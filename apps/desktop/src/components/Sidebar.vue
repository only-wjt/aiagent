<template>
  <nav class="sidebar" :class="{ collapsed: isCollapsed }">
    <!-- Chat / Agent Tab 切换 -->
    <div v-if="!isCollapsed" class="sidebar-tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'chat' }"
        @click="switchTab('chat')"
      >Chat</button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'agent' }"
        @click="switchTab('agent')"
      >Agent</button>
    </div>



    <!-- 搜索框 -->
    <div v-if="!isCollapsed && activeTab === 'chat'" class="search-box">
      <Search :size="14" class="search-icon" />
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="搜索对话..."
      />
    </div>

    <!-- 侧边栏折叠悬浮按钮 -->
    <button class="collapse-btn" @click="toggleCollapse" :title="isCollapsed ? '展开侧边栏' : '收起侧边栏'">
      <ChevronRight v-if="isCollapsed" class="collapse-icon" :size="16" />
      <ChevronLeft v-else class="collapse-icon" :size="16" />
    </button>

    <!-- Chat Tab：对话列表 -->
    <div v-if="!isCollapsed && activeTab === 'chat'" class="sidebar-chats">
      <!-- 置顶对话 -->
      <div v-if="pinnedChats.length > 0" class="chat-group">
        <div class="group-header" @click="pinnedExpanded = !pinnedExpanded">
          <Pin :size="12" class="group-icon" />
          <span class="group-title">置顶对话</span>
          <ChevronDown v-if="pinnedExpanded" :size="12" class="group-chevron" />
          <ChevronRight v-else :size="12" class="group-chevron" />
        </div>
        <div v-if="pinnedExpanded" class="group-list">
          <div
            v-for="chat in pinnedChats"
            :key="chat.id"
            class="chat-entry"
            :class="{ active: currentChatId === chat.id }"
            @click="openChat(chat.id)"
            @contextmenu.prevent="showContextMenu($event, chat)"
          >
            <MessageSquare :size="14" class="chat-icon" />
            <span class="chat-title">{{ chat.title }}</span>
            <button class="chat-delete" @click.stop="deleteChat(chat.id)" title="删除对话">
              <Trash2 :size="12" />
            </button>
          </div>
        </div>
      </div>

      <!-- 按日期分组的对话列表 -->
      <div v-for="group in groupedChats" :key="group.label" class="chat-group">
        <div class="group-header">
          <span class="group-title">{{ group.label }}</span>
        </div>
        <div class="group-list">
          <div
            v-for="chat in group.chats"
            :key="chat.id"
            class="chat-entry"
            :class="{ active: currentChatId === chat.id }"
            @click="openChat(chat.id)"
            @contextmenu.prevent="showContextMenu($event, chat)"
          >
            <MessageSquare :size="14" class="chat-icon" />
            <span class="chat-title">{{ chat.title }}</span>
            <button class="chat-delete" @click.stop="deleteChat(chat.id)" title="删除对话">
              <Trash2 :size="12" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="pinnedChats.length === 0 && groupedChats.length === 0" class="chats-empty">
        暂无对话记录
      </div>
    </div>


    <!-- Agent Tab：工作区 + 会话树 -->
    <div v-if="!isCollapsed && activeTab === 'agent'" class="sidebar-chats">
      <!-- 默认工作区 -->
      <div class="chat-group">
        <div class="group-header" @click="toggleWorkspace('default')">
          <Bot :size="12" class="group-icon" />
          <span class="group-title">默认工作区</span>
          <span class="ws-path">{{ defaultWorkspacePath }}</span>
          <ChevronDown v-if="expandedWorkspaces.default" :size="12" class="group-chevron" />
          <ChevronRight v-else :size="12" class="group-chevron" />
        </div>
        <div v-if="expandedWorkspaces.default" class="group-list">
          <div
            v-for="session in getWorkspaceSessions('default')"
            :key="session.id"
            class="chat-entry"
            :class="{ active: activeAgentSession === session.id }"
            @click="openAgentSession(session.id)"
          >
            <MessageSquare :size="14" class="chat-icon" />
            <span class="chat-title">{{ session.title }}</span>
            <button class="chat-delete" @click.stop="requestDeleteAgentSession(session.id)" title="删除会话">
              <Trash2 :size="12" />
            </button>
          </div>
          <div class="chat-entry new-session" @click="newAgentSession('default')">
            <Plus :size="14" class="chat-icon" />
            <span class="chat-title add-text">新会话</span>
          </div>
        </div>
      </div>

      <!-- 动态工作区 -->
      <div v-for="ws in workspaceStore.workspaces" :key="ws.id" class="chat-group">
        <div class="group-header" @click="toggleWorkspace(ws.id)">
          <Folder :size="12" class="group-icon" />
          <span class="group-title">{{ ws.name }}</span>
          <span class="ws-path">{{ ws.path }}</span>
          <button class="workspace-delete" @click.stop="requestDeleteWorkspace(ws.id, ws.name)" title="删除工作区">
            <Trash2 :size="12" />
          </button>
          <ChevronDown v-if="expandedWorkspaces[ws.id]" :size="12" class="group-chevron" />
          <ChevronRight v-else :size="12" class="group-chevron" />
        </div>
        <div v-if="expandedWorkspaces[ws.id]" class="group-list">
          <div
            v-for="session in getWorkspaceSessions(ws.id)"
            :key="session.id"
            class="chat-entry"
            :class="{ active: activeAgentSession === session.id }"
            @click="openAgentSession(session.id)"
          >
            <MessageSquare :size="14" class="chat-icon" />
            <span class="chat-title">{{ session.title }}</span>
            <button class="chat-delete" @click.stop="requestDeleteAgentSession(session.id)" title="删除会话">
              <Trash2 :size="12" />
            </button>
          </div>
          <div class="chat-entry new-session" @click="newAgentSession(ws.id)">
            <Plus :size="14" class="chat-icon" />
            <span class="chat-title add-text">新会话</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div v-if="contextMenu.visible" class="ctx-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click="contextMenu.visible = false">
        <button class="ctx-item" @click="togglePinChat">
          <Pin :size="14" /> {{ contextMenu.isPinned ? '取消置顶' : '📌 置顶' }}
        </button>
        <button class="ctx-item" @click="startRename">
          <Edit3 :size="14" /> 重命名
        </button>
        <button class="ctx-item" @click="forkChat">
          <GitBranch :size="14" /> 分叉对话
        </button>
        <button class="ctx-item" @click="exportChat">
          <Download :size="14" /> 导出 Markdown
        </button>
        <div class="ctx-divider"></div>
        <button class="ctx-item ctx-danger" @click="deleteChatFromMenu">
          <Trash2 :size="14" /> 删除
        </button>
      </div>
      <div v-if="contextMenu.visible" class="ctx-overlay" @click="contextMenu.visible = false"></div>
    </Teleport>

    <!-- 重命名弹窗 -->
    <Teleport to="body">
      <div v-if="renameDialog.visible" class="ctx-overlay" @click="renameDialog.visible = false"></div>
      <div v-if="renameDialog.visible" class="rename-dialog">
        <h4>重命名对话</h4>
        <input v-model="renameDialog.title" class="rename-input" @keydown.enter="confirmRename" autofocus />
        <div class="rename-actions">
          <button class="btn btn-ghost btn-sm" @click="renameDialog.visible = false">取消</button>
          <button class="btn btn-primary btn-sm" @click="confirmRename">确定</button>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="confirmDialog.visible" class="ctx-overlay" @click="closeConfirmDialog"></div>
      <div v-if="confirmDialog.visible" class="rename-dialog">
        <h4>{{ confirmDialog.title }}</h4>
        <p class="confirm-message">{{ confirmDialog.message }}</p>
        <div class="rename-actions">
          <button class="btn btn-ghost btn-sm" @click="closeConfirmDialog">取消</button>
          <button class="btn btn-danger btn-sm" @click="confirmDangerAction">确认</button>
        </div>
      </div>
    </Teleport>

  </nav>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '../stores/chatStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useConfigStore } from '../stores/configStore'
import { useTabStore } from '../stores/tabStore'
import {
  MessageSquare, ChevronLeft, ChevronRight, ChevronDown,
  Plus, Trash2, Search, Edit3, Download, Pin, Bot, Folder, GitBranch,
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const workspaceStore = useWorkspaceStore()
const configStore = useConfigStore()
const tabStore = useTabStore()
const showToast = inject<(message: string, type?: 'success' | 'error' | 'info') => void>('showToast', () => {})
const isCollapsed = ref(false)
const searchQuery = ref('')
// 侧边栏 tab 状态从 tabStore 共享，让标题栏+号按钮能联动
const activeTab = computed(() => tabStore.sidebarActiveTab)
const pinnedExpanded = ref(true)
const defaultWorkspacePath = computed(() => configStore.appConfig.defaultWorkspacePath || '~')

// ====== Agent 工作区 + 会话管理 ======
const expandedWorkspaces = reactive<Record<string, boolean>>({ default: true })

function toggleWorkspace(wsId: string) {
  expandedWorkspaces[wsId] = !expandedWorkspaces[wsId]
}

// 获取某个工作区下的 Agent 会话（从 chatStore 中按 workspaceId 过滤）
function getWorkspaceSessions(wsId: string) {
  return chatStore.conversations
    .filter(c => c.workspaceId === wsId)
    .map(c => ({ id: c.id, title: c.title || '新会话' }))
}

// 当前激活的 Agent 会话
const activeAgentSession = computed(() => {
  const route = useRoute()
  return route.params.sessionId as string || null
})

function newAgentSession(wsId: string) {
  // 用 chatStore 创建带 workspaceId 的独立会话
  const id = chatStore.createConversation(undefined, wsId)
  expandedWorkspaces[wsId] = true
  router.push(`/agent/${id}`)
}

function openAgentSession(sessionId: string) {
  // 不调用 chatStore.loadConversation，Agent 页面自己通过 agentStore.loadSession 加载
  router.push(`/agent/${sessionId}`)
}

// 切换 Tab（通过 tabStore 共享状态，让标题栏+号按钮联动）
function switchTab(tab: 'chat' | 'agent') {
  tabStore.setSidebarTab(tab)
  if (tab === 'agent') {
    router.push(activeAgentSession.value ? `/agent/${activeAgentSession.value}` : '/agent')
  } else {
    // 切到 Chat 时，清空 chatStore 中可能残留的 Agent 会话数据
    const currentConv = chatStore.currentConversation
    const currentChatId = (currentConv?.workspaceId) ? null : chatStore.currentConversationId
    if (!currentChatId) {
      chatStore.currentConversationId = null
      chatStore.messages = []
    }
    router.push(currentChatId ? `/chat/${currentChatId}` : '/chat')
  }
}

// 置顶对话列表（只显示普通 Chat 对话，不含 Agent 会话）
const pinnedChats = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return chatStore.conversations
    .filter(c => !c.workspaceId)  // 排除 Agent 会话
    .filter(c => c.pinned)
    .filter(c => !q || (c.title || '新对话').toLowerCase().includes(q))
    .map(c => ({
      id: c.id,
      title: c.title || '新对话',
      updatedAt: c.updatedAt,
      pinned: true,
    }))
})

// 按日期分组的对话（排除置顶 + 排除 Agent 会话）
const groupedChats = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const unpinned = chatStore.conversations
    .filter(c => !c.workspaceId)  // 排除 Agent 会话
    .filter(c => !c.pinned)
    .filter(c => !q || (c.title || '新对话').toLowerCase().includes(q))

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: { label: string; chats: { id: string; title: string; updatedAt: string; pinned: boolean }[] }[] = []
  const todayList: typeof groups[0]['chats'] = []
  const yesterdayList: typeof groups[0]['chats'] = []
  const weekList: typeof groups[0]['chats'] = []
  const olderList: typeof groups[0]['chats'] = []

  for (const c of unpinned) {
    const d = new Date(c.updatedAt)
    const item = { id: c.id, title: c.title || '新对话', updatedAt: c.updatedAt, pinned: false }
    if (d >= today) todayList.push(item)
    else if (d >= yesterday) yesterdayList.push(item)
    else if (d >= weekAgo) weekList.push(item)
    else olderList.push(item)
  }

  if (todayList.length) groups.push({ label: '今天', chats: todayList })
  if (yesterdayList.length) groups.push({ label: '昨天', chats: yesterdayList })
  if (weekList.length) groups.push({ label: '最近7天', chats: weekList })
  if (olderList.length) groups.push({ label: '更早', chats: olderList })

  return groups
})

const currentChatId = computed(() => chatStore.currentConversationId)

watch(() => route.path, (path) => {
  tabStore.setSidebarTab(
    (path === '/' || path.startsWith('/settings') || path.startsWith('/agent'))
      ? 'agent'
      : 'chat'
  )
}, { immediate: true })

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function newChat() {
  const id = chatStore.createConversation()
  tabStore.setSidebarTab('chat')
  router.push(`/chat/${id}`)
}

async function openChat(chatId: string) {
  await chatStore.loadConversation(chatId)
  router.push(`/chat/${chatId}`)
}

async function deleteChat(chatId: string) {
  const isCurrentChat = route.path.startsWith('/chat') && route.params.sessionId === chatId
  await chatStore.deleteConversation(chatId)
  if (isCurrentChat) {
    const nextChat = chatStore.conversations.find(c => !c.workspaceId)
    router.replace(nextChat ? `/chat/${nextChat.id}` : '/chat')
  }
}

// ====== 右键菜单 ======
const contextMenu = reactive({ visible: false, x: 0, y: 0, chatId: '', chatTitle: '', isPinned: false })
const renameDialog = reactive({ visible: false, title: '', chatId: '' })
const confirmDialog = reactive({
  visible: false,
  title: '',
  message: '',
  action: '' as '' | 'delete-agent-session' | 'delete-workspace',
  targetId: '',
})

function showContextMenu(e: MouseEvent, chat: { id: string; title: string; pinned: boolean }) {
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
  contextMenu.chatId = chat.id
  contextMenu.chatTitle = chat.title
  contextMenu.isPinned = chat.pinned
  contextMenu.visible = true
}

function togglePinChat() {
  chatStore.togglePin(contextMenu.chatId)
}

function startRename() {
  renameDialog.chatId = contextMenu.chatId
  renameDialog.title = contextMenu.chatTitle
  renameDialog.visible = true
}

async function confirmRename() {
  if (!renameDialog.title.trim()) return
  await chatStore.renameConversation(renameDialog.chatId, renameDialog.title.trim())
  renameDialog.visible = false
  contextMenu.visible = false
}

async function exportChat() {
  const conversation = await chatStore.getConversationSnapshot(contextMenu.chatId)
  if (!conversation) return
  const title = contextMenu.chatTitle
  let md = `# ${title}\n\n> 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n---\n\n`
  for (const msg of conversation.messages) {
    const role = msg.role === 'user' ? '👤 用户' : '🤖 AI'
    const text = msg.content.filter(b => b.type === 'text').map(b => b.text || '').join('')
    md += `### ${role}\n\n${text}\n\n---\n\n`
  }
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/[/\\?%*:|"<>]/g, '_')}.md`
  a.click()
  URL.revokeObjectURL(url)
  contextMenu.visible = false
}

async function forkChat() {
  const id = await chatStore.forkConversation(contextMenu.chatId)
  contextMenu.visible = false
  if (id) {
    router.push(`/chat/${id}`)
  }
}

function deleteChatFromMenu() {
  void deleteChat(contextMenu.chatId)
  contextMenu.visible = false
}

function requestDeleteAgentSession(sessionId: string) {
  confirmDialog.visible = true
  confirmDialog.title = '删除 Agent 会话'
  confirmDialog.message = '会删除该 Agent 会话的全部历史消息，并从侧边栏移除。'
  confirmDialog.action = 'delete-agent-session'
  confirmDialog.targetId = sessionId
}

function requestDeleteWorkspace(workspaceId: string, workspaceName: string) {
  const sessionCount = getWorkspaceSessions(workspaceId).length
  if (sessionCount > 0) {
    showToast('请先删除该工作区下的 Agent 会话，再删除工作区', 'info')
    return
  }

  confirmDialog.visible = true
  confirmDialog.title = '删除工作区'
  confirmDialog.message = `将删除工作区「${workspaceName}」配置，但不会删除磁盘上的实际目录。`
  confirmDialog.action = 'delete-workspace'
  confirmDialog.targetId = workspaceId
}

function closeConfirmDialog() {
  confirmDialog.visible = false
  confirmDialog.title = ''
  confirmDialog.message = ''
  confirmDialog.action = ''
  confirmDialog.targetId = ''
}

async function confirmDangerAction() {
  if (confirmDialog.action === 'delete-agent-session') {
    const sessionId = confirmDialog.targetId
    const wasActive = route.path.startsWith('/agent') && route.params.sessionId === sessionId
    await chatStore.deleteConversation(sessionId)
    if (wasActive) {
      const nextSession = chatStore.conversations.find(c => !!c.workspaceId)
      router.replace(nextSession ? `/agent/${nextSession.id}` : '/agent')
    }
    showToast('Agent 会话已删除', 'success')
  }

  if (confirmDialog.action === 'delete-workspace') {
    await workspaceStore.removeWorkspace(confirmDialog.targetId)
    delete expandedWorkspaces[confirmDialog.targetId]
    showToast('工作区已删除', 'success')
  }

  closeConfirmDialog()
}
</script>

<style scoped>
.sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border-light);
  padding: var(--space-sm) var(--space-sm) var(--space-md);
  transition: width var(--transition-normal);
  overflow: visible;
}
.sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

/* ===== Tab 切换 ===== */
.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border-light);
  margin-bottom: var(--space-sm);
  padding: 0 var(--space-xs);
}
.tab-btn {
  flex: 1;
  padding: 10px 0;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.tab-btn:hover {
  color: var(--color-text-primary);
}
.tab-btn.active {
  color: var(--color-text-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 600;
}



/* ===== 搜索框 ===== */
.search-box {
  display: flex; align-items: center; gap: var(--space-xs);
  padding: 6px 10px;
  margin: 0 var(--space-xs) var(--space-sm);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-light);
  transition: border-color var(--transition-fast);
}
.search-box:focus-within { border-color: var(--color-primary); }
.search-icon { color: var(--color-text-tertiary); flex-shrink: 0; }
.search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--font-size-xs); color: var(--color-text-primary);
  font-family: var(--font-sans);
}
.search-input::placeholder { color: var(--color-text-tertiary); }

/* ===== 对话列表区域 ===== */
.sidebar-chats {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* ===== 分组 ===== */
.chat-group {
  margin-bottom: var(--space-xs);
}
.group-header {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 4px 12px;
  cursor: default;
  user-select: none;
}
.group-header:has(.group-chevron) {
  cursor: pointer;
}
.group-icon {
  color: var(--color-text-tertiary);
}
.group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex: 1;
}
.group-chevron {
  color: var(--color-text-tertiary);
}
.group-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

/* ===== 对话条目 ===== */
.chat-entry {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.chat-entry:hover { background: var(--color-bg-hover); }
.chat-entry.active { background: var(--color-primary-bg); }

.chat-icon {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}
.chat-entry.active .chat-icon { color: var(--color-primary); }

.chat-title {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.chat-entry.active .chat-title { color: var(--color-primary); font-weight: 500; }

.chat-path {
  font-size: 10px;
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

/* 删除按钮 Hover 显示 */
.chat-delete {
  display: none; align-items: center; justify-content: center;
  width: 18px; height: 18px;
  border: none; background: none;
  color: var(--color-text-tertiary);
  cursor: pointer; border-radius: var(--radius-sm);
  flex-shrink: 0; margin-left: auto;
  transition: all var(--transition-fast);
}
.chat-entry:hover .chat-delete { display: flex; }
.chat-delete:hover { color: var(--color-error); background: var(--color-bg-hover); }

.chats-empty {
  padding: var(--space-md) var(--space-sm);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  text-align: center;
}

/* ===== 折叠悬浮按钮 ===== */
.collapse-btn {
  position: absolute;
  top: 50%;
  right: -14px;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  color: var(--color-text-tertiary);
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
  transition: all var(--transition-normal);
}
.collapse-btn:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
  box-shadow: 0 4px 12px rgba(196, 112, 75, 0.15);
  transform: translateY(-50%) scale(1.05);
}
.collapse-icon {
  font-size: 20px;
  line-height: 1;
  margin-bottom: 2px;
}

/* ===== 右键菜单 & 弹窗 (复用原有样式) ===== */
.ctx-menu {
  position: fixed; z-index: 1000;
  background: var(--color-bg-card); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: 4px 0;
  box-shadow: var(--shadow-lg); min-width: 160px;
}
.ctx-item {
  display: flex; align-items: center; gap: var(--space-sm);
  width: 100%; padding: 8px 14px; border: none; background: none;
  font-size: var(--font-size-sm); color: var(--color-text-secondary);
  cursor: pointer; font-family: var(--font-sans);
  transition: all var(--transition-fast);
}
.ctx-item:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }
.ctx-danger { color: var(--color-error); }
.ctx-danger:hover { background: rgba(239,68,68,0.08); }
.ctx-divider { height: 1px; margin: 4px 0; background: var(--color-border-light); }
.ctx-overlay { position: fixed; top:0; left:0; right:0; bottom:0; z-index: 999; }

.rename-dialog {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  z-index: 1001; background: var(--color-bg-card); border-radius: var(--radius-lg);
  padding: var(--space-lg); box-shadow: var(--shadow-lg); min-width: 320px;
}
.rename-dialog h4 { margin: 0 0 var(--space-md); font-size: var(--font-size-md); }
.confirm-message {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}
.rename-input {
  width: 100%; padding: 8px 12px; border: 1px solid var(--color-border);
  border-radius: var(--radius-md); outline: none; font-size: var(--font-size-sm);
  font-family: var(--font-sans); background: var(--color-bg-primary);
  color: var(--color-text-primary); box-sizing: border-box;
}
.rename-input:focus { border-color: var(--color-primary); }
.rename-actions { display: flex; justify-content: flex-end; gap: var(--space-sm); margin-top: var(--space-md); }

/* ===== Agent 工作区 ===== */
.ws-path {
  font-size: 9px;
  color: var(--color-text-tertiary);
  opacity: 0.7;
  margin-left: auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}
.new-session {
  opacity: 0.6;
}
.new-session:hover {
  opacity: 1;
}
.add-text {
  color: var(--color-text-tertiary);
  font-style: italic;
}
.workspace-delete {
  display: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  transition: all var(--transition-fast);
}
.chat-group:hover .workspace-delete {
  display: inline-flex;
}
.workspace-delete:hover {
  color: var(--color-error);
  background: var(--color-bg-hover);
}
.btn-danger {
  background: var(--color-error);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
}
</style>
