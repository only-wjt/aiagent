/**
 * 协议适配器 — 类型定义
 *
 * 定义 Anthropic Messages API 格式与其他厂商之间的映射接口。
 * 每个适配器负责将 Anthropic 格式的请求/响应转换为目标厂商格式，
 * 完成双向透明转换。
 */

// ==================== Anthropic 格式定义 ====================

/** Anthropic Messages API 请求体 */
export interface AnthropicRequest {
  model: string
  max_tokens: number
  system?: string
  messages: AnthropicMessage[]
  stream?: boolean
  temperature?: number
  top_p?: number
  stop_sequences?: string[]
}

/** Anthropic 消息结构 */
export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

/** Anthropic Content Block */
export interface AnthropicContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: string
  source?: {
    type: 'base64'
    media_type: string
    data: string
  }
}

/** Anthropic 非流式响应 */
export interface AnthropicResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: AnthropicContentBlock[]
  model: string
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

/** Anthropic SSE 事件类型 */
export type AnthropicStreamEvent =
  | { type: 'message_start'; message: Partial<AnthropicResponse> }
  | { type: 'content_block_start'; index: number; content_block: AnthropicContentBlock }
  | { type: 'content_block_delta'; index: number; delta: { type: 'text_delta'; text: string } }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string }; usage: { output_tokens: number } }
  | { type: 'message_stop' }

// ==================== 适配器接口 ====================

/**
 * 协议适配器接口
 *
 * 每个适配器实现此接口，负责在 Anthropic 协议与目标协议之间做双向转换。
 */
export interface ProviderAdapter {
  /** 适配器名称 */
  readonly name: string

  /** 将 Anthropic 请求转为目标格式的请求体 */
  translateRequest (req: AnthropicRequest): unknown

  /** 构建目标 API 的请求头 */
  buildHeaders (apiKey: string): Record<string, string>

  /** 获取目标 API 的完整 URL */
  getEndpointUrl (baseUrl: string): string

  /**
   * 获取完整的请求 URL（含 model 和 streaming 参数）
   * 某些 API（如 Gemini）需要在 URL 中包含 model 名和 API Key。
   * 默认实现直接返回 getEndpointUrl。
   */
  getFullEndpointUrl?(baseUrl: string, model: string, stream: boolean, apiKey: string): string

  /** 将目标 API 的非流式响应转为 Anthropic 格式 */
  translateResponse (targetRes: unknown): AnthropicResponse

  /**
   * 解析目标 API 的 SSE 数据行，返回 Anthropic 格式的 SSE 事件列表。
   * 一行目标 SSE 可能对应 0~N 条 Anthropic SSE 事件。
   */
  translateStreamChunk (data: string, context: StreamContext): AnthropicStreamEvent[]
}

/** 流式转换上下文（跨 chunk 共享状态） */
export interface StreamContext {
  /** 当前消息 ID */
  messageId: string
  /** 是否已发送 message_start */
  started: boolean
  /** 当前 content block 索引 */
  blockIndex: number
  /** 已累计生成的 token 数 */
  outputTokens: number
  /** 模型名称 */
  model: string
}

/** 创建初始流式上下文 */
export function createStreamContext (model: string): StreamContext {
  return {
    messageId: `msg_${Date.now().toString(36)}`,
    started: false,
    blockIndex: 0,
    outputTokens: 0,
    model,
  }
}
