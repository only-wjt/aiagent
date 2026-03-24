/**
 * Pinia Store — 多标签页管理
 *
 * 每个标签页对应一个独立的 Agent 会话。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Tab {
  id: string
  title: string
  route: string  // e.g. '/chat', '/'
  closable: boolean
}

export const useTabStore = defineStore('tab', () => {
  const tabs = ref<Tab[]>([
    { id: 'home', title: 'Home', route: '/', closable: false },
  ])

  const activeTabId = ref<string>('home')

  const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value))

  function addTab(route: string, title: string): string {
    const id = crypto.randomUUID()
    tabs.value.push({ id, title, route, closable: true })
    activeTabId.value = id
    return id
  }

  function closeTab(id: string) {
    const idx = tabs.value.findIndex(t => t.id === id)
    if (idx === -1) return
    const tab = tabs.value[idx]
    if (!tab.closable) return
    tabs.value.splice(idx, 1)
    // 激活邻近标签
    if (activeTabId.value === id) {
      const next = tabs.value[Math.min(idx, tabs.value.length - 1)]
      activeTabId.value = next?.id ?? ''
    }
  }

  function activateTab(id: string) {
    if (tabs.value.find(t => t.id === id)) {
      activeTabId.value = id
    }
  }

  function updateTabTitle(id: string, title: string) {
    const tab = tabs.value.find(t => t.id === id)
    if (tab) tab.title = title
  }

  function updateTabRoute(id: string, route: string) {
    const tab = tabs.value.find(t => t.id === id)
    if (tab) tab.route = route
  }

  function openChatTab(title = '新对话'): string {
    // 复用已有的 chat tab（如果当前 active 就是 chat）
    const existing = tabs.value.find(t => t.route === '/chat' && t.id !== 'home')
    if (existing) {
      activeTabId.value = existing.id
      return existing.id
    }
    return addTab('/chat', title)
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    addTab,
    closeTab,
    activateTab,
    updateTabTitle,
    updateTabRoute,
    openChatTab,
  }
})
