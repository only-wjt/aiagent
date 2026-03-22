//! 配置管理模块
//!
//! API Key 存储、应用配置读写、数据目录管理

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::State;

/// 数据目录名（~/.aiagent/）
const DATA_DIR: &str = ".aiagent";

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub theme: String,
    pub locale: String,
    pub default_workspace_path: String,
    pub sidecar_port_start: u16,
    pub auto_start: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            locale: "zh-CN".to_string(),
            default_workspace_path: "~".to_string(),
            sidecar_port_start: 31415,
            auto_start: false,
        }
    }
}

/// 供应商配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub is_default: bool,
    pub enabled: bool,
    #[serde(default)]
    pub endpoint_type: String,
}

/// 配置管理器
pub struct ConfigManager {
    data_dir: PathBuf,
}

impl ConfigManager {
    /// 创建配置管理器，自动创建数据目录
    pub fn new() -> Self {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let data_dir = home.join(DATA_DIR);

        // 确保目录存在
        let _ = fs::create_dir_all(&data_dir);
        let _ = fs::create_dir_all(data_dir.join("sessions"));
        let _ = fs::create_dir_all(data_dir.join("skills"));
        let _ = fs::create_dir_all(data_dir.join("memory"));
        let _ = fs::create_dir_all(data_dir.join("logs"));

        Self { data_dir }
    }

    /// 获取数据目录路径
    pub fn data_dir(&self) -> &PathBuf {
        &self.data_dir
    }

    /// 读取应用配置
    pub fn read_app_config(&self) -> AppConfig {
        let config_path = self.data_dir.join("config.json");
        if let Ok(content) = fs::read_to_string(&config_path) {
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            AppConfig::default()
        }
    }

    /// 保存应用配置
    pub fn save_app_config(&self, config: &AppConfig) -> Result<(), String> {
        let config_path = self.data_dir.join("config.json");
        let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        fs::write(&config_path, json).map_err(|e| format!("保存配置失败: {}", e))
    }

    /// 读取供应商配置列表
    pub fn read_providers(&self) -> Vec<ProviderConfig> {
        let path = self.data_dir.join("providers.json");
        if let Ok(content) = fs::read_to_string(&path) {
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            Vec::new()
        }
    }

    /// 保存供应商配置列表
    pub fn save_providers(&self, providers: &[ProviderConfig]) -> Result<(), String> {
        let path = self.data_dir.join("providers.json");
        let json = serde_json::to_string_pretty(providers).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| format!("保存供应商配置失败: {}", e))
    }
}

// ==================== Tauri IPC 命令 ====================

/// 获取应用配置
#[tauri::command]
pub fn cmd_get_app_config(
    config_mgr: State<'_, ConfigManager>,
) -> AppConfig {
    config_mgr.read_app_config()
}

/// 保存应用配置
#[tauri::command]
pub fn cmd_save_app_config(
    config_mgr: State<'_, ConfigManager>,
    config: AppConfig,
) -> Result<(), String> {
    config_mgr.save_app_config(&config)
}

/// 获取供应商列表
#[tauri::command]
pub fn cmd_get_providers(
    config_mgr: State<'_, ConfigManager>,
) -> Vec<ProviderConfig> {
    config_mgr.read_providers()
}

/// 保存供应商列表
#[tauri::command]
pub fn cmd_save_providers(
    config_mgr: State<'_, ConfigManager>,
    providers: Vec<ProviderConfig>,
) -> Result<(), String> {
    config_mgr.save_providers(&providers)
}

/// 获取数据目录路径
#[tauri::command]
pub fn cmd_get_data_dir(
    config_mgr: State<'_, ConfigManager>,
) -> String {
    config_mgr.data_dir().to_string_lossy().to_string()
}

// ==================== 通用 JSON 存储 ====================

/// 读取数据目录下的 JSON 文件（返回原始 JSON 字符串）
///
/// filename 示例："skills.json"、"mcp_tools.json"
#[tauri::command]
pub fn cmd_read_json(
    config_mgr: State<'_, ConfigManager>,
    filename: String,
) -> Result<String, String> {
    // 安全检查：只允许简单文件名，防止路径遍历
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("不允许的文件名".to_string());
    }
    let path = config_mgr.data_dir().join(&filename);
    if !path.exists() {
        return Ok("null".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("读取 {} 失败: {}", filename, e))
}

/// 写入 JSON 到数据目录
#[tauri::command]
pub fn cmd_write_json(
    config_mgr: State<'_, ConfigManager>,
    filename: String,
    data: String,
) -> Result<(), String> {
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("不允许的文件名".to_string());
    }
    let path = config_mgr.data_dir().join(&filename);
    fs::write(&path, &data).map_err(|e| format!("写入 {} 失败: {}", filename, e))
}

// ==================== 对话持久化 ====================

/// 对话中的单条消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,        // "user" | "assistant"
    pub content: Vec<ContentBlock>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<String>,
}

/// 消息内容块
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentBlock {
    #[serde(rename = "type")]
    pub block_type: String,  // "text" | "tool_use" 等
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

/// 完整对话（存储到文件）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub model: String,
    pub created_at: String,
    pub updated_at: String,
    pub messages: Vec<ChatMessage>,
}

/// 对话摘要（列表展示用，不含完整消息）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub model: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: usize,
    /// 最后一条消息的预览文本
    pub preview: String,
}

impl ConfigManager {
    /// 对话存储目录
    fn conversations_dir(&self) -> PathBuf {
        self.data_dir.join("conversations")
    }

    /// 保存对话
    pub fn save_conversation(&self, conversation: &Conversation) -> Result<(), String> {
        let dir = self.conversations_dir();
        let _ = fs::create_dir_all(&dir);
        let path = dir.join(format!("{}.json", conversation.id));
        let json = serde_json::to_string_pretty(conversation).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| format!("保存对话失败: {}", e))
    }

    /// 加载单个对话
    pub fn load_conversation(&self, id: &str) -> Result<Conversation, String> {
        let path = self.conversations_dir().join(format!("{}.json", id));
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("读取对话失败: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("解析对话失败: {}", e))
    }

    /// 列出所有对话摘要（按更新时间倒序）
    pub fn list_conversations(&self) -> Vec<ConversationSummary> {
        let dir = self.conversations_dir();
        let mut summaries = Vec::new();

        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |e| e == "json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(conv) = serde_json::from_str::<Conversation>(&content) {
                            // 提取最后一条消息作为预览
                            let preview = conv.messages.last()
                                .and_then(|m| {
                                    m.content.iter()
                                        .find(|b| b.block_type == "text")
                                        .and_then(|b| b.text.clone())
                                })
                                .unwrap_or_default();
                            // 预览截断到 80 字符
                            let preview = if preview.chars().count() > 80 {
                                format!("{}…", preview.chars().take(80).collect::<String>())
                            } else {
                                preview
                            };

                            summaries.push(ConversationSummary {
                                id: conv.id,
                                title: conv.title,
                                model: conv.model,
                                created_at: conv.created_at,
                                updated_at: conv.updated_at,
                                message_count: conv.messages.len(),
                                preview,
                            });
                        }
                    }
                }
            }
        }

        // 按 updated_at 倒序
        summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        summaries
    }

    /// 删除对话
    pub fn delete_conversation(&self, id: &str) -> Result<(), String> {
        let path = self.conversations_dir().join(format!("{}.json", id));
        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("删除对话失败: {}", e))
        } else {
            Ok(()) // 文件不存在时不报错
        }
    }
}

/// 保存对话
#[tauri::command]
pub fn cmd_save_conversation(
    config_mgr: State<'_, ConfigManager>,
    conversation: Conversation,
) -> Result<(), String> {
    config_mgr.save_conversation(&conversation)
}

/// 加载对话
#[tauri::command]
pub fn cmd_load_conversation(
    config_mgr: State<'_, ConfigManager>,
    id: String,
) -> Result<Conversation, String> {
    config_mgr.load_conversation(&id)
}

/// 列出所有对话
#[tauri::command]
pub fn cmd_list_conversations(
    config_mgr: State<'_, ConfigManager>,
) -> Vec<ConversationSummary> {
    config_mgr.list_conversations()
}

/// 删除对话
#[tauri::command]
pub fn cmd_delete_conversation(
    config_mgr: State<'_, ConfigManager>,
    id: String,
) -> Result<(), String> {
    config_mgr.delete_conversation(&id)
}
