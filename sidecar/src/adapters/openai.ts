/**
 * OpenAI 协议适配器
 *
 * 将 Anthropic Messages API 格式转换为 OpenAI Chat Completions API 格式。
 * 覆盖所有 OpenAI 兼容端点：DeepSeek、Groq、Together、Moonshot、
 * OpenRouter、vLLM、Ollama 等。
 */

import type {
  ProviderAdapter,
  AnthropicRequest,
  AnthropicResponse,
  AnthropicStreamEvent,
  AnthropicContentBlock,
  StreamContext,
} from './types'

// ==================== OpenAI 格式定义 ====================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | OpenAIContentPart[]
}

interface OpenAIContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

interface OpenAIRequest {
  model: string
  messages: OpenAIMessage[]
  max_tokens?: number
  temperature?: number
  top_p?: number
  stop?: string[]
  stream?: boolean
  stream_options?: { include_usage: boolean }
}

interface OpenAIResponse {
  id: string
  object: string
  model: string
  choices: {
    index: number
    message: { role: string; content: string | null }
    finish_reason: string | null
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface OpenAIStreamChunk {
  id: string
  object: string
  model: string
  choices: {
    index: number
    delta: { role?: string; content?: string | null }
    finish_reason: string | null
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ==================== 适配器实现 ====================

export class OpenAIAdapter implements ProviderAdapter {
  readonly name = 'openai'

  /** Anthropic 请求 → OpenAI 请求 */
  translateRequest (req: AnthropicRequest): OpenAIRequest {
    const messages: OpenAIMessage[] = []

    // 系统提示词 → system message
    if (req.system) {
      messages.push({ role: 'system', content: req.system })
    }

    // 转换消息列表
    for (const msg of req.messages) {
      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role, content: msg.content })
      } else {
        // 转换 content blocks
        const parts: OpenAIContentPart[] = []
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            parts.push({ type: 'text', text: block.text })
          } else if (block.type === 'image' && block.source) {
            parts.push({
              type: 'image_url',
              image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
            })
          }
          // tool_use / tool_result 暂简化为文本
          else if (block.type === 'tool_use') {
            parts.push({ type: 'text', text: `[Tool Call: ${block.name}(${JSON.stringify(block.input)})]` })
          } else if (block.type === 'tool_result') {
            parts.push({ type: 'text', text: block.content || '' })
          }
        }
        messages.push({
          role: msg.role,
          content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text! : parts,
        })
      }
    }

    return {
      model: req.model,
      messages,
      max_tokens: req.max_tokens,
      temperature: req.temperature,
      top_p: req.top_p,
      stop: req.stop_sequences,
      stream: req.stream,
      ...(req.stream ? { stream_options: { include_usage: true } } : {}),
    }
  }

  /** 构建请求头 */
  buildHeaders (apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }
  }

  /** 获取目标端点 URL */
  getEndpointUrl (baseUrl: string): string {
    // 确保 baseUrl 不以 / 结尾
    const base = baseUrl.replace(/\/+$/, '')
    return `${base}/chat/completions`
  }

  /** OpenAI 响应 → Anthropic 响应 */
  translateResponse (res: unknown): AnthropicResponse {
    const openaiRes = res as OpenAIResponse
    const choice = openaiRes.choices?.[0]

    const content: AnthropicContentBlock[] = []
    if (choice?.message?.content) {
      content.push({ type: 'text', text: choice.message.content })
    }

    return {
      id: openaiRes.id || `msg_${Date.now().toString(36)}`,
      type: 'message',
      role: 'assistant',
      content,
      model: openaiRes.model,
      stop_reason: this.mapFinishReason(choice?.finish_reason),
      usage: {
        input_tokens: openaiRes.usage?.prompt_tokens || 0,
        output_tokens: openaiRes.usage?.completion_tokens || 0,
      },
    }
  }

  /** OpenAI SSE chunk → Anthropic SSE 事件列表 */
  translateStreamChunk (data: string, ctx: StreamContext): AnthropicStreamEvent[] {
    // 处理 [DONE] 信号
    if (data === '[DONE]') {
      return [
        { type: 'content_block_stop', index: ctx.blockIndex },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: ctx.outputTokens },
        },
        { type: 'message_stop' },
      ]
    }

    let chunk: OpenAIStreamChunk
    try {
      chunk = JSON.parse(data)
    } catch {
      return []
    }

    const events: AnthropicStreamEvent[] = []
    const choice = chunk.choices?.[0]

    // 首个 chunk：发送 message_start 和 content_block_start
    if (!ctx.started) {
      ctx.started = true
      events.push({
        type: 'message_start',
        message: {
          id: chunk.id || ctx.messageId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: chunk.model || ctx.model,
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
    const text = choice?.delta?.content
    if (text) {
      ctx.outputTokens += Math.ceil(text.length / 4) // 粗略 token 估计
      events.push({
        type: 'content_block_delta',
        index: ctx.blockIndex,
        delta: { type: 'text_delta', text },
      })
    }

    // 完成信号
    if (choice?.finish_reason) {
      events.push({ type: 'content_block_stop', index: ctx.blockIndex })

      // 从 usage 获取精确 token 计数
      const outputTokens = chunk.usage?.completion_tokens || ctx.outputTokens
      events.push({
        type: 'message_delta',
        delta: { stop_reason: this.mapFinishReason(choice.finish_reason) || 'end_turn' },
        usage: { output_tokens: outputTokens },
      })
      events.push({ type: 'message_stop' })
    }

    return events
  }

  /** 映射 finish_reason → stop_reason */
  private mapFinishReason (reason: string | null | undefined): 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null {
    if (!reason) return null
    switch (reason) {
      case 'stop': return 'end_turn'
      case 'length': return 'max_tokens'
      case 'content_filter': return 'end_turn'
      case 'tool_calls': return 'tool_use'
      default: return 'end_turn'
    }
  }
}
