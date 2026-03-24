<template>
  <div class="bot-settings">
    <div class="page-header">
      <div>
        <h2 class="page-title">聊天机器人 Bot</h2>
        <p class="page-desc">连接各平台聊天机器人，让 Agent 远程为你工作</p>
      </div>
    </div>

    <div class="bot-grid">
      <div
        v-for="bot in bots"
        :key="bot.id"
        class="bot-card card"
        :class="{ 'is-configured': bot.configured, 'is-expanded': expandedBot === bot.id }"
      >
        <!-- 卡片头部 -->
        <div class="bot-top" @click="toggleExpand(bot.id)">
          <div class="bot-info">
            <span class="bot-icon">{{ bot.icon }}</span>
            <div>
              <h3 class="bot-name">{{ bot.name }}</h3>
              <p class="bot-desc">{{ bot.description }}</p>
            </div>
          </div>
          <div class="bot-status">
            <span class="badge" :class="bot.configured ? 'badge-success' : 'badge-warning'">
              {{ bot.configured ? '已配置' : '未配置' }}
            </span>
            <span class="expand-arrow">{{ expandedBot === bot.id ? '▲' : '▼' }}</span>
          </div>
        </div>

        <!-- 展开的配置面板 -->
        <div v-if="expandedBot === bot.id" class="bot-config">
          <div class="config-divider"></div>
          <div class="form-group">
            <label>{{ bot.tokenLabel || 'Bot Token' }}</label>
            <div class="token-row">
              <input
                class="input input-mono"
                :type="showToken[bot.id] ? 'text' : 'password'"
                v-model="bot.token"
                :placeholder="bot.tokenPlaceholder || '输入 Token'"
              />
              <button class="btn btn-ghost btn-eye" @click="showToken[bot.id] = !showToken[bot.id]">
                {{ showToken[bot.id] ? '🙈' : '👁️' }}
              </button>
            </div>
          </div>
          <div v-if="bot.webhookField" class="form-group">
            <label>Webhook URL</label>
            <input class="input input-mono" v-model="bot.webhook" placeholder="https://..." />
          </div>
          <div class="config-actions">
            <button
              class="btn btn-secondary btn-sm"
              :disabled="!bot.token"
              @click="testBotConnection(bot)"
            >
              {{ testingBot === bot.id ? '校验中...' : '🔎 校验配置' }}
            </button>
            <button
              class="btn btn-primary btn-sm"
              :disabled="!bot.token"
              @click="saveBotConfig(bot)"
            >
              {{ savingBot === bot.id ? '保存中...' : '💾 保存' }}
            </button>
          </div>
          <div v-if="testResults[bot.id]" class="test-result" :class="testResults[bot.id]">
            {{ testResults[bot.id] === 'success' ? '✅ 本地配置校验通过' : '❌ 本地配置校验失败，请检查必填项' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, inject, onMounted } from 'vue'
import { getTauriInvoke } from '../../utils/tauri'

interface BotConfig {
  id: string; name: string; icon: string; description: string; configured: boolean
  token: string; webhook?: string; webhookField?: boolean
  tokenLabel?: string; tokenPlaceholder?: string
}

interface SavedBotConfig {
  id: string
  token: string
  webhook?: string
  configured: boolean
}

const bots = ref<BotConfig[]>([
  { id: 'telegram', name: 'Telegram', icon: '📱', description: '通过 Telegram Bot 远程使用 Agent', configured: false, token: '', tokenLabel: 'Bot Token', tokenPlaceholder: '123456:ABC-DEF...' },
  { id: 'feishu', name: '飞书', icon: '🐦', description: '飞书机器人接入，支持私聊和群组', configured: false, token: '', webhook: '', webhookField: true, tokenLabel: 'App ID', tokenPlaceholder: 'cli_xxx' },
  { id: 'dingtalk', name: '钉钉', icon: '💬', description: '钉钉机器人接入', configured: false, token: '', webhook: '', webhookField: true, tokenLabel: 'App Key', tokenPlaceholder: 'dingxxx' },
  { id: 'qq', name: 'QQ Bot', icon: '🐧', description: 'QQ 机器人接入', configured: false, token: '', tokenLabel: 'AppKey', tokenPlaceholder: 'appkey_xxx' },
  { id: 'wechat', name: '企业微信', icon: '💼', description: '企业微信 Bot 接入', configured: false, token: '', webhook: '', webhookField: true, tokenLabel: 'Corp ID', tokenPlaceholder: 'wxcorp_xxx' },
])

const expandedBot = ref<string | null>(null)
const showToken = reactive<Record<string, boolean>>({})
const testingBot = ref<string | null>(null)
const testResults = reactive<Record<string, 'success' | 'error'>>({})
const savingBot = ref<string | null>(null)
const showToast = inject<(message: string, type?: 'success' | 'error' | 'info') => void>('showToast', () => {})

function toggleExpand(botId: string) {
  expandedBot.value = expandedBot.value === botId ? null : botId
}

onMounted(() => {
  void loadBotConfigs()
})

async function loadBotConfigs() {
  const invoke = await getTauriInvoke()
  if (!invoke) return
  try {
    const json = await invoke('cmd_read_json', { filename: 'bot_configs.json' }) as string
    if (!json || json === 'null') return
    const saved = JSON.parse(json) as SavedBotConfig[]
    for (const bot of bots.value) {
      const matched = saved.find(item => item.id === bot.id)
      if (!matched) continue
      bot.token = matched.token
      bot.webhook = matched.webhook || ''
      bot.configured = matched.configured
    }
  } catch (error) {
    console.error('[BotSettings] 加载配置失败:', error)
  }
}

async function persistBotConfigs() {
  const invoke = await getTauriInvoke()
  if (!invoke) return
  await invoke('cmd_write_json', {
    filename: 'bot_configs.json',
    data: JSON.stringify(bots.value.map(bot => ({
      id: bot.id,
      token: bot.token,
      webhook: bot.webhook || '',
      configured: bot.configured,
    } satisfies SavedBotConfig))),
  })
}

async function testBotConnection(bot: BotConfig) {
  testingBot.value = bot.id
  delete testResults[bot.id]

  // 这里仅做本地字段校验，真实远程接通暂未实现。
  await new Promise(r => setTimeout(r, 1500))
  const hasWebhook = !bot.webhookField || !!bot.webhook?.trim()
  testResults[bot.id] = bot.token.trim().length > 5 && hasWebhook ? 'success' : 'error'

  if (testResults[bot.id] === 'success') {
    bot.configured = true
    showToast(`${bot.name} 配置校验通过`, 'success')
  } else {
    showToast(`${bot.name} 配置校验失败，请检查必填项`, 'error')
  }
  testingBot.value = null
}

async function saveBotConfig(bot: BotConfig) {
  if (!bot.token) return
  savingBot.value = bot.id
  try {
    bot.configured = true
    await persistBotConfigs()
    showToast(`${bot.name} 配置已保存`, 'success')
  } catch (error) {
    console.error('[BotSettings] 保存配置失败:', error)
    showToast(`${bot.name} 配置保存失败`, 'error')
  } finally {
    savingBot.value = null
  }
}
</script>

<style scoped>
.page-header { margin-bottom: var(--space-xl); }
.page-title { font-size: var(--font-size-xl); font-weight: 700; }
.page-desc { color: var(--color-text-tertiary); font-size: var(--font-size-sm); margin-top: 4px; }

.bot-grid { display: flex; flex-direction: column; gap: var(--space-md); }

.bot-card { overflow: hidden; transition: all var(--transition-normal); }
.bot-card:hover { box-shadow: var(--shadow-md); }
.bot-card.is-configured { border-color: var(--color-primary-border); }

.bot-top {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-md); cursor: pointer;
  transition: background var(--transition-fast);
}
.bot-top:hover { background: var(--color-bg-hover); }

.bot-info { display: flex; align-items: center; gap: var(--space-md); }
.bot-icon { font-size: 32px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: var(--color-bg-secondary); border-radius: var(--radius-md); }
.bot-name { font-size: var(--font-size-md); font-weight: 600; margin-bottom: 2px; }
.bot-desc { font-size: var(--font-size-sm); color: var(--color-text-tertiary); }

.bot-status { display: flex; align-items: center; gap: var(--space-sm); }
.expand-arrow { font-size: 10px; color: var(--color-text-tertiary); transition: transform var(--transition-fast); }

/* 配置面板 */
.bot-config {
  padding: 0 var(--space-md) var(--space-md);
  animation: expand-in 0.2s ease;
}
@keyframes expand-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }

.config-divider { height: 1px; background: var(--color-divider); margin-bottom: var(--space-md); }

.form-group { margin-bottom: var(--space-md); }
.form-group label { display: block; font-size: var(--font-size-sm); font-weight: 500; margin-bottom: var(--space-xs); color: var(--color-text-primary); }
.input-mono { font-family: var(--font-mono); font-size: var(--font-size-sm); }
.token-row { display: flex; gap: var(--space-xs); }
.token-row .input { flex: 1; }
.btn-eye { padding: var(--space-xs) var(--space-sm); font-size: 14px; }

.config-actions { display: flex; gap: var(--space-sm); }
.btn-sm { padding: 4px 12px; font-size: var(--font-size-xs); }

.test-result { margin-top: var(--space-sm); font-size: var(--font-size-sm); padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-sm); }
.test-result.success { background: rgba(82, 196, 26, 0.08); color: var(--color-success); }
.test-result.error { background: rgba(255, 77, 79, 0.08); color: var(--color-error); }
</style>
