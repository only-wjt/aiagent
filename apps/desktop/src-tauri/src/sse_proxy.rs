//! SSE 代理模块
//!
//! Rust 层代理所有 SSE 流量，统一转发到前端，
//! 解决 WebView CORS 问题，并实现 Tab 级别事件隔离。

use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// SSE 连接状态
pub struct SseConnection {
    /// Tab ID
    pub tab_id: String,
    /// 目标 Sidecar 端口
    pub port: u16,
    /// 是否活跃
    pub active: bool,
}

/// SSE 代理状态管理
pub struct SseProxyState {
    /// Tab ID → 连接信息
    connections: Mutex<HashMap<String, SseConnection>>,
    /// HTTP 客户端
    client: Client,
}

impl SseProxyState {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
            client: Client::new(),
        }
    }
}

/// SSE 事件数据（发送给前端）
#[derive(Clone, Serialize, Deserialize)]
pub struct SseEventPayload {
    pub tab_id: String,
    pub event_type: String,
    pub data: String,
}

/// 开始 SSE 代理连接
#[tauri::command]
pub async fn cmd_start_sse_proxy(
    app: AppHandle,
    sse_state: State<'_, SseProxyState>,
    tab_id: String,
    port: u16,
    session_id: String,
) -> Result<(), String> {
    // 记录连接
    {
        let mut connections = sse_state.connections.lock().map_err(|e| e.to_string())?;
        connections.insert(
            tab_id.clone(),
            SseConnection {
                tab_id: tab_id.clone(),
                port,
                active: true,
            },
        );
    }

    // 构建 SSE URL
    let url = format!(
        "http://localhost:{}/api/chat/stream?sessionId={}",
        port, session_id
    );

    // 发起 SSE 连接
    let response = sse_state
        .client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("SSE 连接失败: {}", e))?;

    // 流式读取并转发到前端
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                buffer.push_str(&String::from_utf8_lossy(&bytes));

                // 解析 SSE 事件（以 \n\n 分割）
                while let Some(pos) = buffer.find("\n\n") {
                    let event_str = buffer[..pos].to_string();
                    buffer = buffer[pos + 2..].to_string();

                    // 提取 data: 行
                    for line in event_str.lines() {
                        if let Some(data) = line.strip_prefix("data: ") {
                            let event_name = format!("sse:{}:message", tab_id);
                            let _ = app.emit(
                                &event_name,
                                SseEventPayload {
                                    tab_id: tab_id.clone(),
                                    event_type: "message".to_string(),
                                    data: data.to_string(),
                                },
                            );
                        }
                    }
                }
            }
            Err(e) => {
                // 连接断开，通知前端
                let event_name = format!("sse:{}:error", tab_id);
                let _ = app.emit(
                    &event_name,
                    SseEventPayload {
                        tab_id: tab_id.clone(),
                        event_type: "error".to_string(),
                        data: e.to_string(),
                    },
                );
                break;
            }
        }

        // 检查连接是否被主动断开
        let still_active = sse_state
            .connections
            .lock()
            .map(|c| c.get(&tab_id).map_or(false, |conn| conn.active))
            .unwrap_or(false);

        if !still_active {
            break;
        }
    }

    // 清理连接
    if let Ok(mut connections) = sse_state.connections.lock() {
        connections.remove(&tab_id);
    }

    Ok(())
}

/// 停止 SSE 代理连接
#[tauri::command]
pub fn cmd_stop_sse_proxy(
    sse_state: State<'_, SseProxyState>,
    tab_id: String,
) -> Result<(), String> {
    let mut connections = sse_state.connections.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = connections.get_mut(&tab_id) {
        conn.active = false;
    }
    Ok(())
}
