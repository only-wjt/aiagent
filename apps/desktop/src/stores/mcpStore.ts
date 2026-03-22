/**
 * Pinia Store — MCP 工具管理
 *
 * MCP (Model Context Protocol) 工具配置通过 Tauri IPC
 * 持久化到 ~/.aiagent/mcp_tools.json。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

// 尝试导入 Tauri API
let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null
try {
  const tauri = await import('@tauri-apps/api/core')
  invoke = tauri.invoke
} catch {
  console.warn('[McpStore] Tauri API 不可用')
}

/** MCP 工具配置 */
export interface McpTool {
  id: string
  name: string
  description: string
  command: string
  tags: string[]
  enabled: boolean
  status: 'connected' | 'disconnected' | 'error'
  env?: Record<string, string>
}

/** 默认工具列表 */
const DEFAULT_TOOLS: McpTool[] = [
  { id: 'playwright', name: 'Playwright 浏览器', description: '浏览器自动化，支持网页操作和截图', command: 'npx -y @anthropic-ai/mcp-playwright', tags: ['官方', '关键'], enabled: true, status: 'disconnected' },
  { id: 'duckduckgo', name: 'DuckDuckGo 搜索', description: '网络搜索引擎集成', command: 'npx -y @anthropic-ai/mcp-duckduckgo', tags: ['官方'], enabled: true, status: 'disconnected' },
  { id: 'tavily', name: 'Tavily 搜索引擎', description: '高质量 AI 搜索', command: 'npx -y tavily-mcp', tags: ['新'], enabled: false, status: 'disconnected' },
  { id: 'edge-tts', name: 'Edge TTS 语音合成', description: '文字转语音', command: 'npx -y edge-tts-mcp', tags: ['官方', '关键'], enabled: true, status: 'disconnected' },
]

export const useMcpStore = defineStore('mcp', () => {
  const tools = ref<McpTool[]>([...DEFAULT_TOOLS])
  const isLoaded = ref(false)

  async function init () {
    if (isLoaded.value) return
    await load()
    isLoaded.value = true
  }

  async function load () {
    if (!invoke) return
    try {
      const json = await invoke('cmd_read_json', { filename: 'mcp_tools.json' }) as string
      if (json && json !== 'null') {
        const saved: McpTool[] = JSON.parse(json)
        if (saved.length > 0) {
          // 恢复状态为 disconnected（重启后不保留连接状态）
          tools.value = saved.map(t => ({ ...t, status: 'disconnected' as const }))
        }
      }
    } catch (e) {
      console.error('[McpStore] 加载失败:', e)
    }
  }

  async function save () {
    if (!invoke) return
    try {
      await invoke('cmd_write_json', {
        filename: 'mcp_tools.json',
        data: JSON.stringify(tools.value),
      })
    } catch (e) {
      console.error('[McpStore] 保存失败:', e)
    }
  }

  async function addTool (tool: Omit<McpTool, 'id' | 'status'>) {
    tools.value.push({
      ...tool,
      id: `mcp-${Date.now()}`,
      status: 'disconnected',
    })
    await save()
  }

  async function updateTool (id: string, updates: Partial<McpTool>) {
    const t = tools.value.find(t => t.id === id)
    if (t) {
      Object.assign(t, updates)
      await save()
    }
  }

  async function removeTool (id: string) {
    tools.value = tools.value.filter(t => t.id !== id)
    await save()
  }

  async function toggleTool (id: string) {
    const t = tools.value.find(t => t.id === id)
    if (t) {
      t.enabled = !t.enabled
      await save()
    }
  }

  return {
    tools,
    isLoaded,
    init,
    addTool,
    updateTool,
    removeTool,
    toggleTool,
  }
})
