//! SidecarManager — Session-Centric 多实例 Sidecar 管理器
//!
//! 每个 Session 对应一个独立的 Bun Sidecar 进程，
//! 通过 Owner 模型管理生命周期。

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::process::Child;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Mutex;
use tauri::State;

/// Sidecar 使用者类型
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "type", content = "id")]
pub enum SidecarOwner {
    /// 前端 Tab
    Tab(String),
    /// 定时任务
    CronTask(String),
    /// Agent Channel（IM Bot 等）
    Agent(String),
    /// 后台完成任务
    Background(String),
}

/// Session 级别的 Sidecar 实例
pub struct SessionSidecar {
    /// 会话 ID
    pub session_id: String,
    /// 分配的端口号
    pub port: u16,
    /// 工作目录
    pub workspace_path: PathBuf,
    /// 子进程句柄
    pub process: Option<Child>,
    /// 所有使用者
    pub owners: HashSet<SidecarOwner>,
    /// 健康状态
    pub healthy: bool,
}

/// Sidecar 状态信息（序列化给前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarInfo {
    pub session_id: String,
    pub port: u16,
    pub workspace_path: String,
    pub healthy: bool,
    pub owner_count: usize,
}

/// 多实例 Sidecar 管理器
pub struct SidecarManager {
    /// Session ID → Sidecar 实例（主存储）
    sidecars: Mutex<HashMap<String, SessionSidecar>>,
    /// 端口分配计数器（从 31415 开始递增）
    port_counter: AtomicU16,
    /// Sidecar 可执行文件路径
    sidecar_binary: Mutex<Option<PathBuf>>,
}

impl SidecarManager {
    /// 创建新的管理器实例
    pub fn new(port_start: u16) -> Self {
        Self {
            sidecars: Mutex::new(HashMap::new()),
            port_counter: AtomicU16::new(port_start),
            sidecar_binary: Mutex::new(None),
        }
    }

    /// 设置 Sidecar 二进制路径
    pub fn set_binary_path(&self, path: PathBuf) {
        *self.sidecar_binary.lock().unwrap() = Some(path);
    }

    /// 分配一个新端口
    fn allocate_port(&self) -> u16 {
        self.port_counter.fetch_add(1, Ordering::SeqCst)
    }

    /// 确保指定 Session 有运行中的 Sidecar
    pub fn ensure_sidecar(
        &self,
        session_id: &str,
        workspace_path: &str,
        owner: SidecarOwner,
    ) -> Result<SidecarInfo, String> {
        let mut sidecars = self.sidecars.lock().map_err(|e| e.to_string())?;

        // 如果已存在，添加 Owner
        if let Some(sidecar) = sidecars.get_mut(session_id) {
            sidecar.owners.insert(owner);
            return Ok(SidecarInfo {
                session_id: sidecar.session_id.clone(),
                port: sidecar.port,
                workspace_path: sidecar.workspace_path.to_string_lossy().to_string(),
                healthy: sidecar.healthy,
                owner_count: sidecar.owners.len(),
            });
        }

        // 创建新 Sidecar
        let port = self.allocate_port();
        let ws_path = PathBuf::from(workspace_path);

        // 启动 Bun Sidecar 进程
        let process = self.start_sidecar_process(port, workspace_path)?;

        let mut owners = HashSet::new();
        owners.insert(owner);

        let sidecar = SessionSidecar {
            session_id: session_id.to_string(),
            port,
            workspace_path: ws_path,
            process: Some(process),
            owners,
            healthy: true,
        };

        let info = SidecarInfo {
            session_id: sidecar.session_id.clone(),
            port: sidecar.port,
            workspace_path: sidecar.workspace_path.to_string_lossy().to_string(),
            healthy: sidecar.healthy,
            owner_count: sidecar.owners.len(),
        };

        sidecars.insert(session_id.to_string(), sidecar);
        Ok(info)
    }

    /// 释放 Owner 对 Sidecar 的使用
    pub fn release_sidecar(&self, session_id: &str, owner: &SidecarOwner) -> Result<bool, String> {
        let mut sidecars = self.sidecars.lock().map_err(|e| e.to_string())?;

        if let Some(sidecar) = sidecars.get_mut(session_id) {
            sidecar.owners.remove(owner);

            // 所有 Owner 已释放，停止 Sidecar
            if sidecar.owners.is_empty() {
                if let Some(mut process) = sidecar.process.take() {
                    let _ = process.kill();
                }
                sidecars.remove(session_id);
                return Ok(true); // Sidecar 已停止
            }
            return Ok(false); // Sidecar 仍有其他 Owner
        }

        Ok(true) // 不存在，视为已释放
    }

    /// 获取 Session 的 Sidecar 端口
    pub fn get_port(&self, session_id: &str) -> Option<u16> {
        let sidecars = self.sidecars.lock().ok()?;
        sidecars.get(session_id).map(|s| s.port)
    }

    /// 获取所有活跃 Sidecar 信息
    pub fn list_sidecars(&self) -> Vec<SidecarInfo> {
        let sidecars = self.sidecars.lock().unwrap_or_else(|e| e.into_inner());
        sidecars
            .values()
            .map(|s| SidecarInfo {
                session_id: s.session_id.clone(),
                port: s.port,
                workspace_path: s.workspace_path.to_string_lossy().to_string(),
                healthy: s.healthy,
                owner_count: s.owners.len(),
            })
            .collect()
    }

    /// 停止所有 Sidecar（应用退出时调用）
    pub fn stop_all(&self) {
        let mut sidecars = self.sidecars.lock().unwrap_or_else(|e| e.into_inner());
        for (_, mut sidecar) in sidecars.drain() {
            if let Some(mut process) = sidecar.process.take() {
                let _ = process.kill();
            }
        }
    }

    /// 启动 Sidecar 子进程
    fn start_sidecar_process(&self, port: u16, workspace_path: &str) -> Result<Child, String> {
        // 获取 bun 可执行文件路径
        let bun_path = which_bun().ok_or("未找到 Bun 运行时，请安装 Bun")?;

        // 获取 sidecar 入口文件路径
        let sidecar_entry = self.get_sidecar_entry()?;

        let child = std::process::Command::new(&bun_path)
            .arg("run")
            .arg(&sidecar_entry)
            .arg(port.to_string())
            .arg(workspace_path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("启动 Sidecar 失败: {}", e))?;

        Ok(child)
    }

    /// 获取 sidecar 入口文件路径
    fn get_sidecar_entry(&self) -> Result<String, String> {
        // 开发模式：直接使用源码路径
        // 生产模式：使用编译后的二进制
        let binary = self.sidecar_binary.lock().map_err(|e| e.to_string())?;
        if let Some(path) = binary.as_ref() {
            return Ok(path.to_string_lossy().to_string());
        }

        // 回退：尝试相对路径（开发模式）
        let dev_path = std::env::current_dir()
            .map_err(|e| e.to_string())?
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("sidecar").join("src").join("index.ts"))
            .ok_or("无法定位 sidecar 入口文件")?;

        if dev_path.exists() {
            return Ok(dev_path.to_string_lossy().to_string());
        }

        Err("未找到 sidecar 入口文件".to_string())
    }
}

/// 查找 bun 可执行文件
fn which_bun() -> Option<String> {
    if let Some(home) = dirs::home_dir() {
        let bun_binary = if cfg!(windows) { "bun.exe" } else { "bun" };
        let bun_path = home.join(".bun").join("bin").join(bun_binary);
        if bun_path.exists() {
            return Some(bun_path.to_string_lossy().to_string());
        }
    }

    let locator = if cfg!(windows) { "where" } else { "which" };

    if let Ok(output) = std::process::Command::new(locator).arg("bun").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = path.lines().next() {
                return Some(first_line.trim().to_string());
            }
        }
    }

    None
}

// ==================== Tauri IPC 命令 ====================

/// 确保 Session 有运行中的 Sidecar
#[tauri::command]
pub fn cmd_ensure_session_sidecar(
    manager: State<'_, SidecarManager>,
    session_id: String,
    workspace_path: String,
    owner_type: String,
    owner_id: String,
) -> Result<SidecarInfo, String> {
    let owner = match owner_type.as_str() {
        "tab" => SidecarOwner::Tab(owner_id),
        "cron_task" => SidecarOwner::CronTask(owner_id),
        "agent" => SidecarOwner::Agent(owner_id),
        "background" => SidecarOwner::Background(owner_id),
        _ => return Err("无效的 owner 类型".to_string()),
    };
    manager.ensure_sidecar(&session_id, &workspace_path, owner)
}

/// 释放 Owner 对 Sidecar 的使用
#[tauri::command]
pub fn cmd_release_session_sidecar(
    manager: State<'_, SidecarManager>,
    session_id: String,
    owner_type: String,
    owner_id: String,
) -> Result<bool, String> {
    let owner = match owner_type.as_str() {
        "tab" => SidecarOwner::Tab(owner_id),
        "cron_task" => SidecarOwner::CronTask(owner_id),
        "agent" => SidecarOwner::Agent(owner_id),
        "background" => SidecarOwner::Background(owner_id),
        _ => return Err("无效的 owner 类型".to_string()),
    };
    manager.release_sidecar(&session_id, &owner)
}

/// 获取 Session 的 Sidecar 端口
#[tauri::command]
pub fn cmd_get_session_port(
    manager: State<'_, SidecarManager>,
    session_id: String,
) -> Result<u16, String> {
    manager
        .get_port(&session_id)
        .ok_or("该 Session 没有活跃的 Sidecar".to_string())
}

/// 获取所有活跃的 Sidecar 列表
#[tauri::command]
pub fn cmd_list_sidecars(manager: State<'_, SidecarManager>) -> Vec<SidecarInfo> {
    manager.list_sidecars()
}

/// 停止所有 Sidecar
#[tauri::command]
pub fn cmd_stop_all_sidecars(manager: State<'_, SidecarManager>) {
    manager.stop_all();
}
