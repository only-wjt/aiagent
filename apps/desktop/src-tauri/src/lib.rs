//! AI Agent 桌面应用 — Tauri 后端入口
//!
//! 模块注册和应用初始化

mod sidecar;
mod sse_proxy;
mod config;
mod agent_tools;
mod crypto;
mod mcp;

use sidecar::SidecarManager;
use sse_proxy::SseProxyState;
use config::ConfigManager;
use mcp::McpRegistry;
use tauri::Manager;
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use serde::{Deserialize, Serialize};
use std::fs;

/// 窗口状态（位置/大小）
#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

/// 保存窗口状态到文件
fn save_window_state(data_dir: &std::path::Path, state: &WindowState) {
    let path = data_dir.join("window_state.json");
    if let Ok(json) = serde_json::to_string_pretty(state) {
        let _ = fs::write(path, json);
    }
}

/// 读取窗口状态
fn load_window_state(data_dir: &std::path::Path) -> Option<WindowState> {
    let path = data_dir.join("window_state.json");
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化配置管理器
    let config_mgr = ConfigManager::new();
    let app_config = config_mgr.read_app_config();
    let data_dir = config_mgr.data_dir().clone();

    // 迁移现有的明文 API Key 为加密格式
    let _ = config_mgr.migrate_providers_encryption();

    // 初始化 Sidecar 管理器
    let sidecar_mgr = SidecarManager::new(app_config.sidecar_port_start);

    // 初始化 SSE 代理状态
    let sse_state = SseProxyState::new();

    // 初始化 MCP 注册表
    let mcp_registry = McpRegistry::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        // 注入状态
        .manage(sidecar_mgr)
        .manage(sse_state)
        .manage(config_mgr)
        .manage(mcp_registry)
        // 注册 IPC 命令
        .invoke_handler(tauri::generate_handler![
            // Sidecar 管理
            sidecar::cmd_ensure_session_sidecar,
            sidecar::cmd_release_session_sidecar,
            sidecar::cmd_get_session_port,
            sidecar::cmd_list_sidecars,
            sidecar::cmd_stop_all_sidecars,
            // SSE 代理
            sse_proxy::cmd_start_sse_proxy,
            sse_proxy::cmd_stop_sse_proxy,
            // 配置管理
            config::cmd_get_app_config,
            config::cmd_save_app_config,
            config::cmd_get_providers,
            config::cmd_save_providers,
            config::cmd_get_data_dir,
            config::cmd_migrate_encryption,
            // 对话持久化
            config::cmd_save_conversation,
            config::cmd_load_conversation,
            config::cmd_list_conversations,
            config::cmd_delete_conversation,
            // 通用 JSON 存储
            config::cmd_read_json,
            config::cmd_write_json,
            // Agent 工具执行
            agent_tools::cmd_execute_tool,
            // MCP 进程管理
            mcp::cmd_mcp_connect,
            mcp::cmd_mcp_disconnect,
            mcp::cmd_mcp_call_tool,
            mcp::cmd_mcp_list_tools,
        ])
        // 应用初始化：创建系统托盘 + 恢复窗口状态
        .setup({
            let data_dir_setup = data_dir.clone();
            move |app| {
                // ---- 系统托盘 ----
                let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
                let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
                let menu = MenuBuilder::new(app)
                    .item(&show_item)
                    .separator()
                    .item(&quit_item)
                    .build()?;

                let _tray = TrayIconBuilder::new()
                    .menu(&menu)
                    .tooltip("AI Agent")
                    .on_menu_event(|app, event| {
                        match event.id().as_ref() {
                            "show" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                            "quit" => {
                                // 退出前停止所有 Sidecar
                                if let Some(mgr) = app.try_state::<SidecarManager>() {
                                    mgr.stop_all();
                                }
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        // 左键单击托盘图标 → 显示窗口
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event {
                            if let Some(w) = tray.app_handle().get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;

                // ---- 恢复窗口状态 ----
                if let Some(state) = load_window_state(&data_dir_setup) {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.set_position(tauri::PhysicalPosition::new(state.x, state.y));
                        let _ = window.set_size(tauri::PhysicalSize::new(state.width, state.height));
                    }
                }

                Ok(())
            }
        })
        // 窗口事件：关闭 → 隐藏到托盘 + 保存窗口状态
        .on_window_event({
            let data_dir_event = data_dir.clone();
            move |window, event| {
                match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        // 保存窗口位置/大小
                        if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
                            save_window_state(&data_dir_event, &WindowState {
                                x: pos.x,
                                y: pos.y,
                                width: size.width,
                                height: size.height,
                            });
                        }
                        // 隐藏到托盘而不是退出
                        let _ = window.hide();
                        api.prevent_close();
                    }
                    tauri::WindowEvent::Destroyed => {
                        if let Some(mgr) = window.app_handle().try_state::<SidecarManager>() {
                            mgr.stop_all();
                        }
                    }
                    _ => {}
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
