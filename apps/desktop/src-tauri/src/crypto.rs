//! API Key 加密模块
//!
//! 使用 AES-256-GCM 加密 API Key，密钥从机器标识符派生

use base64::{engine::general_purpose::STANDARD, Engine};
use ring::aead::{self, Aad, LessSafeKey, Nonce, UnboundKey};
use ring::pbkdf2;
use ring::rand::{SecureRandom, SystemRandom};
use std::num::NonZeroU32;

const PBKDF2_ITERATIONS: u32 = 100_000;
const NONCE_LEN: usize = 12;

/// 获取机器唯一标识符（用作加密盐）
fn get_machine_id() -> String {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("ioreg")
            .args(&["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            if let Ok(s) = String::from_utf8(output.stdout) {
                if let Some(line) = s.lines().find(|l| l.contains("IOPlatformUUID")) {
                    if let Some(uuid) = line.split('"').nth(3) {
                        return uuid.to_string();
                    }
                }
            }
        }
        "macos-default".to_string()
    }
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("wmic")
            .args(&["csproduct", "get", "uuid"])
            .output()
        {
            if let Ok(s) = String::from_utf8(output.stdout) {
                if let Some(uuid) = s.lines().nth(1) {
                    return uuid.trim().to_string();
                }
            }
        }
        "windows-default".to_string()
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(id) = std::fs::read_to_string("/etc/machine-id") {
            return id.trim().to_string();
        }
        "linux-default".to_string()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "unknown-default".to_string()
    }
}

/// 从机器 ID 派生加密密钥
fn derive_key(machine_id: &str) -> [u8; 32] {
    let salt = b"aiagent-api-key-encryption";
    let mut key = [0u8; 32];
    pbkdf2::derive(
        pbkdf2::PBKDF2_HMAC_SHA256,
        NonZeroU32::new(PBKDF2_ITERATIONS).unwrap(),
        salt,
        machine_id.as_bytes(),
        &mut key,
    );
    key
}

/// 加密 API Key
pub fn encrypt_api_key(api_key: &str) -> Result<String, String> {
    if api_key.is_empty() {
        return Ok(String::new());
    }

    let machine_id = get_machine_id();
    let key_bytes = derive_key(&machine_id);
    let unbound_key = UnboundKey::new(&aead::AES_256_GCM, &key_bytes)
        .map_err(|_| "Failed to create encryption key".to_string())?;
    let key = LessSafeKey::new(unbound_key);

    // 生成随机 nonce
    let rng = SystemRandom::new();
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rng.fill(&mut nonce_bytes)
        .map_err(|_| "Failed to generate nonce".to_string())?;
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);

    // 加密
    let mut ciphertext = api_key.as_bytes().to_vec();
    key.seal_in_place_append_tag(nonce, Aad::empty(), &mut ciphertext)
        .map_err(|_| "Encryption failed".to_string())?;

    // 组合: nonce + ciphertext
    let mut result = nonce_bytes.to_vec();
    result.extend_from_slice(&ciphertext);

    Ok(STANDARD.encode(&result))
}

/// 解密 API Key
pub fn decrypt_api_key(encrypted: &str) -> Result<String, String> {
    if encrypted.is_empty() {
        return Ok(String::new());
    }

    let machine_id = get_machine_id();
    let key_bytes = derive_key(&machine_id);
    let unbound_key = UnboundKey::new(&aead::AES_256_GCM, &key_bytes)
        .map_err(|_| "Failed to create decryption key".to_string())?;
    let key = LessSafeKey::new(unbound_key);

    // 解码 Base64
    let data = STANDARD
        .decode(encrypted)
        .map_err(|_| "Invalid Base64 encoding".to_string())?;

    if data.len() < NONCE_LEN {
        return Err("Encrypted data too short".to_string());
    }

    // 分离 nonce 和 ciphertext
    let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
    let nonce = Nonce::assume_unique_for_key({
        let mut arr = [0u8; NONCE_LEN];
        arr.copy_from_slice(nonce_bytes);
        arr
    });

    // 解密
    let mut plaintext = ciphertext.to_vec();
    key.open_in_place(nonce, Aad::empty(), &mut plaintext)
        .map_err(|_| "Decryption failed - invalid key or corrupted data".to_string())?;

    String::from_utf8(plaintext).map_err(|_| "Decrypted data is not valid UTF-8".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let api_key = "sk-test-key-12345";
        let encrypted = encrypt_api_key(api_key).expect("Encryption failed");
        assert!(!encrypted.is_empty());
        assert_ne!(encrypted, api_key);

        let decrypted = decrypt_api_key(&encrypted).expect("Decryption failed");
        assert_eq!(decrypted, api_key);
    }

    #[test]
    fn test_empty_key() {
        let encrypted = encrypt_api_key("").expect("Encryption failed");
        assert_eq!(encrypted, "");

        let decrypted = decrypt_api_key("").expect("Decryption failed");
        assert_eq!(decrypted, "");
    }
}
