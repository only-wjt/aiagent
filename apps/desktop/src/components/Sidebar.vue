<template>
  <nav class="sidebar" :class="{ collapsed: isCollapsed }">
    <!-- 导航菜单 -->
    <div class="sidebar-menu">
      <router-link
        v-for="item in menuItems"
        :key="item.path"
        :to="item.path"
        class="menu-item"
        :class="{ active: isActive(item.path) }"
      >
        <component :is="item.icon" class="menu-icon" :size="18" stroke-width="2" />
        <span v-if="!isCollapsed" class="menu-label">{{ item.label }}</span>
      </router-link>
    </div>

    <!-- 侧边栏折叠悬浮按钮 (绝对定位, 不受流式布局干扰) -->
    <button class="collapse-btn" @click="toggleCollapse" :title="isCollapsed ? '展开侧边栏' : '收起侧边栏'">
      <ChevronRight v-if="isCollapsed" class="collapse-icon" :size="16" />
      <ChevronLeft v-else class="collapse-icon" :size="16" />
    </button>

    <!-- 最近对话 -->
    <div v-if="!isCollapsed" class="sidebar-chats">
      <!-- 搜索框 -->
      <div class="search-box">
        <Search :size="14" class="search-icon" />
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="搜索对话..."
        />
      </div>
      <div class="chats-header">
        <span class="chats-title">最近对话</span>
        <button class="btn-icon-sm" @click="newChat" title="新建对话"><Plus :size="14" /></button>
      </div>
      <div v-if="recentChats.length === 0" class="chats-empty">
        暂无对话记录
      </div>
      <div v-else class="chats-list">
        <div
          v-for="chat in recentChats"
          :key="chat.id"
          class="chat-entry"
          :class="{ active: currentChatId === chat.id }"
          @click="openChat(chat.id)"
          @contextmenu.prevent="showContextMenu($event, chat)"
        >
          <span class="chat-title">{{ chat.title }}</span>
          <span class="chat-time">{{ chat.timeAgo }}</span>
          <button class="chat-delete" @click.stop="deleteChat(chat.id)" title="删除对话">
            <Trash2 :size="12" />
          </button>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div v-if="contextMenu.visible" class="ctx-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click="contextMenu.visible = false">
        <button class="ctx-item" @click="startRename">
          <Edit3 :size="14" /> 重命名
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

  </nav>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '../stores/chatStore'
import { Home, MessageSquare, ChevronLeft, ChevronRight, Plus, Trash2, Search, Edit3, Download } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const isCollapsed = ref(false)
const searchQuery = ref('')

const menuItems = [
  { path: '/', icon: Home, label: '首页' },
  { path: '/chat', icon: MessageSquare, label: '对话' },
]

// 最近对话：从 chatStore 读取（响应式），支持搜索过滤
const recentChats = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  let list = chatStore.conversations
  if (q) {
    list = list.filter(c => (c.title || '新对话').toLowerCase().includes(q))
  }
  return list.slice(0, 20).map(c => ({
    id: c.id,
    title: c.title || '新对话',
    timeAgo: formatTimeAgo(c.updatedAt),
  }))
})

const currentChatId = computed(() => chatStore.currentConversationId)

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function newChat() {
  chatStore.createConversation()
  router.push('/chat')
}

async function openChat(chatId: string) {
  await chatStore.loadConversation(chatId)
  router.push('/chat')
}

async function deleteChat(chatId: string) {
  await chatStore.deleteConversation(chatId)
}

// ====== 右键菜单 ======
const contextMenu = reactive({ visible: false, x: 0, y: 0, chatId: '', chatTitle: '' })
const renameDialog = reactive({ visible: false, title: '', chatId: '' })

function showContextMenu(e: MouseEvent, chat: { id: string; title: string }) {
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
  contextMenu.chatId = chat.id
  contextMenu.chatTitle = chat.title
  contextMenu.visible = true
}

function startRename() {
  renameDialog.chatId = contextMenu.chatId
  renameDialog.title = contextMenu.chatTitle
  renameDialog.visible = true
}

async function confirmRename() {
  if (!renameDialog.title.trim()) return
  // 加载对话→修改标题→保存
  await chatStore.loadConversation(renameDialog.chatId)
  const conv = chatStore.conversations.find(c => c.id === renameDialog.chatId)
  if (conv) conv.title = renameDialog.title.trim()
  await chatStore.saveCurrentConversation()
  renameDialog.visible = false
}

async function exportChat() {
  // 加载对话并导出
  await chatStore.loadConversation(contextMenu.chatId)
  const title = contextMenu.chatTitle
  let md = `# ${title}\n\n> 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n---\n\n`
  for (const msg of chatStore.messages) {
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
}

function deleteChatFromMenu() {
  chatStore.deleteConversation(contextMenu.chatId)
}

/** 格式化相对时间 */
function formatTimeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}天前`
  return new Date(iso).toLocaleDateString('zh-CN')
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
  padding: var(--space-xl) var(--space-sm) var(--space-md);
  transition: width var(--transition-normal);
  overflow: visible; /* 为了 collapse 悬浮按钮，把 overflow 修正 */
}

/* 在 sidebar 内容区使用隐藏，外层不隐藏 */
.sidebar::before {
  content: '';
  position: absolute; top:0; left:0; width:100%; height:100%;
  pointer-events: none; z-index: -1;
  overflow: hidden;
}

.sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

.sidebar-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px 12px;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  font-family: var(--font-sans);
}

.menu-item:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.menu-item.active {
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-weight: 500;
}

.menu-icon { width: 20px; display: flex; justify-content: center; flex-shrink: 0; }
.menu-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 搜索框 */
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

/* 最近对话区域 */
.sidebar-chats {
  flex: 1;
  margin-top: var(--space-lg);
  overflow-y: auto;
  min-height: 0;
}

.chats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-sm);
  margin-bottom: var(--space-sm);
}

.chats-title {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.btn-icon-sm {
  width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: none;
  color: var(--color-text-tertiary);
  font-size: 14px; cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}
.btn-icon-sm:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }

.chats-empty {
  padding: var(--space-md) var(--space-sm);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  text-align: center;
}

.chats-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.chat-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.chat-entry:hover { background: var(--color-bg-hover); }
.chat-entry.active { background: var(--color-primary-bg); }

/* 删除按钮，Hover 显现 */
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
.chat-entry:hover .chat-time { display: none; }
.chat-delete:hover { color: var(--color-error); background: var(--color-bg-hover); }

.chat-title {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.chat-entry.active .chat-title { color: var(--color-primary); font-weight: 500; }

.chat-time {
  font-size: 10px;
  color: var(--color-text-tertiary);
  flex-shrink: 0;
  margin-left: var(--space-xs);
}

/* 折叠悬浮按钮 */
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
</style>
