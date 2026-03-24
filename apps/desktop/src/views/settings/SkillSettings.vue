<template>
  <div class="skill-settings">
    <div class="page-header">
      <div>
        <h2 class="page-title">技能 Skills</h2>
        <p class="page-desc">管理 Agent 可使用的内置和自定义技能模块</p>
      </div>
    </div>

    <!-- 内置技能 -->
    <div class="section">
      <h3 class="section-title">内置技能</h3>
      <div class="skill-grid">
        <div
          v-for="skill in builtinSkills"
          :key="skill.id"
          class="skill-card card"
          :class="{ 'is-enabled': skill.enabled }"
        >
          <div class="skill-icon">{{ skill.icon }}</div>
          <div class="skill-body">
            <div class="skill-header">
              <span class="skill-name">{{ skill.name }}</span>
              <label class="toggle" :title="skill.enabled ? '点击禁用' : '点击启用'">
                <input type="checkbox" v-model="skill.enabled" @change="onToggle(skill)" />
                <span class="slider"></span>
              </label>
            </div>
            <p class="skill-desc">{{ skill.description }}</p>
            <div class="skill-tags">
              <span v-for="tag in skill.tags" :key="tag" class="badge badge-primary">{{ tag }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 自定义技能 -->
    <div class="section">
      <div class="section-header">
        <h3 class="section-title">自定义技能</h3>
        <button class="btn btn-primary btn-sm" @click="showAddCustom = true">+ 添加</button>
      </div>

      <div v-if="customSkills.length === 0 && !showAddCustom" class="empty-state">
        <span class="empty-icon">🧩</span>
        <p>还没有自定义技能</p>
        <p class="empty-hint">自定义技能是一段 System Prompt，可以让 Agent 在特定场景下表现更好</p>
      </div>

      <!-- 自定义技能列表 -->
      <div v-if="customSkills.length > 0" class="custom-list">
        <div v-for="skill in customSkills" :key="skill.id" class="custom-card card">
          <div class="custom-header">
            <div class="custom-info">
              <span class="custom-name">{{ skill.name }}</span>
              <label class="toggle">
                <input type="checkbox" :checked="skill.enabled" @change="toggleCustomSkill(skill.id)" />
                <span class="slider"></span>
              </label>
            </div>
            <button class="btn-icon btn-delete" @click="requestRemoveCustomSkill(skill.id, skill.name)" title="删除">🗑️</button>
          </div>
          <p class="custom-prompt">{{ skill.prompt }}</p>
        </div>
      </div>

      <!-- 添加自定义技能表单 -->
      <div v-if="showAddCustom" class="add-form card">
        <h4 class="form-title">添加自定义技能</h4>
        <div class="form-group">
          <label>技能名称</label>
          <input class="input" v-model="newSkill.name" placeholder="例如：代码审查专家" />
        </div>
        <div class="form-group">
          <label>技能 Prompt</label>
          <textarea
            class="input textarea"
            v-model="newSkill.prompt"
            placeholder="描述这个技能的行为方式..."
            rows="4"
          ></textarea>
        </div>
        <div class="form-actions">
          <button class="btn btn-ghost" @click="showAddCustom = false">取消</button>
          <button class="btn btn-primary" @click="addCustomSkill" :disabled="!newSkill.name.trim()">添加</button>
        </div>
      </div>
    </div>

    <div v-if="deleteDialog.visible" class="modal-overlay" @click.self="closeDeleteDialog">
      <div class="delete-modal card">
        <h4 class="form-title">删除自定义技能</h4>
        <p class="delete-hint">删除后将移除这条自定义 Prompt 配置。</p>
        <div class="delete-name">{{ deleteDialog.skillName }}</div>
        <div class="form-actions">
          <button class="btn btn-ghost" @click="closeDeleteDialog">取消</button>
          <button class="btn btn-danger" @click="confirmRemoveCustomSkill">确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, inject } from 'vue'
import { useSkillStore } from '../../stores/skillStore'

const skillStore = useSkillStore()

const builtinSkills = skillStore.builtinSkills
const customSkills = skillStore.customSkills

const showAddCustom = ref(false)
const newSkill = reactive({ name: '', prompt: '' })
const deleteDialog = reactive({ visible: false, skillId: '', skillName: '' })
const showToast = inject<(message: string, type?: 'success' | 'error' | 'info') => void>('showToast', () => {})

async function onToggle(skill: { id: string; enabled: boolean }) {
  try {
    await skillStore.toggleBuiltin(skill.id)
    showToast(skill.enabled ? '技能已启用' : '技能已禁用', 'success')
  } catch (error) {
    skill.enabled = !skill.enabled
    console.error('[SkillSettings] 切换内置技能失败:', error)
    showToast('技能状态保存失败', 'error')
  }
}

async function addCustomSkill() {
  if (!newSkill.name.trim()) return
  try {
    await skillStore.addCustomSkill(newSkill.name, newSkill.prompt)
    newSkill.name = ''
    newSkill.prompt = ''
    showAddCustom.value = false
    showToast('自定义技能已添加', 'success')
  } catch (error) {
    console.error('[SkillSettings] 添加自定义技能失败:', error)
    showToast('自定义技能添加失败', 'error')
  }
}

async function toggleCustomSkill(id: string) {
  const skill = customSkills.find(item => item.id === id)
  if (!skill) return
  try {
    await skillStore.toggleCustomSkill(id)
    showToast(skill.enabled ? '自定义技能已启用' : '自定义技能已禁用', 'success')
  } catch (error) {
    skill.enabled = !skill.enabled
    console.error('[SkillSettings] 切换自定义技能失败:', error)
    showToast('自定义技能状态保存失败', 'error')
  }
}

function requestRemoveCustomSkill(id: string, name: string) {
  deleteDialog.visible = true
  deleteDialog.skillId = id
  deleteDialog.skillName = name
}

function closeDeleteDialog() {
  deleteDialog.visible = false
  deleteDialog.skillId = ''
  deleteDialog.skillName = ''
}

async function confirmRemoveCustomSkill() {
  try {
    await skillStore.removeCustomSkill(deleteDialog.skillId)
    closeDeleteDialog()
    showToast('自定义技能已删除', 'success')
  } catch (error) {
    console.error('[SkillSettings] 删除自定义技能失败:', error)
    showToast('自定义技能删除失败', 'error')
  }
}
</script>

<style scoped>
.page-header { margin-bottom: var(--space-xl); }
.page-title { font-size: var(--font-size-xl); font-weight: 700; }
.page-desc { color: var(--color-text-tertiary); font-size: var(--font-size-sm); margin-top: 4px; }

.section { margin-bottom: var(--space-2xl); }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-md); }
.section-title { font-size: var(--font-size-md); font-weight: 600; color: var(--color-text-secondary); margin-bottom: var(--space-md); }
.section-header .section-title { margin-bottom: 0; }

.skill-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-md); }

.skill-card {
  display: flex; gap: var(--space-md); padding: var(--space-md);
  transition: all var(--transition-normal); border: 1px solid var(--color-border-light);
}
.skill-card.is-enabled { border-color: var(--color-primary-border); }
.skill-card:hover { box-shadow: var(--shadow-md); }

.skill-icon { font-size: 28px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: var(--color-bg-secondary); border-radius: var(--radius-md); flex-shrink: 0; }
.skill-card.is-enabled .skill-icon { background: var(--color-primary-bg); }

.skill-body { flex: 1; min-width: 0; }
.skill-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.skill-name { font-weight: 600; font-family: var(--font-mono); font-size: var(--font-size-sm); }
.skill-desc { font-size: var(--font-size-xs); color: var(--color-text-tertiary); margin-bottom: var(--space-xs); }
.skill-tags { display: flex; gap: 4px; }
.skill-tags .badge { font-size: 10px; padding: 1px 6px; }

/* Toggle 开关 */
.toggle { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; inset: 0; background: var(--color-border); border-radius: 20px; transition: .3s; }
.slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 2px; bottom: 2px; background: white; border-radius: 50%; transition: .3s; }
.toggle input:checked + .slider { background: var(--color-primary); }
.toggle input:checked + .slider::before { transform: translateX(16px); }

/* 空状态 */
.empty-state { display: flex; flex-direction: column; align-items: center; padding: var(--space-2xl); color: var(--color-text-tertiary); gap: var(--space-sm); }
.empty-icon { font-size: 40px; opacity: 0.4; }
.empty-hint { font-size: var(--font-size-xs); max-width: 300px; text-align: center; }

/* 自定义技能 */
.custom-list { display: flex; flex-direction: column; gap: var(--space-md); }
.custom-card { padding: var(--space-md); }
.custom-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-sm); }
.custom-info { display: flex; align-items: center; gap: var(--space-md); }
.custom-name { font-weight: 600; }
.custom-prompt { font-size: var(--font-size-sm); color: var(--color-text-tertiary); white-space: pre-wrap; max-height: 80px; overflow: hidden; }
.btn-icon { background: none; border: none; cursor: pointer; font-size: 16px; padding: 4px; border-radius: var(--radius-sm); transition: all var(--transition-fast); }
.btn-delete:hover { background: rgba(255, 77, 79, 0.1); }
.btn-danger { background: var(--color-error); color: #fff; border: none; }
.btn-danger:hover { filter: brightness(0.95); }

/* 添加表单 */
.add-form { padding: var(--space-lg); }
.form-title { font-size: var(--font-size-md); font-weight: 600; margin-bottom: var(--space-md); }
.form-group { margin-bottom: var(--space-md); }
.form-group label { display: block; font-size: var(--font-size-sm); font-weight: 500; margin-bottom: var(--space-xs); color: var(--color-text-primary); }
.textarea { resize: vertical; min-height: 80px; font-family: var(--font-sans); line-height: 1.5; }
.form-actions { display: flex; justify-content: flex-end; gap: var(--space-sm); }
.btn-sm { padding: 4px 12px; font-size: var(--font-size-xs); }

.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  z-index: 1000;
}

.delete-modal {
  width: min(420px, calc(100vw - 32px));
  padding: var(--space-xl);
}

.delete-hint {
  margin: 0 0 var(--space-md);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

.delete-name {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  font-weight: 600;
  margin-bottom: var(--space-md);
}
</style>
