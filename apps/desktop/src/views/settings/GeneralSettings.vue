<template>
  <div class="general-settings">
    <div class="page-header">
      <h2 class="page-title">通用设置</h2>
      <p class="page-desc">自定义应用外观与行为</p>
    </div>

    <!-- 外观 -->
    <div class="settings-group card">
      <h3 class="group-title">🎨 外观</h3>

      <div class="setting-item">
        <div class="setting-label">
          <label>主题</label>
          <span class="setting-hint">选择界面显示主题</span>
        </div>
        <div class="theme-picker">
          <button
            v-for="t in themeOptions"
            :key="t.value"
            class="theme-btn"
            :class="{ active: appConfig.theme === t.value }"
            @click="setTheme(t.value)"
          >
            <span class="theme-icon">{{ t.icon }}</span>
            <span class="theme-label">{{ t.label }}</span>
          </button>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <label>语言</label>
          <span class="setting-hint">界面显示语言</span>
        </div>
        <div class="segmented-control">
          <button
            v-for="l in localeOptions"
            :key="l.value"
            class="segment-btn"
            :class="{ active: appConfig.locale === l.value }"
            @click="setLocale(l.value)"
          >
            {{ l.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Agent -->
    <div class="settings-group card">
      <h3 class="group-title">🤖 Agent</h3>

      <div class="setting-item">
        <div class="setting-label">
          <label>默认工作目录</label>
          <span class="setting-hint">新会话的默认工作目录</span>
        </div>
        <div class="path-field">
          <input class="input path-input" v-model="appConfig.defaultWorkspacePath" @change="saveConfig" />
          <button class="btn btn-ghost btn-icon-sm" title="恢复为默认路径" @click="resetWorkspacePath">↺</button>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <label>Sidecar 起始端口</label>
          <span class="setting-hint">Agent 进程使用的端口号起点</span>
        </div>
        <input class="input port-input" type="number" v-model.number="appConfig.sidecarPortStart" @change="saveConfig" />
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <label>开机自启</label>
          <span class="setting-hint">系统启动时自动运行应用</span>
        </div>
        <label class="toggle">
          <input type="checkbox" v-model="appConfig.autoStart" @change="saveConfig" />
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <!-- 快捷键 -->
    <div class="settings-group card">
      <h3 class="group-title">⌨️ 快捷键</h3>
      <div class="shortcut-list">
        <div class="shortcut-item" v-for="s in shortcuts" :key="s.label">
          <span class="shortcut-label">{{ s.label }}</span>
          <kbd class="shortcut-kbd">{{ s.key }}</kbd>
        </div>
      </div>
    </div>

    <!-- 关于 -->
    <div class="settings-group card">
      <h3 class="group-title">💡 关于</h3>
      <div class="about-info">
        <p class="about-name">🤖 AI Agent <span class="about-version">v0.1.0</span></p>
        <p class="about-desc">基于 Claude Agent SDK 的全功能 AI Agent 桌面应用</p>
        <div class="about-stack">
          <span class="badge badge-primary">Tauri v2</span>
          <span class="badge badge-primary">Vue 3</span>
          <span class="badge badge-primary">Bun</span>
          <span class="badge badge-primary">Anthropic SDK</span>
        </div>
      </div>
    </div>

    <!-- 危险操作 -->
    <div class="settings-group card danger-zone">
      <h3 class="group-title">⚠️ 危险操作</h3>
      <div class="setting-item">
        <div class="setting-label">
          <label>重置所有设置</label>
          <span class="setting-hint">恢复为默认配置（不可撤销）</span>
        </div>
        <button class="btn btn-danger btn-sm" @click="resetAll">重置</button>
      </div>
    </div>

    <div v-if="showResetDialog" class="modal-overlay" @click.self="showResetDialog = false">
      <div class="reset-modal card">
        <h3 class="group-title">确认重置</h3>
        <p class="reset-hint">这会恢复主题、语言、默认工作目录、Sidecar 起始端口和开机自启设置。</p>
        <div class="reset-actions">
          <button class="btn btn-ghost" @click="showResetDialog = false">取消</button>
          <button class="btn btn-danger" @click="confirmResetAll">确认重置</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, ref } from 'vue'
import { useConfigStore } from '../../stores/configStore'

const configStore = useConfigStore()
const appConfig = configStore.appConfig
const showResetDialog = ref(false)
const showToast = inject<(message: string, type?: 'success' | 'error' | 'info') => void>('showToast', () => {})

const themeOptions = [
  { value: 'system', label: '跟随系统', icon: '💻' },
  { value: 'light', label: '浅色', icon: '☀️' },
  { value: 'dark', label: '深色', icon: '🌙' },
]

const localeOptions = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
]

const shortcuts = [
  { label: '发送消息', key: 'Enter' },
  { label: '换行', key: 'Shift + Enter' },
  { label: '新建对话', key: 'Ctrl + N' },
  { label: '打开设置', key: 'Ctrl + ,' },
]

function setTheme(value: string) {
  appConfig.theme = value
  saveConfig()
}

function setLocale(value: string) {
  appConfig.locale = value
  saveConfig()
}

async function saveConfig() {
  try {
    await configStore.saveAppConfig()
    showToast('设置已保存', 'success')
  } catch (error) {
    console.error('[GeneralSettings] 保存设置失败:', error)
    showToast('设置保存失败', 'error')
  }
}

function resetAll() {
  showResetDialog.value = true
}

function resetWorkspacePath() {
  appConfig.defaultWorkspacePath = '~'
  void saveConfig()
}

function confirmResetAll() {
  appConfig.theme = 'system'
  appConfig.locale = 'zh-CN'
  appConfig.defaultWorkspacePath = '~'
  appConfig.sidecarPortStart = 31415
  appConfig.autoStart = false
  showResetDialog.value = false
  void saveConfig()
}
</script>

<style scoped>
.page-header { margin-bottom: var(--space-xl); }
.page-title { font-size: var(--font-size-xl); font-weight: 700; }
.page-desc { color: var(--color-text-tertiary); font-size: var(--font-size-sm); margin-top: 4px; }

.settings-group { margin-bottom: var(--space-md); padding: var(--space-lg); }
.group-title {
  font-size: var(--font-size-md); font-weight: 600;
  margin-bottom: var(--space-lg); color: var(--color-text-secondary);
  padding-bottom: var(--space-sm); border-bottom: 1px solid var(--color-divider);
}

.setting-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-md) 0;
}
.setting-item + .setting-item { border-top: 1px solid var(--color-border-light); }
.setting-label { display: flex; flex-direction: column; }
.setting-label label { font-size: var(--font-size-sm); font-weight: 500; color: var(--color-text-primary); }
.setting-hint { font-size: var(--font-size-xs); color: var(--color-text-tertiary); margin-top: 2px; }

/* 主题选择器 — 卡片式按钮 */
.theme-picker { display: flex; gap: var(--space-sm); }
.theme-btn {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 16px; border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md); background: var(--color-bg-card);
  cursor: pointer; transition: all var(--transition-fast);
  font-family: var(--font-sans); font-size: var(--font-size-xs);
  color: var(--color-text-secondary); min-width: 72px;
}
.theme-btn:hover { border-color: var(--color-primary-border); background: var(--color-primary-bg); }
.theme-btn.active {
  border-color: var(--color-primary); background: var(--color-primary-bg);
  color: var(--color-primary); font-weight: 600;
  box-shadow: 0 0 0 2px var(--color-primary-bg);
}
.theme-icon { font-size: 20px; }
.theme-label { white-space: nowrap; }

/* 分段控件 — segmented control */
.segmented-control {
  display: flex; border: 1px solid var(--color-border);
  border-radius: var(--radius-md); overflow: hidden;
}
.segment-btn {
  padding: 6px 16px; border: none; background: var(--color-bg-card);
  font-family: var(--font-sans); font-size: var(--font-size-sm);
  color: var(--color-text-secondary); cursor: pointer;
  transition: all var(--transition-fast);
}
.segment-btn + .segment-btn { border-left: 1px solid var(--color-border); }
.segment-btn:hover { background: var(--color-bg-hover); }
.segment-btn.active {
  background: var(--color-primary); color: var(--color-text-inverse);
  font-weight: 500;
}

/* 路径输入 */
.path-field { display: flex; gap: var(--space-xs); align-items: center; }
.path-input { max-width: 260px; font-family: var(--font-mono); font-size: var(--font-size-sm); }
.port-input { max-width: 100px; text-align: center; }
.btn-icon-sm { padding: 4px 8px; font-size: 14px; }

/* Toggle 开关 */
.toggle { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; inset: 0; background: var(--color-border); border-radius: 20px; transition: .3s; }
.slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 2px; bottom: 2px; background: white; border-radius: 50%; transition: .3s; }
.toggle input:checked + .slider { background: var(--color-primary); }
.toggle input:checked + .slider::before { transform: translateX(16px); }

/* 快捷键 */
.shortcut-list { display: flex; flex-direction: column; gap: 2px; }
.shortcut-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0;
}
.shortcut-item + .shortcut-item { border-top: 1px solid var(--color-border-light); }
.shortcut-label { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.shortcut-kbd {
  display: inline-block; padding: 2px 8px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

/* 关于 */
.about-info { text-align: center; padding: var(--space-md); }
.about-name { font-size: var(--font-size-lg); font-weight: 600; }
.about-version { color: var(--color-text-tertiary); font-weight: 400; font-size: var(--font-size-sm); }
.about-desc { color: var(--color-text-tertiary); font-size: var(--font-size-sm); margin: var(--space-sm) 0 var(--space-md); }
.about-stack { display: flex; gap: var(--space-sm); justify-content: center; }

/* 危险区域 */
.danger-zone { border-color: rgba(255, 77, 79, 0.2); }
.danger-zone .group-title { color: var(--color-error); }
.btn-sm { padding: 4px 12px; font-size: var(--font-size-xs); }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.reset-modal {
  width: min(420px, calc(100vw - 32px));
  padding: var(--space-xl);
}

.reset-hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  line-height: 1.6;
}

.reset-actions {
  margin-top: var(--space-lg);
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}
</style>
