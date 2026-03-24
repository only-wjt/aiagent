import type { invoke as tauriInvoke } from '@tauri-apps/api/core'

type TauriInvoke = typeof tauriInvoke

let invokePromise: Promise<TauriInvoke | null> | null = null

export function getTauriInvoke (): Promise<TauriInvoke | null> {
  if (!invokePromise) {
    invokePromise = import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke)
      .catch(() => null)
  }

  return invokePromise
}
