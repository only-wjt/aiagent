/**
 * Google Gemini 协议适配器
 *
 * 将 Anthropic Messages API 格式转换为 Gemini generateContent API 格式。
 * 支持 Gemini 1.5 Pro / Flash / 2.0 等模型。
 */

import type {
  ProviderAdapter,
  AnthropicRequest,
  AnthropicResponse,
  AnthropicStreamEvent,
  AnthropicContentBlock,
  StreamContext,
} from './types'

// ==================== Gemini 格式定义 ====================

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiPart {
  text?: string
  inlineData?: { mimeType: string; data: string }
}

interface GeminiRequest {
  contents: GeminiContent[]
  systemInstruction?: { parts: GeminiPart[] }
  generationConfig?: {
    maxOutputTokens?: number
    temperature?: number
    topP?: number
    stopSequences?: string[]
  }
}

interface GeminiResponse {
  candidates: {
    content: GeminiContent
    finishReason: string
  }[]
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

interface GeminiStreamChunk {
  candidates?: {
    content?: GeminiContent
    finishReason?: string
  }[]
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

// ==================== 适配器实现 ====================

export class GeminiAdapter implements ProviderAdapter {
  readonly name = 'gemini'

  /** Anthropic 请求 → Gemini 请求 */
  translateRequest (req: AnthropicRequest): GeminiRequest {
    const contents: GeminiContent[] = []

    for (const msg of req.messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user'
      const parts: GeminiPart[] = []

      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content })
      } else {
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            parts.push({ text: block.text })
          } else if (block.type === 'image' && block.source) {
            parts.push({
              inlineData: {
                mimeType: block.source.media_type,
                data: block.source.data,
              },
            })
          } else if (block.type === 'tool_use') {
            parts.push({ text: `[Tool Call: ${block.name}(${JSON.stringify(block.input)})]` })
          } else if (block.type === 'tool_result') {
            parts.push({ text: block.content || '' })
          }
        }
      }

      if (parts.length > 0) {
        contents.push({ role, parts })
      }
    }

    const geminiReq: GeminiRequest = {
      contents,
      generationConfig: {
        maxOutputTokens: req.max_tokens,
        temperature: req.temperature,
        topP: req.top_p,
        stopSequences: req.stop_sequences,
      },
    }

    // 系统提示词
    if (req.system) {
      geminiReq.systemInstruction = { parts: [{ text: req.system }] }
    }

    return geminiReq
  }

  /** 构建请求头 */
  buildHeaders (_apiKey: string): Record<string, string> {
    // Gemini 使用 URL 参数传 key，不在 header 中
    return { 'Content-Type': 'application/json' }
  }

  /** 获取目标端点 URL（API Key 附加在 URL 中） */
  getEndpointUrl (baseUrl: string): string {
    // Gemini 的 URL 格式：/v1beta/models/{model}:generateContent
    // 实际 model 名从请求体传入，这里返回基础 URL
    const base = baseUrl.replace(/\/+$/, '')
    return `${base}/v1beta/models`
  }

  /** 获取完整请求 URL（含 model 和 streaming 参数） */
  getFullEndpointUrl (baseUrl: string, model: string, stream: boolean, apiKey: string): string {
    const base = baseUrl.replace(/\/+$/, '')
    const method = stream ? 'streamGenerateContent' : 'generateContent'
    const alt = stream ? '&alt=sse' : ''
    return `${base}/v1beta/models/${model}:${method}?key=${apiKey}${alt}`
  }

  /** Gemini 响应 → Anthropic 响应 */
  translateResponse (res: unknown): AnthropicResponse {
    const geminiRes = res as GeminiResponse
    const candidate = geminiRes.candidates?.[0]

    const content: AnthropicContentBlock[] = []
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          content.push({ type: 'text', text: part.text })
        }
      }
    }

    return {
      id: `msg_${Date.now().toString(36)}`,
      type: 'message',
      role: 'assistant',
      content,
      model: '',
      stop_reason: this.mapFinishReason(candidate?.finishReason),
      usage: {
        input_tokens: geminiRes.usageMetadata?.promptTokenCount || 0,
        output_tokens: geminiRes.usageMetadata?.candidatesTokenCount || 0,
      },
    }
  }

  /** Gemini SSE chunk → Anthropic SSE 事件列表 */
  translateStreamChunk (data: string, ctx: StreamContext): AnthropicStreamEvent[] {
    let chunk: GeminiStreamChunk
    try {
      chunk = JSON.parse(data)
    } catch {
      return []
    }

    const events: AnthropicStreamEvent[] = []
    const candidate = chunk.candidates?.[0]

    // 首个 chunk：发送 message_start
    if (!ctx.started) {
      ctx.started = true
      events.push({
        type: 'message_start',
        message: {
          id: ctx.messageId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: ctx.model,
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      })
      events.push({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      })
    }

    // 文本增量
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          ctx.outputTokens += Math.ceil(part.text.length / 4)
          events.push({
            type: 'content_block_delta',
            index: ctx.blockIndex,
            delta: { type: 'text_delta', text: part.text },
          })
        }
      }
    }

    // 完成信号
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      // 非终止原因的特殊处理
    }
    if (candidate?.finishReason) {
      events.push({ type: 'content_block_stop', index: ctx.blockIndex })
      const outputTokens = chunk.usageMetadata?.candidatesTokenCount || ctx.outputTokens
      events.push({
        type: 'message_delta',
        delta: { stop_reason: this.mapFinishReason(candidate.finishReason) || 'end_turn' },
        usage: { output_tokens: outputTokens },
      })
      events.push({ type: 'message_stop' })
    }

    return events
  }

  /** 映射 Gemini finishReason → Anthropic stop_reason */
  private mapFinishReason (reason: string | undefined): 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null {
    if (!reason) return null
    switch (reason) {
      case 'STOP': return 'end_turn'
      case 'MAX_TOKENS': return 'max_tokens'
      case 'SAFETY': return 'end_turn'
      case 'RECITATION': return 'end_turn'
      default: return 'end_turn'
    }
  }
}
