# 安全性文档

## API Key 加密存储

### 概述

API Key 现在使用 AES-256-GCM 加密存储在本地文件系统中。密钥从机器唯一标识符派生，确保只有该机器可以解密 API Key。

### 实现细节

#### 加密算法
- **算法**: AES-256-GCM（Galois/Counter Mode）
- **密钥长度**: 256 位
- **Nonce 长度**: 12 字节（随机生成）
- **认证标签**: 16 字节

#### 密钥派生
- **方法**: PBKDF2-HMAC-SHA256
- **迭代次数**: 100,000
- **盐值**: `aiagent-api-key-encryption`（固定）
- **输入**: 机器唯一标识符

#### 机器标识符获取

**macOS**: `ioreg -rd1 -c IOPlatformExpertDevice` 获取 IOPlatformUUID

**Windows**: `wmic csproduct get uuid` 获取系统 UUID

**Linux**: `/etc/machine-id` 文件内容

### 存储格式

加密后的 API Key 存储为 Base64 编码的字符串：
```
Base64(Nonce || Ciphertext || AuthTag)
```

其中：
- `Nonce`: 12 字节随机数
- `Ciphertext`: 加密的 API Key
- `AuthTag`: 16 字节认证标签

### 自动迁移

应用启动时自动执行迁移：
1. 读取现有的 `providers.json`
2. 检测明文 API Key（无法解密的）
3. 自动加密并保存

### 使用方式

#### Rust 后端

```rust
use crate::crypto::{encrypt_api_key, decrypt_api_key};

// 加密
let encrypted = encrypt_api_key("sk-xxx")?;

// 解密
let decrypted = decrypt_api_key(&encrypted)?;
```

#### 自动处理

- `ConfigManager::read_providers()` 自动解密 API Key
- `ConfigManager::save_providers()` 自动加密 API Key
- 应用层无需关心加密细节

### 安全考虑

#### 威胁模型

✅ **防护**:
- 本地文件系统访问（需要机器访问权限）
- 内存中的 API Key 泄露（加密存储）
- 跨机器 API Key 转移（密钥绑定到机器）

❌ **不防护**:
- 物理访问（可以提取硬盘）
- 内存中的明文 API Key（应用运行时）
- 机器被完全入侵

#### 最佳实践

1. **定期轮换 API Key**: 在提供商平台定期更新
2. **最小权限**: 为 API Key 配置最小必要权限
3. **监控使用**: 监控 API Key 的使用情况
4. **备份**: 定期备份 `providers.json`（已加密）

### 故障排除

#### 解密失败

**原因**: 机器标识符变化或文件损坏

**解决**:
1. 检查机器标识符是否变化
2. 重新输入 API Key
3. 应用会自动重新加密

#### 迁移失败

**原因**: 权限问题或磁盘空间不足

**解决**:
1. 检查 `~/.aiagent/` 目录权限
2. 确保磁盘有足够空间
3. 手动调用 `cmd_migrate_encryption` IPC 命令

### 依赖

- `ring`: 密码学原语（AES-GCM, PBKDF2）
- `base64`: Base64 编码/解码

### 参考

- [NIST SP 800-38D: GCM Mode](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)
- [RFC 2898: PBKDF2](https://tools.ietf.org/html/rfc2898)
