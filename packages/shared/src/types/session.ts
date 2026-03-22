// 会话类型定义

/** 会话状态 */
export type SessionStatus = 'active' | 'idle' | 'archived'

/** 会话信息 */
export interface Session {
  /** 会话唯一 ID */
  id: string
  /** 会话标题 */
  title: string
  /** 关联的 Agent 配置 ID */
  agentId?: string
  /** 工作目录 */
  workspacePath: string
  /** 状态 */
  status: SessionStatus
  /** 消息数量 */
  messageCount: number
  /** 创建时间 */
  createdAt: string
  /** 最后活跃时间 */
  lastActiveAt: string
  /** 使用的模型 */
  model?: string
  /** 使用的供应商 */
  provider?: string
}

/** 会话创建参数 */
export interface CreateSessionParams {
  title?: string
  agentId?: string
  workspacePath: string
  model?: string
  provider?: string
}
