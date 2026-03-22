/**
 * Pinia Store — 对话管理
 *
 * 所有对话数据通过 Tauri IPC 持久化到本地文件系统。
 * 文件存储于 ~/.aiagent/conversations/{id}.json
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 尝试导入 Tauri API
let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null
try {
  const tauri = await import('@tauri-apps/api/core')
  invoke = tauri.invoke
} catch {
  console.warn('[ChatStore] Tauri API 不可用')
}

/** 消息内容块 */
export interface ContentBlock {
  type: string
  text?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
}

/** 对话消息 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: ContentBlock[]
  createdAt: string
  usage?: string
}

/** 对话摘要（列表展示） */
export interface ConversationSummary {
  id: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
  messageCount: number
  preview: string
}

/** 完整对话（含消息） */
export interface Conversation {
  id: string
  title: string
  model: string
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

  /** 是否已加载 */
  const isLoaded = ref(false)

  // ==================== 计算属性 ====================

  /** 当前对话摘要 */
  const currentConversation = computed(() =>
    conversations.value.find(c => c.id === currentConversationId.value)
  )

  // ==================== 初始化 ====================

  /** 初始化：从文件系统加载对话列表 */
  async function init () {
    if (isLoaded.value) return
    await loadConversationList()
    isLoaded.value = true
  }

  // ==================== CRUD ====================

  /** 加载对话列表 */
  async function loadConversationList () {
    if (!invoke) return
    try {
      const list = await invoke('cmd_list_conversations') as Array<{
        id: string; title: string; model: string;
        created_at: string; updated_at: string;
        message_count: number; preview: string;
      }>
      conversations.value = list.map(c => ({
        id: c.id,
        title: c.title,
        model: c.model,
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
  function createConversation (model?: string): string {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const m = model || currentModel.value

    // 切换到新对话
    currentConversationId.value = id
    currentModel.value = m
    messages.value = []

    // 立即添加到列表顶部
    conversations.value.unshift({
      id,
      title: '新对话',
      model: m,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      preview: '',
    })

    return id
  }

  /** 加载指定对话 */
  async function loadConversation (id: string) {
    if (!invoke) return
    try {
      const conv = await invoke('cmd_load_conversation', { id }) as {
        id: string; title: string; model: string;
        created_at: string; updated_at: string;
        messages: Array<{
          id: string; role: string;
          content: Array<{ type: string; text?: string; name?: string; id?: string }>;
          created_at: string; usage?: string;
        }>;
      }

      currentConversationId.value = conv.id
      currentModel.value = conv.model
      messages.value = conv.messages.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content.map(b => ({ type: b.type, text: b.text, name: b.name, id: b.id })),
        createdAt: m.created_at,
        usage: m.usage,
      }))
    } catch (e) {
      console.error('[ChatStore] 加载对话失败:', e)
    }
  }

  /** 保存当前对话到文件系统 */
  async function saveCurrentConversation () {
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
          })),
          created_at: m.createdAt,
          usage: m.usage || null,
        })),
      }

      await invoke('cmd_save_conversation', { conversation })

      // 更新列表中的摘要
      const idx = conversations.value.findIndex(c => c.id === currentConversationId.value)
      const preview = messages.value.length > 0
        ? (messages.value[messages.value.length - 1].content
          .find(b => b.type === 'text')?.text || '').slice(0, 80)
        : ''

      const summary: ConversationSummary = {
        id: currentConversationId.value,
        title,
        model: currentModel.value,
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
    if (!invoke) return
    try {
      await invoke('cmd_delete_conversation', { id })
      conversations.value = conversations.value.filter(c => c.id !== id)

      // 如果删除的是当前对话，清空状态
      if (currentConversationId.value === id) {
        currentConversationId.value = null
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

  return {
    // 状态
    conversations,
    currentConversationId,
    messages,
    currentModel,
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
  }
})
