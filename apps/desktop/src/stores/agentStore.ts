/**
 * Pinia Store — Agent 会话管理
 *
 * Agent 核心循环：
 * 1. 发送用户消息 + 工具定义给 LLM
 * 2. 解析 LLM 返回的 tool_calls
 * 3. 调用 Tauri 后端执行工具
 * 4. 将工具结果作为 tool 消息发回 LLM
 * 5. 重复直到 LLM 不再调用工具
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../utils/http'
import { useConfigStore } from './configStore'
import { getTauriInvoke } from '../utils/tauri'

/** Agent 消息类型 */
export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  createdAt: string
  // 工具调用信息
  toolCalls?: ToolCall[]
  // 工具结果（role=tool 时）
  toolCallId?: string
  toolName?: string
  // 思考过程
  thinking?: string
  thinkingDuration?: number
}

/** 工具调用 */
export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'pending' | 'running' | 'done' | 'error'
  result?: string
  error?: string
  duration?: number
  collapsed?: boolean
}

/** Agent 工具定义（OpenAI function calling 格式） */
const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: '在工作区目录下执行 shell 命令。用于运行脚本、安装依赖、查看进程等。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的 bash 命令' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取工作区中的文件内容。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对于工作区的文件路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '在工作区中创建或覆盖文件。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对于工作区的文件路径' },
          content: { type: 'string', description: '文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: '编辑文件：查找并替换指定文本。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对于工作区的文件路径' },
          old_text: { type: 'string', description: '要被替换的原始文本' },
          new_text: { type: 'string', description: '替换后的新文本' },
        },
        required: ['path', 'old_text', 'new_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: '列出目录中的文件和子目录。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对于工作区的目录路径，默认为当前目录' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: '按文件名模式搜索文件（如 *.ts、*.vue）。',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '文件名匹配模式' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: '在文件中按正则表达式搜索内容。',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '搜索模式（正则表达式）' },
          include: { type: 'string', description: '文件名过滤模式（如 *.ts）' },
        },
        required: ['pattern'],
      },
    },
  },
]

/** 工具名到图标/标签的映射 */
export const TOOL_META: Record<string, { icon: string; label: string }> = {
  bash: { icon: '💻', label: 'Bash' },
  read_file: { icon: '📖', label: 'Read' },
  write_file: { icon: '✏️', label: 'Write' },
  edit_file: { icon: '🔧', label: 'Edit' },
  list_dir: { icon: '📂', label: 'ListDir' },
  glob: { icon: '🔍', label: 'Glob' },
  grep: { icon: '🔎', label: 'Grep' },
}

/** 权限模式类型 */
export type PermissionMode = 'action' | 'plan' | 'autonomous'

export const useAgentStore = defineStore('agent', () => {
  // ==================== 状态 ====================
  const messages = ref<AgentMessage[]>([])
  const isProcessing = ref(false)
  const currentWorkspace = ref('')
  const currentModel = ref('')
  const permissionMode = ref<PermissionMode>('autonomous')
  const abortController = ref<AbortController | null>(null)
  /** 当前正在流式输出的消息 ID（用于 UI 显示打字光标） */
  const streamingMsgId = ref<string | null>(null)
  /** 流式更新计数器（每次变化触发 UI 滚动） */
  const updateTick = ref(0)
  /** 工具启用状态 */
  const enabledTools = ref<Record<string, boolean>>({
    bash: true, read_file: true, write_file: true, edit_file: true,
    list_dir: true, glob: true, grep: true,
  })
  /** 待确认的工具调用 */
  const pendingToolCall = ref<{ toolCall: ToolCall; messageId: string } | null>(null)
  /** 用户确认/拒绝的Promise resolve */
  let confirmResolve: ((approved: boolean) => void) | null = null

  /** 构建分层 System Prompt */
  function buildSystemPrompt(): string {
    const parts: string[] = []

    // L1: 基础身份
    parts.push(`你是一个 AI Agent，运行在 MyAgent 桌面客户端中。`)

    // L2: 工作区信息
    if (currentWorkspace.value) {
      parts.push(`当前工作区路径: ${currentWorkspace.value}`)
      parts.push(`你可以使用提供的工具来查看和修改工作区中的文件、执行命令。`)
    }

    // L3: 权限模式指令
    switch (permissionMode.value) {
      case 'plan':
        parts.push(`【规划模式】你目前处于规划模式。请仅分析和讨论方案，不要调用任何工具。输出你的思路和建议即可。`)
        break
      case 'action':
        parts.push(`【行动模式】你可以使用工具，但每次调用工具前请先说明你要做什么和为什么。`)
        break
      case 'autonomous':
        parts.push(`【自主模式】你拥有完全自主权限，可以直接调用工具完成任务，无需额外确认。高效地完成用户的需求。`)
        break
    }

    return parts.join('\n')
  }

  // ==================== 核心方法 ====================

  /** 请求用户确认工具调用 */
  async function requestToolApproval(toolCall: ToolCall, messageId: string): Promise<boolean> {
    pendingToolCall.value = { toolCall, messageId }
    return new Promise((resolve) => {
      confirmResolve = resolve
    })
  }

  /** 用户确认工具调用 */
  function approveToolCall() {
    if (confirmResolve) {
      confirmResolve(true)
      confirmResolve = null
    }
    pendingToolCall.value = null
  }

  /** 用户拒绝工具调用 */
  function rejectToolCall() {
    if (confirmResolve) {
      confirmResolve(false)
      confirmResolve = null
    }
    pendingToolCall.value = null
  }

  /** 在 Tauri 后端执行工具 */
  async function executeTool(name: string, args: Record<string, unknown>): Promise<{ success: boolean; output: string; error?: string }> {
    const invoke = await getTauriInvoke()
    if (!invoke) {
      return { success: false, output: '', error: 'Tauri 不可用' }
    }
    try {
      const result = await invoke('cmd_execute_tool', {
        name,
        args,
        workspace: currentWorkspace.value,
      }) as { success: boolean; output: string; error: string | null }
      return { success: result.success, output: result.output, error: result.error || undefined }
    } catch (e) {
      return { success: false, output: '', error: String(e) }
    }
  }

  /** 构建 API 请求的消息历史（OpenAI 格式） */
  function buildApiMessages(systemPrompt: string) {
    const apiMsgs: Array<Record<string, unknown>> = []

    // System prompt
    if (systemPrompt) {
      apiMsgs.push({ role: 'system', content: systemPrompt })
    }

    // 历史消息
    for (const msg of messages.value) {
      if (msg.role === 'user') {
        apiMsgs.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'assistant') {
        const assistantMsg: Record<string, unknown> = {
          role: 'assistant',
          content: msg.content || null,
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          assistantMsg.tool_calls = msg.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          }))
        }
        apiMsgs.push(assistantMsg)
      } else if (msg.role === 'tool') {
        apiMsgs.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: msg.content,
        })
      }
    }

    return apiMsgs
  }

  /** Agent 核心循环：发送消息并处理工具调用 */
  async function sendMessage(userMessage: string) {
    if (isProcessing.value || !userMessage.trim()) return

    const configStore = useConfigStore()

    // 根据当前模型找到所属 provider
    const allModels = configStore.allEnabledModels()
    const modelInfo = allModels.find(m => m.id === currentModel.value)
    const provider = modelInfo
      ? configStore.providers.find(p => p.id === modelInfo.providerId)
      : configStore.defaultProvider
    if (!provider || !provider.apiKey) {
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '❌ 错误: 无可用供应商，请先在设置中配置 API Key',
        createdAt: new Date().toISOString(),
      })
      return
    }

    // URL 校验
    const rawBaseUrl = (provider.baseUrl || '').trim()
    if (!rawBaseUrl || (!rawBaseUrl.startsWith('http://') && !rawBaseUrl.startsWith('https://'))) {
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ 错误: 供应商 "${provider.name}" 的 Base URL 无效: "${rawBaseUrl}"\n请在设置中配置正确的 URL（需以 http:// 或 https:// 开头）`,
        createdAt: new Date().toISOString(),
      })
      return
    }

    isProcessing.value = true

    // 添加用户消息
    messages.value.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      createdAt: new Date().toISOString(),
    })

    try {
      // Agent 循环：持续直到 LLM 不再调用工具
      let loopCount = 0
      const maxLoops = 20 // 防止无限循环

      while (loopCount < maxLoops) {
        loopCount++

        const systemPrompt = buildSystemPrompt()
        const apiMessages = buildApiMessages(systemPrompt)
        const thinkStart = Date.now()

        // 规划模式不发工具定义
        const shouldSendTools = permissionMode.value !== 'plan'

        const baseUrl = rawBaseUrl.replace(/\/+$/, '')
        const endpointType = provider.endpointType || 'openai'

        // 创建 assistant 消息（流式填充）
        const agentMsg: AgentMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
        }
        messages.value.push(agentMsg)
        streamingMsgId.value = agentMsg.id

        // 节流触发 Vue 响应式更新（50ms 一次）
        let pendingFlush = false
        function flushStreamUpdate() {
          if (pendingFlush) return
          pendingFlush = true
          setTimeout(() => {
            pendingFlush = false
            const idx = messages.value.findIndex(m => m.id === agentMsg.id)
            if (idx >= 0) {
              messages.value[idx] = { ...messages.value[idx] }
              updateTick.value++
            }
          }, 50)
        }

        let hasToolCalls = false
        let stopReason = ''

        if (endpointType === 'anthropic' || endpointType === 'gemini') {
          // ===== Anthropic / Gemini 流式（Gemini 经 sidecar proxy 转换格式）=====
          let url: string
          const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' }

          if (endpointType === 'gemini') {
            // 通过 sidecar proxy 转换：发送 Anthropic 格式，sidecar 转为 Gemini 原生格式
            const invoke = await getTauriInvoke()
            let port: number | null = null
            if (invoke) {
              const workspacePath = currentWorkspace.value || '~'
              port = await (invoke('cmd_ensure_session_sidecar', {
                sessionId: 'agent-default',
                workspacePath,
                ownerType: 'agent',
                ownerId: 'default-agent',
              }) as Promise<{ port: number }>).then((sidecar) => sidecar.port).catch(() => null)
            }
            const proxyBase = port ? `http://localhost:${port}` : 'http://localhost:3700'
            url = `${proxyBase}/proxy/v1/messages`
            reqHeaders['x-target-provider'] = 'gemini'
            reqHeaders['x-target-baseurl'] = baseUrl
            reqHeaders['x-api-key'] = provider.apiKey
            console.debug('[Agent] Gemini via sidecar proxy:', url)
          } else {
            url = `${baseUrl}/v1/messages`
            reqHeaders['x-api-key'] = provider.apiKey
            reqHeaders['anthropic-version'] = '2023-06-01'
            console.debug('[Agent] Anthropic 流式请求:', url)
          }

          const anthropicTools = getEnabledAnthropicTools()

          const systemMsg = apiMessages.find(m => m.role === 'system')
          const nonSystemMsgs = apiMessages.filter(m => m.role !== 'system')

          // 转换消息格式
          const anthropicMsgs = nonSystemMsgs.map(m => {
            if (m.role === 'tool') {
              return {
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: String(m.content) }],
              }
            }
            if (m.role === 'assistant' && m.tool_calls) {
              const content: any[] = []
              if (m.content) content.push({ type: 'text', text: String(m.content) })
              for (const tc of m.tool_calls as any[]) {
                content.push({
                  type: 'tool_use', id: tc.id, name: tc.function.name,
                  input: JSON.parse(tc.function.arguments || '{}'),
                })
              }
              return { role: 'assistant', content }
            }
            return { role: m.role, content: String(m.content || '') }
          })

          abortController.value = new AbortController()
          const response = await apiFetch(url, {
            method: 'POST',
            headers: reqHeaders,
            body: JSON.stringify({
              model: currentModel.value,
              max_tokens: 8192,
              system: systemMsg ? String(systemMsg.content) : undefined,
              messages: anthropicMsgs,
              ...(shouldSendTools ? { tools: anthropicTools } : {}),
              stream: true,
            }),
            signal: abortController.value.signal,
          })

          if (!response.ok) {
            const errorBody = await response.text().catch(() => '')
            throw new Error(`${endpointType === 'gemini' ? 'Gemini' : 'Anthropic'} API 返回 ${response.status}: ${errorBody.slice(0, 300)}`)
          }

          // 流式解析 Anthropic SSE
          const reader = response.body?.getReader()
          if (!reader) throw new Error('无法获取响应流')

          const decoder = new TextDecoder()
          let buffer = ''
          // 跟踪当前 tool_use block
          const pendingToolCalls: ToolCall[] = []
          const toolInputJsons: Record<string, string> = {} // tool_id -> 累积的 JSON 字符串

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            while (buffer.includes('\n')) {
              const pos = buffer.indexOf('\n')
              const line = buffer.slice(0, pos).trim()
              buffer = buffer.slice(pos + 1)

              if (!line || line.startsWith(':')) continue
              if (!line.startsWith('data: ')) continue

              try {
                const data = JSON.parse(line.slice(6))

                if (data.type === 'content_block_start') {
                  if (data.content_block?.type === 'tool_use') {
                    const tc: ToolCall = {
                      id: data.content_block.id,
                      name: data.content_block.name,
                      args: {},
                      status: 'pending',
                      collapsed: false,
                    }
                    pendingToolCalls.push(tc)
                    toolInputJsons[tc.id] = ''
                  }
                } else if (data.type === 'content_block_delta') {
                  if (data.delta?.type === 'text_delta' && data.delta.text) {
                    agentMsg.content += data.delta.text
                    flushStreamUpdate()
                  } else if (data.delta?.type === 'input_json_delta' && data.delta.partial_json) {
                    // 累积 tool input JSON
                    const lastTc = pendingToolCalls[pendingToolCalls.length - 1]
                    if (lastTc) {
                      toolInputJsons[lastTc.id] = (toolInputJsons[lastTc.id] || '') + data.delta.partial_json
                    }
                  }
                } else if (data.type === 'message_delta') {
                  stopReason = data.delta?.stop_reason || ''
                }
              } catch { /* 忽略解析错误 */ }
            }
          }

          // 解析累积的 tool input JSON
          for (const tc of pendingToolCalls) {
            try {
              tc.args = JSON.parse(toolInputJsons[tc.id] || '{}')
            } catch { tc.args = {} }
          }

          if (pendingToolCalls.length > 0) {
            agentMsg.toolCalls = pendingToolCalls
            hasToolCalls = true
          }

          agentMsg.thinkingDuration = Math.round((Date.now() - thinkStart) / 1000)

        } else {
          // ===== OpenAI 流式 =====
          const url = `${baseUrl}/v1/chat/completions`
          console.debug('[Agent] OpenAI 流式请求:', url)

          abortController.value = new AbortController()
          const response = await apiFetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${provider.apiKey}`,
            },
            body: JSON.stringify({
              model: currentModel.value,
              messages: apiMessages,
              ...(shouldSendTools ? { tools: getEnabledAgentTools(), tool_choice: 'auto' } : {}),
              stream: true,
            }),
            signal: abortController.value.signal,
          })

          if (!response.ok) {
            const errorBody = await response.text().catch(() => '')
            throw new Error(`API 返回 ${response.status}: ${errorBody.slice(0, 300)}`)
          }

          const reader = response.body?.getReader()
          if (!reader) throw new Error('无法获取响应流')

          const decoder = new TextDecoder()
          let buffer = ''
          // OpenAI 流式 tool_calls 增量解析
          const toolCallsMap: Record<number, { id: string; name: string; arguments: string }> = {}

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            while (buffer.includes('\n')) {
              const pos = buffer.indexOf('\n')
              const line = buffer.slice(0, pos).trim()
              buffer = buffer.slice(pos + 1)

              if (!line || line.startsWith(':')) continue
              if (line === 'data: [DONE]') continue
              if (!line.startsWith('data: ')) continue

              try {
                const data = JSON.parse(line.slice(6))
                const delta = data.choices?.[0]?.delta
                const finishReason = data.choices?.[0]?.finish_reason

                if (delta?.content) {
                  agentMsg.content += delta.content
                  flushStreamUpdate()
                }

                // 增量 tool_calls
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0
                    if (!toolCallsMap[idx]) {
                      toolCallsMap[idx] = { id: tc.id || '', name: tc.function?.name || '', arguments: '' }
                    }
                    if (tc.id) toolCallsMap[idx].id = tc.id
                    if (tc.function?.name) toolCallsMap[idx].name = tc.function.name
                    if (tc.function?.arguments) toolCallsMap[idx].arguments += tc.function.arguments
                  }
                }

                if (finishReason) stopReason = finishReason
              } catch { /* 忽略解析错误 */ }
            }
          }

          // 组装工具调用
          const parsedToolCalls = Object.values(toolCallsMap)
          if (parsedToolCalls.length > 0) {
            agentMsg.toolCalls = parsedToolCalls.map(tc => ({
              id: tc.id,
              name: tc.name,
              args: (() => { try { return JSON.parse(tc.arguments || '{}') } catch { return {} } })(),
              status: 'pending' as const,
              collapsed: false,
            }))
            hasToolCalls = true
          }

          agentMsg.thinkingDuration = Math.round((Date.now() - thinkStart) / 1000)
        }

        // 如果没有工具调用 → 结束循环
        if (!hasToolCalls || !agentMsg.toolCalls) break

        // 执行每个工具调用
        for (const toolCall of agentMsg.toolCalls) {
          // action 模式下请求用户确认
          if (permissionMode.value === 'action') {
            toolCall.status = 'pending'
            const approved = await requestToolApproval(toolCall, agentMsg.id)
            if (!approved) {
              toolCall.status = 'error'
              toolCall.error = '用户拒绝执行'
              messages.value.push({
                id: crypto.randomUUID(),
                role: 'tool',
                content: `用户拒绝执行 ${toolCall.name} 工具`,
                createdAt: new Date().toISOString(),
                toolCallId: toolCall.id,
                toolName: toolCall.name,
              })
              continue
            }
          }

          toolCall.status = 'running'
          const startTime = Date.now()
          const result = await executeTool(toolCall.name, toolCall.args)
          toolCall.duration = Math.round((Date.now() - startTime) / 1000)
          toolCall.status = result.success ? 'done' : 'error'
          toolCall.result = result.output
          toolCall.error = result.error
          toolCall.collapsed = true

          messages.value.push({
            id: crypto.randomUUID(),
            role: 'tool',
            content: result.success ? result.output : `错误: ${result.error}`,
            createdAt: new Date().toISOString(),
            toolCallId: toolCall.id,
            toolName: toolCall.name,
          })
        }

        // 工具执行完后继续循环（让 LLM 处理工具结果）
        if (stopReason === 'stop' || stopReason === 'end_turn') break
      }
      // 流式结束，最后一次强制刷新
      streamingMsgId.value = null
      updateTick.value++
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        messages.value.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `❌ 错误: ${e.message}`,
          createdAt: new Date().toISOString(),
        })
      }
    } finally {
      isProcessing.value = false
      abortController.value = null
    }
  }

  /** 停止当前处理 */
  function stopProcessing() {
    if (abortController.value) {
      abortController.value.abort()
    }
    isProcessing.value = false
    streamingMsgId.value = null
  }

  /** 清空会话 */
  function clearMessages() {
    messages.value = []
  }

  /** 设置工作区 */
  function setWorkspace(path: string) {
    currentWorkspace.value = path
  }

  /** 设置模型 */
  function setModel(model: string) {
    currentModel.value = model
  }

  /** 设置权限模式 */
  function setPermissionMode(mode: PermissionMode) {
    permissionMode.value = mode
  }

  /** 获取启用的工具列表（过滤禁用的） */
  function getEnabledAgentTools() {
    return AGENT_TOOLS.filter(t => enabledTools.value[t.function.name] !== false)
  }

  /** 获取 Anthropic 格式的启用工具 */
  function getEnabledAnthropicTools() {
    return getEnabledAgentTools().map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }))
  }

  return {
    messages,
    isProcessing,
    currentWorkspace,
    currentModel,
    permissionMode,
    streamingMsgId,
    updateTick,
    enabledTools,
    pendingToolCall,
    sendMessage,
    stopProcessing,
    clearMessages,
    setWorkspace,
    setModel,
    setPermissionMode,
    approveToolCall,
    rejectToolCall,
    AGENT_TOOLS,
  }
})
