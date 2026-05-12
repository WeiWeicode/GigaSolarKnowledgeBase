<template>
  <transition name="panel">
    <div v-if="modelValue" class="panel-overlay" @click.self="close">
      <div class="side-panel">
        <div class="panel-header">
          <span class="panel-title">
            <el-icon><Clock /></el-icon> 修改紀錄
          </span>
          <el-button text circle @click="close"><el-icon><Close /></el-icon></el-button>
        </div>

        <div class="panel-body">
          <div v-if="loading"><el-skeleton :rows="5" animated /></div>
          <div v-else-if="versions.length === 0">
            <el-empty description="尚無版本紀錄" :image-size="60" />
          </div>
          <div v-else class="version-list">
            <div
              v-for="v in versions"
              :key="v.versionNumber"
              class="version-item"
              :class="{ current: v.versionNumber === currentVersion }"
            >
              <div class="version-badge">v{{ v.versionNumber }}</div>
              <div class="version-info">
                <div class="version-editor">{{ v.editorName }}</div>
                <div class="version-time">{{ formatDateTime(v.savedAt) }}</div>
                <div class="version-diff" v-if="v.diffSummary">{{ v.diffSummary }}</div>
              </div>
              <div class="version-actions">
                <!-- 預覽：跳到 /article/:id?version=N (查看模式) -->
                <el-button
                  size="small" text type="primary"
                  @click="preview(v.versionNumber)"
                >預覽</el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch } from 'vue'
import { versionService } from '@/services/api.js'
import { formatDateTime } from '@/utils/dateFormat.js'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: Boolean,
  articleId: { type: Number, default: null },
})
const emit = defineEmits(['update:modelValue', 'preview'])

const versions = ref([])
const loading = ref(false)
const currentVersion = ref(0)

function close() { emit('update:modelValue', false) }

async function loadVersions() {
  if (!props.articleId) return
  loading.value = true
  try {
    versions.value = await versionService.getByArticleId(props.articleId)
    if (versions.value.length > 0) currentVersion.value = versions.value[0].versionNumber
  } finally { loading.value = false }
}

// 預覽：關閉面板，讓父層跳轉到 /article/:id?version=N
function preview(versionNumber) {
  emit('preview', props.articleId, versionNumber)
}

watch(() => props.modelValue, v => { if (v) loadVersions() })
</script>

<style scoped>
.panel-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.3); z-index: 1000;
  display: flex; justify-content: flex-end;
}
.side-panel {
  width: 360px; background: var(--color-surface);
  height: 100%; display: flex; flex-direction: column;
  box-shadow: var(--shadow-lg);
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
}
.panel-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 700; color: var(--color-text-primary);
}
.panel-body { flex: 1; overflow-y: auto; padding: 16px 20px; }

.version-list { display: flex; flex-direction: column; gap: 10px; }

.version-item {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 12px; border-radius: var(--border-radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  transition: all var(--transition);
}
.version-item:hover { border-color: var(--color-primary); background: var(--color-primary-light); }
.version-item.current { border-color: var(--color-success); background: #f0fdf4; }

.version-badge {
  background: var(--color-primary);
  color: #fff;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  height: 22px;
  display: flex;
  align-items: center;
}
.version-item.current .version-badge { background: var(--color-success); }

.version-info { flex: 1; min-width: 0; }
.version-editor { font-size: 13px; font-weight: 600; color: var(--color-text-primary); }
.version-time { font-size: 11px; color: var(--color-text-muted); margin: 2px 0; }
.version-diff { font-size: 12px; color: var(--color-text-secondary); }

.version-actions { display: flex; gap: 4px; flex-shrink: 0; }

.panel-enter-active, .panel-leave-active { transition: opacity 0.25s ease; }
.panel-enter-active .side-panel, .panel-leave-active .side-panel { transition: transform 0.28s cubic-bezier(.4,0,.2,1); }
.panel-enter-from, .panel-leave-to { opacity: 0; }
.panel-enter-from .side-panel, .panel-leave-to .side-panel { transform: translateX(100%); }
</style>
