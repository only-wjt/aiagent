<template>
  <div class="settings-page">
    <div class="settings-sidebar">
      <h2 class="settings-title">设置</h2>
      <nav class="settings-nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="settings-nav-item"
          :class="{ active: isActive(item.path) }"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </nav>
    </div>
    <div class="settings-content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  { path: '/settings', icon: '🔌', label: '模型供应商' },
  { path: '/settings/skills', icon: '⚡', label: '技能 Skills' },
  { path: '/settings/mcp', icon: '🛠️', label: '工具 MCP' },
  { path: '/settings/bots', icon: '🤖', label: '聊天机器人 Bot' },
  { path: '/settings/general', icon: '⚙️', label: '通用设置' },
  { path: '/settings/stats', icon: '📊', label: '使用统计' },
]

function isActive(path: string) {
  if (path === '/settings') return route.path === '/settings'
  return route.path.startsWith(path)
}
</script>

<style scoped>
.settings-page {
  display: flex;
  height: 100%;
}

.settings-sidebar {
  width: 200px;
  padding: var(--space-lg) var(--space-md);
  border-right: 1px solid var(--color-border-light);
  background: var(--color-bg-secondary);
}

.settings-title {
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--space-lg);
  padding-left: var(--space-sm);
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: all var(--transition-fast);
}

.settings-nav-item:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.settings-nav-item.active {
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-weight: 500;
}

.nav-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.settings-content {
  flex: 1;
  padding: var(--space-lg) var(--space-xl);
  overflow-y: auto;
}
</style>
