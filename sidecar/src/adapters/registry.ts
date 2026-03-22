/**
 * 适配器注册表 + 本地代理服务器
 *
 * 提供以下能力：
 * 1. 根据 endpointType 获取对应的 ProviderAdapter
 * 2. 启动本地 HTTP 代理，暴露 Anthropic Messages API 格式
 * 3. 代理内部将请求转为目标格式 → 转发 → 转换响应返回
 *
 * Claude Agent SDK 只需将 baseURL 指向此代理即可使用任何厂商。
 */

import type {
  ProviderAdapter,
  AnthropicRequest,
  StreamContext,
} from './types'
import { createStreamContext } from './types'
import { OpenAIAdapter } from './openai'
import { GeminiAdapter } from './gemini'

// ==================== 适配器注册表 ====================

const adapters = new Map<string, ProviderAdapter>()

// 注册内置适配器
adapters.set('openai', new OpenAIAdapter())
adapters.set('openai-compatible', new OpenAIAdapter())
adapters.set('gemini', new GeminiAdapter())

/** 获取适配器（返回 null 表示原生 Anthropic，无需转换） */
export function getAdapter (endpointType: string): ProviderAdapter | null {
  if (endpointType === 'anthropic') return null // 原生，无需转换
  return adapters.get(endpointType) || null
}

/** 注册自定义适配器 */
export function registerAdapter (type: string, adapter: ProviderAdapter): void {
  adapters.set(type, adapter)
}

// ==================== 代理核心逻辑 ====================

/**
 * 代理请求处理 — 非流式
 *
 * 将 Anthropic 格式请求转为目标格式，发送到目标 API，再将响应转回。
 */
export async function proxyRequest (
  adapter: ProviderAdapter,
  anthropicReq: AnthropicRequest,
  targetBaseUrl: string,
  apiKey: string,
): Promise<Response> {
  // 1. 转换请求
  const targetBody = adapter.translateRequest({ ...anthropicReq, stream: false })
  const headers = adapter.buildHeaders(apiKey)

  // 构建目标 URL
  let url: string
  if (adapter.getFullEndpointUrl) {
    url = adapter.getFullEndpointUrl(targetBaseUrl, anthropicReq.model, false, apiKey)
  } else {
    url = adapter.getEndpointUrl(targetBaseUrl)
  }

  console.log(`[Proxy] 非流式请求 → ${adapter.name}: ${url}`)

  // 2. 发送到目标 API
  const targetRes = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(targetBody),
  })

  if (!targetRes.ok) {
    const errText = await targetRes.text()
    console.error(`[Proxy] 目标 API 返回错误 ${targetRes.status}: ${errText}`)
    return new Response(JSON.stringify({
      type: 'error',
      error: {
        type: 'api_error',
        message: `目标 API (${adapter.name}) 返回错误: ${targetRes.status} - ${errText}`,
      },
    }), {
      status: targetRes.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 3. 转换响应
  const targetData = await targetRes.json()
  const anthropicRes = adapter.translateResponse(targetData)
  anthropicRes.model = anthropicReq.model // 保持请求中的 model 名

  return new Response(JSON.stringify(anthropicRes), {
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * 代理请求处理 — 流式 SSE
 *
 * 将 Anthropic 格式请求以流式方式代理，实时转换 SSE 事件。
 */
export function proxyStreamRequest (
  adapter: ProviderAdapter,
  anthropicReq: AnthropicRequest,
  targetBaseUrl: string,
  apiKey: string,
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start (controller) {
      try {
        // 1. 转换请求（流式）
        const targetBody = adapter.translateRequest({ ...anthropicReq, stream: true })
        const headers = adapter.buildHeaders(apiKey)

        let url: string
        if (adapter.getFullEndpointUrl) {
          url = adapter.getFullEndpointUrl(targetBaseUrl, anthropicReq.model, true, apiKey)
        } else {
          url = adapter.getEndpointUrl(targetBaseUrl)
        }

        console.log(`[Proxy] 流式请求 → ${adapter.name}: ${url}`)

        // 2. 发送到目标 API
        const targetRes = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(targetBody),
        })

        if (!targetRes.ok) {
          const errText = await targetRes.text()
          const errEvent = `event: error\ndata: ${JSON.stringify({
            type: 'error',
            error: { type: 'api_error', message: `${adapter.name} API 错误: ${targetRes.status} - ${errText}` },
          })}\n\n`
          controller.enqueue(encoder.encode(errEvent))
          controller.close()
          return
        }

        // 3. 创建流式转换上下文
        const ctx: StreamContext = createStreamContext(anthropicReq.model)

        // 4. 逐行读取 SSE 并转换
        const reader = targetRes.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // 按行分割 SSE 数据
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // 最后一行可能不完整，保留

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith(':')) continue // 注释或空行

            // 提取 data: 后的内容
            let data = ''
            if (trimmed.startsWith('data: ')) {
              data = trimmed.slice(6)
            } else if (trimmed.startsWith('data:')) {
              data = trimmed.slice(5)
            } else {
              continue
            }

            if (!data) continue

            // 转换为 Anthropic SSE 事件
            const events = adapter.translateStreamChunk(data, ctx)
            for (const event of events) {
              const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
              controller.enqueue(encoder.encode(sseData))
            }
          }
        }

        // 处理缓冲区剩余数据
        if (buffer.trim()) {
          const data = buffer.trim().startsWith('data: ')
            ? buffer.trim().slice(6)
            : buffer.trim().startsWith('data:')
              ? buffer.trim().slice(5)
              : ''
          if (data) {
            const events = adapter.translateStreamChunk(data, ctx)
            for (const event of events) {
              const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
              controller.enqueue(encoder.encode(sseData))
            }
          }
        }

        // 如果目标 API 没有发送明确结束信号，手动结束
        if (ctx.started && !buffer.includes('[DONE]')) {
          // 确保发送 message_stop（某些厂商可能不发 [DONE]）
          const finalEvents = adapter.translateStreamChunk('[DONE]', ctx)
          for (const event of finalEvents) {
            if (event.type === 'message_stop') {
              const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
              controller.enqueue(encoder.encode(sseData))
            }
          }
        }

        controller.close()
      } catch (error) {
        console.error('[Proxy] 流式代理异常:', error)
        const errEvent = `event: error\ndata: ${JSON.stringify({
          type: 'error',
          error: { type: 'api_error', message: (error as Error).message },
        })}\n\n`
        controller.enqueue(encoder.encode(errEvent))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

/**
 * 处理代理路由
 *
 * 在 Sidecar 的主 HTTP 服务器中增加代理路由：
 * POST /proxy/v1/messages     → 非流式代理
 * POST /proxy/v1/messages (stream=true) → 流式代理
 *
 * 请求头中必须携带：
 * - X-Target-Provider: 目标适配器类型（openai / gemini）
 * - X-Target-BaseUrl: 目标 API 的 Base URL
 * - X-Api-Key 或 Authorization: API Key
 */
export async function handleProxyRoute (req: Request): Promise<Response | null> {
  const url = new URL(req.url)

  // 只处理 /proxy/v1/messages 路由
  if (!url.pathname.startsWith('/proxy/v1/messages')) return null
  if (req.method !== 'POST') return null

  // 提取代理参数
  const endpointType = req.headers.get('x-target-provider') || ''
  const targetBaseUrl = req.headers.get('x-target-baseurl') || ''
  const apiKey = req.headers.get('x-api-key')
    || req.headers.get('authorization')?.replace('Bearer ', '')
    || ''

  if (!endpointType || !targetBaseUrl || !apiKey) {
    return new Response(JSON.stringify({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: '缺少必要的代理头: X-Target-Provider, X-Target-BaseUrl, X-Api-Key',
      },
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const adapter = getAdapter(endpointType)
  if (!adapter) {
    return new Response(JSON.stringify({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: `不支持的端点类型: ${endpointType}`,
      },
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  // 解析 Anthropic 格式的请求体
  const body = await req.json() as AnthropicRequest

  // 根据是否流式选择处理方式
  if (body.stream) {
    return proxyStreamRequest(adapter, body, targetBaseUrl, apiKey)
  } else {
    return await proxyRequest(adapter, body, targetBaseUrl, apiKey)
  }
}
