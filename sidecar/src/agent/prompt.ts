/**
 * 系统提示词组装器 — 三层 Prompt 架构
 *
 * 参考 MyAgents 的设计：
 * L1: 基础身份 — 告诉 AI 运行在什么产品中
 * L2: 交互方式 — 桌面客户端 / IM Bot
 * L3: 场景指令 — 定时任务 / 心跳 / 特殊指令
 */

/** 交互场景类型 */
export type InteractionScenario =
  | { type: 'desktop' }
  | { type: 'im'; platform: 'telegram' | 'feishu' | 'dingtalk'; sourceType: 'private' | 'group'; botName?: string }
  | { type: 'cron'; taskId: string; intervalMinutes: number }

// ==================== L1: 基础身份 ====================

const L1_BASE_IDENTITY = `你是 AI Agent，一个强大的 AI 助手。你运行在 AI Agent 桌面应用中，能够帮助用户完成各种任务。

你的核心能力：
- 理解和回答各种问题
- 编写、分析和调试代码
- 读写文件和管理项目
- 搜索信息和总结内容
- 执行多步骤复杂任务

你应该：
- 用中文回复（除非用户使用其他语言）
- 思考清晰，回答准确
- 对不确定的内容坦诚说明
- 主动提供更好的解决方案`

// ==================== L2: 交互方式 ====================

const L2_DESKTOP = `

当前交互方式：桌面客户端
用户通过桌面应用与你交互。你可以：
- 使用 Markdown 格式化输出
- 提供代码块（会被高亮显示）
- 使用列表和表格组织信息`

function buildL2Im (platform: string, sourceType: string, botName?: string): string {
  return `

当前交互方式：IM 聊天机器人
平台: ${platform}
聊天类型: ${sourceType === 'private' ? '私聊' : '群聊'}
${botName ? `Bot 名称: ${botName}` : ''}

注意：
- 回复保持简洁（IM 消息不宜过长）
- 避免复杂的 Markdown（部分 IM 不支持）
- ${sourceType === 'group' ? '仅在被 @ 或相关时回复' : '直接回复用户消息'}`
}

// ==================== L3: 场景指令 ====================

function buildL3Cron (taskId: string, intervalMinutes: number): string {
  return `

[定时任务模式]
任务 ID: ${taskId}
执行间隔: 每 ${intervalMinutes} 分钟
请按照任务目标执行，完成后输出执行结果。`
}

// ==================== 组装函数 ====================

/**
 * 组装完整系统提示词
 */
export function buildSystemPrompt (
  scenario: InteractionScenario,
  customPrompt?: string
): string {
  let prompt = L1_BASE_IDENTITY

  // L2: 交互方式
  switch (scenario.type) {
    case 'desktop':
      prompt += L2_DESKTOP
      break
    case 'im':
      prompt += buildL2Im(scenario.platform, scenario.sourceType, scenario.botName)
      break
    case 'cron':
      prompt += L2_DESKTOP // 定时任务也走桌面通道
      break
  }

  // L3: 场景指令
  if (scenario.type === 'cron') {
    prompt += buildL3Cron(scenario.taskId, scenario.intervalMinutes)
  }

  // 用户自定义提示词
  if (customPrompt) {
    prompt += `\n\n[用户自定义指令]\n${customPrompt}`
  }

  return prompt
}
