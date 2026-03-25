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
          <button v-if="tab.closable" class="tab-close" @click.stop="closeTab(tab.id)"><X :size="14" /></button>
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
import { ref, watch, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bot, Plus, X, Settings, Minus, Square } from 'lucide-vue-next'
import { useChatStore } from '../stores/chatStore'
import { useTabStore } from '../stores/tabStore'

const router = useRouter()
const route = useRoute()
const chatStore = useChatStore()
const tabStore = useTabStore()

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

// ====== Tab 管理（通过 tabStore 共享，与 chatStore 联动） ======

// tabStore 扩展：每个 tab 需要记录关联的 conversationId
// tabStore.Tab 的 route 字段复用，但我们需要额外的 conversationId 映射
const tabConvMap = ref<Record<string, string | null>>({
  [tabStore.activeTabId]: null,
})

const tabs = computed(() => tabStore.tabs)
const activeTabId = computed({
  get: () => tabStore.activeTabId,
  set: (id) => tabStore.activateTab(id),
})

/** 新建 Tab：根据侧边栏当前 tab 类型创建对应的对话 */
function addTab() {
  if (tabStore.sidebarActiveTab === 'agent') {
    // Agent 模式：创建带 workspaceId 的会话
    const convId = chatStore.createConversation(undefined, 'default')
    const tabId = tabStore.addTab(`/agent/${convId}`, '新会话')
    tabConvMap.value[tabId] = convId
    router.push(`/agent/${convId}`)
  } else {
    // Chat 模式：创建普通对话
    const convId = chatStore.createConversation()
    const tabId = tabStore.addTab(`/chat/${convId}`, '新对话')
    tabConvMap.value[tabId] = convId
    router.push(`/chat/${convId}`)
  }
}

/** 关闭 Tab：不删除对话，只移除标签页 */
function closeTab(tabId: string) {
  const idx = tabStore.tabs.findIndex(t => t.id === tabId)
  if (idx === -1) return
  tabStore.closeTab(tabId)
  delete tabConvMap.value[tabId]
  if (tabStore.tabs.length === 0) {
    addTab()
  } else {
    const nextTab = tabStore.activeTab
    const convId = nextTab ? tabConvMap.value[nextTab.id] : null
    if (convId) {
      void chatStore.loadConversation(convId)
      router.push(nextTab?.route || `/chat/${convId}`)
    } else if (nextTab?.route) {
      router.push(nextTab.route)
    }
  }
}

/** 切换 Tab：加载关联的对话 */
async function switchTab(tabId: string) {
  if (tabStore.activeTabId === tabId) return
  tabStore.activateTab(tabId)
  const nextTab = tabStore.tabs.find(tab => tab.id === tabId)
  const convId = tabConvMap.value[tabId]
  if (convId) {
    await chatStore.loadConversation(convId)
    router.push(nextTab?.route || `/chat/${convId}`)
  } else if (nextTab?.route) {
    router.push(nextTab.route)
  }
}

/** 监听 chatStore 当前对话变化（侧边栏切换时同步 Tab） */
watch(() => chatStore.currentConversationId, (newId) => {
  if (!newId) return
  const currentRoute = route.path.startsWith('/agent') ? `/agent/${newId}` : `/chat/${newId}`
  // 检查是否已有 Tab 关联该对话
  const existingTabId = Object.entries(tabConvMap.value).find(([, cid]) => cid === newId)?.[0]
  if (existingTabId) {
    tabStore.activateTab(existingTabId)
    tabStore.updateTabRoute(existingTabId, currentRoute)
  } else {
    // 如果当前活跃 Tab 没有关联对话，则关联上
    const curId = tabStore.activeTabId
    if (curId && !tabConvMap.value[curId]) {
      tabConvMap.value[curId] = newId
      tabStore.updateTabRoute(curId, currentRoute)
    } else {
      const tabId = tabStore.addTab(currentRoute, '新对话')
      tabConvMap.value[tabId] = newId
    }
  }
})

/** 监听对话标题变化，同步更新 Tab 标题 */
watch(() => chatStore.currentConversation?.title, (newTitle) => {
  if (!newTitle) return
  const curId = tabStore.activeTabId
  if (curId) {
    tabStore.updateTabTitle(curId, newTitle.length > 15 ? newTitle.slice(0, 15) + '…' : newTitle)
  }
})

watch(() => route.fullPath, (path) => {
  if (!path.startsWith('/chat/') && !path.startsWith('/agent/')) return
  const curId = tabStore.activeTabId
  if (curId) {
    tabStore.updateTabRoute(curId, path)
  }
}, { immediate: true })

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
