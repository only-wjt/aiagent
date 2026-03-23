<template>
  <div class="home-page">
    <!-- 欢迎区域 -->
    <div class="welcome-section animate-fade-in">
      <h1 class="welcome-title">AI Agent</h1>
      <p class="welcome-subtitle">每个人都可以拥有属于自己的 AI Agent，你的私人助理已经准备好了</p>

      <!-- 搜索/输入框 -->
      <div class="quick-input-wrapper">
        <div class="quick-input-container">
          <input
            v-model="quickPrompt"
            class="quick-input"
            placeholder="今天，想干点啥？"
            @keydown.enter="startChat"
          />
          <div class="quick-input-actions">
            <div class="model-picker-wrapper">
              <span class="model-badge" @click="showModelPicker = !showModelPicker">
                {{ selectedModel || '选择模型' }} ▾
              </span>
              <div v-if="showModelPicker" class="model-dropdown card">
                <div v-if="availableModels.length === 0" class="model-option" style="opacity:0.5;cursor:default">
                  无可用模型，请在设置中启用
                </div>
                <div
                  v-for="m in availableModels"
                  :key="m.id"
                  class="model-option"
                  :class="{ active: selectedModel === m.id }"
                  @click="selectedModel = m.id; showModelPicker = false"
                >
                  <span class="model-option-name">{{ m.name }}</span>
                  <span class="model-option-desc">{{ m.providerName }}</span>
                </div>
              </div>
            </div>
            <button class="btn btn-primary btn-send" @click="startChat">
              发送
            </button>
          </div>
        </div>
      </div>

      <!-- 快捷操作 -->
      <div class="quick-actions">
        <button class="quick-btn" @click="quickAction('帮我写一段 Python 代码')">
          <Code2 :size="16" /> 写代码
        </button>
        <button class="quick-btn" @click="quickAction('帮我翻译下面的内容')">
          <Globe :size="16" /> 翻译
        </button>
        <button class="quick-btn" @click="quickAction('帮我总结这篇文章的要点')">
          <FileText :size="16" /> 总结
        </button>
        <button class="quick-btn" @click="quickAction('帮我分析一下这个问题')">
          <Search :size="16" /> 分析
        </button>
      </div>
    </div>



    <!-- Agent 工作区 -->
    <div class="section animate-slide-up" style="animation-delay: 0.2s">
      <div class="section-header">
        <h2 class="section-title">Agent 工作区</h2>
        <button class="btn btn-primary btn-sm btn-flex" @click="showNewWorkspace = true">
          <Plus :size="14" /> 新建
        </button>
      </div>
      <div class="workspace-grid">
        <div class="workspace-card card card-interactive" @click="openWorkspace('default')">
          <div class="workspace-icon"><Bot :size="24" stroke-width="1.5" /></div>
          <div class="workspace-info">
            <h3 class="workspace-name">默认工作区</h3>
            <p class="workspace-path">~/Documents/aiagent</p>
          </div>
        </div>

        <!-- 动态添加的工作区 -->
        <div
          v-for="ws in workspaceStore.workspaces"
          :key="ws.id"
          class="workspace-card card card-interactive"
          @click="openWorkspace(ws.id)"
        >
          <div class="workspace-icon"><Folder :size="24" stroke-width="1.5" /></div>
          <div class="workspace-info">
            <h3 class="workspace-name">{{ ws.name }}</h3>
            <p class="workspace-path">{{ ws.path }}</p>
          </div>
        </div>
      </div>

    </div>

    <!-- 新建工作区模态弹窗 (Modal) -->
    <Transition name="modal">
      <div v-if="showNewWorkspace" class="modal-overlay" @click.self="showNewWorkspace = false">
        <div class="modal-content card">
          <div class="modal-header">
            <h4 class="form-title">新建工作区</h4>
            <button class="btn-close" @click="showNewWorkspace = false"><X :size="20" /></button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>名称</label>
              <input class="input" v-model="newWs.name" placeholder="我的项目" />
            </div>
            <div class="form-group mt-md">
              <label>路径</label>
              <input class="input input-mono" v-model="newWs.path" placeholder="~/Projects/my-project" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" @click="showNewWorkspace = false">取消</button>
            <button class="btn btn-primary" @click="createWorkspace" :disabled="!newWs.name.trim()">创建</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '../stores/chatStore'
import { useConfigStore } from '../stores/configStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { Code2, Globe, FileText, Search, Bot, Plus, X, Folder } from 'lucide-vue-next'

const router = useRouter()
const chatStore = useChatStore()
const configStore = useConfigStore()
const workspaceStore = useWorkspaceStore()
const quickPrompt = ref('')
const showNewWorkspace = ref(false)
const newWs = reactive({ name: '', path: '' })

// 可用模型列表（只显示用户勾选启用的模型）
const availableModels = computed(() => configStore.allEnabledModels())
const selectedModel = ref(chatStore.currentModel)
const showModelPicker = ref(false)

// 最近 5 个对话（不再使用）
// const recentConversations = computed(() => chatStore.conversations.slice(0, 5))

function startChat() {
  const prompt = quickPrompt.value.trim()
  if (!prompt) {
    router.push('/chat')
    return
  }
  // 设置选择的模型
  chatStore.currentModel = selectedModel.value
  sessionStorage.setItem('quickPrompt', prompt)
  quickPrompt.value = ''
  router.push('/chat')
}

function quickAction(prompt: string) {
  quickPrompt.value = prompt
  startChat()
}

async function createWorkspace() {
  if (!newWs.name.trim()) return
  await workspaceStore.addWorkspace(newWs.name, newWs.path)
  newWs.name = ''
  newWs.path = ''
  showNewWorkspace.value = false
}

function openWorkspace(id: string) {
  router.push('/chat')
}
</script>

<style scoped>
.home-page {
  max-width: 800px;
  margin: 0 auto;
  padding: var(--space-2xl) var(--space-lg);
}

.welcome-section {
  text-align: center;
  padding: var(--space-2xl) 0;
}

.welcome-title {
  font-size: 42px;
  font-weight: 700;
  letter-spacing: -0.03em;
  margin-bottom: var(--space-sm);
  background: linear-gradient(135deg, var(--color-primary-dark), var(--color-primary-light));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  display: inline-block;
}

.welcome-subtitle {
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-xl);
}

.quick-input-wrapper { max-width: 560px; margin: 0 auto; }

.quick-input-container {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  box-shadow: var(--shadow-md);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.quick-input-container:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-bg), var(--shadow-md);
}

.quick-input {
  width: 100%; border: none; outline: none;
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  background: transparent;
  padding: var(--space-xs) 0;
  font-family: var(--font-sans);
}
.quick-input::placeholder { color: var(--color-text-tertiary); }

.quick-input-actions { display: flex; align-items: center; justify-content: space-between; margin-top: var(--space-sm); }

.model-picker-wrapper {
  position: relative;
}
.model-badge {
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-bg);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}
.model-badge:hover { opacity: 0.8; }
.model-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  min-width: 240px;
  max-height: 300px;
  overflow-y: auto;
  padding: 4px 0;
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-md);
  z-index: 100;
}
.model-option {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; cursor: pointer;
  transition: all var(--transition-fast);
  font-size: var(--font-size-sm);
}
.model-option:hover { background: var(--color-bg-hover); }
.model-option.active { background: var(--color-primary-bg); color: var(--color-primary); }
.model-option-name { color: var(--color-text-primary); }
.model-option-desc { font-size: var(--font-size-xs); color: var(--color-text-tertiary); }

.btn-send { padding: 6px 16px; }

/* 快捷操作 */
.quick-actions {
  display: flex; gap: var(--space-sm); justify-content: center;
  margin-top: var(--space-lg);
}
.quick-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-pill);
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: var(--font-sans);
}
.quick-btn:hover {
  background: var(--color-primary-bg);
  border-color: var(--color-primary-border);
  color: var(--color-primary);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

/* Sections */
.section { margin-top: var(--space-xl); }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-md); }
.section-title { font-size: var(--font-size-lg); font-weight: 600; }
.section-subtitle { font-size: var(--font-size-sm); color: var(--color-text-tertiary); }
.btn-sm { padding: 4px 12px; font-size: var(--font-size-xs); }
.btn-flex { display: flex; align-items: center; gap: 4px; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: var(--space-xl); color: var(--color-text-tertiary); gap: var(--space-sm); }
.empty-icon { font-size: 32px; opacity: 0.5; }

/* 工作区 */
.workspace-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-md); }
.workspace-card { display: flex; align-items: center; gap: var(--space-md); cursor: pointer; }
.workspace-card:hover { box-shadow: var(--shadow-md); }
.workspace-icon { font-size: 28px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: var(--color-primary-bg); border-radius: var(--radius-md); }
.workspace-name { font-size: var(--font-size-md); font-weight: 600; }
.workspace-path { font-size: var(--font-size-xs); color: var(--color-text-tertiary); margin-top: 2px; }

/* 模态弹框 (Modal) */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.modal-content {
  width: 90%; max-width: 460px;
  padding: 0; /* 让头尾能够贴边，或者自己控制 padding */
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-border-light);
}
.form-title { font-size: var(--font-size-md); font-weight: 600; margin: 0; }
.btn-close {
  display: flex; align-items: center; justify-content: center;
  background: none; border: none;
  color: var(--color-text-tertiary); cursor: pointer;
  transition: color var(--transition-fast);
}
.btn-close:hover { color: var(--color-error); }

.modal-body {
  padding: var(--space-lg);
}
.mt-md { margin-top: var(--space-md); }

.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border-light);
}

.form-group label { display: block; font-size: var(--font-size-sm); font-weight: 500; margin-bottom: var(--space-xs); }
.input-mono { font-family: var(--font-mono); font-size: var(--font-size-sm); }

/* Modal 动画 */
.modal-enter-active, .modal-leave-active {
  transition: all 0.25s ease;
}
.modal-enter-active .modal-content, .modal-leave-active .modal-content {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-content, .modal-leave-to .modal-content {
  transform: scale(0.95) translateY(10px);
}
</style>
