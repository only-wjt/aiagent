<template>
  <div class="agent-view">
    <!-- 头部：工作区信息 -->
    <div class="agent-header">
      <div class="workspace-info">
        <Folder :size="16" />
        <span class="ws-name">{{ workspaceName }}</span>
        <span class="ws-path-label">{{ agentStore.currentWorkspace }}</span>
      </div>
      <div class="agent-actions">
        <button class="btn btn-sm btn-ghost" @click="agentStore.clearMessages()" title="清空">
          <Trash2 :size="14" /> 清空
        </button>
      </div>
    </div>

    <!-- 消息列表 -->
    <div ref="messagesContainer" class="agent-messages">
      <!-- 空状态 -->
      <div v-if="agentStore.messages.length === 0 && !agentStore.isProcessing" class="empty-state">
        <Bot :size="48" class="empty-icon" />
        <h3>Agent 准备就绪</h3>
        <p>向 Agent 发送指令，它将自主使用工具完成任务</p>
        <div class="tool-tags">
          <span v-for="(meta, key) in TOOL_META" :key="key" class="tool-tag">
            {{ meta.icon }} {{ meta.label }}
          </span>
        </div>
      </div>

      <!-- 消息 -->
      <template v-for="msg in visibleMessages" :key="msg.id">
        <!-- 用户消息 -->
        <div v-if="msg.role === 'user'" class="msg-row msg-row-user animate-slide-up">
          <div class="msg-content-wrap">
            <div class="msg-bubble user-bubble">{{ msg.content }}</div>
            <div class="msg-meta">{{ formatTime(msg.createdAt) }}</div>
          </div>
          <div class="msg-avatar user-avatar">
            <User :size="16" />
          </div>
        </div>

        <!-- Assistant 消息 -->
        <div v-if="msg.role === 'assistant'" class="msg-row msg-row-assistant animate-slide-up">
          <div class="msg-avatar bot-avatar">
            <Bot :size="16" />
          </div>
          <div class="msg-content-wrap">
            <div class="msg-header">
              <span class="msg-sender">{{ agentStore.currentModel || 'Agent' }}</span>
              <span class="msg-time">{{ formatTime(msg.createdAt) }}</span>
              <span v-if="msg.thinkingDuration" class="thinking-badge">
                <Brain :size="12" /> {{ msg.thinkingDuration }}s
              </span>
            </div>

            <!-- 工具调用卡片 -->
            <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="tool-calls">
              <div
                v-for="tc in msg.toolCalls"
                :key="tc.id"
                class="tool-card"
                :class="{ collapsed: tc.collapsed, running: tc.status === 'running', error: tc.status === 'error' }"
              >
                <div class="tool-card-header" @click="tc.collapsed = !tc.collapsed">
                  <span class="tool-icon">{{ getToolMeta(tc.name).icon }}</span>
                  <span class="tool-label">{{ getToolMeta(tc.name).label }}</span>
                  <span class="tool-duration" v-if="tc.duration !== undefined">{{ tc.duration }}s</span>
                  <span class="tool-args-preview">{{ formatArgsPreview(tc) }}</span>
                  <span class="tool-status-icon">
                    <Loader2 v-if="tc.status === 'running'" :size="14" class="spin" />
                    <CheckCircle2 v-else-if="tc.status === 'done'" :size="14" class="text-success" />
                    <XCircle v-else-if="tc.status === 'error'" :size="14" class="text-error" />
                    <ChevronDown v-else :size="14" />
                  </span>
                  <ChevronDown :size="14" class="collapse-chevron" :class="{ rotated: !tc.collapsed }" />
                </div>
                <div v-if="!tc.collapsed" class="tool-card-body">
                  <div class="tool-section">
                    <div class="tool-section-label">参数</div>
                    <pre class="tool-code">{{ JSON.stringify(tc.args, null, 2) }}</pre>
                  </div>
                  <div v-if="tc.result" class="tool-section">
                    <div class="tool-section-label">输出</div>
                    <pre class="tool-code tool-output">{{ tc.result }}</pre>
                  </div>
                  <div v-if="tc.error" class="tool-section">
                    <div class="tool-section-label">错误</div>
                    <pre class="tool-code tool-error">{{ tc.error }}</pre>
                  </div>
                </div>
              </div>
            </div>

            <!-- 文本内容 -->
            <div v-if="msg.content" class="msg-bubble assistant-bubble">
              <div class="markdown-body" v-html="renderMarkdown(msg.content)"></div>
              <!-- 流式打字光标 -->
              <span v-if="agentStore.streamingMsgId === msg.id" class="typing-cursor"></span>
            </div>

            <!-- 空内容 + 流式中 -->
            <div v-else-if="agentStore.streamingMsgId === msg.id" class="msg-bubble assistant-bubble">
              <span class="typing-cursor"></span>
            </div>
          </div>
        </div>
      </template>

      <!-- 处理中指示器 -->
      <div v-if="agentStore.isProcessing && !agentStore.streamingMsgId" class="processing-indicator">
        <Loader2 :size="16" class="spin" />
        <span>Agent 正在处理...</span>
      </div>
    </div>

    <!-- 底部输入区 -->
    <div class="agent-input-area">
      <div class="agent-input-wrapper">
        <textarea
          ref="inputRef"
          v-model="inputText"
          class="agent-input"
          placeholder="输入消息，让 Agent 帮你完成任务..."
          rows="1"
          @keydown.enter.exact="handleSend"
          @input="autoResize"
        ></textarea>
        <button
          v-if="agentStore.isProcessing"
          class="btn-stop"
          @click="agentStore.stopProcessing()"
          title="停止"
        >
          <StopCircle :size="18" />
        </button>
        <button
          v-else
          class="btn-send-agent"
          @click="handleSend"
          :disabled="!inputText.trim()"
        >
          <Send :size="18" />
        </button>
      </div>
      <!-- 底部工具栏 -->
      <div class="agent-toolbar">
        <div class="toolbar-left">
          <button class="toolbar-btn" title="附件"><Plus :size="14" /></button>

          <!-- 会话模式选择器 -->
          <div class="toolbar-popup-wrapper">
            <button
              class="toolbar-btn" :class="{ active: true }"
              @click="showModeMenu = !showModeMenu; showToolMenu = false"
            >
              <component :is="modeConfig[agentStore.permissionMode].icon" :size="14" />
              {{ modeConfig[agentStore.permissionMode].label }} ▴
            </button>
            <Transition name="popup">
              <div v-if="showModeMenu" class="toolbar-popup mode-popup">
                <div class="popup-header">
                  <span>会话模式</span>
                  <span class="popup-link" @click="$router.push('/settings')">Agent 设置</span>
                </div>
                <div
                  v-for="(cfg, key) in modeConfig" :key="key"
                  class="mode-option" :class="{ active: agentStore.permissionMode === key }"
                  @click="agentStore.setPermissionMode(key as PermissionMode); showModeMenu = false"
                >
                  <component :is="cfg.icon" :size="18" class="mode-icon" :style="{ color: cfg.color }" />
                  <div class="mode-text">
                    <div class="mode-label" :style="{ color: cfg.color }">{{ cfg.label }}</div>
                    <div class="mode-desc">{{ cfg.desc }}</div>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <!-- 工具管理 -->
          <div class="toolbar-popup-wrapper">
            <button
              class="toolbar-btn"
              @click="showToolMenu = !showToolMenu; showModeMenu = false"
            >
              <Wrench :size="14" /> 工具
            </button>
            <Transition name="popup">
              <div v-if="showToolMenu" class="toolbar-popup tool-popup">
                <div class="popup-header">
                  <span>工具 (在此对话中启用)</span>
                </div>
                <div v-for="(meta, key) in TOOL_META" :key="key" class="tool-toggle-item">
                  <div class="tool-toggle-info">
                    <span class="tool-toggle-icon">{{ meta.icon }}</span>
                    <div>
                      <div class="tool-toggle-name">{{ meta.label }}</div>
                      <div class="tool-toggle-desc">{{ toolDescriptions[key as string] || '' }}</div>
                    </div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" :checked="agentStore.enabledTools[key as string] !== false" @change="agentStore.setEnabledTool(key as string, ($event.target as HTMLInputElement).checked)" />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </Transition>
          </div>
        </div>
        <div class="toolbar-right">
          <!-- 模型选择 -->
          <div class="model-picker-wrapper">
            <span class="model-badge" @click="showModelPicker = !showModelPicker; showModeMenu = false; showToolMenu = false">
              {{ agentStore.currentModel || '选择模型' }} ▾
            </span>
            <div v-if="showModelPicker" class="model-dropdown card">
              <div v-if="availableModels.length === 0" class="model-option" style="opacity:0.5">
                无可用模型
              </div>
              <div
                v-for="m in availableModels"
                :key="m.id + '-' + m.providerId"
                class="model-option"
                :class="{ active: agentStore.currentModel === m.id && agentStore.currentProviderId === m.providerId }"
                @click="agentStore.setModel(m.id, m.providerId); showModelPicker = false"
              >
                <span class="model-option-name">{{ m.name }}</span>
                <span class="model-option-desc">{{ m.providerName }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- 点击外部关闭弹窗 -->
      <div v-if="showModeMenu || showToolMenu" class="popup-overlay" @click="showModeMenu = false; showToolMenu = false"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAgentStore, TOOL_META, type PermissionMode } from '../stores/agentStore'
import { renderMarkdown } from '../utils/markdown'
import { useChatStore, type PersistedToolCall } from '../stores/chatStore'
import { useConfigStore } from '../stores/configStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import {
  Folder, Trash2, Bot, Brain, Loader2, CheckCircle2, XCircle,
  ChevronDown, Send, StopCircle, Plus, Zap, Wrench, Rocket, FileText,
  User,
} from 'lucide-vue-next'

const agentStore = useAgentStore()
const chatStore = useChatStore()
const configStore = useConfigStore()
const workspaceStore = useWorkspaceStore()
const route = useRoute()

const inputText = ref('')
const showModelPicker = ref(false)
const showModeMenu = ref(false)
const showToolMenu = ref(false)
const messagesContainer = ref<HTMLElement>()
const inputRef = ref<HTMLTextAreaElement>()
const hydratingPersistedSession = ref(false)

// 会话模式配置
const modeConfig: Record<PermissionMode, { label: string; desc: string; icon: any; color: string }> = {
  action: { label: '行动', desc: 'Agent 在工作区内行动，使用工具需确认', icon: Zap, color: '#f59e0b' },
  plan: { label: '规划', desc: 'Agent 仅研究信息并与您讨论规划', icon: FileText, color: '#6b7280' },
  autonomous: { label: '自主行动', desc: 'Agent 拥有完全自主权限，无需人工确认', icon: Rocket, color: '#c4704b' },
}

// 工具描述
const toolDescriptions: Record<string, string> = {
  bash: '执行 Shell 命令',
  read_file: '读取文件内容',
  write_file: '创建或覆盖文件',
  edit_file: '查找替换编辑文件',
  list_dir: '列出目录内容',
  glob: '文件名模式匹配',
  grep: '正则搜索文件内容',
}

// 工作区名称
const workspaceName = computed(() => {
  const workspaceId = chatStore.currentConversation?.workspaceId
  if (!workspaceId || workspaceId === 'default') return '默认工作区'
  const ws = workspaceStore.workspaces.find(w => w.id === workspaceId)
  return ws?.name || '默认工作区'
})

// 可用模型
const availableModels = computed(() => configStore.allEnabledModels())

// 过滤掉 tool 角色消息（结果已在卡片中展示）
const visibleMessages = computed(() =>
  agentStore.messages.filter(m => m.role !== 'tool')
)

// 获取工具元信息
function getToolMeta(name: string) {
  return TOOL_META[name] || { icon: '🔧', label: name }
}

// 格式化工具参数预览
function formatArgsPreview(tc: { name: string; args: Record<string, unknown> }) {
  if (tc.name === 'bash') return String(tc.args.command || '').slice(0, 60)
  if (tc.name === 'read_file' || tc.name === 'write_file' || tc.name === 'edit_file') return String(tc.args.path || '')
  if (tc.name === 'glob') return String(tc.args.pattern || '')
  if (tc.name === 'grep') return `"${String(tc.args.pattern || '').slice(0, 40)}"`
  if (tc.name === 'list_dir') return String(tc.args.path || '.')
  return ''
}

// 格式化时间
function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

// 发送消息
function handleSend(e?: Event) {
  e?.preventDefault()
  const text = inputText.value.trim()
  if (!text || agentStore.isProcessing) return
  inputText.value = ''
  if (inputRef.value) inputRef.value.style.height = 'auto'
  agentStore.sendMessage(text)
}

// 自动调整输入框高度
function autoResize() {
  if (inputRef.value) {
    inputRef.value.style.height = 'auto'
    inputRef.value.style.height = Math.min(inputRef.value.scrollHeight, 200) + 'px'
  }
}

// 自动滚动到底部（监听 messages.length + updateTick）
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(() => agentStore.messages.length, scrollToBottom)
watch(() => agentStore.updateTick, scrollToBottom)

function syncAgentMessagesToChatStore() {
  if (hydratingPersistedSession.value) return
  const sessionId = route.params.sessionId as string | undefined
  if (!sessionId || chatStore.currentConversationId !== sessionId) return

  syncAgentSessionSettingsToChatStore(false)
  chatStore.currentModel = agentStore.currentModel
  chatStore.messages = agentStore.messages.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content ? [{ type: 'text', text: m.content }] : [],
    createdAt: m.createdAt,
    model: m.role === 'assistant' ? agentStore.currentModel : undefined,
    thinking: m.thinking,
    thinkingDuration: m.thinkingDuration,
    toolCalls: m.toolCalls?.map(tc => ({
      ...tc,
      args: { ...tc.args },
    })) as PersistedToolCall[] | undefined,
    toolCallId: m.toolCallId,
    toolName: m.toolName,
  }))
  void chatStore.saveCurrentConversation()
}

function syncAgentSessionSettingsToChatStore(shouldSave: boolean = true) {
  if (hydratingPersistedSession.value) return
  const sessionId = route.params.sessionId as string | undefined
  if (!sessionId || chatStore.currentConversationId !== sessionId) return

  chatStore.currentModel = agentStore.currentModel
  chatStore.currentProviderId = agentStore.currentProviderId
  chatStore.currentAgentMode = agentStore.permissionMode
  chatStore.currentEnabledTools = { ...agentStore.enabledTools }

  if (shouldSave) {
    void chatStore.saveCurrentConversation()
  }
}

watch(() => agentStore.isProcessing, (isProcessing, wasProcessing) => {
  if (wasProcessing && !isProcessing) {
    syncAgentMessagesToChatStore()
  }
})

watch(() => agentStore.messages.length, () => {
  if (!agentStore.isProcessing) {
    syncAgentMessagesToChatStore()
  }
})

function resolveWorkspacePath(workspaceId?: string) {
  if (!workspaceId || workspaceId === 'default') {
    return configStore.appConfig.defaultWorkspacePath || '~'
  }
  return workspaceStore.workspaces.find(w => w.id === workspaceId)?.path || configStore.appConfig.defaultWorkspacePath || '~'
}

async function syncAgentSessionFromRoute() {
  const sessionId = route.params.sessionId as string | undefined
  if (agentStore.isProcessing) {
    agentStore.stopProcessing()
  }
  if (sessionId && chatStore.currentConversationId !== sessionId) {
    await chatStore.loadConversation(sessionId)
  }

  hydratingPersistedSession.value = true
  try {
    agentStore.setWorkspace(resolveWorkspacePath(chatStore.currentConversation?.workspaceId))
    agentStore.replaceMessages(chatStore.messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content
        .filter(block => block.type === 'text')
        .map(block => block.text || '')
        .join(''),
      createdAt: m.createdAt,
      thinking: m.thinking,
      thinkingDuration: m.thinkingDuration,
      toolCalls: m.toolCalls?.map(tc => ({
        ...tc,
        args: { ...tc.args },
      })),
      toolCallId: m.toolCallId,
      toolName: m.toolName,
    })))

    agentStore.setPermissionMode(chatStore.currentAgentMode || 'autonomous')
    agentStore.setEnabledTools(chatStore.currentEnabledTools)

    if (chatStore.currentModel) {
      agentStore.setModel(chatStore.currentModel, chatStore.currentProviderId)
    } else {
      const models = configStore.allEnabledModels()
      if (models.length > 0 && !agentStore.currentModel) {
        agentStore.setModel(models[0].id, models[0].providerId)
      }
    }
  } finally {
    hydratingPersistedSession.value = false
  }
}

watch(() => route.params.sessionId, () => {
  void syncAgentSessionFromRoute()
}, { immediate: true })

watch(() => agentStore.currentModel, () => {
  syncAgentSessionSettingsToChatStore()
})

watch(() => agentStore.currentProviderId, () => {
  syncAgentSessionSettingsToChatStore()
})

watch(() => agentStore.permissionMode, () => {
  syncAgentSessionSettingsToChatStore()
})

watch(() => agentStore.enabledTools, () => {
  syncAgentSessionSettingsToChatStore()
}, { deep: true })
</script>

<style scoped>
.agent-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-primary);
}

/* ===== 头部 ===== */
.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-bg-secondary);
}
.workspace-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}
.ws-name { color: var(--color-text-primary); font-weight: 600; }
.ws-path-label { color: var(--color-text-tertiary); font-size: var(--font-size-xs); }

/* ===== 消息列表 ===== */
.agent-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  scroll-behavior: smooth;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-tertiary);
  text-align: center;
}
.empty-icon { opacity: 0.3; margin-bottom: 16px; color: var(--color-primary); }
.empty-state h3 { margin: 0 0 8px; color: var(--color-text-secondary); font-size: var(--font-size-lg); }
.empty-state p { margin: 0 0 20px; }
.tool-tags { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.tool-tag {
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

/* ===== 消息行 ===== */
.msg-row {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  align-items: flex-start;
}
.msg-row-user { justify-content: flex-end; }
.msg-row-assistant { justify-content: flex-start; }

.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.bot-avatar {
  background: var(--color-primary-bg, rgba(99,102,241,0.1));
  color: var(--color-primary);
}
.user-avatar {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.msg-content-wrap {
  max-width: 80%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.msg-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}
.msg-sender { font-weight: 600; color: var(--color-text-secondary); }
.msg-time { color: var(--color-text-tertiary); }
.msg-meta {
  font-size: 11px;
  color: var(--color-text-tertiary);
  text-align: right;
  padding-right: 4px;
}

/* 消息气泡 */
.msg-bubble {
  padding: 10px 14px;
  border-radius: var(--radius-lg);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  word-break: break-word;
}
.user-bubble {
  background: var(--color-primary);
  color: white;
  border-bottom-right-radius: 4px;
}
.assistant-bubble {
  background: var(--color-bg-card);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-light);
  border-bottom-left-radius: 4px;
}

/* 思考徽章 */
.thinking-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  font-size: 11px;
  color: var(--color-text-tertiary);
}

/* 打字光标 */
.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--color-primary);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 0.8s ease-in-out infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* 滑入动画 */
.animate-slide-up {
  animation: slideUp 0.2s ease-out;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ===== 工具调用卡片 ===== */
.tool-calls { display: flex; flex-direction: column; gap: 6px; }
.tool-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: all var(--transition-fast);
}
.tool-card.running { border-color: var(--color-primary); }
.tool-card.error { border-color: var(--color-error); }

.tool-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: background var(--transition-fast);
}
.tool-card-header:hover { background: var(--color-bg-hover); }

.tool-icon { font-size: 14px; }
.tool-label { font-weight: 600; color: var(--color-text-primary); }
.tool-duration {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  background: var(--color-bg-tertiary);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}
.tool-args-preview {
  flex: 1;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tool-status-icon { display: flex; align-items: center; }
.text-success { color: var(--color-success, #22c55e); }
.text-error { color: var(--color-error); }
.collapse-chevron {
  color: var(--color-text-tertiary);
  transition: transform var(--transition-fast);
}
.collapse-chevron.rotated { transform: rotate(180deg); }

.tool-card-body {
  border-top: 1px solid var(--color-border-light);
  padding: 8px 12px;
}
.tool-section { margin-bottom: 8px; }
.tool-section:last-child { margin-bottom: 0; }
.tool-section-label {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
  margin-bottom: 4px;
  letter-spacing: 0.5px;
}
.tool-code {
  font-family: var(--font-mono, 'SF Mono', 'Monaco', monospace);
  font-size: 12px;
  background: var(--color-bg-primary);
  padding: 8px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
  color: var(--color-text-primary);
}
.tool-output { border-left: 3px solid var(--color-success, #22c55e); }
.tool-error { border-left: 3px solid var(--color-error); color: var(--color-error); }

/* 处理中 */
.processing-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

/* 旋转动画 */
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ===== Markdown 渲染样式 ===== */
:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3),
:deep(.markdown-body h4) {
  margin: 12px 0 6px;
  font-weight: 600;
  color: var(--color-text-primary);
}
:deep(.markdown-body h1) { font-size: 1.3em; }
:deep(.markdown-body h2) { font-size: 1.15em; }
:deep(.markdown-body h3) { font-size: 1.05em; }

:deep(.markdown-body ul) {
  margin: 4px 0;
  padding-left: 20px;
}
:deep(.markdown-body li) {
  margin: 2px 0;
}
:deep(.markdown-body strong) {
  font-weight: 600;
  color: var(--color-text-primary);
}
:deep(.markdown-body a) {
  color: var(--color-primary);
  text-decoration: none;
}
:deep(.markdown-body a:hover) {
  text-decoration: underline;
}

:deep(.inline-code) {
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: var(--font-mono, monospace);
  font-size: 0.85em;
}
:deep(.code-block) {
  background: #1e1e2e;
  border-radius: var(--radius-md);
  overflow: hidden;
  margin: 8px 0;
}
:deep(.code-block-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
:deep(.code-lang) {
  font-size: 11px;
  color: rgba(255,255,255,0.5);
  font-family: var(--font-mono, monospace);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
:deep(.code-copy-btn) {
  background: none;
  border: 1px solid rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.6);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
:deep(.code-copy-btn:hover) {
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.9);
}
:deep(.code-block code) {
  display: block;
  padding: 12px;
  font-family: var(--font-mono, 'SF Mono', 'Monaco', monospace);
  font-size: 13px;
  color: #cdd6f4;
  line-height: 1.5;
  overflow-x: auto;
}

/* ===== 输入区 ===== */
.agent-input-area {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--color-border-light);
  background: var(--color-bg-secondary);
}
.agent-input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 8px 12px;
  transition: border-color var(--transition-fast);
}
.agent-input-wrapper:focus-within { border-color: var(--color-primary); }

.agent-input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  resize: none;
  font-size: var(--font-size-sm);
  font-family: var(--font-sans);
  color: var(--color-text-primary);
  line-height: 1.5;
  max-height: 200px;
}
.agent-input::placeholder { color: var(--color-text-tertiary); }

.btn-send-agent, .btn-stop {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}
.btn-send-agent {
  background: var(--color-primary);
  color: white;
}
.btn-send-agent:hover { opacity: 0.85; }
.btn-send-agent:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-stop {
  background: var(--color-error);
  color: white;
}

/* 底部工具栏 */
.agent-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding: 0 4px;
}
.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}
.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.toolbar-btn:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }
.toolbar-btn.active { background: var(--color-primary-bg); color: var(--color-primary); border-color: var(--color-primary); }

/* 模型选择 */
.model-picker-wrapper { position: relative; }
.model-badge {
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-bg);
  cursor: pointer;
  white-space: nowrap;
}
.model-badge:hover { opacity: 0.8; }
.model-dropdown {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  min-width: 240px;
  max-height: 300px;
  overflow-y: auto;
  padding: 4px 0;
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-md);
  z-index: 100;
}
.model-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: all var(--transition-fast);
}
.model-option:hover { background: var(--color-bg-hover); }
.model-option.active { background: var(--color-primary-bg); color: var(--color-primary); }
.model-option-name { color: var(--color-text-primary); }
.model-option-desc { font-size: var(--font-size-xs); color: var(--color-text-tertiary); }

.btn-sm {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  padding: 4px 8px;
}
.btn-ghost {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.btn-ghost:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }

/* ===== 弹窗通用 ===== */
.toolbar-popup-wrapper { position: relative; }
.toolbar-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 300px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 200;
  overflow: hidden;
}
.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px 8px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-light);
}
.popup-link {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--color-primary);
  cursor: pointer;
}
.popup-link:hover { text-decoration: underline; }
.popup-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 150;
}

/* 弹窗动画 */
.popup-enter-active, .popup-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.popup-enter-from, .popup-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* 会话模式弹窗 */
.mode-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background var(--transition-fast);
}
.mode-option:hover { background: var(--color-bg-hover); }
.mode-option.active { background: var(--color-primary-bg); }
.mode-icon { flex-shrink: 0; }
.mode-text { flex: 1; }
.mode-label { font-weight: 600; font-size: var(--font-size-sm); }
.mode-desc { font-size: var(--font-size-xs); color: var(--color-text-tertiary); margin-top: 2px; }

/* 工具管理弹窗 */
.tool-popup { min-width: 320px; }
.tool-toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border-light);
  transition: background var(--transition-fast);
}
.tool-toggle-item:last-child { border-bottom: none; }
.tool-toggle-item:hover { background: var(--color-bg-hover); }
.tool-toggle-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}
.tool-toggle-icon { font-size: 18px; }
.tool-toggle-name { font-weight: 600; font-size: var(--font-size-sm); color: var(--color-text-primary); }
.tool-toggle-desc { font-size: var(--font-size-xs); color: var(--color-text-tertiary); margin-top: 1px; }

/* Toggle 开关 */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--color-border);
  border-radius: 22px;
  transition: 0.2s;
}
.toggle-slider::before {
  content: '';
  position: absolute;
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.2s;
}
.toggle-switch input:checked + .toggle-slider {
  background: var(--color-primary);
}
.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(18px);
}
</style>
