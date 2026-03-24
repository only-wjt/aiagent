/**
 * Pinia Store — 对话管理
 *
 * 所有对话数据通过 Tauri IPC 持久化到本地文件系统。
 * 文件存储于 ~/.aiagent/conversations/{id}.json
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getTauriInvoke } from '../utils/tauri'

/** 消息内容块 */
export interface ContentBlock {
  type: string
  text?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
  image_url?: { url: string }
}

export interface PersistedToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'pending' | 'running' | 'done' | 'error'
  result?: string
  error?: string
  duration?: number
  collapsed?: boolean
}

export type ChatMessageRole = 'user' | 'assistant' | 'tool'
export type AgentSessionMode = 'action' | 'plan' | 'autonomous'

/** 对话消息 */
export interface ChatMessage {
  id: string
  role: ChatMessageRole
  content: ContentBlock[]
  createdAt: string
  usage?: string
  model?: string
  thinking?: string
  thinkingDuration?: number
  toolCalls?: PersistedToolCall[]
  toolCallId?: string
  toolName?: string
}

/** 对话摘要（列表展示） */
export interface ConversationSummary {
  id: string
  title: string
  model: string
  providerId?: string
  createdAt: string
  updatedAt: string
  messageCount: number
  preview: string
  pinned?: boolean
  workspaceId?: string  // Agent 会话绑定的工作区 ID
}

/** 完整对话（含消息） */
export interface Conversation {
  id: string
  title: string
  model: string
  providerId?: string
  workspaceId?: string
  agentMode?: AgentSessionMode
  enabledTools?: Record<string, boolean>
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

export const useChatStore = defineStore('chat', () => {
  // ==================== 状态 ====================

  /** 对话列表（摘要） */
  const conversations = ref<ConversationSummary[]>([])

  /** 当前对话 ID */
  const currentConversationId = ref<string | null>(null)

  /** 当前对话消息 */
  const messages = ref<ChatMessage[]>([])

  /** 当前对话模型 */
  const currentModel = ref('claude-sonnet-4-20250514')

  /** 当前对话供应商 */
  const currentProviderId = ref<string | null>(null)

  /** 当前 Agent 会话模式（仅 Agent 会话使用） */
  const currentAgentMode = ref<AgentSessionMode | null>(null)

  /** 当前 Agent 会话工具开关（仅 Agent 会话使用） */
  const currentEnabledTools = ref<Record<string, boolean> | null>(null)

  /** 是否已加载 */
  const isLoaded = ref(false)

  // ==================== 计算属性 ====================

  /** 当前对话摘要 */
  const currentConversation = computed(() =>
    conversations.value.find(c => c.id === currentConversationId.value)
  )

  function normalizeChatMessageRole(role: string): ChatMessageRole {
    if (role === 'assistant' || role === 'tool') return role
    return 'user'
  }

  // ==================== 初始化 ====================

  /** 初始化：从文件系统加载对话列表 */
  async function init () {
    if (isLoaded.value) return
    await loadConversationList()
    await loadPinnedState()
    isLoaded.value = true
  }

  // ==================== CRUD ====================

  /** 加载对话列表 */
  async function loadConversationList () {
    const invoke = await getTauriInvoke()
    if (!invoke) return
    try {
      const list = await invoke('cmd_list_conversations') as Array<{
        id: string; title: string; model: string;
        provider_id?: string | null;
        workspace_id?: string | null;
        created_at: string; updated_at: string;
        message_count: number; preview: string;
      }>
      conversations.value = list.map(c => ({
        id: c.id,
        title: c.title,
        model: c.model,
        providerId: c.provider_id || undefined,
        workspaceId: c.workspace_id || undefined,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        messageCount: c.message_count,
        preview: c.preview,
      }))
    } catch (e) {
      console.error('[ChatStore] 加载对话列表失败:', e)
    }
  }

  /** 创建新对话 */
  function createConversation (model?: string, workspaceId?: string, providerId?: string): string {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const m = model || currentModel.value
    const p = providerId ?? currentProviderId.value ?? undefined

    // 切换到新对话
    currentConversationId.value = id
    currentModel.value = m
    currentProviderId.value = p || null
    currentAgentMode.value = null
    currentEnabledTools.value = null
    messages.value = []

    // 立即添加到列表顶部
    conversations.value.unshift({
      id,
      title: '新对话',
      model: m,
      providerId: p,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      preview: '',
      workspaceId,
    })

    return id
  }

  /** 加载指定对话 */
  async function loadConversation (id: string) {
    const invoke = await getTauriInvoke()
    if (!invoke) return
    try {
      const conv = await invoke('cmd_load_conversation', { id }) as {
        id: string; title: string; model: string;
        provider_id?: string | null;
        workspace_id?: string | null;
        agent_mode?: AgentSessionMode | null;
        enabled_tools?: Record<string, boolean> | null;
        created_at: string; updated_at: string;
        messages: Array<{
          id: string; role: string;
          content: Array<{ type: string; text?: string; name?: string; id?: string; image_url?: { url: string } }>;
          created_at: string; usage?: string;
          thinking?: string | null;
          thinking_duration?: number | null;
          tool_calls?: PersistedToolCall[] | null;
          tool_call_id?: string | null;
          tool_name?: string | null;
        }>;
      }

      currentConversationId.value = conv.id
      currentModel.value = conv.model
      currentProviderId.value = conv.provider_id || null
      currentAgentMode.value = conv.agent_mode || null
      currentEnabledTools.value = conv.enabled_tools || null
      const summary = conversations.value.find(c => c.id === conv.id)
      if (summary) {
        summary.workspaceId = conv.workspace_id || undefined
        summary.providerId = conv.provider_id || undefined
      }
      messages.value = conv.messages.map(m => ({
        id: m.id,
        role: normalizeChatMessageRole(m.role),
        content: m.content.map(b => ({ ...b })),
        createdAt: m.created_at,
        usage: m.usage,
        model: (m as any).model,
        thinking: m.thinking || undefined,
        thinkingDuration: m.thinking_duration || undefined,
        toolCalls: m.tool_calls || undefined,
        toolCallId: m.tool_call_id || undefined,
        toolName: m.tool_name || undefined,
      }))
    } catch (e) {
      console.error('[ChatStore] 加载对话失败:', e)
    }
  }

  /** 保存防抖定时器 */
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  /** 保存当前对话到文件系统（防抖，500ms 内多次调用只执行最后一次） */
  async function saveCurrentConversation () {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => _doSaveConversation(), 500)
  }

  /** 实际执行保存 */
  async function _doSaveConversation () {
    const invoke = await getTauriInvoke()
    if (!invoke || !currentConversationId.value) return
    try {
      // 自动生成标题：取第一条用户消息的前 30 字
      let title = '新对话'
      const firstUserMsg = messages.value.find(m => m.role === 'user')
      if (firstUserMsg) {
        const text = firstUserMsg.content
          .filter(b => b.type === 'text')
          .map(b => b.text || '')
          .join('')
        title = text.length > 30 ? text.slice(0, 30) + '…' : text
      }

      const now = new Date().toISOString()

      // 转为 Rust 结构（snake_case）
      const conversation = {
        id: currentConversationId.value,
        title,
        model: currentModel.value,
        provider_id: currentProviderId.value,
        workspace_id: currentConversation.value?.workspaceId || null,
        agent_mode: currentAgentMode.value,
        enabled_tools: currentEnabledTools.value,
        created_at: currentConversation.value?.createdAt || now,
        updated_at: now,
        messages: messages.value.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content.map(b => ({
            type: b.type,
            text: b.text || null,
            name: b.name || null,
            id: b.id || null,
            image_url: b.image_url || null,
          })),
          created_at: m.createdAt,
          usage: m.usage || null,
          thinking: m.thinking || null,
          thinking_duration: m.thinkingDuration || null,
          tool_calls: m.toolCalls || null,
          tool_call_id: m.toolCallId || null,
          tool_name: m.toolName || null,
        })),
      }

      await invoke('cmd_save_conversation', { conversation })

      // 更新列表中的摘要
      const idx = conversations.value.findIndex(c => c.id === currentConversationId.value)
      const previewMessage = [...messages.value].reverse().find(m => m.role !== 'tool')
        || messages.value[messages.value.length - 1]
      const preview = previewMessage
        ? (previewMessage.content.find(b => b.type === 'text')?.text || '').slice(0, 80)
        : ''

      const summary: ConversationSummary = {
        id: currentConversationId.value,
        title,
        model: currentModel.value,
        providerId: currentProviderId.value || undefined,
        workspaceId: currentConversation.value?.workspaceId,
        createdAt: conversation.created_at,
        updatedAt: now,
        messageCount: messages.value.length,
        preview,
      }

      if (idx >= 0) {
        conversations.value[idx] = summary
      } else {
        conversations.value.unshift(summary)
      }
    } catch (e) {
      console.error('[ChatStore] 保存对话失败:', e)
    }
  }

  /** 删除对话 */
  async function deleteConversation (id: string) {
    const invoke = await getTauriInvoke()
    if (!invoke) return
    try {
      await invoke('cmd_delete_conversation', { id })
      conversations.value = conversations.value.filter(c => c.id !== id)

      // 如果删除的是当前对话，清空状态
      if (currentConversationId.value === id) {
        currentConversationId.value = null
        currentProviderId.value = null
        currentAgentMode.value = null
        currentEnabledTools.value = null
        messages.value = []
      }
    } catch (e) {
      console.error('[ChatStore] 删除对话失败:', e)
    }
  }

  /** 添加消息到当前对话 */
  function addMessage (msg: ChatMessage) {
    messages.value.push(msg)
  }

  /** 清空当前对话（不删除文件，仅清空内存） */
  function clearCurrentMessages () {
    messages.value = []
  }

  /** 置顶/取消置顶（同步持久化） */
  async function togglePin (id: string) {
    const invoke = await getTauriInvoke()
    const conv = conversations.value.find(c => c.id === id)
    if (conv) {
      conv.pinned = !conv.pinned
      // 将置顶状态持久化
      if (invoke) {
        try {
          const pinnedIds = conversations.value
            .filter(c => c.pinned)
            .map(c => c.id)
          await invoke('cmd_write_json', {
            filename: 'pinned_conversations.json',
            data: JSON.stringify(pinnedIds),
          })
        } catch (e) {
          console.error('[ChatStore] 保存置顶状态失败:', e)
        }
      }
    }
  }

  /** 加载置顶状态 */
  async function loadPinnedState () {
    const invoke = await getTauriInvoke()
    if (!invoke) return
    try {
      const json = await invoke('cmd_read_json', {
        filename: 'pinned_conversations.json',
      }) as string | null
      if (json && json !== 'null') {
        const pinnedIds = JSON.parse(json) as string[]
        for (const conv of conversations.value) {
          conv.pinned = pinnedIds.includes(conv.id)
        }
      }
    } catch {
      // 首次运行无置顶数据，忽略
    }
  }

  return {
    // 状态
    conversations,
    currentConversationId,
    messages,
    currentModel,
    currentProviderId,
    currentAgentMode,
    currentEnabledTools,
    isLoaded,
    // 计算属性
    currentConversation,
    // 方法
    init,
    loadConversationList,
    createConversation,
    loadConversation,
    saveCurrentConversation,
    deleteConversation,
    addMessage,
    clearCurrentMessages,
    togglePin,
  }
})
