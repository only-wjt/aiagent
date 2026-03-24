//! MCP (Model Context Protocol) 进程管理
//!
//! 通过 STDIO 启动和管理 MCP 服务器进程，支持工具调用。

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

/// MCP 工具描述
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolDef {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

/// MCP 工具调用结果
#[derive(Debug, Serialize, Deserialize)]
pub struct McpCallResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

/// MCP 连接句柄（可安全跨线程共享）
#[derive(Clone)]
pub struct McpHandle {
    pub tool_id: String,
    pub tools: Vec<McpToolDef>,
    inner: Arc<Mutex<McpInner>>,
}

struct McpInner {
    stdin: std::process::ChildStdin,
    reader: BufReader<std::process::ChildStdout>,
    next_id: u64,
    _child: Child,
}

impl McpInner {
    fn rpc(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;

        let request = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        let mut line = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        line.push('\n');
        self.stdin
            .write_all(line.as_bytes())
            .map_err(|e| e.to_string())?;
        self.stdin.flush().map_err(|e| e.to_string())?;

        // 读取响应行（跳过非 JSON 行）
        loop {
            let mut resp_line = String::new();
            self.reader
                .read_line(&mut resp_line)
                .map_err(|e| e.to_string())?;
            let resp_line = resp_line.trim();
            if resp_line.is_empty() {
                continue;
            }
            if let Ok(v) = serde_json::from_str::<Value>(resp_line) {
                // 找到对应 id 的响应
                if v.get("id").and_then(|i| i.as_u64()) == Some(id) {
                    if let Some(err) = v.get("error") {
                        return Err(err.to_string());
                    }
                    return Ok(v.get("result").cloned().unwrap_or(Value::Null));
                }
                // 收到通知（id 为 null），继续等待
            }
        }
    }
}

/// 全局 MCP 进程注册表
pub struct McpRegistry {
    handles: Mutex<HashMap<String, McpHandle>>,
}

impl McpRegistry {
    pub fn new() -> Self {
        McpRegistry {
            handles: Mutex::new(HashMap::new()),
        }
    }

    /// 启动并连接 MCP 服务器，返回工具列表
    pub fn connect(
        &self,
        tool_id: &str,
        command: &str,
        env: HashMap<String, String>,
    ) -> Result<Vec<McpToolDef>, String> {
        // 解析命令
        let parts: Vec<&str> = command.split_whitespace().collect();
        if parts.is_empty() {
            return Err("命令为空".to_string());
        }

        let mut cmd = Command::new(parts[0]);
        for arg in &parts[1..] {
            cmd.arg(arg);
        }
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        for (k, v) in &env {
            cmd.env(k, v);
        }

        let mut child = cmd.spawn().map_err(|e| format!("启动进程失败: {}", e))?;
        let stdin = child.stdin.take().ok_or("无法获取 stdin")?;
        let stdout = child.stdout.take().ok_or("无法获取 stdout")?;
        let reader = BufReader::new(stdout);

        let mut inner = McpInner {
            stdin,
            reader,
            next_id: 1,
            _child: child,
        };

        // MCP 初始化握手
        let _init_result = inner.rpc(
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "aiagent", "version": "1.0.0" },
            }),
        )?;

        // 发送 initialized 通知（无需响应）
        let notif = json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
        });
        let mut notif_line = serde_json::to_string(&notif).map_err(|e| e.to_string())?;
        notif_line.push('\n');
        inner
            .stdin
            .write_all(notif_line.as_bytes())
            .map_err(|e| e.to_string())?;
        inner.stdin.flush().map_err(|e| e.to_string())?;

        // 获取工具列表
        let tools_result = inner.rpc("tools/list", json!({})).unwrap_or(Value::Null);
        let tools: Vec<McpToolDef> = tools_result
            .get("tools")
            .and_then(|t| t.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|t| {
                        let name = t.get("name")?.as_str()?.to_string();
                        let description = t
                            .get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("")
                            .to_string();
                        let input_schema = t.get("inputSchema").cloned().unwrap_or(json!({}));
                        Some(McpToolDef {
                            name,
                            description,
                            input_schema,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let handle = McpHandle {
            tool_id: tool_id.to_string(),
            tools: tools.clone(),
            inner: Arc::new(Mutex::new(inner)),
        };

        self.handles
            .lock()
            .unwrap()
            .insert(tool_id.to_string(), handle);
        Ok(tools)
    }

    /// 断开 MCP 服务器
    pub fn disconnect(&self, tool_id: &str) {
        self.handles.lock().unwrap().remove(tool_id);
    }

    /// 调用 MCP 工具
    pub fn call_tool(
        &self,
        tool_id: &str,
        tool_name: &str,
        arguments: Value,
    ) -> Result<String, String> {
        let handles = self.handles.lock().unwrap();
        let handle = handles
            .get(tool_id)
            .ok_or(format!("MCP 服务器 '{}' 未连接", tool_id))?;
        let result = handle.inner.lock().unwrap().rpc(
            "tools/call",
            json!({ "name": tool_name, "arguments": arguments }),
        )?;

        // 提取文本内容
        let text = result
            .get("content")
            .and_then(|c| c.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_else(|| result.to_string());

        Ok(text)
    }

    /// 获取所有已连接的工具列表
    pub fn list_connected(&self) -> Vec<(String, Vec<McpToolDef>)> {
        self.handles
            .lock()
            .unwrap()
            .iter()
            .map(|(id, h)| (id.clone(), h.tools.clone()))
            .collect()
    }
}

// ==================== Tauri 命令 ====================

/// 连接 MCP 服务器
#[tauri::command]
pub fn cmd_mcp_connect(
    tool_id: String,
    command: String,
    env: Option<HashMap<String, String>>,
    state: tauri::State<McpRegistry>,
) -> Result<Vec<McpToolDef>, String> {
    state.connect(&tool_id, &command, env.unwrap_or_default())
}

/// 断开 MCP 服务器
#[tauri::command]
pub fn cmd_mcp_disconnect(tool_id: String, state: tauri::State<McpRegistry>) {
    state.disconnect(&tool_id);
}

/// 调用 MCP 工具
#[tauri::command]
pub fn cmd_mcp_call_tool(
    tool_id: String,
    tool_name: String,
    arguments: Value,
    state: tauri::State<McpRegistry>,
) -> McpCallResult {
    match state.call_tool(&tool_id, &tool_name, arguments) {
        Ok(output) => McpCallResult {
            success: true,
            output,
            error: None,
        },
        Err(e) => McpCallResult {
            success: false,
            output: String::new(),
            error: Some(e),
        },
    }
}

/// 获取所有已连接的 MCP 服务器工具
#[tauri::command]
pub fn cmd_mcp_list_tools(state: tauri::State<McpRegistry>) -> Vec<(String, Vec<McpToolDef>)> {
    state.list_connected()
}
