<template>
  <div class="mcp-settings">
    <div class="page-header">
      <div>
        <h2 class="page-title">工具 MCP</h2>
        <p class="page-desc">MCP (Model Context Protocol) 扩展 Agent 的工具调用能力</p>
      </div>
      <button class="btn btn-primary" @click="showAddModal = true">+ 添加 MCP 服务器</button>
    </div>

    <!-- MCP 工具列表 -->
    <div v-if="tools.length > 0" class="tool-list">
      <div v-for="tool in tools" :key="tool.id" class="tool-card card" :class="{ 'is-disabled': !tool.enabled }">
        <div class="tool-top">
          <div class="tool-main">
            <div class="tool-status-dot" :class="tool.status" :title="statusText(tool.status)"></div>
            <span class="tool-name">{{ tool.name }}</span>
            <div class="tool-tags">
              <span v-for="tag in tool.tags" :key="tag" class="badge badge-primary">{{ tag }}</span>
            </div>
          </div>
          <div class="tool-actions">
            <label class="toggle">
              <input type="checkbox" v-model="tool.enabled" />
              <span class="slider"></span>
            </label>
            <button class="btn-icon" @click="editTool(tool)" title="编辑">✏️</button>
            <button class="btn-icon btn-delete" @click="removeTool(tool.id)" title="删除">🗑️</button>
          </div>
        </div>
        <p class="tool-desc">{{ tool.description }}</p>
        <div class="tool-meta">
          <code class="tool-command">{{ tool.command }}</code>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <span class="empty-icon">🛠️</span>
      <h3>还没有 MCP 工具</h3>
      <p>添加 MCP 服务器来扩展 Agent 的工具调用能力</p>
      <button class="btn btn-primary" @click="showAddModal = true">+ 添加第一个</button>
    </div>

    <!-- 添加/编辑模态框 -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal card">
        <h3 class="modal-title">{{ editingTool ? '编辑 MCP 服务器' : '添加 MCP 服务器' }}</h3>
        <div class="form-group">
          <label>服务器名称</label>
          <input class="input" v-model="form.name" placeholder="例如：Playwright 浏览器" />
        </div>
        <div class="form-group">
          <label>启动命令</label>
          <input class="input input-mono" v-model="form.command" placeholder="npx -y @anthropic-ai/mcp-playwright" />
        </div>
        <div class="form-group">
          <label>描述</label>
          <input class="input" v-model="form.description" placeholder="这个工具做什么？" />
        </div>
        <div class="form-group">
          <label>标签 <span class="label-hint">（逗号分隔）</span></label>
          <input class="input" v-model="form.tagsStr" placeholder="官方, 关键" />
        </div>
        <div class="form-group">
          <label>环境变量 <span class="label-hint">（每行一个 KEY=VALUE）</span></label>
          <textarea class="input textarea" v-model="form.envStr" placeholder="API_KEY=sk-xxx" rows="3"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="saveTool" :disabled="!form.name.trim() || !form.command.trim()">
            {{ editingTool ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useMcpStore, type McpTool } from '../../stores/mcpStore'

const mcpStore = useMcpStore()
const tools = mcpStore.tools

const showAddModal = ref(false)
const editingTool = ref<McpTool | null>(null)
const form = reactive({ name: '', command: '', description: '', tagsStr: '', envStr: '' })

function statusText(s: string) {
  return { connected: '已连接', disconnected: '未连接', error: '错误' }[s] || s
}

function editTool(tool: McpTool) {
  editingTool.value = tool
  form.name = tool.name
  form.command = tool.command
  form.description = tool.description
  form.tagsStr = tool.tags.join(', ')
  form.envStr = tool.env ? Object.entries(tool.env).map(([k, v]) => `${k}=${v}`).join('\n') : ''
  showAddModal.value = true
}

function closeModal() {
  showAddModal.value = false
  editingTool.value = null
  form.name = ''; form.command = ''; form.description = ''; form.tagsStr = ''; form.envStr = ''
}

async function saveTool() {
  const tags = form.tagsStr.split(',').map(t => t.trim()).filter(Boolean)
  const env: Record<string, string> = {}
  form.envStr.split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k?.trim()) env[k.trim()] = v.join('=').trim()
  })

  if (editingTool.value) {
    await mcpStore.updateTool(editingTool.value.id, {
      name: form.name, command: form.command, description: form.description, tags, env,
    })
  } else {
    await mcpStore.addTool({
      name: form.name, command: form.command, description: form.description,
      tags, enabled: true, env,
    })
  }
  closeModal()
}

async function removeTool(id: string) {
  await mcpStore.removeTool(id)
}
</script>

<style scoped>
.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--space-xl); }
.page-title { font-size: var(--font-size-xl); font-weight: 700; }
.page-desc { color: var(--color-text-tertiary); font-size: var(--font-size-sm); margin-top: 4px; }

.tool-list { display: flex; flex-direction: column; gap: var(--space-md); }

.tool-card { padding: var(--space-md); transition: all var(--transition-normal); }
.tool-card.is-disabled { opacity: 0.5; }
.tool-card:hover { box-shadow: var(--shadow-md); }

.tool-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-sm); }
.tool-main { display: flex; align-items: center; gap: var(--space-sm); }
.tool-name { font-weight: 600; font-size: var(--font-size-md); }
.tool-tags { display: flex; gap: 4px; }
.tool-tags .badge { font-size: 10px; padding: 1px 6px; }
.tool-desc { font-size: var(--font-size-sm); color: var(--color-text-tertiary); margin-bottom: var(--space-sm); }
.tool-meta { }
.tool-command { font-size: var(--font-size-xs); color: var(--color-text-tertiary); background: var(--color-bg-tertiary); padding: 4px 8px; border-radius: var(--radius-sm); }

.tool-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.tool-status-dot.connected { background: var(--color-success); }
.tool-status-dot.disconnected { background: var(--color-border); }
.tool-status-dot.error { background: var(--color-error); }

.tool-actions { display: flex; align-items: center; gap: var(--space-sm); }
.btn-icon { background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; border-radius: var(--radius-sm); transition: all var(--transition-fast); }
.btn-icon:hover { background: var(--color-bg-hover); }
.btn-delete:hover { background: rgba(255, 77, 79, 0.1); }

/* Toggle */
.toggle { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; inset: 0; background: var(--color-border); border-radius: 20px; transition: .3s; }
.slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 2px; bottom: 2px; background: white; border-radius: 50%; transition: .3s; }
.toggle input:checked + .slider { background: var(--color-primary); }
.toggle input:checked + .slider::before { transform: translateX(16px); }

/* 空状态 */
.empty-state { display: flex; flex-direction: column; align-items: center; padding: var(--space-2xl) var(--space-xl); color: var(--color-text-tertiary); gap: var(--space-sm); }
.empty-icon { font-size: 48px; opacity: 0.4; }
.empty-state h3 { font-size: var(--font-size-md); color: var(--color-text-secondary); }

/* 模态框 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
.modal { width: 480px; max-height: 80vh; overflow-y: auto; padding: var(--space-xl); animation: modal-in 0.2s ease; }
@keyframes modal-in { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: none; } }
.modal-title { font-size: var(--font-size-lg); font-weight: 600; margin-bottom: var(--space-lg); }

.form-group { margin-bottom: var(--space-md); }
.form-group label { display: block; font-size: var(--font-size-sm); font-weight: 500; margin-bottom: var(--space-xs); color: var(--color-text-primary); }
.label-hint { font-weight: 400; color: var(--color-text-tertiary); }
.input-mono { font-family: var(--font-mono); font-size: var(--font-size-sm); }
.textarea { resize: vertical; min-height: 60px; font-family: var(--font-mono); font-size: var(--font-size-sm); line-height: 1.5; }
.modal-actions { display: flex; justify-content: flex-end; gap: var(--space-sm); margin-top: var(--space-lg); }
</style>
