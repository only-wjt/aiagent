/**
 * Pinia Store — 技能管理
 *
 * 技能分为内置技能（有预定义 prompt）和自定义技能（用户自写 prompt）。
 * 所有技能配置通过 Tauri IPC 持久化到 ~/.aiagent/skills.json。
 * 启用的技能 prompt 会被注入到 Sidecar 的 system prompt 中。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getTauriInvoke } from '../utils/tauri'

/** 内置技能 */
export interface BuiltinSkill {
  id: string
  name: string
  description: string
  icon: string
  enabled: boolean
  tags: string[]
  /** 注入到 system prompt 的指令 */
  prompt: string
}

/** 自定义技能 */
export interface CustomSkill {
  id: string
  name: string
  prompt: string
  enabled: boolean
}

/** 持久化格式 */
interface SkillsData {
  builtinEnabled: Record<string, boolean>
  customSkills: CustomSkill[]
}

// 内置技能定义（带 prompt）
const BUILTIN_DEFINITIONS: Omit<BuiltinSkill, 'enabled'>[] = [
  {
    id: 'docs', name: 'docs', icon: '📖', tags: ['内置'],
    description: '文档查阅与知识检索',
    prompt: '你擅长文档查阅和知识检索。当用户提出问题时，优先从已有文档中寻找答案，引用出处，确保信息准确。',
  },
  {
    id: 'pdf', name: 'pdf', icon: '📄', tags: ['内置'],
    description: 'PDF 文件解析与内容提取',
    prompt: '你能够解析 PDF 文件内容，提取关键信息、表格和图表数据，并以结构化方式呈现。',
  },
  {
    id: 'sqlite', name: 'sqlite', icon: '🗃️', tags: ['内置'],
    description: 'SQLite 数据库查询与管理',
    prompt: '你精通 SQLite 数据库操作，能编写高效 SQL 查询、分析数据结构、优化查询性能。',
  },
  {
    id: 'summarizer', name: 'summarizer', icon: '📝', tags: ['内置'],
    description: '智能内容总结与摘要',
    prompt: '你擅长总结和提炼信息。面对长文本时，提取核心观点，分层次组织，确保摘要简洁准确。',
  },
  {
    id: 'xlsx', name: 'xlsx', icon: '📊', tags: ['内置'],
    description: 'Excel 文件读写与分析',
    prompt: '你能够处理 Excel 文件，分析数据趋势，创建公式，生成图表描述，支持数据清洗和转换。',
  },
  {
    id: 'research', name: 'ultra-research', icon: '🔍', tags: ['内置', '高级'],
    description: '深度调研与信息收集',
    prompt: '你是深度调研专家。收到调研任务后，系统性搜索信息，交叉验证，输出结构化报告含来源引用。',
  },
  {
    id: 'code-review', name: 'code-review', icon: '🔎', tags: ['内置', '高级'],
    description: '代码审查与最佳实践',
    prompt: '你是代码审查专家。检查代码时关注安全漏洞、性能问题、可读性、SOLID 原则、错误处理，给出具体修改建议。',
  },
]

export const useSkillStore = defineStore('skill', () => {
  // ==================== 状态 ====================

  const builtinSkills = ref<BuiltinSkill[]>(
    BUILTIN_DEFINITIONS.map(d => ({ ...d, enabled: ['docs', 'summarizer', 'code-review'].includes(d.id) }))
  )

  const customSkills = ref<CustomSkill[]>([])

  const isLoaded = ref(false)

  // ==================== 计算属性 ====================

  /** 所有启用的技能 prompt（用于注入 system prompt） */
  const activeSkillPrompts = computed(() => {
    const prompts: string[] = []
    for (const s of builtinSkills.value) {
      if (s.enabled) prompts.push(`[${s.name}] ${s.prompt}`)
    }
    for (const s of customSkills.value) {
      if (s.enabled && s.prompt) prompts.push(`[${s.name}] ${s.prompt}`)
    }
    return prompts
  })

  /** 拼接后的完整技能 prompt */
  const combinedSkillPrompt = computed(() => {
    if (activeSkillPrompts.value.length === 0) return ''
    return '\n\n[启用的技能]\n' + activeSkillPrompts.value.join('\n')
  })

  // ==================== 持久化 ====================

  async function init () {
    if (isLoaded.value) return
    await load()
    isLoaded.value = true
  }

  async function load () {
    const invoke = await getTauriInvoke()
    if (!invoke) return
    try {
      const json = await invoke('cmd_read_json', { filename: 'skills.json' }) as string
      if (json && json !== 'null') {
        const data: SkillsData = JSON.parse(json)
        // 恢复内置技能开关
        if (data.builtinEnabled) {
          for (const s of builtinSkills.value) {
            if (data.builtinEnabled[s.id] !== undefined) {
              s.enabled = data.builtinEnabled[s.id]
            }
          }
        }
        // 恢复自定义技能
        if (data.customSkills) {
          customSkills.value = data.customSkills
        }
      }
    } catch (e) {
      console.error('[SkillStore] 加载失败:', e)
    }
  }

  async function save () {
    const invoke = await getTauriInvoke()
    if (!invoke) return
    try {
      const data: SkillsData = {
        builtinEnabled: Object.fromEntries(builtinSkills.value.map(s => [s.id, s.enabled])),
        customSkills: customSkills.value,
      }
      await invoke('cmd_write_json', { filename: 'skills.json', data: JSON.stringify(data) })
    } catch (e) {
      console.error('[SkillStore] 保存失败:', e)
    }
  }

  // ==================== 操作 ====================

  async function toggleBuiltin (id: string) {
    const s = builtinSkills.value.find(s => s.id === id)
    if (s) {
      s.enabled = !s.enabled
      await save()
    }
  }

  async function addCustomSkill (name: string, prompt: string) {
    customSkills.value.push({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      prompt: prompt.trim(),
      enabled: true,
    })
    await save()
  }

  async function removeCustomSkill (id: string) {
    customSkills.value = customSkills.value.filter(s => s.id !== id)
    await save()
  }

  async function toggleCustomSkill (id: string) {
    const s = customSkills.value.find(s => s.id === id)
    if (s) {
      s.enabled = !s.enabled
      await save()
    }
  }

  return {
    builtinSkills,
    customSkills,
    isLoaded,
    activeSkillPrompts,
    combinedSkillPrompt,
    init,
    toggleBuiltin,
    addCustomSkill,
    removeCustomSkill,
    toggleCustomSkill,
  }
})
