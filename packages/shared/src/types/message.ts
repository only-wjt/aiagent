// 消息类型定义

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system'

/** 消息内容块类型 */
export type ContentBlockType = 'text' | 'tool_use' | 'tool_result' | 'thinking'

/** 文本内容块 */
export interface TextBlock {
  type: 'text'
  text: string
}

/** 工具调用块 */
export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

/** 工具结果块 */
export interface ToolResultBlock {
  type: 'tool_result'
  toolUseId: string
  content: string
  isError?: boolean
}

/** 思考块 */
export interface ThinkingBlock {
  type: 'thinking'
  text: string
}

/** 内容块联合类型 */
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock

/** 消息 */
export interface Message {
  /** 消息唯一 ID */
  id: string
  /** 会话 ID */
  sessionId: string
  /** 角色 */
  role: MessageRole
  /** 内容块列表 */
  content: ContentBlock[]
  /** 模型名称 */
  model?: string
  /** Token 使用量 */
  usage?: TokenUsage
  /** 创建时间 */
  createdAt: string
}

/** Token 使用量 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** SSE 事件类型 */
export type SSEEventType =
  | 'message:start'
  | 'message:chunk'
  | 'message:complete'
  | 'tool:start'
  | 'tool:result'
  | 'thinking:start'
  | 'thinking:chunk'
  | 'error'

/** SSE 事件 */
export interface SSEEvent {
  type: SSEEventType
  data: unknown
}
