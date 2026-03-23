/**
 * Pinia Store — 配置管理
 *
 * 全局共享的供应商和应用配置状态。
 * 使用 Pinia 确保所有组件共享同一份数据。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { PROVIDER_TEMPLATES, type ProviderStatus } from '@aiagent/shared'
import { apiFetch } from '../utils/http'

// 尝试导入 Tauri API
let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null
try {
  const tauri = await import('@tauri-apps/api/core')
  invoke = tauri.invoke
} catch {
  console.warn('[ConfigStore] Tauri API 不可用，使用 localStorage 回退')
}

/** 模型信息（前端视图） */
export interface ModelView {
  id: string
  name: string
  enabled: boolean
  isCustom?: boolean
}

/** 供应商配置（前端视图） */
export interface ProviderView {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  isDefault: boolean
  status: ProviderStatus
  endpointType: string
  icon: string
  isCustom?: boolean
  models: ModelView[]
}

/** 应用配置（前端视图） */
export interface AppConfigView {
  theme: string
  locale: string
  defaultWorkspacePath: string
  sidecarPortStart: number
  autoStart: boolean
}

export const useConfigStore = defineStore('config', () => {
  // ==================== 供应商 ====================

  // 同步初始化供应商列表（从模板）
  const providers = ref<ProviderView[]>(
    PROVIDER_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      baseUrl: t.baseUrl,
      apiKey: '',
      isDefault: t.id === 'anthropic',
      status: 'unconfigured' as ProviderStatus,
      endpointType: t.endpointType,
      icon: t.icon,
      models: [] as ModelView[],
    }))
  )

  const appConfig = ref<AppConfigView>({
    theme: 'system',
    locale: 'zh-CN',
    defaultWorkspacePath: '~',
    sidecarPortStart: 31415,
    autoStart: false,
  })

  const isLoaded = ref(false)

  /** 默认供应商（有 API Key 的） */
  const defaultProvider = computed(() => {
    return providers.value.find(p => p.isDefault && p.apiKey)
      || providers.value.find(p => !!p.apiKey)
  })

  /** 初始化（从持久化加载） */
  async function init () {
    if (isLoaded.value) return
    await loadProviders()
    await loadAppConfig()
    isLoaded.value = true
    // 自动为已配置 API Key 但模型列表为空的供应商获取模型
    for (const p of providers.value) {
      if (p.apiKey && p.models.length === 0) {
        console.log(`[ConfigStore] 自动获取模型: ${p.name}`)
        fetchModels(p.id).catch(e => console.error(`[ConfigStore] 自动获取模型失败: ${p.name}`, e))
      }
    }
  }

  /** 加载供应商列表（全走 Tauri IPC） */
  async function loadProviders () {
    if (!invoke) {
      console.warn('[ConfigStore] Tauri 不可用，无法加载供应商配置')
      return
    }
    try {
      const saved = await invoke('cmd_get_providers') as Array<{
        id: string; name: string; base_url: string; api_key: string;
        is_default: boolean; enabled: boolean; endpoint_type: string;
      }>
      if (saved.length > 0) {
        providers.value = saved.map(p => {
          const template = PROVIDER_TEMPLATES.find(t => t.id === p.id)
          return {
            id: p.id,
            name: p.name,
            baseUrl: p.base_url,
            apiKey: p.api_key,
            isDefault: p.is_default,
            status: (p.api_key ? 'active' : 'unconfigured') as ProviderStatus,
            endpointType: p.endpoint_type || template?.endpointType || 'anthropic',
            icon: template?.icon || p.id,
            models: (p as any).models || [],
          }
        })
      }
    } catch (e) {
      console.error('[ConfigStore] 加载供应商失败:', e)
    }
  }

  /** 保存供应商配置（全走 Tauri IPC） */
  async function saveProviders () {
    if (!invoke) {
      console.warn('[ConfigStore] Tauri 不可用，无法保存供应商配置')
      return
    }
    try {
      await invoke('cmd_save_providers', {
        providers: providers.value.map(p => ({
          id: p.id,
          name: p.name,
          base_url: p.baseUrl,
          api_key: p.apiKey,
          is_default: p.isDefault,
          enabled: true,
          endpoint_type: p.endpointType || 'anthropic',
          models: p.models || [],
        }))
      })
    } catch (e) {
      console.error('[ConfigStore] 保存供应商到 Tauri 失败:', e)
    }
  }

  /** 更新单个供应商的 API Key */
  async function updateProviderApiKey (providerId: string, apiKey: string) {
    const provider = providers.value.find(p => p.id === providerId)
    if (provider) {
      provider.apiKey = apiKey
      provider.status = apiKey ? 'active' : 'unconfigured'
      await saveProviders()
    }
  }

  /** 测试供应商连接（根据端点类型选择不同策略） */
  async function testProviderConnection (providerId: string): Promise<boolean> {
    const provider = providers.value.find(p => p.id === providerId)
    if (!provider || !provider.apiKey) return false

    try {
      const endpointType = provider.endpointType || 'anthropic'
      const base = provider.baseUrl.replace(/\/+$/, '')
      let testUrl: string
      let fetchOptions: RequestInit

      if (endpointType === 'anthropic') {
        testUrl = `${base}/v1/messages`
        fetchOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        }
      } else if (endpointType === 'gemini') {
        testUrl = `${base}/v1beta/models?key=${provider.apiKey}`
        fetchOptions = {}
      } else {
        // openai-compatible / openai-responses / 其他：统一用 /v1/models 测试
        testUrl = `${base}/v1/models`
        fetchOptions = {
          headers: { 'Authorization': `Bearer ${provider.apiKey}` },
        }
      }

      console.log(`[ConfigStore] 测试连接: ${testUrl}`)
      const response = await apiFetch(testUrl, fetchOptions)
      console.log(`[ConfigStore] 测试连接响应: ${response.status}`)

      // 只要收到 HTTP 响应就算连接成功（端点可达）
      // 401/403 说明端点可达但 Key 可能有问题，仍视为"可连接"
      // 只有 fetch 抛异常（网络不通）才算失败
      provider.status = 'active'
      await saveProviders()
      return true
    } catch (e) {
      console.error('[ConfigStore] 测试连接失败:', e)
      provider.status = 'error'
      await saveProviders()
      return false
    }
  }

  /** 加载应用配置 */
  async function loadAppConfig () {
    if (invoke) {
      try {
        const config = await invoke('cmd_get_app_config') as {
          theme: string; locale: string; default_workspace_path: string;
          sidecar_port_start: number; auto_start: boolean;
        }
        appConfig.value = {
          theme: config.theme,
          locale: config.locale,
          defaultWorkspacePath: config.default_workspace_path,
          sidecarPortStart: config.sidecar_port_start,
          autoStart: config.auto_start,
        }
      } catch (e) {
        console.error('[ConfigStore] 加载应用配置失败:', e)
      }
    }
  }

  /** 保存应用配置 */
  async function saveAppConfig () {
    if (invoke) {
      try {
        await invoke('cmd_save_app_config', {
          config: {
            theme: appConfig.value.theme,
            locale: appConfig.value.locale,
            default_workspace_path: appConfig.value.defaultWorkspacePath,
            sidecar_port_start: appConfig.value.sidecarPortStart,
            auto_start: appConfig.value.autoStart,
          }
        })
      } catch (e) {
        console.error('[ConfigStore] 保存应用配置失败:', e)
      }
    }
  }

  /** 从 API 拉取供应商的模型列表 */
  async function fetchModels (providerId: string): Promise<string[]> {
    const provider = providers.value.find(p => p.id === providerId)
    if (!provider || !provider.apiKey) return []

    const endpointType = provider.endpointType || 'anthropic'
    const base = provider.baseUrl.replace(/\/+$/, '')
    let modelIds: string[] = []

    try {
      if (endpointType === 'openai' || endpointType === 'openai-compatible' || endpointType === 'openai-responses' || endpointType === 'deepseek') {
        // OpenAI 兼容：GET /v1/models
        const resp = await apiFetch(`${base}/v1/models`, {
          headers: { 'Authorization': `Bearer ${provider.apiKey}` },
        })
        if (resp.ok) {
          const json = await resp.json()
          modelIds = (json.data || []).map((m: any) => m.id).sort()
        }
      } else if (endpointType === 'anthropic') {
        // Anthropic：GET /v1/models
        const resp = await apiFetch(`${base}/v1/models`, {
          headers: {
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
          },
        })
        if (resp.ok) {
          const json = await resp.json()
          modelIds = (json.data || []).map((m: any) => m.id).sort()
        }
      }
    } catch (e) {
      console.error('[ConfigStore] 获取模型列表失败:', e)
    }

    // 合并到现有模型列表（保留已有的 enabled 状态和自定义模型）
    if (modelIds.length > 0) {
      const existing = new Map(provider.models.map(m => [m.id, m]))
      const newModels: ModelView[] = modelIds.map(id => ({
        id,
        name: id,
        enabled: existing.get(id)?.enabled ?? true,
        isCustom: false,
      }))
      // 保留用户自定义的模型
      const customModels = provider.models.filter(m => m.isCustom)
      provider.models = [...newModels, ...customModels]
      await saveProviders()
    }

    return modelIds
  }

  /** 手动添加自定义模型 */
  async function addCustomModel (providerId: string, modelId: string) {
    const provider = providers.value.find(p => p.id === providerId)
    if (!provider) return
    if (provider.models.some(m => m.id === modelId)) return
    provider.models.push({ id: modelId, name: modelId, enabled: true, isCustom: true })
    await saveProviders()
  }

  /** 切换模型启用/禁用 */
  async function toggleModel (providerId: string, modelId: string) {
    const provider = providers.value.find(p => p.id === providerId)
    if (!provider) return
    const model = provider.models.find(m => m.id === modelId)
    if (model) {
      model.enabled = !model.enabled
      await saveProviders()
    }
  }

  /** 删除自定义模型 */
  async function removeModel (providerId: string, modelId: string) {
    const provider = providers.value.find(p => p.id === providerId)
    if (!provider) return
    provider.models = provider.models.filter(m => m.id !== modelId)
    await saveProviders()
  }

  /** 获取所有已启用的模型（跨供应商，用于全局模型选择器） */
  function allEnabledModels (): Array<{ id: string; name: string; providerId: string; providerName: string }> {
    const result: Array<{ id: string; name: string; providerId: string; providerName: string }> = []
    for (const p of providers.value) {
      if (!p.apiKey) continue
      for (const m of p.models) {
        if (m.enabled) {
          result.push({ id: m.id, name: m.name, providerId: p.id, providerName: p.name })
        }
      }
    }
    return result
  }

  return {
    providers,
    appConfig,
    isLoaded,
    defaultProvider,
    init,
    loadProviders,
    saveProviders,
    updateProviderApiKey,
    testProviderConnection,
    loadAppConfig,
    saveAppConfig,
    fetchModels,
    addCustomModel,
    toggleModel,
    removeModel,
    allEnabledModels,
  }
})
