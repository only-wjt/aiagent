/**
 * useSidecar — Sidecar IPC 通信组合式函数
 *
 * 封装 Tauri IPC 命令，管理 Sidecar 生命周期。
 * 开发模式下回退到直接 HTTP 调用。
 */

import { ref } from 'vue'

// 尝试导入 Tauri API（开发模式下可能不可用）
let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null
try {
  const tauri = await import('@tauri-apps/api/core')
  invoke = tauri.invoke
} catch {
  console.warn('[useSidecar] Tauri API 不可用，使用直接 HTTP 模式')
}

/** Sidecar 连接信息 */
export interface SidecarConnection {
  sessionId: string
  port: number
  healthy: boolean
}

export function useSidecar () {
  const connection = ref<SidecarConnection | null>(null)
  const isConnecting = ref(false)
  const error = ref<string | null>(null)

  /** 默认开发模式端口 */
  const DEV_PORT = 31415

  /**
   * 确保 Session 有运行中的 Sidecar
   */
  async function ensureSidecar (
    sessionId: string,
    workspacePath: string = '~',
    ownerId: string = 'tab-default'
  ): Promise<SidecarConnection> {
    isConnecting.value = true
    error.value = null

    try {
      if (invoke) {
        // Tauri 模式：通过 IPC 管理 Sidecar
        const result = await invoke('cmd_ensure_session_sidecar', {
          sessionId,
          workspacePath,
          ownerType: 'tab',
          ownerId,
        }) as { session_id: string; port: number; healthy: boolean }

        connection.value = {
          sessionId: result.session_id,
          port: result.port,
          healthy: result.healthy,
        }
      } else {
        // 开发模式：假设 Sidecar 已在本地运行
        connection.value = {
          sessionId,
          port: DEV_PORT,
          healthy: true,
        }
      }

      return connection.value
    } catch (e) {
      error.value = (e as Error).message || '连接 Sidecar 失败'
      throw e
    } finally {
      isConnecting.value = false
    }
  }

  /**
   * 释放 Sidecar
   */
  async function releaseSidecar (sessionId: string, ownerId: string = 'tab-default') {
    if (invoke) {
      await invoke('cmd_release_session_sidecar', {
        sessionId,
        ownerType: 'tab',
        ownerId,
      })
    }
    connection.value = null
  }

  /**
   * 获取 Sidecar 的 API 基础 URL
   */
  function getBaseUrl (): string {
    const port = connection.value?.port || DEV_PORT
    return `http://localhost:${port}`
  }

  /**
   * 向 Sidecar 发送 API 请求
   */
  async function apiPost<T = unknown> (
    path: string,
    body: unknown
  ): Promise<T> {
    const response = await fetch(`${getBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`)
    }
    return response.json() as Promise<T>
  }

  async function apiGet<T = unknown> (path: string): Promise<T> {
    const response = await fetch(`${getBaseUrl()}${path}`)
    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`)
    }
    return response.json() as Promise<T>
  }

  return {
    connection,
    isConnecting,
    error,
    ensureSidecar,
    releaseSidecar,
    getBaseUrl,
    apiPost,
    apiGet,
  }
}
