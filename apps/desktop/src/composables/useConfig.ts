/**
 * useConfig — 配置管理组合式函数
 *
 * 封装 Tauri IPC 配置命令，管理供应商和应用配置。
 * 开发模式下使用 localStorage 回退。
 */

import { ref, onMounted } from 'vue'
import { PROVIDER_TEMPLATES, type ProviderStatus } from '@aiagent/shared'

// 尝试导入 Tauri API
let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null
try {
  const tauri = await import('@tauri-apps/api/core')
  invoke = tauri.invoke
} catch {
  console.warn('[useConfig] Tauri API 不可用，使用 localStorage 回退')
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
}

/** 应用配置（前端视图） */
export interface AppConfigView {
  theme: string
  locale: string
  defaultWorkspacePath: string
  sidecarPortStart: number
  autoStart: boolean
}

export function useConfig () {
  const providers = ref<ProviderView[]>([])
  const appConfig = ref<AppConfigView>({
    theme: 'system',
    locale: 'zh-CN',
    defaultWorkspacePath: '~',
    sidecarPortStart: 31415,
    autoStart: false,
  })
  const isLoading = ref(false)

  /** 加载供应商列表 */
  async function loadProviders () {
    isLoading.value = true
    try {
      if (invoke) {
        const saved = await invoke('cmd_get_providers') as Array<{
          id: string; name: string; base_url: string; api_key: string;
          is_default: boolean; enabled: boolean;
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
              status: p.api_key ? 'active' as const : 'unconfigured' as const,
              endpointType: template?.endpointType || 'anthropic',
              icon: template?.icon || p.id,
            }
          })
          return
        }
      }

      // 回退：从模板初始化
      const stored = localStorage.getItem('aiagent_providers')
      if (stored) {
        providers.value = JSON.parse(stored)
      } else {
        providers.value = PROVIDER_TEMPLATES.map(t => ({
          id: t.id,
          name: t.name,
          baseUrl: t.baseUrl,
          apiKey: '',
          isDefault: t.id === 'anthropic',
          status: 'unconfigured' as const,
          endpointType: t.endpointType,
          icon: t.icon,
        }))
      }
    } finally {
      isLoading.value = false
    }
  }

  /** 保存供应商配置 */
  async function saveProviders () {
    if (invoke) {
      await invoke('cmd_save_providers', {
        providers: providers.value.map(p => ({
          id: p.id,
          name: p.name,
          base_url: p.baseUrl,
          api_key: p.apiKey,
          is_default: p.isDefault,
          enabled: true,
        }))
      })
    }
    localStorage.setItem('aiagent_providers', JSON.stringify(providers.value))
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

  /** 测试供应商连接 */
  async function testProviderConnection (providerId: string): Promise<boolean> {
    const provider = providers.value.find(p => p.id === providerId)
    if (!provider || !provider.apiKey) return false

    try {
      // 发送一个简单请求来测试连接
      const response = await fetch(`${provider.baseUrl}/v1/messages`, {
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
      })
      provider.status = response.ok ? 'active' : 'error'
      await saveProviders()
      return response.ok
    } catch {
      provider.status = 'error'
      await saveProviders()
      return false
    }
  }

  /** 获取默认供应商 */
  function getDefaultProvider (): ProviderView | undefined {
    return providers.value.find(p => p.isDefault && p.apiKey)
      || providers.value.find(p => p.apiKey)
  }

  /** 加载应用配置 */
  async function loadAppConfig () {
    if (invoke) {
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
    }
  }

  /** 保存应用配置 */
  async function saveAppConfig () {
    if (invoke) {
      await invoke('cmd_save_app_config', {
        config: {
          theme: appConfig.value.theme,
          locale: appConfig.value.locale,
          default_workspace_path: appConfig.value.defaultWorkspacePath,
          sidecar_port_start: appConfig.value.sidecarPortStart,
          auto_start: appConfig.value.autoStart,
        }
      })
    }
  }

  // 组件挂载时自动加载
  onMounted(() => {
    loadProviders()
    loadAppConfig()
  })

  return {
    providers,
    appConfig,
    isLoading,
    loadProviders,
    saveProviders,
    updateProviderApiKey,
    testProviderConnection,
    getDefaultProvider,
    loadAppConfig,
    saveAppConfig,
  }
}
