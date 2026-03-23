/**
 * HTTP 工具 — 统一封装 fetch 请求
 *
 * 在 Tauri 环境下使用 @tauri-apps/plugin-http 的 fetch，
 * 绕过浏览器 CORS 限制。在普通浏览器环境下回退到 window.fetch。
 */

let tauriFetch: typeof globalThis.fetch | null = null

// 尝试动态加载 Tauri HTTP 插件
try {
  const httpPlugin = await import('@tauri-apps/plugin-http')
  tauriFetch = httpPlugin.fetch
  console.log('[HTTP] 使用 Tauri HTTP 插件（绕过 CORS）')
} catch {
  console.warn('[HTTP] Tauri HTTP 插件不可用，回退到浏览器 fetch')
}

/**
 * 通用 fetch 函数
 * Tauri 环境走插件（无 CORS），浏览器走 window.fetch
 */
export function apiFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  if (tauriFetch) {
    return tauriFetch(input, init)
  }
  return globalThis.fetch(input, init)
}
