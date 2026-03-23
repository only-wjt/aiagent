<template>
  <div class="app-shell" :data-theme="currentTheme">
    <!-- 自定义标题栏 -->
    <TitleBar />

    <!-- 主内容区 -->
    <div class="app-content">
      <Sidebar />
      <main class="main-area">
        <router-view />
      </main>
    </div>

    <!-- 全局 Toast 通知 -->
    <Transition name="toast">
      <div v-if="toast.visible" class="toast" :class="toast.type">
        {{ toast.message }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide } from 'vue'
import { useRouter } from 'vue-router'
import TitleBar from './components/TitleBar.vue'
import Sidebar from './components/Sidebar.vue'
import { useConfigStore } from './stores/configStore'
import { useChatStore } from './stores/chatStore'
import { useSkillStore } from './stores/skillStore'
import { useMcpStore } from './stores/mcpStore'
import { useWorkspaceStore } from './stores/workspaceStore'

const router = useRouter()
const configStore = useConfigStore()
const chatStore = useChatStore()
const skillStore = useSkillStore()
const mcpStore = useMcpStore()
const workspaceStore = useWorkspaceStore()

// 主题系统：跟随 configStore.appConfig.theme
const systemTheme = ref<'light' | 'dark'>('light')

const currentTheme = computed(() => {
  const setting = configStore.appConfig.theme
  if (setting === 'dark') return 'dark'
  if (setting === 'light') return 'light'
  return systemTheme.value // 'system'
})

/** 全局快捷键 */
function handleGlobalKeydown(e: KeyboardEvent) {
  // Ctrl+, : 打开设置
  if ((e.ctrlKey || e.metaKey) && e.key === ',') {
    e.preventDefault()
    router.push('/settings')
  }
}

/** 系统主题变化回调 */
function handleThemeChange(e: MediaQueryListEvent) {
  systemTheme.value = e.matches ? 'dark' : 'light'
}

/** 系统主题媒体查询引用（用于清理） */
let prefersDarkQuery: MediaQueryList | null = null

onMounted(async () => {
  try {
    // 初始化配置（从持久化加载）
    await configStore.init()
    // 初始化对话列表
    await chatStore.init()
    // 初始化技能和 MCP 工具
    await skillStore.init()
    await mcpStore.init()
    await workspaceStore.init()
  } catch (error) {
    console.error('[App] 初始化失败:', error)
    showToast('应用初始化失败，部分功能可能不可用', 'error')
  }

  // 监听系统主题变化
  prefersDarkQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemTheme.value = prefersDarkQuery.matches ? 'dark' : 'light'
  prefersDarkQuery.addEventListener('change', handleThemeChange)

  // 注册全局快捷键
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  // 清理系统主题监听
  if (prefersDarkQuery) {
    prefersDarkQuery.removeEventListener('change', handleThemeChange)
    prefersDarkQuery = null
  }
  window.removeEventListener('keydown', handleGlobalKeydown)
})

// 全局 Toast 通知
const toast = ref<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>({
  visible: false, message: '', type: 'info'
})

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  toast.value = { visible: true, message, type }
  setTimeout(() => { toast.value.visible = false }, 2500)
}

// 提供给子组件的 Toast 方法
provide('showToast', showToast)
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.main-area {
  flex: 1;
  overflow-y: auto;
  background: var(--color-bg-primary);
}

/* Toast 通知 */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 24px;
  border-radius: var(--radius-pill);
  font-size: var(--font-size-sm);
  font-weight: 500;
  box-shadow: var(--shadow-lg);
  z-index: 9999;
  pointer-events: none;
}
.toast.success { background: var(--color-success); color: white; }
.toast.error { background: var(--color-error); color: white; }
.toast.info { background: var(--color-bg-card); color: var(--color-text-primary); border: 1px solid var(--color-border); }

.toast-enter-active { animation: toast-in 0.3s ease; }
.toast-leave-active { animation: toast-out 0.3s ease; }
@keyframes toast-in { from { opacity: 0; transform: translateX(-50%) translateY(16px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
@keyframes toast-out { from { opacity: 1; transform: translateX(-50%) translateY(0); } to { opacity: 0; transform: translateX(-50%) translateY(16px); } }
</style>