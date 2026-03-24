/**
 * AI Agent Sidecar — HTTP 服务入口
 *
 * 每个 Session 会话对应一个独立的 Sidecar 进程，
 * 由 Rust 层的 SidecarManager 管理生命周期。
 *
 * 通过 Anthropic SDK 直接调用 Claude API，
 * 支持流式输出、多轮对话、工具调用。
 */

import { AgentSession, type AgentSessionConfig, type StreamCallbacks } from './agent/client'
import { SessionManager } from './agent/session'
import { buildSystemPrompt } from './agent/prompt'
import { handleProxyRoute } from './adapters/registry'
import { executeIPCCommand, type IPCCommand } from './ipc/handler'
import * as path from 'path'
import * as fs from 'fs'

// ==================== 启动参数 ====================

const PORT = parseInt(process.argv[2] || '31415', 10)
const WORKSPACE = process.argv[3] || process.cwd()
const DATA_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.aiagent'
)

console.log(`[Sidecar] 启动中... port=${PORT} workspace=${WORKSPACE}`)

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// 初始化会话管理器
const sessionManager = new SessionManager(DATA_DIR)

// 活跃的 Agent 会话缓存（sessionId → AgentSession）
const activeSessions = new Map<string, AgentSession>()

// 当前启用的技能 prompt（从前端传入，注入到 system prompt）
let currentSkillPrompt = ''

// ==================== 路由处理 ====================

async function handleRequest (req: Request): Promise<Response> {
  const url = new URL(req.url)
  const routePath = url.pathname

  // CORS 头
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Target-Provider, X-Target-BaseUrl, X-Api-Key, Authorization',
  }

  // 预检请求
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 健康检查
    if (routePath === '/health') {
      return Response.json({ status: 'ok', port: PORT, workspace: WORKSPACE }, { headers: corsHeaders })
    }

    // ==================== 对话 API ====================

    if (routePath === '/api/chat/send' && req.method === 'POST') {
      return await handleChatSend(req, corsHeaders)
    }

    // 流式聊天改为 POST（避免 apiKey 暴露在 URL 中）
    if (routePath === '/api/chat/stream' && req.method === 'POST') {
      return await handleChatStream(req, corsHeaders)
    }

    if (routePath === '/api/chat/stop' && req.method === 'POST') {
      return handleChatStop(req, corsHeaders)
    }

    // ==================== 会话 API ====================

    if (routePath === '/api/session/list' && req.method === 'GET') {
      return Response.json({ sessions: sessionManager.listSessions() }, { headers: corsHeaders })
    }

    if (routePath === '/api/session/create' && req.method === 'POST') {
      return await handleSessionCreate(req, corsHeaders)
    }

    // ==================== 工具/配置 API ====================

    if (routePath === '/api/tools/list' && req.method === 'GET') {
      return Response.json({ tools: [] }, { headers: corsHeaders })
    }

    if (routePath === '/api/config' && req.method === 'GET') {
      return Response.json({ port: PORT, workspace: WORKSPACE }, { headers: corsHeaders })
    }

    // ==================== IPC 命令执行 ====================

    if (routePath === '/api/ipc/execute' && req.method === 'POST') {
      return await handleIPCExecute(req, corsHeaders)
    }

    // ==================== 协议转换代理 ====================

    // 代理路由：/proxy/v1/messages
    const proxyResponse = await handleProxyRoute(req)
    if (proxyResponse) {
      // 注入 CORS 头
      for (const [k, v] of Object.entries(corsHeaders)) {
        proxyResponse.headers.set(k, v)
      }
      return proxyResponse
    }

    // 404
    return new Response('Not Found', { status: 404, headers: corsHeaders })
  } catch (error) {
    console.error('[Sidecar] 请求处理异常:', error)
    return Response.json(
      { error: '服务器内部错误', message: (error as Error).message },
      { status: 500, headers: corsHeaders }
    )
  }
}

// ==================== 对话处理 ====================

/**
 * 发送消息（非流式，返回完整响应）
 */
async function handleChatSend (
  req: Request,
  headers: Record<string, string>
): Promise<Response> {
  const body = await req.json() as {
    prompt: string
    sessionId?: string
    apiKey?: string
    model?: string
    baseUrl?: string
    endpointType?: string
  }

  const { prompt, sessionId, apiKey, model, baseUrl, endpointType } = body

  if (!prompt) {
    return Response.json({ error: '消息内容不能为空' }, { status: 400, headers })
  }

  // 获取或创建 AgentSession
  const session = getOrCreateAgentSession(sessionId || 'default', {
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY || '',
    model: model || 'claude-sonnet-4-20250514',
    baseUrl,
    workspacePath: WORKSPACE,
    endpointType,
  })

  if (!session) {
    return Response.json(
      { error: 'API Key 未配置，请在设置中添加供应商并输入 API Key' },
      { status: 401, headers }
    )
  }

  // 收集完整响应
  let responseText = ''

  await session.sendMessage(prompt, {
    onText: (text) => { responseText += text },
    onError: (error) => {
      responseText = `错误: ${error.message}`
    },
  })

  // 更新元数据
  if (sessionId) {
    sessionManager.touchSession(sessionId)
  }

  return Response.json({
    id: crypto.randomUUID(),
    sessionId: sessionId || 'default',
    role: 'assistant',
    content: [{ type: 'text', text: responseText }],
    createdAt: new Date().toISOString(),
  }, { headers })
}

/**
 * SSE 流式响应（改为 POST，避免 apiKey 暴露在 URL 中）
 */
async function handleChatStream (
  req: Request,
  headers: Record<string, string>
): Promise<Response> {
  const body = await req.json() as {
    sessionId?: string
    prompt?: string
    apiKey?: string
    model?: string
    baseUrl?: string
    endpointType?: string
    skillPrompt?: string
  }

  const sessionId = body.sessionId || 'default'
  const prompt = body.prompt || ''
  const apiKey = body.apiKey || process.env.ANTHROPIC_API_KEY || ''
  const model = body.model || 'claude-sonnet-4-20250514'
  const baseUrl = body.baseUrl || undefined
  const endpointType = body.endpointType || undefined
      const skillPrompt = body.skillPrompt || undefined

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start (controller) {
      // 如果没有 prompt，发送等待事件
      if (!prompt) {
        const event = `data: ${JSON.stringify({ type: 'message:start', sessionId })}\n\n`
        controller.enqueue(encoder.encode(event))

        const msg = 'AI Agent Sidecar 已就绪，等待消息...'
        for (let i = 0; i < msg.length; i++) {
          setTimeout(() => {
            const chunk = `data: ${JSON.stringify({ type: 'message:chunk', data: { text: msg[i] } })}\n\n`
            controller.enqueue(encoder.encode(chunk))
            if (i === msg.length - 1) {
              const complete = `data: ${JSON.stringify({ type: 'message:complete' })}\n\n`
              controller.enqueue(encoder.encode(complete))
              controller.close()
            }
          }, i * 30)
        }
        return
      }

      // 更新当前 skill prompt
      currentSkillPrompt = skillPrompt || ''

      // 有 prompt 时，使用 Agent SDK 流式响应
      const session = getOrCreateAgentSession(sessionId, {
        apiKey,
        model,
        baseUrl,
        workspacePath: WORKSPACE,
        endpointType,
      })

      if (!session) {
        const errEvent = `data: ${JSON.stringify({ type: 'error', data: { message: 'API Key 未配置' } })}\n\n`
        controller.enqueue(encoder.encode(errEvent))
        controller.close()
        return
      }

      // 发送开始事件
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'message:start', sessionId })}\n\n`)
      )

      session.sendMessage(prompt, {
        onText: (text) => {
          const chunk = `data: ${JSON.stringify({ type: 'message:chunk', data: { text } })}\n\n`
          controller.enqueue(encoder.encode(chunk))
        },
        onToolUse: (tool) => {
          const event = `data: ${JSON.stringify({ type: 'tool:start', data: tool })}\n\n`
          controller.enqueue(encoder.encode(event))
        },
        onComplete: (message) => {
          const complete = `data: ${JSON.stringify({
            type: 'message:complete',
            data: {
              usage: message.usage,
              model: message.model,
              stopReason: message.stop_reason,
            }
          })}\n\n`
          controller.enqueue(encoder.encode(complete))
          controller.close()
        },
        onError: (error) => {
          const errEvent = `data: ${JSON.stringify({ type: 'error', data: { message: error.message } })}\n\n`
          controller.enqueue(encoder.encode(errEvent))
          controller.close()
        },
      }).catch((error) => {
        console.error('[Sidecar] 流式响应异常:', error)
        try {
          controller.close()
        } catch { }
      })
    }
  })

  return new Response(stream, {
    headers: {
      ...headers,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

/**
 * 停止响应
 */
async function handleChatStop (
  req: Request,
  headers: Record<string, string>
): Promise<Response> {
  // 支持从 body 或 query 参数获取 sessionId
  let sessionId = 'default'
  try {
    const body = await req.json() as { sessionId?: string }
    sessionId = body.sessionId || 'default'
  } catch {
    const url = new URL(req.url)
    sessionId = url.searchParams.get('sessionId') || 'default'
  }

  // 遍历所有匹配此 sessionId 的活跃会话并停止
  let stopped = false
  for (const [key, session] of activeSessions.entries()) {
    if (key.startsWith(sessionId + ':')) {
      session.stop()
      stopped = true
    }
  }

  return Response.json({ stopped }, { headers })
}

/**
 * 创建会话
 */
async function handleSessionCreate (
  req: Request,
  headers: Record<string, string>
): Promise<Response> {
  const body = await req.json() as {
    title?: string
    workspacePath?: string
    apiKey?: string
    model?: string
    baseUrl?: string
    endpointType?: string
  }

  const meta = sessionManager.createSession({
    apiKey: body.apiKey || process.env.ANTHROPIC_API_KEY || '',
    model: body.model || 'claude-sonnet-4-20250514',
    baseUrl: body.baseUrl,
    workspacePath: body.workspacePath || WORKSPACE,
    title: body.title,
    endpointType: body.endpointType,
  })

  return Response.json(meta, { headers })
}

/**
 * 执行 IPC 命令
 */
async function handleIPCExecute (
  req: Request,
  headers: Record<string, string>
): Promise<Response> {
  try {
    const body = await req.json() as IPCCommand
    const result = await executeIPCCommand(body, WORKSPACE)
    return Response.json(result, { headers })
  } catch (error) {
    return Response.json(
      { success: false, error: (error as Error).message },
      { status: 400, headers }
    )
  }
}

// ==================== 工具函数 ====================

/** Session 缓存活跃时间追踪 */
const sessionLastActive = new Map<string, number>()
/** Session 自动回收间隔（30 分钟） */
const SESSION_TTL_MS = 30 * 60 * 1000

// 每 5 分钟清理过期 session
setInterval(() => {
  const now = Date.now()
  for (const [key, lastActive] of sessionLastActive.entries()) {
    if (now - lastActive > SESSION_TTL_MS) {
      const session = activeSessions.get(key)
      if (session) session.stop()
      activeSessions.delete(key)
      sessionLastActive.delete(key)
      console.log(`[Sidecar] 回收过期 session: ${key}`)
    }
  }
}, 5 * 60 * 1000)

/**
 * 获取或创建 AgentSession
 * 使用复合 key（sessionId + model + endpointType）避免配置冲突
 */
function getOrCreateAgentSession (
  sessionId: string,
  config: { apiKey: string; model: string; baseUrl?: string; workspacePath: string; endpointType?: string }
): AgentSession | null {
  // 检查 API Key
  if (!config.apiKey) {
    return null
  }

  // 复合缓存 key：同一个 session + 同型号 + 同端点才复用
  const cacheKey = `${sessionId}:${config.model}:${config.endpointType || 'anthropic'}:${config.baseUrl || ''}`

  const systemPrompt = buildSystemPrompt(
    { type: 'desktop' },
    currentSkillPrompt || undefined,
  )

  // 更新活跃时间
  sessionLastActive.set(cacheKey, Date.now())

  // 复用已有 session
  if (activeSessions.has(cacheKey)) {
    const existing = activeSessions.get(cacheKey)!
    existing.setSystemPrompt(systemPrompt)
    existing.setModel(config.model)
    return existing
  }

  // 创建新 session
  const session = new AgentSession({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    systemPrompt,
    endpointType: config.endpointType,
    sidecarPort: PORT,
  })

  activeSessions.set(cacheKey, session)
  return session
}

// ==================== 启动服务器 ====================

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
})

console.log(`[Sidecar] ✅ 服务已启动: http://localhost:${server.port}`)
console.log(`[Sidecar] 📂 工作目录: ${WORKSPACE}`)
console.log(`[Sidecar] 🧠 Anthropic SDK 已加载，等待 API Key 配置...`)
