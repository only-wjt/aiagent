/**
 * Pinia Store — 工作区管理
 *
 * 工作区配置通过 Tauri IPC 持久化到 ~/.aiagent/workspaces.json。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getTauriInvoke } from '../utils/tauri'

/** 工作区定义 */
export interface Workspace {
  id: string
  name: string
  path: string
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const workspaces = ref<Workspace[]>([])
  const isLoaded = ref(false)

  async function init () {
    if (isLoaded.value) return
    await load()
    isLoaded.value = true
  }

  async function load () {
    const invoke = await getTauriInvoke()
    if (!invoke) return
    try {
      const json = await invoke('cmd_read_json', { filename: 'workspaces.json' }) as string
      if (json && json !== 'null') {
        const saved: Workspace[] = JSON.parse(json)
        if (saved.length > 0) {
          workspaces.value = saved
        }
      }
    } catch (e) {
      console.error('[WorkspaceStore] 加载失败:', e)
    }
  }

  async function save () {
    const invoke = await getTauriInvoke()
    if (!invoke) return
    try {
      await invoke('cmd_write_json', {
        filename: 'workspaces.json',
        data: JSON.stringify(workspaces.value),
      })
    } catch (e) {
      console.error('[WorkspaceStore] 保存失败:', e)
    }
  }

  async function addWorkspace (name: string, path: string) {
    workspaces.value.push({
      id: `ws-${Date.now()}`,
      name: name.trim(),
      path: path.trim() || '~',
    })
    await save()
  }

  async function removeWorkspace (id: string) {
    workspaces.value = workspaces.value.filter(w => w.id !== id)
    await save()
  }

  return {
    workspaces,
    isLoaded,
    init,
    addWorkspace,
    removeWorkspace,
  }
})
