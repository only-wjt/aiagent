<template>
  <div class="provider-settings">
    <div class="page-header">
      <div>
        <h2 class="page-title">模型供应商</h2>
        <p class="page-desc">配置 AI 模型供应商和 API 密钥，支持 Anthropic 及兼容端点</p>
      </div>
      <button class="btn btn-primary" @click="showAddModal = true">+ 添加供应商</button>
    </div>

    <!-- 供应商列表 -->
    <div class="provider-list">
      <div
        v-for="provider in providers"
        :key="provider.id"
        class="provider-card card"
        :class="{ 'is-default': provider.isDefault }"
      >
        <div class="provider-header">
          <div class="provider-info">
            <span class="provider-icon">{{ providerIcon(provider.id) }}</span>
            <div>
              <div class="provider-name-row">
                <span class="provider-name">{{ provider.name }}</span>
                <span v-if="provider.isDefault" class="badge badge-primary">默认</span>
                <span v-if="provider.isCustom" class="badge badge-warning">自定义</span>
              </div>
              <span class="provider-url">{{ provider.baseUrl }}</span>
              <span v-if="provider.endpointType && provider.endpointType !== 'anthropic'" class="badge badge-info" style="margin-left:6px;font-size:11px">{{ provider.endpointType }}</span>
            </div>
            <div class="provider-actual-url">
              → {{ getActualEndpoint(provider.baseUrl, provider.endpointType) }}
            </div>
          </div>
          <div class="provider-status-area">
            <span class="badge" :class="statusClass(provider.status)">
              {{ statusText(provider.status) }}
            </span>
            <button
              class="btn-icon btn-edit"
              @click="editProvider(provider)"
              title="编辑"
            >✏️</button>
            <button
              v-if="provider.isCustom"
              class="btn-icon btn-delete"
              @click="removeCustomProvider(provider.id)"
              title="删除"
            >🗑️</button>
          </div>
        </div>

        <!-- API Key 输入 -->
        <div class="provider-key-row">
          <div class="key-input-wrapper">
            <input
              :type="showKey[provider.id] ? 'text' : 'password'"
              class="input key-input"
              placeholder="输入 API Key"
              :value="provider.apiKey"
              @change="(e) => onApiKeyChange(provider.id, (e.target as HTMLInputElement).value)"
            />
            <button class="btn btn-ghost btn-eye" @click="showKey[provider.id] = !showKey[provider.id]">
              {{ showKey[provider.id] ? '🙈' : '👁️' }}
            </button>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="provider-actions">
          <button
            class="btn btn-secondary btn-sm"
            :disabled="!provider.apiKey || testingId === provider.id"
            @click="testConnection(provider.id)"
          >
            {{ testingId === provider.id ? '测试中...' : '🔗 测试连接' }}
          </button>
          <button
            v-if="!provider.isDefault && provider.apiKey"
            class="btn btn-ghost btn-sm"
            @click="setDefault(provider.id)"
          >
            设为默认
          </button>
          <button
            v-if="provider.isCustom"
            class="btn btn-ghost btn-sm"
            @click="editProvider(provider)"
          >
            ✏️ 编辑
          </button>
        </div>

        <!-- 测试结果 -->
        <div v-if="testResults[provider.id]" class="test-result" :class="testResults[provider.id]">
          {{ testResults[provider.id] === 'success' ? '✅ 连接成功' : '❌ 连接失败，请检查 API Key 或 Base URL' }}
        </div>
      </div>
    </div>

    <!-- 添加/编辑供应商模态框 -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal card">
        <h3 class="modal-title">{{ editingProviderId ? '编辑供应商' : '添加自定义供应商' }}</h3>
        <p class="modal-hint">支持任何兼容 Anthropic API 格式的端点（如 OpenRouter、AWS Bedrock 等）</p>

        <!-- 快捷选择 -->
        <div class="preset-row">
          <span class="preset-label">快捷选择：</span>
          <button
            v-for="p in presets"
            :key="p.name"
            class="preset-btn"
            @click="applyPreset(p)"
          >{{ p.name }}</button>
        </div>

        <div class="form-group">
          <label>供应商名称</label>
          <input class="input" v-model="form.name" placeholder="例如：OpenRouter" />
        </div>
        <div class="form-group">
          <label>Base URL</label>
          <input class="input input-mono" v-model="form.baseUrl" placeholder="https://openrouter.ai/api/v1" />
        </div>
        <div class="form-group">
          <label>端点类型</label>
          <div class="segmented-control">
            <button
              v-for="ep in endpointTypes"
              :key="ep"
              class="segment-btn"
              :class="{ active: form.endpointType === ep }"
              @click="form.endpointType = ep"
            >{{ ep }}</button>
          </div>
        </div>
        <!-- 真实请求地址预览 -->
        <div v-if="form.baseUrl.trim()" class="form-group">
          <label>真实请求地址</label>
          <div class="actual-url-preview">
            → {{ getActualEndpoint(form.baseUrl, form.endpointType) }}
          </div>
        </div>
        <div class="form-group">
          <label>API Key <span class="label-hint">（可选，稍后配置）</span></label>
          <input class="input input-mono" v-model="form.apiKey" type="password" placeholder="sk-..." />
        </div>

        <!-- 模型管理 -->
        <div class="form-group">
          <div class="models-header-modal">
            <label>模型配置</label>
            <button
              v-if="form.apiKey.trim()"
              class="btn btn-secondary btn-xs"
              @click="fetchModalModels"
              :disabled="fetchingModalModels"
            >
              {{ fetchingModalModels ? '获取中...' : '从 API 获取' }}
            </button>
          </div>
          <p class="modal-hint" style="margin-bottom: 8px; font-size: 12px;">勾选要启用的模型，或手动添加不支持 API 的模型</p>

          <!-- 模型列表 -->
          <div v-if="form.models.length > 0" class="models-list-modal">
            <label v-for="model in form.models" :key="model.id" class="model-checkbox">
              <input type="checkbox" v-model="model.enabled" />
              <span>{{ model.name }}</span>
              <button
                v-if="model.isCustom"
                class="btn-icon btn-remove-model"
                @click.prevent="removeFormModel(model.id)"
              >✕</button>
            </label>
          </div>

          <!-- 手动添加模型 -->
          <div class="add-model-row-modal">
            <input
              class="input add-model-input"
              placeholder="输入模型 ID，如 gpt-4o"
              v-model="formNewModelId"
              @keydown.enter="addFormModel"
            />
            <button class="btn btn-secondary btn-sm" @click="addFormModel" :disabled="!formNewModelId.trim()">
              添加
            </button>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-ghost" @click="closeModal">取消</button>
          <button
            v-if="editingProviderId"
            class="btn btn-primary"
            @click="saveEditedProvider"
            :disabled="!form.name.trim() || !form.baseUrl.trim()"
          >
            保存
          </button>
          <button
            v-else
            class="btn btn-primary"
            @click="addProvider"
            :disabled="!form.name.trim() || !form.baseUrl.trim()"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useConfigStore } from '../../stores/configStore'
import { apiFetch } from '../../utils/http'
import type { ProviderStatus } from '@aiagent/shared'

const configStore = useConfigStore()
const providers = configStore.providers

const showKey = reactive<Record<string, boolean>>({})
const testingId = ref<string | null>(null)
const testResults = reactive<Record<string, 'success' | 'error'>>({})
const showAddModal = ref(false)
const editingProviderId = ref<string | null>(null)


const endpointTypes = ['anthropic', 'openai-compatible', 'openai-responses', 'gemini']

const presets = [
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', endpointType: 'openai-compatible' },
  { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com', endpointType: 'gemini' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', endpointType: 'openai-compatible' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', endpointType: 'openai-compatible' },
  { name: 'Azure AI', baseUrl: 'https://models.inference.ai.azure.com', endpointType: 'openai-compatible' },
  { name: '本地代理', baseUrl: 'http://localhost:8080', endpointType: 'anthropic' },
]

const fetchingModalModels = ref(false)
const formNewModelId = ref('')
const form = reactive({
  name: '', baseUrl: '', endpointType: 'anthropic', apiKey: '',
  models: [] as Array<{ id: string; name: string; enabled: boolean; isCustom?: boolean }>,
})

const providerIcons: Record<string, string> = {
  anthropic: '🟠', openrouter: '🌐', groq: '⚡', deepseek: '🐋',
  google: '🔵', openai: '🟢', mistral: '🔴', together: '🟣',
}

function providerIcon(id: string) {
  return providerIcons[id] || '🔗'
}

function statusClass(status: ProviderStatus) {
  return {
    'badge-success': status === 'active',
    'badge-error': status === 'error',
    'badge-warning': status === 'unconfigured',
  }
}

function statusText(status: ProviderStatus) {
  return { active: '已连接', error: '连接失败', unconfigured: '未配置' }[status]
}

/** 根据端点类型计算真实请求地址 */
function getActualEndpoint(baseUrl: string, endpointType?: string): string {
  const base = (baseUrl || '').replace(/\/+$/, '')
  const type = endpointType || 'anthropic'
  const pathMap: Record<string, string> = {
    'anthropic': '/v1/messages',
    'openai-compatible': '/v1/chat/completions',
    'openai-responses': '/v1/responses',
    'gemini': '/v1beta/models/{model}:streamGenerateContent',
  }
  return `${base}${pathMap[type] || '/v1/chat/completions'}`
}

async function onApiKeyChange(providerId: string, value: string) {
  await configStore.updateProviderApiKey(providerId, value.trim())
  delete testResults[providerId]
}

async function testConnection(providerId: string) {
  testingId.value = providerId
  delete testResults[providerId]
  try {
    const ok = await configStore.testProviderConnection(providerId)
    testResults[providerId] = ok ? 'success' : 'error'
  } catch {
    testResults[providerId] = 'error'
  } finally {
    testingId.value = null
  }
}

async function setDefault(providerId: string) {
  configStore.providers.forEach(p => p.isDefault = p.id === providerId)
  await configStore.saveProviders()
}

function applyPreset(p: { name: string; baseUrl: string; endpointType: string }) {
  form.name = p.name
  form.baseUrl = p.baseUrl
  form.endpointType = p.endpointType
}

async function fetchModalModels() {
  if (!form.apiKey.trim() || !form.baseUrl.trim()) return
  fetchingModalModels.value = true
  try {
    const base = form.baseUrl.replace(/\/+$/, '')
    const headers = form.endpointType === 'anthropic'
      ? { 'x-api-key': form.apiKey, 'anthropic-version': '2023-06-01' }
      : { 'Authorization': `Bearer ${form.apiKey}` }
    const resp = await apiFetch(`${base}/v1/models`, { headers })
    if (resp.ok) {
      const json = await resp.json()
      const modelIds = (json.data || []).map((m: any) => m.id).sort()
      form.models = modelIds.map(id => ({ id, name: id, enabled: true }))
    }
  } catch (e) {
    console.error('获取模型失败:', e)
  } finally {
    fetchingModalModels.value = false
  }
}

function addFormModel() {
  const modelId = formNewModelId.value.trim()
  if (!modelId || form.models.some(m => m.id === modelId)) return
  form.models.push({ id: modelId, name: modelId, enabled: true, isCustom: true })
  formNewModelId.value = ''
}

function removeFormModel(modelId: string) {
  form.models = form.models.filter(m => m.id !== modelId)
}

function closeModal() {
  showAddModal.value = false
  editingProviderId.value = null
  form.name = ''; form.baseUrl = ''; form.endpointType = 'anthropic'; form.apiKey = ''; form.models = []
  formNewModelId.value = ''
}

/** 打开编辑弹窗，预填充当前供应商数据 */
function editProvider(provider: any) {
  editingProviderId.value = provider.id
  form.name = provider.name
  form.baseUrl = provider.baseUrl
  form.endpointType = provider.endpointType || 'anthropic'
  form.apiKey = provider.apiKey || ''
  form.models = (provider.models || []).map((m: any) => ({
    id: m.id, name: m.name, enabled: m.enabled, isCustom: m.isCustom,
  }))
  showAddModal.value = true
}

/** 保存编辑后的供应商 */
async function saveEditedProvider() {
  if (!editingProviderId.value || !form.name.trim() || !form.baseUrl.trim()) return
  const provider = providers.find(p => p.id === editingProviderId.value)
  if (!provider) return
  provider.name = form.name.trim()
  provider.baseUrl = form.baseUrl.trim()
  provider.endpointType = form.endpointType
  provider.apiKey = form.apiKey.trim()
  provider.status = form.apiKey.trim() ? 'active' : 'unconfigured'
  provider.models = form.models.map(m => ({ id: m.id, name: m.name, enabled: m.enabled, isCustom: m.isCustom }))
  await configStore.saveProviders()
  closeModal()
}

async function addProvider() {
  if (!form.name.trim() || !form.baseUrl.trim()) return
  const newProvider = {
    id: `custom-${Date.now()}`,
    name: form.name.trim(),
    baseUrl: form.baseUrl.trim(),
    endpointType: form.endpointType,
    apiKey: form.apiKey.trim(),
    isDefault: false,
    isCustom: true,
    status: (form.apiKey ? 'active' : 'unconfigured') as ProviderStatus,
    models: form.models.map(m => ({ id: m.id, name: m.name, enabled: m.enabled, isCustom: m.isCustom })),
  }
  providers.push(newProvider as any)
  await configStore.saveProviders()
  closeModal()
}

async function removeCustomProvider(id: string) {
  const idx = providers.findIndex(p => p.id === id)
  if (idx !== -1) {
    providers.splice(idx, 1)
    await configStore.saveProviders()
  }
}


</script>

<style scoped>
.page-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: var(--space-xl);
}
.page-title { font-size: var(--font-size-xl); font-weight: 700; }
.page-desc { color: var(--color-text-tertiary); font-size: var(--font-size-sm); margin-top: 4px; }

.provider-list { display: flex; flex-direction: column; gap: var(--space-md); }

.provider-card { padding: var(--space-md); transition: all var(--transition-normal); }
.provider-card.is-default { border-color: var(--color-primary-border); }
.provider-card:hover { box-shadow: var(--shadow-md); }

.provider-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: var(--space-md);
}
.provider-info { display: flex; align-items: center; gap: var(--space-md); }
.provider-icon {
  font-size: 24px; width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-bg-secondary); border-radius: var(--radius-md);
}
.provider-name-row { display: flex; align-items: center; gap: var(--space-sm); }
.provider-name { font-weight: 600; font-size: var(--font-size-md); }
.provider-url { font-size: var(--font-size-xs); color: var(--color-text-tertiary); }

.provider-status-area { display: flex; align-items: center; gap: var(--space-sm); }
.btn-icon { background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; border-radius: var(--radius-sm); transition: all var(--transition-fast); }
.btn-delete:hover { background: rgba(255, 77, 79, 0.1); }

.provider-key-row { margin-bottom: var(--space-md); }
.key-input-wrapper { display: flex; gap: var(--space-xs); }
.key-input { font-size: var(--font-size-sm); flex: 1; }
.btn-eye { padding: var(--space-xs) var(--space-sm); font-size: 14px; }

.provider-url-edit { margin-bottom: var(--space-md); }
.provider-edit-section { margin-bottom: var(--space-md); display: flex; flex-direction: column; gap: var(--space-sm); }
.edit-field { }
.field-label { display: block; font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-tertiary); margin-bottom: 4px; }
.url-input { font-family: var(--font-mono); font-size: var(--font-size-sm); }

.provider-actions { display: flex; gap: var(--space-sm); }
.btn-sm { padding: 4px 12px; font-size: var(--font-size-xs); }

.test-result {
  margin-top: var(--space-sm); font-size: var(--font-size-sm);
  padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-sm);
}
.test-result.success { background: rgba(82, 196, 26, 0.08); color: var(--color-success); }
.test-result.error { background: rgba(255, 77, 79, 0.08); color: var(--color-error); }

/* 模态框 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
.modal { width: 500px; max-height: 85vh; overflow-y: auto; padding: var(--space-xl); animation: modal-in 0.2s ease; }
@keyframes modal-in { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: none; } }
.modal-title { font-size: var(--font-size-lg); font-weight: 600; margin-bottom: var(--space-xs); }
.modal-hint { font-size: var(--font-size-sm); color: var(--color-text-tertiary); margin-bottom: var(--space-lg); }

/* 快捷选择 */
.preset-row { display: flex; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-lg); flex-wrap: wrap; }
.preset-label { font-size: var(--font-size-xs); color: var(--color-text-tertiary); }
.preset-btn {
  padding: 4px 12px; border: 1px solid var(--color-border-light);
  border-radius: var(--radius-pill); background: var(--color-bg-card);
  font-family: var(--font-sans); font-size: var(--font-size-xs);
  color: var(--color-text-secondary); cursor: pointer;
  transition: all var(--transition-fast);
}
.preset-btn:hover { border-color: var(--color-primary-border); background: var(--color-primary-bg); color: var(--color-primary); }

.form-group { margin-bottom: var(--space-md); }
.form-group label { display: block; font-size: var(--font-size-sm); font-weight: 500; margin-bottom: var(--space-xs); color: var(--color-text-primary); }
.label-hint { font-weight: 400; color: var(--color-text-tertiary); }
.input-mono { font-family: var(--font-mono); font-size: var(--font-size-sm); }

/* 分段控件 */
.segmented-control { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
.segment-btn {
  flex: 1; padding: 6px 12px; border: none; background: var(--color-bg-card);
  font-family: var(--font-sans); font-size: var(--font-size-xs);
  color: var(--color-text-secondary); cursor: pointer; transition: all var(--transition-fast);
}
.segment-btn + .segment-btn { border-left: 1px solid var(--color-border); }
.segment-btn:hover { background: var(--color-bg-hover); }
.segment-btn.active { background: var(--color-primary); color: var(--color-text-inverse); font-weight: 500; }

.modal-actions { display: flex; justify-content: flex-end; gap: var(--space-sm); margin-top: var(--space-lg); }


.models-header-modal { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.models-list-modal { display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto; margin-bottom: 8px; padding: 8px; background: var(--color-bg-secondary); border-radius: var(--radius-md); }
.model-checkbox { display: flex; align-items: center; gap: 8px; font-size: var(--font-size-sm); cursor: pointer; user-select: none; }
.model-checkbox input { cursor: pointer; }
.btn-remove-model { background: none; border: none; color: var(--color-text-tertiary); cursor: pointer; padding: 0; margin-left: auto; font-size: 14px; }
.btn-remove-model:hover { color: var(--color-error); }
.add-model-row-modal { display: flex; gap: var(--space-xs); margin-top: 8px; }

/* 真实请求地址 */
.provider-actual-url {
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
  padding: 2px 0;
  margin-top: 2px;
}
.actual-url-preview {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--color-primary);
  background: var(--color-primary-bg);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  word-break: break-all;
}
</style>
