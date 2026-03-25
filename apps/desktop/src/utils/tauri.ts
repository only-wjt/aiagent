import type { invoke as tauriInvoke } from '@tauri-apps/api/core'

type TauriInvoke = typeof tauriInvoke

let invokePromise: Promise<TauriInvoke | null> | null = null

/**
 * 获取 Tauri invoke 方法
 *
 * 通过检查 window.__TAURI_INTERNALS__ 判断是否在 Tauri 桌面环境中运行。
 * 该全局变量由 Tauri 运行时自动注入，在浏览器中不存在。
 */
export function getTauriInvoke (): Promise<TauriInvoke | null> {
  // 快速判断：不在 Tauri 运行时环境中，直接返回 null
  if (!(window as any).__TAURI_INTERNALS__) {
    return Promise.resolve(null)
  }

  if (!invokePromise) {
    invokePromise = import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke)
      .catch(() => null)
  }

  return invokePromise
}


