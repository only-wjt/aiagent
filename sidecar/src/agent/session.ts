/**
 * 会话管理器
 *
 * 管理多个 AgentSession 实例，支持：
 * - 创建/切换/销毁会话
 * - 会话持久化到磁盘
 * - 会话历史记录
 */

import { AgentSession, type AgentSessionConfig } from './client'
import { buildSystemPrompt, type InteractionScenario } from './prompt'
import * as fs from 'fs'
import * as path from 'path'

/** 会话元数据 */
export interface SessionMeta {
  id: string
  title: string
  workspacePath: string
  model: string
  provider?: string
  createdAt: string
  lastActiveAt: string
  messageCount: number
}

/** 会话存储 */
export class SessionManager {
  /** 活跃的 Agent 会话 */
  private sessions: Map<string, AgentSession> = new Map()
  /** 会话元数据 */
  private metadata: Map<string, SessionMeta> = new Map()
  /** 数据存储目录 */
  private dataDir: string
  /** 当前交互场景 */
  private scenario: InteractionScenario = { type: 'desktop' }

  constructor (dataDir: string) {
    this.dataDir = dataDir
    this.loadMetadata()
  }

  /** 创建新会话 */
  createSession (config: AgentSessionConfig & { workspacePath: string; title?: string }): SessionMeta {
    const id = crypto.randomUUID()
    const systemPrompt = buildSystemPrompt(this.scenario, config.systemPrompt)

    const session = new AgentSession({
      ...config,
      systemPrompt,
    })

    const meta: SessionMeta = {
      id,
      title: config.title || '新会话',
      workspacePath: config.workspacePath,
      model: config.model,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      messageCount: 0,
    }

    this.sessions.set(id, session)
    this.metadata.set(id, meta)
    this.saveMetadata()

    return meta
  }

  /** 获取会话 */
  getSession (sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId)
  }

  /** 获取会话元数据列表 */
  listSessions (): SessionMeta[] {
    return Array.from(this.metadata.values())
      .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
  }

  /** 更新会话活跃时间 */
  touchSession (sessionId: string): void {
    const meta = this.metadata.get(sessionId)
    if (meta) {
      meta.lastActiveAt = new Date().toISOString()
      meta.messageCount++
      this.saveMetadata()
    }
  }

  /** 销毁会话 */
  destroySession (sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.stop()
    }
    this.sessions.delete(sessionId)
    this.metadata.delete(sessionId)
    this.saveMetadata()
  }

  /** 设置交互场景 */
  setScenario (scenario: InteractionScenario): void {
    this.scenario = scenario
  }

  // ==================== 持久化 ====================

  private loadMetadata (): void {
    try {
      const filePath = path.join(this.dataDir, 'sessions', 'metadata.json')
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        for (const meta of data) {
          this.metadata.set(meta.id, meta)
        }
      }
    } catch {
      // 首次启动，没有元数据
    }
  }

  private saveMetadata (): void {
    try {
      const sessionsDir = path.join(this.dataDir, 'sessions')
      if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true })
      }
      const filePath = path.join(sessionsDir, 'metadata.json')
      fs.writeFileSync(filePath, JSON.stringify(Array.from(this.metadata.values()), null, 2))
    } catch (error) {
      console.error('[SessionManager] 保存元数据失败:', error)
    }
  }
}
