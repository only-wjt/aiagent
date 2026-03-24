/**
 * HTTP 工具 — 统一封装 fetch 请求
 *
 * 在 Tauri 环境下使用 @tauri-apps/plugin-http 的 fetch，
 * 绕过浏览器 CORS 限制。在普通浏览器环境下回退到 window.fetch。
 */

let tauriFetchPromise: Promise<typeof globalThis.fetch | null> | null = null

function getTauriFetch (): Promise<typeof globalThis.fetch | null> {
  if (!tauriFetchPromise) {
    tauriFetchPromise = import('@tauri-apps/plugin-http')
      .then((httpPlugin) => httpPlugin.fetch)
      .catch(() => null)
  }

  return tauriFetchPromise
}

/**
 * 通用 fetch 函数
 * Tauri 环境走插件（无 CORS），浏览器走 window.fetch
 */
export function apiFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  return getTauriFetch().then((tauriFetch) => {
    if (tauriFetch) {
      return tauriFetch(input, init)
    }

    return globalThis.fetch(input, init)
  })
}
