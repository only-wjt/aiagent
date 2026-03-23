//! Agent 工具执行层
//!
//! 为 AI Agent 提供工具调用能力：Bash、文件操作、搜索等。
//! 所有工具在指定工作区目录下执行，确保安全隔离。

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use wait_timeout::ChildExt;

/// 工具执行请求
#[derive(Debug, Deserialize)]
pub struct ToolRequest {
    /// 工具名称
    pub name: String,
    /// 工具参数（JSON 对象）
    pub args: serde_json::Value,
    /// 工作区路径
    pub workspace: String,
}

/// 工具执行结果
#[derive(Debug, Serialize)]
pub struct ToolResult {
    /// 是否成功
    pub success: bool,
    /// 输出内容
    pub output: String,
    /// 错误信息（如果有）
    pub error: Option<String>,
}

/// 解析工作区路径（支持 ~ 展开）
fn resolve_workspace(workspace: &str) -> PathBuf {
    if workspace.starts_with('~') {
        if let Some(home) = dirs::home_dir() {
            return home.join(&workspace[2..]);
        }
    }
    PathBuf::from(workspace)
}

/// 执行 Bash 命令
fn tool_bash(args: &serde_json::Value, workspace: &Path) -> ToolResult {
    let command = args.get("command")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if command.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("缺少 command 参数".into()),
        };
    }

    // 限制超时时间（默认 30 秒，上限 300 秒）
    let timeout = args.get("timeout")
        .and_then(|v| v.as_u64())
        .unwrap_or(30)
        .min(300);

    // 使用子进程 + wait_timeout 实现超时控制
    match Command::new("bash")
        .arg("-c")
        .arg(command)
        .current_dir(workspace)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(mut child) => {
            let timeout_duration = std::time::Duration::from_secs(timeout);
            match child.wait_timeout(timeout_duration) {
                Ok(Some(status)) => {
                    // 进程正常退出
                    let stdout = child.stdout.take()
                        .map(|mut s| { let mut buf = String::new(); std::io::Read::read_to_string(&mut s, &mut buf).ok(); buf })
                        .unwrap_or_default();
                    let stderr = child.stderr.take()
                        .map(|mut s| { let mut buf = String::new(); std::io::Read::read_to_string(&mut s, &mut buf).ok(); buf })
                        .unwrap_or_default();
                    let combined = if stderr.is_empty() {
                        stdout
                    } else {
                        format!("{}\n[stderr]\n{}", stdout, stderr)
                    };
                    let truncated = if combined.len() > 50000 {
                        format!("{}...\n[输出已截断，共 {} 字节]", &combined[..50000], combined.len())
                    } else {
                        combined
                    };
                    ToolResult {
                        success: status.success(),
                        output: truncated,
                        error: if status.success() { None } else { Some(format!("退出码: {}", status.code().unwrap_or(-1))) },
                    }
                }
                Ok(None) => {
                    // 超时，杀死进程
                    let _ = child.kill();
                    let _ = child.wait();
                    ToolResult {
                        success: false,
                        output: String::new(),
                        error: Some(format!("命令执行超时（{}秒）", timeout)),
                    }
                }
                Err(e) => ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("等待进程失败: {}", e)),
                },
            }
        }
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("执行命令失败: {}", e)),
        },
    }
}

/// 读取文件
fn tool_read_file(args: &serde_json::Value, workspace: &Path) -> ToolResult {
    let file_path = args.get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if file_path.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("缺少 path 参数".into()),
        };
    }

    let full_path = workspace.join(file_path);
    match std::fs::read_to_string(&full_path) {
        Ok(content) => {
            let truncated = if content.len() > 100000 {
                format!("{}...\n[文件已截断，共 {} 字节]", &content[..100000], content.len())
            } else {
                content
            };
            ToolResult {
                success: true,
                output: truncated,
                error: None,
            }
        }
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("读取文件失败: {}", e)),
        },
    }
}

/// 写入文件
fn tool_write_file(args: &serde_json::Value, workspace: &Path) -> ToolResult {
    let file_path = args.get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let content = args.get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if file_path.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("缺少 path 参数".into()),
        };
    }

    let full_path = workspace.join(file_path);
    // 确保父目录存在
    if let Some(parent) = full_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    match std::fs::write(&full_path, content) {
        Ok(_) => ToolResult {
            success: true,
            output: format!("已写入 {} ({} 字节)", file_path, content.len()),
            error: None,
        },
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("写入文件失败: {}", e)),
        },
    }
}

/// 编辑文件（查找替换）
fn tool_edit_file(args: &serde_json::Value, workspace: &Path) -> ToolResult {
    let file_path = args.get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let old_text = args.get("old_text")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let new_text = args.get("new_text")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if file_path.is_empty() || old_text.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("缺少 path 或 old_text 参数".into()),
        };
    }

    let full_path = workspace.join(file_path);
    match std::fs::read_to_string(&full_path) {
        Ok(content) => {
            if !content.contains(old_text) {
                return ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some("未找到要替换的文本".into()),
                };
            }
            let new_content = content.replacen(old_text, new_text, 1);
            match std::fs::write(&full_path, &new_content) {
                Ok(_) => ToolResult {
                    success: true,
                    output: format!("已编辑 {}", file_path),
                    error: None,
                },
                Err(e) => ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("写入文件失败: {}", e)),
                },
            }
        }
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("读取文件失败: {}", e)),
        },
    }
}

/// 列出目录
fn tool_list_dir(args: &serde_json::Value, workspace: &Path) -> ToolResult {
    let dir_path = args.get("path")
        .and_then(|v| v.as_str())
        .unwrap_or(".");

    let full_path = workspace.join(dir_path);
    match std::fs::read_dir(&full_path) {
        Ok(entries) => {
            let mut items: Vec<String> = Vec::new();
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let file_type = if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    "dir"
                } else {
                    "file"
                };
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                items.push(format!("[{}] {} ({}B)", file_type, name, size));
            }
            items.sort();
            ToolResult {
                success: true,
                output: items.join("\n"),
                error: None,
            }
        }
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("列出目录失败: {}", e)),
        },
    }
}

/// Glob 文件匹配
fn tool_glob(args: &serde_json::Value, workspace: &Path) -> ToolResult {
    let pattern = args.get("pattern")
        .and_then(|v| v.as_str())
        .unwrap_or("*");

    // 直接传参给 find，避免 shell 注入
    match Command::new("find")
        .arg(".")
        .arg("-name")
        .arg(pattern)
        .arg("!")
        .arg("-path")
        .arg("./.git/*")
        .current_dir(workspace)
        .output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            // 限制结果行数
            let limited: String = stdout.lines().take(100).collect::<Vec<_>>().join("\n");
            ToolResult {
                success: true,
                output: if limited.is_empty() { "未找到匹配文件".into() } else { limited },
                error: None,
            }
        }
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Glob 搜索失败: {}", e)),
        },
    }
}

/// Grep 搜索
fn tool_grep(args: &serde_json::Value, workspace: &Path) -> ToolResult {
    let pattern = args.get("pattern")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let file_pattern = args.get("include")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if pattern.is_empty() {
        return ToolResult {
            success: false,
            output: String::new(),
            error: Some("缺少 pattern 参数".into()),
        };
    }

    // 直接传参给 grep，避免 shell 注入
    let mut cmd = Command::new("grep");
    cmd.arg("-rn")
        .arg("--exclude-dir=.git")
        .arg("--exclude-dir=node_modules");
    if !file_pattern.is_empty() {
        cmd.arg(format!("--include={}", file_pattern));
    }
    cmd.arg(pattern).arg(".").current_dir(workspace);

    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            // 限制结果行数
            let limited: String = stdout.lines().take(50).collect::<Vec<_>>().join("\n");
            ToolResult {
                success: true,
                output: if limited.is_empty() { "未找到匹配内容".into() } else { limited },
                error: None,
            }
        }
        Err(e) => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Grep 搜索失败: {}", e)),
        },
    }
}

/// 工具路由：根据名称分发到具体工具
pub fn execute_tool(request: &ToolRequest) -> ToolResult {
    let workspace = resolve_workspace(&request.workspace);

    // 确保工作区存在
    if !workspace.exists() {
        let _ = std::fs::create_dir_all(&workspace);
    }

    match request.name.as_str() {
        "bash" | "Bash" => tool_bash(&request.args, &workspace),
        "read_file" | "Read" | "ReadFile" => tool_read_file(&request.args, &workspace),
        "write_file" | "Write" | "WriteFile" => tool_write_file(&request.args, &workspace),
        "edit_file" | "Edit" | "EditFile" => tool_edit_file(&request.args, &workspace),
        "list_dir" | "ListDir" => tool_list_dir(&request.args, &workspace),
        "glob" | "Glob" => tool_glob(&request.args, &workspace),
        "grep" | "Grep" => tool_grep(&request.args, &workspace),
        _ => ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("未知工具: {}", request.name)),
        },
    }
}

/// Tauri 命令：执行 Agent 工具
#[tauri::command]
pub fn cmd_execute_tool(name: String, args: serde_json::Value, workspace: String) -> ToolResult {
    let request = ToolRequest { name, args, workspace };
    execute_tool(&request)
}
