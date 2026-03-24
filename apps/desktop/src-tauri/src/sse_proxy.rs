//! SSE 代理模块
//!
//! Rust 层代理所有 SSE 流量，统一转发到前端，
//! 解决 WebView CORS 问题，并实现 Tab 级别事件隔离。

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
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

fn emit_sse_event(app: &AppHandle, tab_id: &str, event_type: &str, data: String) {
    let event_name = format!("sse:{}:{}", tab_id, event_type);
    let _ = app.emit(
        &event_name,
        SseEventPayload {
            tab_id: tab_id.to_string(),
            event_type: event_type.to_string(),
            data,
        },
    );
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
    let url = format!("http://localhost:{}/api/chat/stream", port);

    // 发起 SSE 连接
    let request_body =
        serde_json::to_string(&json!({ "sessionId": session_id })).map_err(|e| e.to_string())?;

    let mut response = sse_state
        .client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(request_body)
        .send()
        .await
        .map_err(|e| format!("SSE 连接失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        emit_sse_event(
            &app,
            &tab_id,
            "error",
            format!("SSE 连接失败: {} {}", status, error_body),
        );

        if let Ok(mut connections) = sse_state.connections.lock() {
            connections.remove(&tab_id);
        }

        return Err(format!("SSE 连接失败: {}", status));
    }

    // 流式读取并转发到前端
    let mut buffer = String::new();

    loop {
        let chunk = match response.chunk().await {
            Ok(chunk) => chunk,
            Err(e) => {
                emit_sse_event(&app, &tab_id, "error", e.to_string());
                break;
            }
        };

        let Some(bytes) = chunk else {
            break;
        };

        let chunk_text = String::from_utf8_lossy(bytes.as_ref())
            .replace("\r\n", "\n")
            .replace('\r', "\n");
        buffer.push_str(&chunk_text);

        // 解析 SSE 事件（以 \n\n 分割）
        while let Some(pos) = buffer.find("\n\n") {
            let event_str = buffer[..pos].to_string();
            buffer = buffer[pos + 2..].to_string();

            let mut event_type = "message".to_string();
            let mut data_lines = Vec::new();

            for line in event_str.lines() {
                if let Some(event) = line.strip_prefix("event:") {
                    event_type = event.trim().to_string();
                } else if let Some(data) = line.strip_prefix("data:") {
                    data_lines.push(data.trim_start().to_string());
                }
            }

            if !data_lines.is_empty() {
                emit_sse_event(&app, &tab_id, &event_type, data_lines.join("\n"));
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
