<template>
  <header class="titlebar drag-region" @dblclick="toggleMaximize">
    <!-- Logo -->
    <div class="titlebar-left no-drag">
      <div class="app-logo">
        <Bot class="logo-icon" :size="20" stroke-width="2" />
        <span class="logo-text">AI Agent</span>
      </div>
    </div>

    <!-- Tab 栏 -->
    <div class="titlebar-center">
      <div class="tab-bar no-drag">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-item"
          :class="{ active: tab.id === activeTabId }"
          @click="switchTab(tab.id)"
        >
          <span class="tab-title">{{ tab.title }}</span>
          <button class="tab-close" @click.stop="closeTab(tab.id)"><X :size="14" /></button>
        </div>
        <button class="tab-add" @click="addTab"><Plus :size="16" /></button>
      </div>
    </div>

    <!-- 右侧操作区：设置 + 窗口控制 -->
    <div class="titlebar-right no-drag">
      <!-- 总是显示设置按钮 -->
      <button class="sys-btn" @click="goToSettings" title="全局设置">
        <Settings class="icon" :size="16" />
      </button>

      <!-- 仅 Tauri 且非 Mac 测试下显示 Windows 风格控制钮 -->
      <template v-if="isTauriApp && !isMac">
        <div class="window-controls">
          <button class="window-btn" @click="minimizeWindow"><Minus :size="16" stroke-width="1.5" /></button>
          <button class="window-btn" @click="toggleMaximize"><Square :size="13" stroke-width="1.5" /></button>
          <button class="window-btn window-btn-close" @click="closeWindow"><X :size="16" stroke-width="1.5" /></button>
        </div>
      </template>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Bot, Plus, X, Settings, Minus, Square } from 'lucide-vue-next'
import { useChatStore } from '../stores/chatStore'

const router = useRouter()
const chatStore = useChatStore()

// 检测是否在 Tauri 桌面模式下运行以及操作系统环境
const isTauriApp = ref(false)
const isMac = ref(false)
let tauriWindow: any = null

onMounted(async () => {
  isMac.value = /Mac/i.test(navigator.userAgent)
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    tauriWindow = getCurrentWindow()
    isTauriApp.value = true
  } catch {
    // 浏览器模式，不显示窗口控制按钮
    isTauriApp.value = false
  }
})

// ====== Tab 管理（与 chatStore 联动） ======
interface Tab {
  id: string          // Tab 的唯一标识
  title: string       // 显示标题
  conversationId: string | null  // 关联的对话 ID
}

const tabs = ref<Tab[]>([
  { id: 'tab-1', title: '新对话', conversationId: null }
])
const activeTabId = ref('tab-1')

/** 新建 Tab：创建新对话并切换 */
function addTab() {
  const convId = chatStore.createConversation()
  const tabId = `tab-${Date.now()}`
  tabs.value.push({ id: tabId, title: '新对话', conversationId: convId })
  activeTabId.value = tabId
  router.push('/chat')
}

/** 关闭 Tab：不删除对话，只移除标签页 */
function closeTab(tabId: string) {
  const index = tabs.value.findIndex(t => t.id === tabId)
  if (index === -1) return
  tabs.value.splice(index, 1)
  if (tabs.value.length === 0) {
    addTab()
  } else if (activeTabId.value === tabId) {
    const nextTab = tabs.value[Math.min(index, tabs.value.length - 1)]
    activeTabId.value = nextTab.id
    // 切换到下一个 Tab 关联的对话
    if (nextTab.conversationId) {
      chatStore.loadConversation(nextTab.conversationId)
    }
  }
}

/** 切换 Tab：加载关联的对话 */
async function switchTab(tabId: string) {
  if (activeTabId.value === tabId) return
  activeTabId.value = tabId
  const tab = tabs.value.find(t => t.id === tabId)
  if (tab?.conversationId) {
    await chatStore.loadConversation(tab.conversationId)
    router.push('/chat')
  }
}

/** 监听 chatStore 当前对话变化（侧边栏切换时同步 Tab） */
watch(() => chatStore.currentConversationId, (newId) => {
  if (!newId) return
  // 检查是否已有 Tab 关联该对话
  const existingTab = tabs.value.find(t => t.conversationId === newId)
  if (existingTab) {
    activeTabId.value = existingTab.id
  } else {
    // 如果当前活跃 Tab 没有关联对话，则关联上
    const activeTab = tabs.value.find(t => t.id === activeTabId.value)
    if (activeTab && !activeTab.conversationId) {
      activeTab.conversationId = newId
    } else {
      // 否则创建新 Tab
      const tabId = `tab-${Date.now()}`
      tabs.value.push({ id: tabId, title: '新对话', conversationId: newId })
      activeTabId.value = tabId
    }
  }
})

/** 监听对话标题变化，同步更新 Tab 标题 */
watch(() => chatStore.currentConversation?.title, (newTitle) => {
  if (!newTitle) return
  const tab = tabs.value.find(t => t.id === activeTabId.value)
  if (tab) {
    tab.title = newTitle.length > 15 ? newTitle.slice(0, 15) + '…' : newTitle
  }
})

// 窗口控制
async function minimizeWindow() {
  await tauriWindow?.minimize()
}

async function toggleMaximize() {
  if (!tauriWindow) return
  if (await tauriWindow.isMaximized()) {
    await tauriWindow.unmaximize()
  } else {
    await tauriWindow.maximize()
  }
}

async function closeWindow() {
  await tauriWindow?.close()
}

function goToSettings() {
  router.push('/settings')
}
</script>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  height: var(--titlebar-height);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border-light);
  padding: 0 var(--space-sm);
  user-select: none;
}

.titlebar-left {
  display: flex;
  align-items: center;
  min-width: 160px;
  /* macOS 交通灯按钮（红黄绿）占位约 78px */
  padding-left: 78px;
}

.app-logo { display: flex; align-items: center; gap: var(--space-sm); color: var(--color-primary); }
.logo-icon { display: flex; align-items: center; justify-content: center; }
.logo-text { font-size: var(--font-size-md); font-weight: 700; color: var(--color-primary); letter-spacing: -0.02em; }

.titlebar-center { flex: 1; display: flex; justify-content: center; overflow: hidden; }

.tab-bar { display: flex; align-items: center; gap: 2px; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.tab-bar::-webkit-scrollbar { display: none; }

.tab-item {
  display: flex; align-items: center; gap: var(--space-xs);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  max-width: 180px;
}
.tab-item:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }
.tab-item.active { background: var(--color-bg-card); color: var(--color-text-primary); box-shadow: var(--shadow-sm); }

.tab-close {
  display: flex; align-items: center; justify-content: center;
  width: 16px; height: 16px;
  border: none; background: none;
  color: var(--color-text-tertiary);
  font-size: 14px; cursor: pointer;
  border-radius: 50%;
  opacity: 0;
  transition: all var(--transition-fast);
}
.tab-item:hover .tab-close { opacity: 1; }
.tab-close:hover { background: var(--color-error); color: white; }

.tab-title { overflow: hidden; text-overflow: ellipsis; }

.tab-add {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  border: none; background: none;
  color: var(--color-text-tertiary);
  font-size: 16px; cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}
.tab-add:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }

.titlebar-right { display: flex; align-items: center; gap: var(--space-sm); padding-right: var(--space-xs); }

/* 右侧通用系统按钮 */
.sys-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px;
  border: none; background: transparent;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.sys-btn:hover { background: var(--color-bg-hover); color: var(--color-primary); }
.sys-btn .icon { font-size: 16px; }

/* 窗口控制组 - 类似 Windows 11 原生级风格 */
.window-controls {
  display: flex; align-items: center; height: var(--titlebar-height);
  margin-right: calc(-1 * var(--space-sm)); /* 抵消外层 padding，让按钮贴边 */
  -webkit-app-region: no-drag; /* 确保不被拖拽区吞噬 */
}

.window-btn {
  display: flex; align-items: center; justify-content: center;
  width: 46px; height: 100%;
  border: none; background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background 0.1s ease;
  -webkit-app-region: no-drag;
}
.window-btn svg { pointer-events: none; } /* SVG 子元素透传点击给父级 button */
.window-btn:hover { background: var(--color-bg-hover); }
.window-btn-close:hover { background: #e81123; color: white; }
</style>
