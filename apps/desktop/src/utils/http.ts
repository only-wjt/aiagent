/**
 * HTTP 工具 — 统一封装 fetch 请求
 *
 * 在 Tauri 环境下使用 @tauri-apps/plugin-http 的 fetch，
 * 绕过浏览器 CORS 限制。在普通浏览器环境下回退到 /api-proxy 本地代理。
 */

/** 是否在 Tauri 桌面运行时环境中 */
const isTauriEnv = !!(window as any).__TAURI_INTERNALS__

let tauriFetchPromise: Promise<typeof globalThis.fetch | null> | null = null

function getTauriFetch (): Promise<typeof globalThis.fetch | null> {
  // 不在 Tauri 环境中，直接返回 null
  if (!isTauriEnv) return Promise.resolve(null)

  if (!tauriFetchPromise) {
    tauriFetchPromise = import('@tauri-apps/plugin-http')
      .then((httpPlugin) => httpPlugin.fetch)
      .catch(() => null)
  }

  return tauriFetchPromise
}

/**
 * 通用 fetch 函数
 * Tauri 环境走插件（无 CORS），浏览器环境走 /api-proxy 本地代理绕过 CORS。
 */
export async function apiFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const tauriFetch = await getTauriFetch()

  // Tauri 桌面环境：直接用 Tauri HTTP 插件
  if (tauriFetch) {
    return tauriFetch(input, init)
  }

  // 浏览器环境：通过 Vite dev server 的 /api-proxy 中间件转发，绕过 CORS
  const targetUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const proxyUrl = `/api-proxy?target=${encodeURIComponent(targetUrl)}`
  return globalThis.fetch(proxyUrl, init)
}


