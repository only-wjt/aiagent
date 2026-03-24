<template>
  <div class="chat-page">
    <!-- 顶部工具栏 -->
    <div class="chat-toolbar">
      <div class="toolbar-left flex-center gap-xs">
        <MessageSquare :size="16" /> <span class="toolbar-title">对话</span>
        <span v-if="messages.length > 0" class="toolbar-count">{{ messages.length }} 条消息</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-ghost btn-sm btn-flex" @click="exportToMarkdown" :disabled="messages.length === 0" title="导出为 Markdown">
          <Download :size="14" /> 导出
        </button>
        <button class="btn btn-ghost btn-sm btn-flex" @click="forkCurrentConversation" :disabled="messages.length === 0" title="分叉当前对话">
          <GitBranch :size="14" /> 分叉
        </button>
        <button class="btn btn-ghost btn-sm btn-flex" @click="clearChat" :disabled="messages.length === 0 && !isStreaming">
          <Trash2 :size="14" /> 清空
        </button>
        <button class="btn btn-secondary btn-sm btn-flex" @click="newChat">
          <Plus :size="14" /> 新对话
        </button>
      </div>
    </div>

    <!-- 消息列表 -->
    <div ref="messageListRef" class="message-list" @scroll="onMessageScroll">
      <div v-if="messages.length === 0 && !isStreaming" class="chat-empty">
        <MessageSquare class="chat-empty-icon" :size="48" stroke-width="1" />
        <h3>开始新对话</h3>
        <p>输入你的问题，AI Agent 将为你服务</p>
        <p v-if="!hasApiKey" class="hint-text">
          ⚠️ 请先在 <router-link to="/settings" class="hint-link">设置 → 模型供应商</router-link> 中配置 API Key
        </p>
      </div>

      <div
        v-for="(msg, idx) in messages"
        :key="msg.id"
        class="message-row animate-slide-up"
        :class="msg.role"
      >
        <!-- AI 消息：左侧 -->
        <template v-if="msg.role === 'assistant'">
          <div class="message-avatar"><Bot :size="20" stroke-width="1.5" /></div>
          <div class="message-content-wrap">
            <div class="message-header">
              <span class="message-sender">{{ msg.model || currentModel }}</span>
              <span class="message-timestamp">{{ formatTime(msg.createdAt) }}</span>
              <span v-if="msg.usage" class="message-token-info">{{ msg.usage }}</span>
            </div>
            <div class="message-bubble bubble-assistant">
              <div class="message-body">
                <!-- 图片内容块 -->
                <template v-for="(block, bi) in msg.content" :key="bi">
                  <div v-if="block.type === 'image_url'" class="msg-image-wrap">
                    <img :src="(block as any).image_url?.url" class="msg-image" alt="图片" />
                  </div>
                  <div v-else-if="block.type === 'text'" v-html="renderMarkdown(block.text || '')"></div>
                </template>
              </div>
            </div>
            <!-- 悬浮操作栏 -->
            <div class="msg-actions">
              <button class="msg-action-btn" @click="forkConversationAt(idx)" title="从此处分叉"><GitBranch :size="14" /></button>
              <button class="msg-action-btn" @click="regenerateMessage(idx)" title="重新生成"><RotateCcw :size="14" /></button>
              <button class="msg-action-btn" @click="copyMessage(msg)" title="复制"><Copy :size="14" /></button>
              <button class="msg-action-btn" @click="deleteMessage(idx)" title="删除"><Trash2 :size="14" /></button>
            </div>
          </div>
        </template>

        <!-- 用户消息：右侧 -->
        <template v-else-if="msg.role === 'user'">
          <div class="message-content-wrap">
            <div class="message-header message-header-right">
              <span v-if="msg.usage" class="message-token-info">{{ msg.usage }}</span>
              <span class="message-timestamp">{{ formatTime(msg.createdAt) }}</span>
              <span class="message-sender">onlyWjt</span>
            </div>
            <div class="message-bubble bubble-user">
              <div class="message-body">
                <!-- 图片内容块 -->
                <template v-for="(block, bi) in msg.content" :key="bi">
                  <div v-if="block.type === 'image_url'" class="msg-image-wrap">
                    <img :src="(block as any).image_url?.url" class="msg-image" alt="图片" />
                  </div>
                  <span v-else-if="block.type === 'text'">{{ block.text }}</span>
                </template>
              </div>
            </div>
            <!-- 悬浮操作栏 -->
            <div class="msg-actions msg-actions-right">
              <button class="msg-action-btn" @click="forkConversationAt(idx)" title="从此处分叉"><GitBranch :size="14" /></button>
              <button class="msg-action-btn" @click="editMessage(idx)" title="编辑"><Edit2 :size="14" /></button>
              <button class="msg-action-btn" @click="copyMessage(msg)" title="复制"><Copy :size="14" /></button>
              <button class="msg-action-btn" @click="deleteMessage(idx)" title="删除"><Trash2 :size="14" /></button>
            </div>
          </div>
          <div class="message-avatar user-avatar"><User :size="20" stroke-width="1.5" /></div>
        </template>

        <!-- 工具消息：中性展示，避免误当作用户消息 -->
        <template v-else>
          <div class="message-avatar"><Bot :size="20" stroke-width="1.5" /></div>
          <div class="message-content-wrap">
            <div class="message-header">
              <span class="message-sender">{{ msg.toolName || '工具输出' }}</span>
              <span class="message-timestamp">{{ formatTime(msg.createdAt) }}</span>
            </div>
            <div class="message-bubble bubble-assistant">
              <div class="message-body">
                <template v-for="(block, bi) in msg.content" :key="bi">
                  <div v-if="block.type === 'text'" v-html="renderMarkdown(block.text || '')"></div>
                </template>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 流式输出中 -->
      <div v-if="isStreaming" class="message-row assistant animate-fade-in">
        <div class="message-avatar"><Bot :size="20" stroke-width="1.5" /></div>
        <div class="message-content-wrap">
          <div class="message-header">
            <span class="message-sender">{{ currentModel }}</span>
            <span class="message-timestamp">正在生成...</span>
          </div>
          <div class="message-bubble bubble-assistant">
            <div class="message-body">
              <div v-html="renderMarkdown(streamingText)"></div>
              <span v-if="streamingText.length === 0" class="loading-dots">
                <span>●</span><span>●</span><span>●</span>
              </span>
              <span v-else class="cursor-blink">|</span>
            </div>
          </div>
          <div v-if="streamingUsage" class="message-meta">
            {{ streamingUsage }}
          </div>
        </div>
      </div>
    </div>

    <!-- 回到底部 FAB -->
    <Transition name="fab">
      <button v-if="showScrollBtn" class="scroll-bottom-fab" @click="scrollToBottom">
        ↓
      </button>
    </Transition>

    <!-- 输入区域 -->
    <div class="chat-input-area">
      <div class="chat-input-container" :class="{ focused: isFocused }">
        <!-- 图片预览 -->
        <div v-if="pendingImages.length > 0" class="image-preview-row">
          <div v-for="(img, i) in pendingImages" :key="i" class="image-preview-item">
            <img :src="img" class="preview-thumb" alt="预览" />
            <button class="preview-remove" @click="removePendingImage(i)">×</button>
          </div>
        </div>
        <textarea
          ref="textareaRef"
          v-model="inputText"
          class="chat-textarea"
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          rows="1"
          @keydown="handleKeydown"
          @input="autoResize"
          @focus="isFocused = true"
          @blur="isFocused = false"
          @paste="handlePaste"
        />
        <div class="chat-input-actions">
          <div class="input-left">
            <!-- 工具栏图标 -->
            <button class="toolbar-icon-btn" @click="triggerImageUpload" title="上传图片">
              <ImageIcon :size="16" />
            </button>
            <input ref="imageInputRef" type="file" accept="image/*" multiple style="display:none" @change="onImageSelected" />
            <!-- 模型选择器 -->
            <div class="model-picker-wrapper">
              <span class="model-badge badge badge-primary" @click="showModelPicker = !showModelPicker">
                {{ modelDisplayName(currentModel) }} ▾
              </span>
              <div v-if="showModelPicker" class="model-dropdown card">
                <div v-if="availableModels.length === 0" class="model-option" style="opacity:0.5;cursor:default">
                  无可用模型，请在设置中配置
                </div>
                <div
                  v-for="m in availableModels"
                  :key="m.id + '-' + m.providerId"
                  class="model-option"
                  :class="{ active: currentModel === m.id && currentProviderId === m.providerId }"
                  @click="selectModel(m.id, m.providerId)"
                >
                  <span class="model-option-name">{{ m.name }}</span>
                  <span class="model-option-desc">{{ m.providerName }}</span>
                </div>
              </div>
            </div>
            <span v-if="hasApiKey" class="status-dot connected" title="已连接"></span>
            <span v-else class="status-dot disconnected" title="未配置 API Key"></span>
          </div>
          <div class="action-buttons">
            <button v-if="isStreaming" class="btn btn-ghost btn-stop btn-flex" @click="stopStreaming">
              <StopCircle :size="14" /> 停止
            </button>
            <button
              class="btn btn-primary btn-send"
              :disabled="(!inputText.trim() && pendingImages.length === 0) || isStreaming"
              @click="sendMessage"
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 工具执行确认对话框 (action 模式) -->
    <div v-if="pendingToolCall" class="tool-approval-modal">
      <div class="modal-overlay" @click="rejectPendingTool"></div>
      <div class="modal-content">
        <h3>确认工具执行</h3>
        <p class="tool-name">工具: <code>{{ pendingToolCall.toolCall.name }}</code></p>
        <div class="tool-args">
          <p>参数:</p>
          <pre>{{ JSON.stringify(pendingToolCall.toolCall.args, null, 2) }}</pre>
        </div>
        <p class="modal-hint">按 <kbd>Ctrl+Enter</kbd> 确认，<kbd>Esc</kbd> 拒绝</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" :disabled="toolApprovalLoading" @click="rejectPendingTool">拒绝</button>
          <button class="btn btn-primary" :disabled="toolApprovalLoading" @click="approvePendingTool">确认执行</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, computed, inject, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSidecar } from '../composables/useSidecar'
import { useConfigStore } from '../stores/configStore'
import { useChatStore, type ChatMessage } from '../stores/chatStore'
import { useSkillStore } from '../stores/skillStore'
import { useAgentStore } from '../stores/agentStore'
import { apiFetch } from '../utils/http'
import { renderMarkdown } from '../utils/markdown'
import { MessageSquare, Trash2, Plus, Bot, User, Copy, RotateCcw, Edit2, StopCircle, Download, ImageIcon, GitBranch } from 'lucide-vue-next'

const { ensureSidecar, releaseSidecar, getBaseUrl } = useSidecar()
const route = useRoute()
const router = useRouter()
const configStore = useConfigStore()
const chatStore = useChatStore()
const skillStore = useSkillStore()
const agentStore = useAgentStore()

// 注入全局 Toast
const showToast = inject<(message: string, type?: 'success' | 'error' | 'info') => void>('showToast', () => {})

const messageListRef = ref<HTMLElement>()
const textareaRef = ref<HTMLTextAreaElement>()

// 从 chatStore 读取消息和模型（响应式）
const messages = computed(() => chatStore.messages)
const currentModel = computed({
  get: () => chatStore.currentModel,
  set: (v) => { chatStore.currentModel = v },
})
const currentProviderId = computed({
  get: () => chatStore.currentProviderId,
  set: (v) => { chatStore.currentProviderId = v },
})

const inputText = ref('')
const isStreaming = ref(false)
const streamingText = ref('')
const streamingUsage = ref('')
const isFocused = ref(false)
const showModelPicker = ref(false)
const showScrollBtn = ref(false)

// 图片上传相关
const pendingImages = ref<string[]>([])
const imageInputRef = ref<HTMLInputElement | null>(null)
let currentAbortController: AbortController | null = null
const sidecarOwnerId = `chat-${crypto.randomUUID()}`
const attachedSidecarSessionId = ref<string | null>(null)

// 工具执行确认
const pendingToolCall = computed(() => agentStore.pendingToolCall)
const toolApprovalLoading = ref(false)

function approvePendingTool() {
  if (pendingToolCall.value && !toolApprovalLoading.value) {
    toolApprovalLoading.value = true
    agentStore.approveToolCall()
    showToast('已批准工具执行', 'success')
    toolApprovalLoading.value = false
  }
}

function rejectPendingTool() {
  if (pendingToolCall.value && !toolApprovalLoading.value) {
    toolApprovalLoading.value = true
    agentStore.rejectToolCall()
    showToast('已拒绝工具执行', 'info')
    toolApprovalLoading.value = false
  }
}

// 可用模型列表：仅显示已配置供应商中已启用的模型
const availableModels = computed(() => {
  return configStore.allEnabledModels()
})
const selectedProvider = computed(() => {
  return configStore.findProviderByModel(currentModel.value, currentProviderId.value || undefined) || configStore.defaultProvider
})
const activeSidecarSessionId = computed(() => chatStore.currentConversationId || 'default')
const activeWorkspacePath = computed(() => configStore.appConfig.defaultWorkspacePath || '~')

function modelDisplayName(id: string) {
  const m = availableModels.value.find(m => m.id === id)
  if (m) return m.name
  // 截短过长的模型 ID
  return id.length > 25 ? id.slice(0, 22) + '…' : id
}

function selectModel(id: string, providerId: string) {
  currentModel.value = id
  currentProviderId.value = providerId
  showModelPicker.value = false
}

// 点击外部关闭 model dropdown
function handleGlobalClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.model-picker-wrapper')) {
    showModelPicker.value = false
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (!pendingToolCall.value) return
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault()
    approvePendingTool()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    rejectPendingTool()
  }
}

async function ensureActiveSidecarSession(sessionId: string = activeSidecarSessionId.value) {
  if (attachedSidecarSessionId.value && attachedSidecarSessionId.value !== sessionId) {
    await releaseActiveSidecarSession(attachedSidecarSessionId.value)
  }

  const connection = await ensureSidecar(sessionId, activeWorkspacePath.value, sidecarOwnerId)
  attachedSidecarSessionId.value = connection.sessionId
  return connection
}

async function releaseActiveSidecarSession(sessionId: string | null = attachedSidecarSessionId.value) {
  if (!sessionId) return

  try {
    await releaseSidecar(sessionId, sidecarOwnerId)
  } catch (error) {
    console.warn('[Chat] 释放 Sidecar 失败:', error)
  } finally {
    if (attachedSidecarSessionId.value === sessionId) {
      attachedSidecarSessionId.value = null
    }
  }
}

onMounted(() => {
  document.addEventListener('click', handleGlobalClick)
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
  document.removeEventListener('keydown', handleKeyDown)
})

async function syncChatSessionFromRoute() {
  const sessionId = route.params.sessionId as string | undefined
  if (isStreaming.value && sessionId !== chatStore.currentConversationId) {
    stopStreaming()
  }
  if (sessionId && chatStore.currentConversationId !== sessionId) {
    await chatStore.loadConversation(sessionId)
  }
  if (!chatStore.currentProviderId && selectedProvider.value?.id) {
    currentProviderId.value = selectedProvider.value.id
  }
}

watch(() => chatStore.currentConversationId, (nextId, prevId) => {
  if (prevId && prevId !== nextId) {
    void releaseActiveSidecarSession(prevId)
  }
})

watch(() => route.params.sessionId, () => {
  void syncChatSessionFromRoute()
}, { immediate: true })

function clearChat() {
  if (isStreaming.value) stopStreaming()
  chatStore.clearCurrentMessages()
}

function newChat() {
  clearChat()
  const sessionId = chatStore.createConversation(
    currentModel.value,
    undefined,
    selectedProvider.value?.id || currentProviderId.value || undefined,
  )
  router.push(`/chat/${sessionId}`)
  inputText.value = ''
  textareaRef.value?.focus()
}

// 检查是否有可用的 API Key
const hasApiKey = computed(() => {
  return !!selectedProvider.value?.apiKey
})

function isUserOrAssistantMessage(msg: ChatMessage): msg is ChatMessage & { role: 'user' | 'assistant' } {
  return msg.role === 'user' || msg.role === 'assistant'
}

// 获取消息文本
function getMessageText(msg: ChatMessage): string {
  return msg.content
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('')
}

type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type AnthropicContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

type SidecarHistoryMessage = {
  role: 'user' | 'assistant'
  content: string | AnthropicContentPart[]
}

type ResponsesContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }

function parseImageDataUrl(url: string): { mediaType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mediaType: match[1], data: match[2] }
}

function buildOpenAIMessageContent(blocks: ChatMessage['content']): string | OpenAIContentPart[] {
  const hasImages = blocks.some(block => block.type === 'image_url' && !!block.image_url?.url)
  if (!hasImages) {
    return blocks
      .filter(block => block.type === 'text')
      .map(block => block.text || '')
      .join('')
  }

  const parts: OpenAIContentPart[] = []
  for (const block of blocks) {
    if (block.type === 'text' && block.text) {
      parts.push({ type: 'text', text: block.text })
    } else if (block.type === 'image_url' && block.image_url?.url) {
      parts.push({ type: 'image_url', image_url: { url: block.image_url.url } })
    }
  }
  return parts
}

function buildAnthropicMessageContent(blocks: ChatMessage['content']): string | AnthropicContentPart[] {
  const hasImages = blocks.some(block => block.type === 'image_url' && !!block.image_url?.url)
  if (!hasImages) {
    return blocks
      .filter(block => block.type === 'text')
      .map(block => block.text || '')
      .join('')
  }

  const parts: AnthropicContentPart[] = []
  for (const block of blocks) {
    if (block.type === 'text' && block.text) {
      parts.push({ type: 'text', text: block.text })
    } else if (block.type === 'image_url' && block.image_url?.url) {
      const image = parseImageDataUrl(block.image_url.url)
      if (image) {
        parts.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mediaType,
            data: image.data,
          },
        })
      }
    }
  }
  return parts
}

function buildResponsesMessageContent(blocks: ChatMessage['content']): string | ResponsesContentPart[] {
  const hasImages = blocks.some(block => block.type === 'image_url' && !!block.image_url?.url)
  if (!hasImages) {
    return blocks
      .filter(block => block.type === 'text')
      .map(block => block.text || '')
      .join('')
  }

  const parts: ResponsesContentPart[] = []
  for (const block of blocks) {
    if (block.type === 'text' && block.text) {
      parts.push({ type: 'input_text', text: block.text })
    } else if (block.type === 'image_url' && block.image_url?.url) {
      parts.push({ type: 'input_image', image_url: block.image_url.url })
    }
  }
  return parts
}

function buildOpenAIHistoryMessages() {
  return chatStore.messages
    .filter(isUserOrAssistantMessage)
    .map(m => ({
    role: m.role,
    content: buildOpenAIMessageContent(m.content),
    }))
}

function buildAnthropicHistoryMessages() {
  return chatStore.messages
    .filter(isUserOrAssistantMessage)
    .map(m => ({
    role: m.role,
    content: buildAnthropicMessageContent(m.content),
    }))
}

function buildSidecarHistoryMessages(): SidecarHistoryMessage[] {
  return chatStore.messages
    .slice(0, -1)
    .filter(isUserOrAssistantMessage)
    .map(m => ({
    role: m.role,
    content: buildAnthropicMessageContent(m.content),
    }))
}

function buildResponsesInputMessages() {
  return chatStore.messages
    .filter(isUserOrAssistantMessage)
    .map(m => ({
      role: m.role,
      content: buildResponsesMessageContent(m.content),
    }))
}

function buildCurrentSidecarMessageContent() {
  const lastUserMessage = [...chatStore.messages].reverse().find(m => m.role === 'user')
  if (!lastUserMessage) return ''
  return buildAnthropicMessageContent(lastUserMessage.content)
}

// 发送消息
async function sendMessage() {
  const text = inputText.value.trim()
  if ((!text && pendingImages.value.length === 0) || isStreaming.value) return

  // 获取 API Key
  const provider = selectedProvider.value
  if (provider?.id && currentProviderId.value !== provider.id) {
    currentProviderId.value = provider.id
  }

  // 如果还没有当前对话，创建一个
  if (!chatStore.currentConversationId) {
    const sessionId = chatStore.createConversation(
      currentModel.value,
      undefined,
      provider?.id || currentProviderId.value || undefined,
    )
    router.replace(`/chat/${sessionId}`)
  }

  // 构建 content 数组（支持图片）
  const contentBlocks: any[] = []
  for (const imgData of pendingImages.value) {
    contentBlocks.push({ type: 'image_url', image_url: { url: imgData } })
  }
  if (text) {
    contentBlocks.push({ type: 'text', text })
  }

  // 添加用户消息
  chatStore.addMessage({
    id: crypto.randomUUID(),
    role: 'user',
    content: contentBlocks,
    createdAt: new Date().toISOString(),
  })

  inputText.value = ''
  pendingImages.value = []
  // 重置 textarea 高度
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
  }
  scrollToBottom()

  // 开始流式响应
  isStreaming.value = true
  streamingText.value = ''
  streamingUsage.value = ''

  try {
    if (provider?.apiKey) {
      await streamAuto(text, provider.apiKey, provider.baseUrl, provider.endpointType)
    } else {
      await mockStream(text)
    }
  } catch (error) {
    console.error('[Chat] 发送消息失败:', error)
    streamingText.value = `❌ 错误: ${(error as Error).message}`
  }

  // 完成流式输出 → 添加到消息列表
  if (streamingText.value) {
    chatStore.addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: [{ type: 'text', text: streamingText.value }],
      createdAt: new Date().toISOString(),
      usage: streamingUsage.value || undefined,
      model: currentModel.value,
    })
  }
  isStreaming.value = false
  streamingText.value = ''

  // 自动保存对话到文件系统
  await chatStore.saveCurrentConversation()
}

/** 从 Sidecar SSE 流式读取（POST，避免 apiKey 暴露在 URL 中） */
async function streamFromSidecar(prompt: string, apiKey: string, baseUrl?: string, endpointType?: string) {
  const sessionId = activeSidecarSessionId.value
  await ensureActiveSidecarSession(sessionId)
  const sidecarUrl = getBaseUrl()
  const messageContent = buildCurrentSidecarMessageContent()
  const historyMessages = buildSidecarHistoryMessages()

  currentAbortController = new AbortController()
  const response = await fetch(`${sidecarUrl}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      prompt,
      apiKey,
      model: currentModel.value,
      baseUrl,
      endpointType,
      skillPrompt: skillStore.combinedSkillPrompt,
      messageContent,
      historyMessages,
    }),
    signal: currentAbortController.signal,
  })

  if (!response.ok) {
    throw new Error(`Sidecar 返回 ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法获取响应流')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // 解析 SSE 事件
    while (buffer.includes('\n\n')) {
      const pos = buffer.indexOf('\n\n')
      const eventStr = buffer.slice(0, pos)
      buffer = buffer.slice(pos + 2)

      for (const line of eventStr.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            handleSSEEvent(data)
          } catch {}
        }
      }
    }
  }
}

/** 处理 Sidecar 自定义 SSE 事件 */
function handleSSEEvent(event: { type: string; data?: Record<string, unknown> }) {
  switch (event.type) {
    case 'message:chunk':
      if (event.data && typeof event.data === 'object' && 'text' in event.data) {
        streamingText.value += event.data.text as string
        scrollToBottom()
      }
      break
    case 'message:complete':
      if (event.data) {
        const usage = event.data.usage as { input_tokens?: number; output_tokens?: number } | undefined
        if (usage) {
          streamingUsage.value = `输入 ${usage.input_tokens} / 输出 ${usage.output_tokens} tokens`
        }
      }
      break
    case 'tool:start':
      if (event.data && 'name' in event.data) {
        streamingText.value += `\n\n🔧 调用工具: ${event.data.name}\n`
        scrollToBottom()
      }
      break
    case 'error':
      if (event.data && 'message' in event.data) {
        streamingText.value += `\n\n❌ ${event.data.message}`
      }
      break
  }
}

/**
 * 直接调用 OpenAI / OpenAI 兼容 API（无需 Sidecar）
 * 支持所有兼容 OpenAI Chat Completions 格式的服务（DeepSeek、通义千问等）
 */
async function streamFromOpenAI(_prompt: string, apiKey: string, baseUrl: string) {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`

  // 构建消息历史
  const historyMessages = buildOpenAIHistoryMessages()

  // 添加 system prompt（技能注入）
  const systemMessages: Array<{role: string; content: string}> = []
  if (skillStore.combinedSkillPrompt) {
    systemMessages.push({ role: 'system', content: skillStore.combinedSkillPrompt })
  }

  currentAbortController = new AbortController()
  const response = await apiFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: currentModel.value,
      messages: [
        ...systemMessages,
        ...historyMessages,
      ],
      stream: true,
    }),
    signal: currentAbortController.signal,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(`OpenAI API 返回 ${response.status}: ${errorBody.slice(0, 200)}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法获取响应流')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // 解析 OpenAI SSE 格式：data: {...}\n\n
    while (buffer.includes('\n')) {
      const pos = buffer.indexOf('\n')
      const line = buffer.slice(0, pos).trim()
      buffer = buffer.slice(pos + 1)

      if (!line || line.startsWith(':')) continue
      if (line === 'data: [DONE]') continue

      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          // OpenAI Chat Completions 流式格式
          const delta = data.choices?.[0]?.delta
          if (delta?.content) {
            streamingText.value += delta.content
            scrollToBottom()
          }
          // 检查用量（最后一个 chunk 可能包含）
          if (data.usage) {
            streamingUsage.value = `输入 ${data.usage.prompt_tokens} / 输出 ${data.usage.completion_tokens} tokens`
          }
        } catch {}
      }
    }
  }
}

/**
 * 直接调用 Anthropic Messages API（无需 Sidecar）
 */
async function streamFromAnthropic(_prompt: string, apiKey: string, baseUrl: string) {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`

  // 构建消息历史
  const historyMessages = buildAnthropicHistoryMessages()

  // System prompt
  const systemPrompt = skillStore.combinedSkillPrompt || undefined

  currentAbortController = new AbortController()
  const response = await apiFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: currentModel.value,
      max_tokens: 8192,
      system: systemPrompt,
      messages: historyMessages,
      stream: true,
    }),
    signal: currentAbortController.signal,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(`Anthropic API 返回 ${response.status}: ${errorBody.slice(0, 200)}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法获取响应流')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // 解析 Anthropic SSE 格式
    while (buffer.includes('\n')) {
      const pos = buffer.indexOf('\n')
      const line = buffer.slice(0, pos).trim()
      buffer = buffer.slice(pos + 1)

      if (!line || line.startsWith(':')) continue

      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          // Anthropic 流式事件类型
          if (data.type === 'content_block_delta' && data.delta?.text) {
            streamingText.value += data.delta.text
            scrollToBottom()
          }
          if (data.type === 'message_delta' && data.usage) {
            streamingUsage.value = `输入 ${data.usage.input_tokens || '?'} / 输出 ${data.usage.output_tokens || '?'} tokens`
          }
        } catch {}
      }
    }
  }
}

/**
 * 直接调用 OpenAI Responses API（/v1/responses，2025 年新接口）
 * 使用语义化 SSE 事件格式
 */
async function streamFromOpenAIResponses(_prompt: string, apiKey: string, baseUrl: string) {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/responses`

  // 构建输入：Responses API 使用 input 字段（支持字符串或消息数组）
  const historyMessages = buildResponsesInputMessages()

  // 构建 input 消息数组
  const inputMessages = historyMessages

  // 系统指令（技能注入）
  const instructions = skillStore.combinedSkillPrompt || undefined

  currentAbortController = new AbortController()
  const response = await apiFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: currentModel.value,
      input: inputMessages,
      instructions,
      stream: true,
    }),
    signal: currentAbortController.signal,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(`OpenAI Responses API 返回 ${response.status}: ${errorBody.slice(0, 200)}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法获取响应流')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // 解析 OpenAI Responses API 语义 SSE 格式（event: + data:）
    while (buffer.includes('\n\n')) {
      const pos = buffer.indexOf('\n\n')
      const eventBlock = buffer.slice(0, pos)
      buffer = buffer.slice(pos + 2)

      let eventType = ''
      let eventData = ''

      for (const line of eventBlock.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6)
        }
      }

      if (!eventData) continue

      try {
        const data = JSON.parse(eventData)

        // 处理不同的语义事件
        switch (eventType) {
          case 'response.output_text.delta':
            // 文本增量
            if (data.delta) {
              streamingText.value += data.delta
              scrollToBottom()
            }
            break

          case 'response.completed':
            // 响应完成，提取 token 用量
            if (data.response?.usage) {
              const u = data.response.usage
              streamingUsage.value = `输入 ${u.input_tokens || u.prompt_tokens || '?'} / 输出 ${u.output_tokens || u.completion_tokens || '?'} tokens`
            }
            break

          case 'response.failed':
            // 响应失败
            const errorMsg = data.response?.status_details?.error?.message || '未知错误'
            streamingText.value += `\n\n❌ ${errorMsg}`
            break

          case 'response.output_text.done':
            // 单个输出项完成，无需额外处理
            break

          default:
            // 其他事件（response.created, response.in_progress 等）忽略
            break
        }
      } catch {}
    }
  }
}

/**
 * 智能路由：根据 endpointType 选择正确的流式调用方式
 * 优先尝试 Sidecar，如果 Sidecar 不可用则直接调用 API
 */
async function streamAuto(prompt: string, apiKey: string, baseUrl?: string, endpointType?: string) {
  const type = endpointType || 'anthropic'
  const url = baseUrl || ''

  // 尝试 Sidecar 优先
  try {
    await ensureActiveSidecarSession()
    const sidecarUrl = getBaseUrl()
    if (await waitForSidecarReady(sidecarUrl)) {
      // Sidecar 可用，使用 Sidecar 中转
      await streamFromSidecar(prompt, apiKey, baseUrl, endpointType)
      return
    }
  } catch {}

  // Sidecar 不可用，直接调用 API
  if (type === 'openai-responses') {
    // OpenAI Responses API（/v1/responses）
    await streamFromOpenAIResponses(prompt, apiKey, url)
  } else if (type === 'openai' || type === 'deepseek' || type === 'openai-compatible') {
    await streamFromOpenAI(prompt, apiKey, url)
  } else if (type === 'anthropic') {
    await streamFromAnthropic(prompt, apiKey, url)
  } else if (type === 'gemini') {
    throw new Error('Gemini 供应商当前依赖 Sidecar 代理，请确认桌面侧 Sidecar 可用')
  } else {
    // 其他类型尝试 OpenAI 兼容格式
    await streamFromOpenAI(prompt, apiKey, url)
  }
}

async function waitForSidecarReady(sidecarUrl: string, retries: number = 8, delayMs: number = 250): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const healthCheck = await fetch(`${sidecarUrl}/health`, {
      signal: AbortSignal.timeout(1000),
    }).catch(() => null)

    if (healthCheck?.ok) {
      return true
    }

    if (attempt < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return false
}

/** 模拟流式输出（无 API Key 时） */
async function mockStream(prompt: string) {
  const response = `你好！我是 AI Agent。

你说的是：「${prompt}」

⚠️ **API Key 未配置**

请前往 **设置 → 模型供应商** 页面：
1. 找到 **Anthropic** 供应商
2. 输入你的 API Key
3. 点击 **测试连接**

配置完成后，我就能真正为你提供 AI 服务了！🚀`

  for (const char of response) {
    if (!isStreaming.value) break
    streamingText.value += char
    scrollToBottom()
    await new Promise(r => setTimeout(r, 15))
  }
}

function stopStreaming() {
  isStreaming.value = false
  currentAbortController?.abort()
  currentAbortController = null

  void fetch(`${getBaseUrl()}/api/chat/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: activeSidecarSessionId.value }),
  }).catch(() => {})
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  })
}

/** 滚动监听：用于控制“回到底部 FAB”的显隐 */
function onMessageScroll() {
  if (!messageListRef.value) return
  const el = messageListRef.value
  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  showScrollBtn.value = distFromBottom > 200
}

/** 复制消息全文到剪贴板（带 Toast 反馈） */
function copyMessage(msg: ChatMessage) {
  const text = getMessageText(msg)
  navigator.clipboard.writeText(text).then(() => {
    showToast('已复制到剪贴板', 'success')
  }).catch(() => {
    showToast('复制失败', 'error')
  })
}

/** 重新生成：删除该条 AI 消息，用上一条用户消息直接重新请求（不经过 sendMessage 避免重复添加用户消息） */
async function regenerateMessage(idx: number) {
  // 找到该 AI 消息前的用户消息
  const msgs = chatStore.messages
  let userPrompt = ''
  for (let i = idx - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') {
      userPrompt = getMessageText(msgs[i])
      break
    }
  }
  if (!userPrompt) return
  // 删除该条 AI 消息
  chatStore.messages.splice(idx, 1)
  scrollToBottom()

  // 直接发起流式请求，不再添加用户消息
  const provider = selectedProvider.value
  isStreaming.value = true
  streamingText.value = ''
  streamingUsage.value = ''
  try {
    if (provider?.apiKey) {
      await streamAuto(userPrompt, provider.apiKey, provider.baseUrl, provider.endpointType)
    } else {
      await mockStream(userPrompt)
    }
  } catch (error) {
    streamingText.value = `❌ 错误: ${(error as Error).message}`
  }
  // 完成流式输出 → 添加到消息列表
  if (streamingText.value) {
    chatStore.addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: [{ type: 'text', text: streamingText.value }],
      createdAt: new Date().toISOString(),
      usage: streamingUsage.value || undefined,
      model: currentModel.value,
    })
  }
  isStreaming.value = false
  streamingText.value = ''
  await chatStore.saveCurrentConversation()
}

/** 编辑重试：将用户消息填回输入框，并删除该消息及其之后的所有消息 */
function editMessage(idx: number) {
  const msg = chatStore.messages[idx]
  inputText.value = getMessageText(msg)
  // 删除当前消息及之后所有
  chatStore.messages.splice(idx)
  nextTick(() => textareaRef.value?.focus())
}

/** 删除单条消息 */
function deleteMessage(idx: number) {
  chatStore.messages.splice(idx, 1)
  chatStore.saveCurrentConversation()
}

async function forkCurrentConversation() {
  const sessionId = await chatStore.forkConversation()
  if (!sessionId) return
  router.push(`/chat/${sessionId}`)
  showToast('已创建对话分叉', 'success')
}

async function forkConversationAt(idx: number) {
  const msg = chatStore.messages[idx]
  if (!msg) return
  const sessionId = await chatStore.forkConversation(undefined, msg.id)
  if (!sessionId) return
  router.push(`/chat/${sessionId}`)
  showToast('已从当前消息创建分叉', 'success')
}

/** 触发图片文件选择 */
function triggerImageUpload() {
  imageInputRef.value?.click()
}

/** 图片文件选择回调 */
function onImageSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  for (const file of input.files) {
    if (!file.type.startsWith('image/')) continue
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        pendingImages.value.push(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }
  input.value = '' // 重置，允许重复选择
}

/** 粘贴图片支持 */
function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) continue
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          pendingImages.value.push(reader.result)
        }
      }
      reader.readAsDataURL(file)
    }
  }
}

/** 移除待发送图片 */
function removePendingImage(index: number) {
  pendingImages.value.splice(index, 1)
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/** 导出当前对话为 Markdown 文件 */
function exportToMarkdown() {
  if (messages.value.length === 0) return
  const title = chatStore.currentConversation?.title || '对话'
  let md = `# ${title}\n\n`
  md += `> 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n---\n\n`
  for (const msg of messages.value) {
    const role = msg.role === 'user' ? '👤 用户' : '🤖 AI'
    const text = getMessageText(msg)
    md += `### ${role}\n\n${text}\n\n---\n\n`
  }
  // 创建下载
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/[/\\?%*:|"<>]/g, '_')}.md`
  a.click()
  URL.revokeObjectURL(url)
  showToast('已导出为 Markdown', 'success')
}

/** 全局快捷键处理 */
function handleGlobalShortcut(e: KeyboardEvent) {
  // Ctrl+N: 新建对话
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault()
    newChat()
  }
  // Ctrl+Shift+E: 导出
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
    e.preventDefault()
    exportToMarkdown()
  }
}

onMounted(() => {
  textareaRef.value?.focus()
  // 从首页快捷输入传过来的 prompt
  const quickPrompt = sessionStorage.getItem('quickPrompt')
  if (quickPrompt) {
    sessionStorage.removeItem('quickPrompt')
    inputText.value = quickPrompt
    nextTick(() => sendMessage())
  }
  // 注册快捷键
  window.addEventListener('keydown', handleGlobalShortcut)
})

onUnmounted(() => {
  stopStreaming()
  void releaseActiveSidecarSession()
  window.removeEventListener('keydown', handleGlobalShortcut)
})
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

/* 工具栏 */
.chat-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-lg);
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}
.toolbar-left { display: flex; align-items: center; gap: var(--space-sm); }
.toolbar-title { font-size: var(--font-size-sm); font-weight: 600; }
.toolbar-count { font-size: var(--font-size-xs); color: var(--color-text-tertiary); }
.toolbar-right { display: flex; gap: var(--space-sm); }
.btn-sm { padding: 4px 10px; font-size: var(--font-size-xs); }

/* 消息列表 */
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg) var(--space-lg) var(--space-xl);
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-tertiary);
  gap: var(--space-sm);
}
.chat-empty-icon { font-size: 48px; opacity: 0.4; }
.chat-empty h3 { font-size: var(--font-size-lg); color: var(--color-text-secondary); }
.hint-text { font-size: var(--font-size-sm); margin-top: var(--space-md); }
.hint-link { color: var(--color-primary); text-decoration: underline; }

/* ===== 气泡式消息行 ===== */
.message-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  max-width: 800px;
  margin: 0 auto;
}

/* 用户消息靠右 */
.message-row.user {
  justify-content: flex-end;
}

/* 头像 */
.message-avatar {
  width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-primary-bg);
  border-radius: var(--radius-md);
  font-size: 16px; flex-shrink: 0;
  margin-top: 20px;
}
.user-avatar {
  background: var(--color-bg-tertiary);
}

/* 消息内容包裹器 */
.message-content-wrap {
  display: flex;
  flex-direction: column;
  max-width: 75%;
  position: relative;
}

/* 消息头部（模型名+时间戳+Token） */
.message-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 0 var(--space-xs);
  margin-bottom: 2px;
}
.message-header-right {
  justify-content: flex-end;
}
.message-sender {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}
.message-timestamp {
  font-size: 11px;
  color: var(--color-text-tertiary);
}
.message-token-info {
  font-size: 11px;
  color: var(--color-text-tertiary);
  background: var(--color-bg-tertiary);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}

/* 气泡通用 */
.message-bubble {
  position: relative;
  padding: var(--space-md);
  border-radius: var(--radius-lg);
  line-height: 1.7;
  word-break: break-word;
}

/* AI 气泡 - 左侧 */
.bubble-assistant {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm);
  box-shadow: var(--shadow-card);
}

/* 用户气泡 - 右侧 */
.bubble-user {
  background: var(--color-primary);
  color: var(--color-text-inverse);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.message-body {
  font-size: var(--font-size-base);
  line-height: 1.7;
}
.message-meta {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  margin-top: var(--space-xs);
}

/* 消息内图片 */
.msg-image-wrap {
  margin: var(--space-sm) 0;
}
.msg-image {
  max-width: 100%;
  max-height: 300px;
  border-radius: var(--radius-md);
  object-fit: contain;
  cursor: pointer;
}

/* ===== 消息悬浮操作栏 ===== */
.msg-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  opacity: 0;
  transition: opacity var(--transition-fast);
  pointer-events: none;
}
.msg-actions-right {
  justify-content: flex-end;
}

.message-row:hover .msg-actions,
.message-content-wrap:hover .msg-actions {
  opacity: 1;
  pointer-events: auto;
}

.msg-action-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-sm);
}
.msg-action-btn:hover {
  background: var(--color-primary-bg);
  border-color: var(--color-primary);
  transform: scale(1.1);
}

/* ===== 代码块增强 ===== */
.message-body :deep(pre.code-block) {
  position: relative;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  padding: 0;
  overflow: hidden;
  margin: var(--space-sm) 0;
}

.message-body :deep(.code-block-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px var(--space-md);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border-light);
  font-size: var(--font-size-xs);
}

.message-body :deep(.code-lang) {
  color: var(--color-text-tertiary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.message-body :deep(.code-copy-btn) {
  padding: 2px 8px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: var(--font-sans);
}
.message-body :deep(.code-copy-btn:hover) {
  background: var(--color-primary-bg);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.message-body :deep(pre.code-block code) {
  display: block;
  padding: var(--space-md);
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.9em;
  line-height: 1.5;
}

.message-body :deep(code.inline-code) {
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.9em;
}

.message-body :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
}

.message-body :deep(strong) { font-weight: 600; }

.message-body :deep(ul) {
  padding-left: var(--space-lg);
  margin: var(--space-xs) 0;
}

.message-body :deep(li) {
  margin: 2px 0;
}

/* 用户气泡内代码样式覆盖 */
.bubble-user .message-body :deep(code.inline-code) {
  background: rgba(255, 255, 255, 0.15);
  color: inherit;
}

/* ===== 加载动画 ===== */
.loading-dots { display: inline-flex; gap: 4px; }
.loading-dots span {
  animation: dot-bounce 1.4s ease infinite;
  font-size: 8px;
  color: var(--color-primary);
}
.loading-dots span:nth-child(1) { animation-delay: 0s; }
.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-4px); opacity: 1; }
}

.cursor-blink { animation: blink 0.8s infinite; color: var(--color-primary); font-weight: 300; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

/* ===== 回到底部 FAB ===== */
.scroll-bottom-fab {
  position: absolute;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px; height: 40px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 700;
  color: var(--color-text-secondary);
  cursor: pointer;
  box-shadow: var(--shadow-md);
  z-index: 50;
  transition: all var(--transition-fast);
}
.scroll-bottom-fab:hover {
  background: var(--color-primary);
  color: var(--color-text-inverse);
  box-shadow: var(--shadow-glow);
  transform: translateX(-50%) scale(1.1);
}

.fab-enter-active, .fab-leave-active {
  transition: all 0.2s ease;
}
.fab-enter-from, .fab-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

/* ===== 输入区域 ===== */
.chat-input-area {
  padding: var(--space-md) var(--space-lg) var(--space-lg);
  background: var(--color-bg-primary);
}

.chat-input-container {
  max-width: 800px;
  margin: 0 auto;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  box-shadow: var(--shadow-md);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.chat-input-container.focused {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-bg), var(--shadow-md);
}

.chat-textarea {
  width: 100%;
  border: none; outline: none; resize: none;
  font-size: var(--font-size-base);
  font-family: var(--font-sans);
  color: var(--color-text-primary);
  background: transparent;
  line-height: 1.6;
  min-height: 24px; max-height: 200px;
}
.chat-textarea::placeholder { color: var(--color-text-tertiary); }

.chat-input-actions {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: var(--space-sm);
}
.input-left { display: flex; align-items: center; gap: var(--space-sm); }
.action-buttons { display: flex; gap: var(--space-sm); }

.model-badge { cursor: pointer; }

/* 模型选择器下拉 */
.model-picker-wrapper { position: relative; }
.model-dropdown {
  position: absolute; bottom: 100%; left: 0; margin-bottom: 8px;
  width: 240px; padding: var(--space-xs); z-index: 100;
  animation: modal-in 0.15s ease;
}
@keyframes modal-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

.model-option {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 12px; border-radius: var(--radius-sm);
  cursor: pointer; transition: all var(--transition-fast);
}
.model-option:hover { background: var(--color-bg-hover); }
.model-option.active { background: var(--color-primary-bg); }
.model-option-name { font-size: var(--font-size-sm); font-weight: 500; }
.model-option.active .model-option-name { color: var(--color-primary); }
.model-option-desc { font-size: var(--font-size-xs); color: var(--color-text-tertiary); }

.status-dot {
  width: 8px; height: 8px; border-radius: 50%; display: inline-block;
}
.status-dot.connected { background: var(--color-success); }
.status-dot.disconnected { background: var(--color-warning); }

.btn-send { padding: 6px 16px; }
.btn-stop { color: var(--color-error); }
.btn-flex { display: flex; align-items: center; gap: 4px; }
.flex-center { display: flex; align-items: center; }
.gap-xs { gap: var(--space-xs); }

/* 工具栏图标按钮 */
.toolbar-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  background: transparent;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.toolbar-icon-btn:hover {
  background: var(--color-primary-bg);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

/* 图片预览行 */
.image-preview-row {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  flex-wrap: wrap;
}
.image-preview-item {
  position: relative;
  display: inline-block;
}
.preview-thumb {
  width: 64px; height: 64px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light);
}
.preview-remove {
  position: absolute;
  top: -6px; right: -6px;
  width: 20px; height: 20px;
  background: var(--color-error);
  color: white;
  border: none; border-radius: 50%;
  font-size: 12px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  line-height: 1;
}

/* 工具执行确认对话框 */
.tool-approval-modal {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.modal-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
}
.modal-content {
  position: relative;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}
.modal-content h3 {
  margin: 0 0 var(--space-md) 0;
  font-size: var(--font-size-lg);
}
.tool-name {
  margin: var(--space-sm) 0;
  font-size: var(--font-size-sm);
}
.tool-name code {
  background: var(--color-bg-secondary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: monospace;
}
.tool-args {
  margin: var(--space-md) 0;
}
.tool-args p {
  margin: 0 0 var(--space-sm) 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
}
.tool-args pre {
  background: var(--color-bg-secondary);
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  font-size: var(--font-size-xs);
  margin: 0;
}
.modal-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  margin: var(--space-sm) 0 0 0;
}
.modal-hint kbd {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  padding: 1px 5px;
  font-size: var(--font-size-xs);
  font-family: monospace;
}
.modal-actions {
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-md);
  justify-content: flex-end;
}
</style>
