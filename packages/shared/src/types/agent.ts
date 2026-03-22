// Agent 相关类型

/** Agent 权限模式 */
export type PermissionMode = 'action' | 'plan' | 'autonomous'

/** Agent 配置 */
export interface AgentConfig {
  /** Agent 唯一 ID */
  id: string
  /** Agent 名称 */
  name: string
  /** Agent 描述 */
  description: string
  /** 系统提示词 */
  systemPrompt: string
  /** 使用的模型 ID */
  modelId: string
  /** 使用的供应商 ID */
  providerId: string
  /** 权限模式 */
  permissionMode: PermissionMode
  /** 允许的工具列表 */
  allowedTools: string[]
  /** 禁止的工具列表 */
  disallowedTools: string[]
  /** 工作目录 */
  workspacePath: string
  /** 是否启用 */
  enabled: boolean
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
}

/** Sidecar 所有者类型 */
export type SidecarOwnerType = 'tab' | 'cron_task' | 'agent' | 'background'

/** Sidecar 所有者 */
export interface SidecarOwner {
  type: SidecarOwnerType
  id: string
}

/** Sidecar 状态 */
export interface SidecarStatus {
  sessionId: string
  port: number
  healthy: boolean
  owners: SidecarOwner[]
}
