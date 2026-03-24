<template>
  <div class="stats-panel">
    <div class="page-header">
      <h2 class="page-title">使用统计</h2>
      <p class="page-desc">查看你的 AI Agent 使用概况</p>
    </div>

    <!-- 概览卡片 -->
    <div class="stats-grid">
      <button class="stat-card card stat-card-button" @click="openLatestConversation">
        <div class="stat-icon"><MessageSquare :size="24" stroke-width="1.5" /></div>
        <div class="stat-body">
          <span class="stat-value">{{ totalConversations }}</span>
          <span class="stat-label">总对话数</span>
        </div>
      </button>

      <button class="stat-card card stat-card-button" @click="openLatestConversation">
        <div class="stat-icon"><Mail :size="24" stroke-width="1.5" /></div>
        <div class="stat-body">
          <span class="stat-value">{{ totalMessages }}</span>
          <span class="stat-label">总消息数</span>
        </div>
      </button>

      <button class="stat-card card stat-card-button" @click="router.push('/settings/skills')">
        <div class="stat-icon"><Zap :size="24" stroke-width="1.5" /></div>
        <div class="stat-body">
          <span class="stat-value">{{ activeSkillCount }}</span>
          <span class="stat-label">启用技能</span>
        </div>
      </button>

      <button class="stat-card card stat-card-button" @click="router.push('/settings/mcp')">
        <div class="stat-icon"><Wrench :size="24" stroke-width="1.5" /></div>
        <div class="stat-body">
          <span class="stat-value">{{ enabledToolCount }}</span>
          <span class="stat-label">启用工具</span>
        </div>
      </button>

      <button class="stat-card card stat-card-button" @click="router.push('/settings')">
        <div class="stat-icon"><Bot :size="24" stroke-width="1.5" /></div>
        <div class="stat-body">
          <span class="stat-value">{{ mostUsedModel }}</span>
          <span class="stat-label">最常用模型</span>
        </div>
      </button>

      <button class="stat-card card stat-card-button" @click="openLatestConversation">
        <div class="stat-icon"><TrendingUp :size="24" stroke-width="1.5" /></div>
        <div class="stat-body">
          <span class="stat-value">{{ avgMessagesPerConv }}</span>
          <span class="stat-label">平均消息数/对话</span>
        </div>
      </button>
    </div>

    <!-- 最近对话 -->
    <div class="section">
      <h3 class="section-title">最近活跃</h3>
      <div v-if="recentConversations.length > 0" class="recent-list">
        <div
          v-for="conv in recentConversations"
          :key="conv.id"
          class="recent-item card recent-item-button"
          @click="openConversation(conv.id, conv.workspaceId)"
        >
          <div class="recent-main">
            <span class="recent-title">{{ conv.title || '新对话' }}</span>
            <span class="recent-model badge badge-primary">{{ conv.model }}</span>
          </div>
          <div class="recent-meta">
            <span>{{ conv.messageCount }} 条消息</span>
            <span>{{ conv.updatedAt ? new Date(conv.updatedAt).toLocaleDateString('zh-CN') : '' }}</span>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <BarChart3 class="empty-icon" :size="48" stroke-width="1" />
        <p>暂无对话数据</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '../../stores/chatStore'
import { useSkillStore } from '../../stores/skillStore'
import { useMcpStore } from '../../stores/mcpStore'
import { MessageSquare, Mail, Zap, Wrench, Bot, TrendingUp, BarChart3 } from 'lucide-vue-next'

const router = useRouter()
const chatStore = useChatStore()
const skillStore = useSkillStore()
const mcpStore = useMcpStore()

const totalConversations = computed(() => chatStore.conversations.length)

const totalMessages = computed(() =>
  chatStore.conversations.reduce((sum, c) => sum + c.messageCount, 0)
)

const activeSkillCount = computed(() =>
  skillStore.builtinSkills.filter(s => s.enabled).length +
  skillStore.customSkills.filter(s => s.enabled).length
)

const enabledToolCount = computed(() =>
  mcpStore.tools.filter(t => t.enabled).length
)

/** 最常用的模型 */
const mostUsedModel = computed(() => {
  const models: Record<string, number> = {}
  for (const c of chatStore.conversations) {
    if (c.model) models[c.model] = (models[c.model] || 0) + 1
  }
  const entries = Object.entries(models)
  if (entries.length === 0) return '-'
  entries.sort((a, b) => b[1] - a[1])
  // 截短模型名
  const name = entries[0][0]
  return name.length > 20 ? name.slice(0, 18) + '…' : name
})

/** 平均每个对话的消息数 */
const avgMessagesPerConv = computed(() => {
  if (totalConversations.value === 0) return '0'
  return (totalMessages.value / totalConversations.value).toFixed(1)
})

const recentConversations = computed(() =>
  [...chatStore.conversations]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10)
)

function openConversation(id: string, workspaceId?: string) {
  router.push(workspaceId ? `/agent/${id}` : `/chat/${id}`)
}

function openLatestConversation() {
  const latestConversation = recentConversations.value[0]
  if (!latestConversation) return
  openConversation(latestConversation.id, latestConversation.workspaceId)
}
</script>

<style scoped>
.page-header { margin-bottom: var(--space-xl); }
.page-title { font-size: var(--font-size-xl); font-weight: 700; }
.page-desc { color: var(--color-text-tertiary); font-size: var(--font-size-sm); margin-top: 4px; }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-md);
  margin-bottom: var(--space-2xl);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  transition: all var(--transition-normal);
}
.stat-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
.stat-card-button {
  width: 100%;
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-card);
  text-align: left;
  cursor: pointer;
}

.stat-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-bg);
  color: var(--color-primary);
  border-radius: var(--radius-lg);
}

.stat-body { display: flex; flex-direction: column; min-width: 0; }
.stat-value { font-size: var(--font-size-2xl); font-weight: 700; color: var(--color-text-primary); line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat-label { font-size: var(--font-size-xs); color: var(--color-text-tertiary); margin-top: 4px; }

.section { margin-bottom: var(--space-2xl); }
.section-title { font-size: var(--font-size-md); font-weight: 600; margin-bottom: var(--space-md); color: var(--color-text-secondary); }

.recent-list { display: flex; flex-direction: column; gap: var(--space-sm); }
.recent-item { padding: var(--space-md); transition: all var(--transition-normal); }
.recent-item:hover { box-shadow: var(--shadow-md); }
.recent-item-button {
  width: 100%;
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-card);
  text-align: left;
  cursor: pointer;
}
.recent-main { display: flex; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-xs); }
.recent-title { font-weight: 500; font-size: var(--font-size-sm); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-model { font-size: 10px; }
.recent-meta { font-size: var(--font-size-xs); color: var(--color-text-tertiary); display: flex; gap: var(--space-md); }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: var(--space-2xl); color: var(--color-text-tertiary); gap: var(--space-sm); }
.empty-icon { opacity: 0.4; }
</style>
