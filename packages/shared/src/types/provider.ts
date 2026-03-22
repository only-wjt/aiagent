// 模型供应商类型定义

/** 供应商状态 */
export type ProviderStatus = 'active' | 'error' | 'unconfigured'

/** 供应商配置 */
export interface Provider {
  /** 供应商唯一 ID */
  id: string
  /** 供应商名称 */
  name: string
  /** API 端点 URL */
  baseUrl: string
  /** API Key（前端仅展示掩码） */
  apiKey?: string
  /** API Key 掩码 */
  apiKeyMask?: string
  /** 可用模型列表 */
  models: ModelInfo[]
  /** 是否为默认供应商 */
  isDefault: boolean
  /** 状态 */
  status: ProviderStatus
  /** 图标名称（用于前端展示） */
  icon?: string
}

/** 模型信息 */
export interface ModelInfo {
  /** 模型 ID */
  id: string
  /** 模型显示名称 */
  name: string
  /** 最大上下文窗口（Token 数） */
  maxTokens?: number
  /** 是否支持 Agent 模式 */
  supportsAgent?: boolean
  /** 是否支持 Vision */
  supportsVision?: boolean
}

/** 预定义供应商模板 */
export interface ProviderTemplate {
  id: string
  name: string
  baseUrl: string
  icon: string
  /** 兼容端点类型 */
  endpointType: 'anthropic' | 'openai'
}

/** 内置供应商模板列表 */
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', icon: 'anthropic', endpointType: 'anthropic' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com', icon: 'openai', endpointType: 'openai' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', icon: 'deepseek', endpointType: 'openai' },
  { id: 'moonshot', name: 'Moonshot AI', baseUrl: 'https://api.moonshot.cn', icon: 'moonshot', endpointType: 'openai' },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas', icon: 'zhipu', endpointType: 'openai' },
  { id: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimax.chat', icon: 'minimax', endpointType: 'openai' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api', icon: 'openrouter', endpointType: 'openai' },
  { id: 'volcengine', name: '火山方舟', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', icon: 'volcengine', endpointType: 'openai' },
  { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn', icon: 'siliconflow', endpointType: 'openai' },
]
