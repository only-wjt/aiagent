/**
 * 协议适配器 — 自动化测试
 *
 * 覆盖范围：
 * 1. OpenAI 适配器：请求转换、响应转换、SSE 流式转换
 * 2. Gemini 适配器：请求转换、响应转换、SSE 流式转换
 * 3. 适配器注册表：获取/注册适配器
 * 4. client.ts: 消息历史滑动窗口
 */

import { describe, test, expect } from 'bun:test'
import { OpenAIAdapter } from '../src/adapters/openai'
import { GeminiAdapter } from '../src/adapters/gemini'
import { getAdapter, registerAdapter } from '../src/adapters/registry'
import { createStreamContext, type AnthropicRequest } from '../src/adapters/types'
import { AgentSession } from '../src/agent/client'

// ==================== 测试数据 ====================

const sampleAnthropicRequest: AnthropicRequest = {
  model: 'gpt-4o',
  max_tokens: 1024,
  system: '你是一个有用的助手。',
  messages: [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好！有什么可以帮你的吗？' },
    { role: 'user', content: '写一首诗' },
  ],
  stream: false,
  temperature: 0.7,
}

// ==================== OpenAI 适配器测试 ====================

describe('OpenAI 适配器', () => {
  const adapter = new OpenAIAdapter()

  test('适配器基本属性', () => {
    expect(adapter.name).toBe('openai')
  })

  describe('请求转换 (translateRequest)', () => {
    test('系统提示词转为 system message', () => {
      const result = adapter.translateRequest(sampleAnthropicRequest) as any
      expect(result.messages[0]).toEqual({
        role: 'system',
        content: '你是一个有用的助手。',
      })
    })

    test('消息角色映射正确', () => {
      const result = adapter.translateRequest(sampleAnthropicRequest) as any
      // system + 3 条消息 = 4
      expect(result.messages.length).toBe(4)
      expect(result.messages[1].role).toBe('user')
      expect(result.messages[2].role).toBe('assistant')
      expect(result.messages[3].role).toBe('user')
    })

    test('字符串 content 直接传递', () => {
      const result = adapter.translateRequest(sampleAnthropicRequest) as any
      expect(result.messages[1].content).toBe('你好')
    })

    test('content blocks 转换为 parts', () => {
      const req: AnthropicRequest = {
        model: 'gpt-4o',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'hello' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
          ],
        }],
      }
      const result = adapter.translateRequest(req) as any
      expect(result.messages[0].content).toEqual([
        { type: 'text', text: 'hello' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
      ])
    })

    test('模型名称传递', () => {
      const result = adapter.translateRequest(sampleAnthropicRequest) as any
      expect(result.model).toBe('gpt-4o')
    })

    test('参数传递 (max_tokens, temperature)', () => {
      const result = adapter.translateRequest(sampleAnthropicRequest) as any
      expect(result.max_tokens).toBe(1024)
      expect(result.temperature).toBe(0.7)
    })

    test('流式请求添加 stream_options', () => {
      const streamReq = { ...sampleAnthropicRequest, stream: true }
      const result = adapter.translateRequest(streamReq) as any
      expect(result.stream).toBe(true)
      expect(result.stream_options).toEqual({ include_usage: true })
    })

    test('非流式请求不含 stream_options', () => {
      const result = adapter.translateRequest(sampleAnthropicRequest) as any
      expect(result.stream_options).toBeUndefined()
    })
  })

  describe('请求头构建 (buildHeaders)', () => {
    test('Bearer Token 格式', () => {
      const headers = adapter.buildHeaders('sk-test-key')
      expect(headers['Authorization']).toBe('Bearer sk-test-key')
      expect(headers['Content-Type']).toBe('application/json')
    })
  })

  describe('端点 URL (getEndpointUrl)', () => {
    test('拼接 /chat/completions', () => {
      expect(adapter.getEndpointUrl('https://api.openai.com/v1')).toBe(
        'https://api.openai.com/v1/chat/completions'
      )
    })

    test('去除尾部斜杠', () => {
      expect(adapter.getEndpointUrl('https://api.deepseek.com/')).toBe(
        'https://api.deepseek.com/chat/completions'
      )
    })
  })

  describe('响应转换 (translateResponse)', () => {
    test('正常响应转为 Anthropic 格式', () => {
      const openaiRes = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        model: 'gpt-4o',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '这是一首诗。' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }

      const result = adapter.translateResponse(openaiRes)
      expect(result.type).toBe('message')
      expect(result.role).toBe('assistant')
      expect(result.content).toEqual([{ type: 'text', text: '这是一首诗。' }])
      expect(result.stop_reason).toBe('end_turn')
      expect(result.usage.input_tokens).toBe(10)
      expect(result.usage.output_tokens).toBe(20)
    })

    test('finish_reason 映射', () => {
      const makeRes = (reason: string) => ({
        id: 'x', object: '', model: '',
        choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: reason }],
      })

      expect(adapter.translateResponse(makeRes('stop')).stop_reason).toBe('end_turn')
      expect(adapter.translateResponse(makeRes('length')).stop_reason).toBe('max_tokens')
      expect(adapter.translateResponse(makeRes('tool_calls')).stop_reason).toBe('tool_use')
    })
  })

  describe('流式 SSE 转换 (translateStreamChunk)', () => {
    test('首个 chunk 发送 message_start + content_block_start', () => {
      const ctx = createStreamContext('gpt-4o')
      const events = adapter.translateStreamChunk(JSON.stringify({
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        model: 'gpt-4o',
        choices: [{ index: 0, delta: { role: 'assistant', content: '你' }, finish_reason: null }],
      }), ctx)

      expect(events.length).toBe(3) // message_start + content_block_start + delta
      expect(events[0].type).toBe('message_start')
      expect(events[1].type).toBe('content_block_start')
      expect(events[2].type).toBe('content_block_delta')
      expect(ctx.started).toBe(true)
    })

    test('后续 chunk 只发送 delta', () => {
      const ctx = createStreamContext('gpt-4o')
      ctx.started = true // 模拟已开始

      const events = adapter.translateStreamChunk(JSON.stringify({
        id: 'chatcmpl-1', object: '', model: '',
        choices: [{ index: 0, delta: { content: '好' }, finish_reason: null }],
      }), ctx)

      expect(events.length).toBe(1)
      expect(events[0].type).toBe('content_block_delta')
    })

    test('[DONE] 信号发送结束事件', () => {
      const ctx = createStreamContext('gpt-4o')
      ctx.started = true
      ctx.outputTokens = 42

      const events = adapter.translateStreamChunk('[DONE]', ctx)
      expect(events.length).toBe(3)
      expect(events[0].type).toBe('content_block_stop')
      expect(events[1].type).toBe('message_delta')
      expect(events[2].type).toBe('message_stop')
    })

    test('无效 JSON 返回空数组', () => {
      const ctx = createStreamContext('gpt-4o')
      const events = adapter.translateStreamChunk('not json', ctx)
      expect(events).toEqual([])
    })

    test('finish_reason 触发完成事件', () => {
      const ctx = createStreamContext('gpt-4o')
      ctx.started = true

      const events = adapter.translateStreamChunk(JSON.stringify({
        id: 'x', object: '', model: '',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 25, total_tokens: 35 },
      }), ctx)

      const msgDelta = events.find(e => e.type === 'message_delta') as any
      expect(msgDelta).toBeDefined()
      expect(msgDelta.delta.stop_reason).toBe('end_turn')
      expect(msgDelta.usage.output_tokens).toBe(25)
    })
  })
})

// ==================== Gemini 适配器测试 ====================

describe('Gemini 适配器', () => {
  const adapter = new GeminiAdapter()

  test('适配器基本属性', () => {
    expect(adapter.name).toBe('gemini')
  })

  describe('请求转换 (translateRequest)', () => {
    test('角色映射: assistant → model', () => {
      const result = adapter.translateRequest(sampleAnthropicRequest) as any
      expect(result.contents[1].role).toBe('model')
    })

    test('角色映射: user → user', () => {
      const result = adapter.translateRequest(sampleAnthropicRequest) as any
      expect(result.contents[0].role).toBe('user')
    })

    test('系统提示词转为 systemInstruction', () => {
      const result = adapter.translateRequest(sampleAnthropicRequest) as any
      expect(result.systemInstruction).toEqual({
        parts: [{ text: '你是一个有用的助手。' }],
      })
    })

    test('无系统提示词时不含 systemInstruction', () => {
      const noSystem = { ...sampleAnthropicRequest, system: undefined }
      const result = adapter.translateRequest(noSystem) as any
      expect(result.systemInstruction).toBeUndefined()
    })

    test('generationConfig 映射', () => {
      const result = adapter.translateRequest(sampleAnthropicRequest) as any
      expect(result.generationConfig.maxOutputTokens).toBe(1024)
      expect(result.generationConfig.temperature).toBe(0.7)
    })

    test('文本内容转为 parts', () => {
      const result = adapter.translateRequest(sampleAnthropicRequest) as any
      expect(result.contents[0].parts[0].text).toBe('你好')
    })

    test('图片 content block 转为 inlineData', () => {
      const req: AnthropicRequest = {
        model: 'gemini-pro',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'xyz' } },
          ],
        }],
      }
      const result = adapter.translateRequest(req) as any
      expect(result.contents[0].parts[0].inlineData).toEqual({
        mimeType: 'image/jpeg',
        data: 'xyz',
      })
    })
  })

  describe('请求头构建 (buildHeaders)', () => {
    test('Gemini 只需 Content-Type (key 在 URL 中)', () => {
      const headers = adapter.buildHeaders('AIza-test')
      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['Authorization']).toBeUndefined()
    })
  })

  describe('完整 URL (getFullEndpointUrl)', () => {
    test('非流式 URL', () => {
      const url = adapter.getFullEndpointUrl!(
        'https://generativelanguage.googleapis.com',
        'gemini-1.5-pro',
        false,
        'AIza-key'
      )
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=AIza-key'
      )
    })

    test('流式 URL', () => {
      const url = adapter.getFullEndpointUrl!(
        'https://generativelanguage.googleapis.com',
        'gemini-1.5-flash',
        true,
        'AIza-key'
      )
      expect(url).toContain('streamGenerateContent')
      expect(url).toContain('alt=sse')
      expect(url).toContain('key=AIza-key')
    })
  })

  describe('响应转换 (translateResponse)', () => {
    test('标准响应转换', () => {
      const geminiRes = {
        candidates: [{
          content: { role: 'model', parts: [{ text: '诗歌内容。' }] },
          finishReason: 'STOP',
        }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 15, totalTokenCount: 20 },
      }

      const result = adapter.translateResponse(geminiRes)
      expect(result.type).toBe('message')
      expect(result.content).toEqual([{ type: 'text', text: '诗歌内容。' }])
      expect(result.stop_reason).toBe('end_turn')
      expect(result.usage.input_tokens).toBe(5)
      expect(result.usage.output_tokens).toBe(15)
    })
  })

  describe('流式 SSE 转换 (translateStreamChunk)', () => {
    test('首个 chunk 发送 message_start', () => {
      const ctx = createStreamContext('gemini-pro')

      const events = adapter.translateStreamChunk(JSON.stringify({
        candidates: [{
          content: { role: 'model', parts: [{ text: '你' }] },
        }],
      }), ctx)

      expect(events.length).toBe(3) // message_start + content_block_start + delta
      expect(events[0].type).toBe('message_start')
      expect(ctx.started).toBe(true)
    })

    test('finishReason 触发完成', () => {
      const ctx = createStreamContext('gemini-pro')
      ctx.started = true

      const events = adapter.translateStreamChunk(JSON.stringify({
        candidates: [{
          content: { role: 'model', parts: [{ text: '。' }] },
          finishReason: 'STOP',
        }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 30, totalTokenCount: 40 },
      }), ctx)

      const stop = events.find(e => e.type === 'content_block_stop')
      const msgDelta = events.find(e => e.type === 'message_delta') as any
      expect(stop).toBeDefined()
      expect(msgDelta.delta.stop_reason).toBe('end_turn')
      expect(msgDelta.usage.output_tokens).toBe(30)
    })
  })
})

// ==================== 注册表测试 ====================

describe('适配器注册表', () => {
  test('获取 OpenAI 适配器', () => {
    const adapter = getAdapter('openai')
    expect(adapter).not.toBeNull()
    expect(adapter!.name).toBe('openai')
  })

  test('获取 openai-compatible 适配器', () => {
    const adapter = getAdapter('openai-compatible')
    expect(adapter).not.toBeNull()
    expect(adapter!.name).toBe('openai')
  })

  test('获取 Gemini 适配器', () => {
    const adapter = getAdapter('gemini')
    expect(adapter).not.toBeNull()
    expect(adapter!.name).toBe('gemini')
  })

  test('Anthropic 返回 null（直连，无需适配器）', () => {
    expect(getAdapter('anthropic')).toBeNull()
  })

  test('未知类型返回 null', () => {
    expect(getAdapter('unknown-provider')).toBeNull()
  })

  test('注册自定义适配器', () => {
    const mockAdapter = {
      name: 'custom',
      translateRequest: () => ({}),
      buildHeaders: () => ({}),
      getEndpointUrl: () => '',
      translateResponse: () => ({
        id: '', type: 'message' as const, role: 'assistant' as const,
        content: [], model: '', stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 },
      }),
      translateStreamChunk: () => [],
    }
    registerAdapter('custom-llm', mockAdapter)
    expect(getAdapter('custom-llm')).toBe(mockAdapter)
  })
})

// ==================== StreamContext 测试 ====================

describe('StreamContext', () => {
  test('createStreamContext 初始值正确', () => {
    const ctx = createStreamContext('test-model')
    expect(ctx.started).toBe(false)
    expect(ctx.blockIndex).toBe(0)
    expect(ctx.outputTokens).toBe(0)
    expect(ctx.model).toBe('test-model')
    expect(ctx.messageId).toMatch(/^msg_/)
  })
})

describe('AgentSession history', () => {
  test('setMessages 会覆盖旧历史并保留滑动窗口', () => {
    const session = new AgentSession({
      apiKey: 'sk-test-key',
      model: 'claude-sonnet-4-20250514',
    })

    const history = Array.from({ length: 52 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message-${index}`,
    }))

    session.setMessages(history)

    const messages = session.getMessages()
    expect(messages.length).toBe(50)
    expect(messages[0]).toEqual({ role: 'user', content: 'message-2' })
    expect(messages.at(-1)).toEqual({ role: 'assistant', content: 'message-51' })
  })

  test('setMessages 传入空数组时会清空旧缓存', () => {
    const session = new AgentSession({
      apiKey: 'sk-test-key',
      model: 'claude-sonnet-4-20250514',
    })

    session.setMessages([{ role: 'user', content: 'hello' }])
    expect(session.getMessages()).toHaveLength(1)

    session.setMessages([])
    expect(session.getMessages()).toEqual([])
  })
})

// ==================== 端到端转换测试 ====================

describe('端到端转换', () => {
  test('OpenAI: Anthropic 请求 → OpenAI 请求 → 模拟 OpenAI 响应 → Anthropic 响应', () => {
    const adapter = new OpenAIAdapter()

    // 1. 转换请求
    const openaiReq = adapter.translateRequest(sampleAnthropicRequest) as any
    expect(openaiReq.model).toBe('gpt-4o')
    expect(openaiReq.messages.length).toBe(4) // system + 3

    // 2. 模拟 OpenAI 响应
    const openaiRes = {
      id: 'chatcmpl-abc',
      object: 'chat.completion',
      model: 'gpt-4o',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: '春风送暖入屠苏。' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 50, completion_tokens: 12, total_tokens: 62 },
    }

    // 3. 转换响应
    const anthropicRes = adapter.translateResponse(openaiRes)
    expect(anthropicRes.type).toBe('message')
    expect(anthropicRes.role).toBe('assistant')
    expect(anthropicRes.content[0].text).toBe('春风送暖入屠苏。')
    expect(anthropicRes.stop_reason).toBe('end_turn')
  })

  test('OpenAI: 完整 SSE 流式转换流程', () => {
    const adapter = new OpenAIAdapter()
    const ctx = createStreamContext('gpt-4o')

    // 模拟 3 个 SSE chunk + [DONE]
    const chunks = [
      '{"id":"x","object":"","model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"春"},"finish_reason":null}]}',
      '{"id":"x","object":"","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"风"},"finish_reason":null}]}',
      '{"id":"x","object":"","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"来"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":3,"total_tokens":13}}',
    ]

    const allEvents = chunks.flatMap(c => adapter.translateStreamChunk(c, ctx))
    const doneEvents = adapter.translateStreamChunk('[DONE]', ctx)

    // 验证事件序列
    expect(allEvents[0].type).toBe('message_start')
    expect(allEvents[1].type).toBe('content_block_start')

    // 有 3 个 text_delta 事件
    const deltas = allEvents.filter(e => e.type === 'content_block_delta')
    expect(deltas.length).toBe(3)

    // 最后一个 chunk 带 finish_reason，产生结束事件
    const stops = allEvents.filter(e => e.type === 'message_stop')
    expect(stops.length).toBe(1)
  })

  test('Gemini: Anthropic 请求 → Gemini 请求 → 模拟 Gemini 响应 → Anthropic 响应', () => {
    const adapter = new GeminiAdapter()

    // 1. 转换请求
    const geminiReq = adapter.translateRequest({
      ...sampleAnthropicRequest,
      model: 'gemini-1.5-pro',
    }) as any
    expect(geminiReq.contents.length).toBe(3)
    expect(geminiReq.systemInstruction.parts[0].text).toBe('你是一个有用的助手。')

    // 2. 模拟 Gemini 响应
    const geminiRes = {
      candidates: [{
        content: { role: 'model', parts: [{ text: '明月几时有。' }] },
        finishReason: 'STOP',
      }],
      usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 8, totalTokenCount: 38 },
    }

    // 3. 转换响应
    const anthropicRes = adapter.translateResponse(geminiRes)
    expect(anthropicRes.content[0].text).toBe('明月几时有。')
    expect(anthropicRes.stop_reason).toBe('end_turn')
    expect(anthropicRes.usage.input_tokens).toBe(30)
  })
})
