/**
 * Claude Agent SDK 封装 — 多轮会话客户端
 *
 * 基于 @anthropic-ai/sdk 创建带上下文的多轮对话管理，
 * 支持流式输出、工具调用、断点续传。
 *
 * 当使用非 Anthropic 端点时，自动将 baseURL 路由到本地代理，
 * 代理层负责协议转换（OpenAI/Gemini → Anthropic 格式）。
 */

import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, ContentBlock } from '@anthropic-ai/sdk/resources/messages'

type AgentInputContent = MessageParam['content']

/** 会话配置 */
export interface AgentSessionConfig {
  /** API Key */
  apiKey: string
  /** API Base URL */
  baseUrl?: string
  /** 模型名称 */
  model: string
  /** 系统提示词 */
  systemPrompt?: string
  /** 最大 Token */
  maxTokens?: number
  /**
   * 端点类型：
   * - 'anthropic' → 直连（默认）
   * - 'openai' / 'openai-compatible' → 通过本地代理转换
   * - 'gemini' → 通过本地代理转换
   */
  endpointType?: string
  /** 本地 Sidecar 端口（用于代理路由） */
  sidecarPort?: number
}

/** 流式输出回调 */
export interface StreamCallbacks {
  onText?: (text: string) => void
  onThinking?: (text: string) => void
  onToolUse?: (tool: { id: string; name: string; input: unknown }) => void
  onToolResult?: (result: { toolUseId: string; content: string; isError: boolean }) => void
  onComplete?: (message: Anthropic.Message) => void
  onError?: (error: Error) => void
}

/** Agent 会话管理器 */
export class AgentSession {
  private client: Anthropic
  private model: string
  private systemPrompt: string
  private maxTokens: number
  private messages: MessageParam[] = []
  private abortController: AbortController | null = null

  /** 非 Anthropic 端点的代理参数 */
  private isProxied: boolean = false
  private targetBaseUrl: string = ''
  private endpointType: string = 'anthropic'
  private realApiKey: string = ''

  constructor (config: AgentSessionConfig) {
    const endpointType = config.endpointType || 'anthropic'
    const isNativeAnthropic = endpointType === 'anthropic'

    if (isNativeAnthropic) {
      // 直连 Anthropic API
      this.client = new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      })
      this.isProxied = false
    } else {
      // 非 Anthropic 端点 → 路由到本地代理
      const proxyPort = config.sidecarPort || 31415
      const proxyBaseUrl = `http://localhost:${proxyPort}/proxy`

      this.client = new Anthropic({
        apiKey: config.apiKey, // SDK 内部会带上这个 key
        baseURL: proxyBaseUrl,
      })

      // 保存代理参数，在请求时通过自定义 header 传递
      this.isProxied = true
      this.targetBaseUrl = config.baseUrl || ''
      this.endpointType = endpointType
      this.realApiKey = config.apiKey
    }

    this.model = config.model
    this.systemPrompt = config.systemPrompt || ''
    this.maxTokens = config.maxTokens || 8192
  }

  /** 历史消息上限（超出后截断最早的消息） */
  private static readonly MAX_HISTORY_MESSAGES = 50

  /** 发送消息并获取流式响应 */
  async sendMessage (
    userMessage: AgentInputContent,
    callbacks: StreamCallbacks
  ): Promise<void> {
    // 添加用户消息到历史
    this.messages.push({
      role: 'user',
      content: userMessage,
    })

    // 滑动窗口：保留最近 N 条消息
    this.trimHistory()

    this.abortController = new AbortController()

    try {
      // 构建额外请求头（代理模式需要）
      const extraHeaders: Record<string, string> = {}
      if (this.isProxied) {
        extraHeaders['x-target-provider'] = this.endpointType
        extraHeaders['x-target-baseurl'] = this.targetBaseUrl
        extraHeaders['x-api-key'] = this.realApiKey
      }

      // 创建流式请求
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: this.systemPrompt || undefined,
        messages: this.messages,
      }, {
        signal: this.abortController.signal,
        headers: extraHeaders,
      })

      let fullText = ''
      const contentBlocks: ContentBlock[] = []

      // 监听流式事件
      stream.on('text', (text: string) => {
        fullText += text
        callbacks.onText?.(text)
      })

      stream.on('contentBlock', (block: ContentBlock) => {
        contentBlocks.push(block)
        if (block.type === 'tool_use') {
          callbacks.onToolUse?.({
            id: block.id,
            name: block.name,
            input: block.input,
          })
        }
      })

      // 等待完成
      const finalMessage = await stream.finalMessage()

      // 将 assistant 回复加入历史
      this.messages.push({
        role: 'assistant',
        content: finalMessage.content,
      })

      callbacks.onComplete?.(finalMessage)
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // 用户主动停止，不作为错误处理
        return
      }
      callbacks.onError?.(error as Error)
    } finally {
      this.abortController = null
    }
  }

  /** 停止当前响应 */
  stop (): void {
    this.abortController?.abort()
    this.abortController = null
  }

  /** 获取当前消息历史 */
  getMessages (): MessageParam[] {
    return [...this.messages]
  }

  /** 用外部历史覆盖当前消息历史 */
  setMessages (messages: MessageParam[]): void {
    this.messages = [...messages]
    this.trimHistory()
  }

  /** 截断历史消息，保留最近 N 条（滑动窗口） */
  private trimHistory (): void {
    const max = AgentSession.MAX_HISTORY_MESSAGES
    if (this.messages.length > max) {
      // 截断最早的消息，但确保首条是 user 消息（不留孤立 assistant）
      this.messages = this.messages.slice(-max)
      if (this.messages.length > 0 && this.messages[0].role === 'assistant') {
        this.messages.shift()
      }
    }
  }

  /** 清空消息历史 */
  clearMessages (): void {
    this.messages = []
  }

  /** 更新系统提示词 */
  setSystemPrompt (prompt: string): void {
    this.systemPrompt = prompt
  }

  /** 更新模型 */
  setModel (model: string): void {
    this.model = model
  }
}
