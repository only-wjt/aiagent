// 配置类型定义

/** 全局应用配置 */
export interface AppConfig {
  /** 应用主题 */
  theme: 'light' | 'dark' | 'system'
  /** 界面语言 */
  locale: 'zh-CN' | 'en-US'
  /** 默认工作目录 */
  defaultWorkspacePath: string
  /** 默认模型 ID */
  defaultModelId?: string
  /** 默认供应商 ID */
  defaultProviderId?: string
  /** 起始端口号 */
  sidecarPortStart: number
  /** 是否开机启动 */
  autoStart: boolean
}

/** 默认应用配置 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  theme: 'system',
  locale: 'zh-CN',
  defaultWorkspacePath: '~',
  sidecarPortStart: 31415,
  autoStart: false,
}

/** 工作区配置 */
export interface WorkspaceConfig {
  /** 工作区路径 */
  path: string
  /** 工作区名称 */
  name: string
  /** 关联的 Agent 配置 */
  agentId?: string
  /** 模型配置 */
  modelId?: string
  /** 供应商配置 */
  providerId?: string
  /** 自定义系统提示词 */
  systemPrompt?: string
}
