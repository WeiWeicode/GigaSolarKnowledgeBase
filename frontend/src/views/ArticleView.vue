<template>
  <div class="article-view">
    <!-- Loading -->
    <div v-if="loading" class="page-loading">
      <el-skeleton :rows="8" animated />
    </div>

    <template v-else>
      <!-- Page Header -->
      <div class="article-header">
        <div class="header-left-col">
          <!-- 編輯模式退回按鈕 -->
          <el-button
            v-if="isEditing && mode !== 'create'"
            text circle
            class="back-btn"
            title="退回查看"
            @click="cancelEdit"
          >
            <el-icon size="18"><ArrowLeft /></el-icon>
          </el-button>

          <div class="ai-badge" @click="showAiPanel = true">
            <el-icon><MagicStick /></el-icon>
            <span>AI 輔助</span>
          </div>
          <el-input
            v-if="isEditing || mode === 'create'"
            v-model="form.title"
            placeholder="輸入文章標題（將顯示於目錄樹）"
            size="large"
            class="title-input"
          />
          <h1 v-else class="article-title">{{ form.title || '（未命名文章）' }}</h1>
        </div>

        <div class="header-right-col">
          <div class="meta-dates">
            <span class="meta-item">建立：{{ formatDateTime(article?.createdAt) }}</span>
            <span class="meta-item">更新：{{ formatDateTime(article?.updatedAt) }}</span>
          </div>
          <div class="header-actions">
            <!-- 預覽舊版本時顯示返回最新版本按鈕 -->
            <el-button v-if="route.query.version" type="primary" plain @click="returnToLatestVersion">
              <el-icon><RefreshLeft /></el-icon> 返回最新版本
            </el-button>

            <el-button v-if="!isEditing && mode !== 'create' && canEdit" type="primary" @click="startEdit">
              <el-icon><Edit /></el-icon> 編輯
            </el-button>
            <el-button v-if="isEditing && mode !== 'create'" type="success" :loading="saving" @click="saveArticle">
              <el-icon><Check /></el-icon> 儲存
            </el-button>
            <el-button v-if="mode === 'create'" type="warning" :loading="saving" @click="createArticle">
              <el-icon><Plus /></el-icon> 建立
            </el-button>
          </div>
        </div>
      </div>

      <!-- Form Fields -->
      <el-collapse-transition>
        <div v-if="isEditing || mode === 'create'" class="form-fields kb-card">
          <el-row :gutter="20">
            <el-col :span="12">
              <div class="field-group">
                <label class="field-label">所屬目錄</label>
                <el-button plain size="small" @click="showDirPicker = true">
                  <el-icon><Folder /></el-icon> 選擇目錄（可多選）
                </el-button>
                <div class="selected-dirs" v-if="form.directories.length">
                  <el-tag v-for="d in form.directories" :key="d" closable size="small" @close="removeDir(d)">{{ getDirLabel(d) }}</el-tag>
                </div>
              </div>

              <div class="field-group">
                <label class="field-label">標籤</label>
                <el-select
                  v-model="form.tagIds"
                  multiple filterable allow-create
                  placeholder="選擇或輸入新標籤"
                  size="small" class="full-width"
                  @create="createTag"
                >
                  <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.id" />
                </el-select>
              </div>

              <div class="field-group">
                <label class="field-label">文件上架</label>
                <el-radio-group v-model="form.isPublished" size="small">
                  <el-radio :value="true">上架</el-radio>
                  <el-radio :value="false">下架（移至垃圾桶）</el-radio>
                </el-radio-group>
              </div>

              <div class="field-group">
                <label class="field-label">文章編輯權限</label>
                <el-button plain size="small" @click="showEditorPicker = true">
                  <el-icon><User /></el-icon> 指定可編輯同仁
                </el-button>
                <div class="selected-editors" v-if="selectedEditors.length">
                  <el-tag v-for="e in selectedEditors" :key="e.員工工號" size="small" closable @close="removeEditor(e.員工工號)">
                    {{ e.員工姓名 }}
                  </el-tag>
                </div>
              </div>
            </el-col>

            <el-col :span="12">
              <div class="field-group">
                <label class="field-label">附件</label>
                <el-button plain size="small" @click="showAttachPicker = true">
                  <el-icon><Paperclip /></el-icon> 關聯文件（可多選）
                </el-button>
                <div v-if="form.attachmentIds.length" style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">
                  <el-tag v-for="attId in form.attachmentIds" :key="attId" size="small" closable @close="removeAttachment(attId)">
                    {{ getAttachmentName(attId) }}
                  </el-tag>
                </div>
              </div>

              <div class="field-group">
                <label class="field-label">是否公開</label>
                <el-radio-group v-model="form.isPublic" size="small">
                  <el-radio :value="true">公開（所有登入者可見）</el-radio>
                  <el-radio :value="false">部門私有</el-radio>
                </el-radio-group>
              </div>

              <div class="field-group">
                <label class="field-label">修改說明</label>
                <el-input
                  v-model="form.changeNote"
                  type="textarea"
                  :rows="2"
                  placeholder="簡述本次修改內容（將記錄於修改紀錄）"
                  size="small"
                  resize="none"
                />
              </div>

              <div class="field-group side-btns">
                <el-button plain @click="showCommentPanel = true">
                  <el-icon><ChatDotSquare /></el-icon> 評論
                </el-button>
                <el-button plain @click="showHistoryPanel = true">
                  <el-icon><Clock /></el-icon> 修改紀錄
                </el-button>
              </div>

              <div v-if="collaboratorName" class="collab-notice">
                <el-icon><Warning /></el-icon>
                {{ collaboratorName }} 正在編輯此文章
              </div>
            </el-col>
          </el-row>
        </div>
      </el-collapse-transition>

      <!-- View mode action bar -->
      <div v-if="mode === 'view' && !isEditing" class="view-action-bar">
        <el-button plain @click="showCommentPanel = true">
          <el-icon><ChatDotSquare /></el-icon> 評論
        </el-button>
        <el-button plain @click="showHistoryPanel = true" class="history-btn">
          <el-icon><Clock /></el-icon>
          <span>修改紀錄 v{{ latestVersionNumber }}</span>
          <span v-if="article?.updatedAt" class="history-date">&nbsp;· {{ formatDateTime(article.updatedAt) }}</span>
        </el-button>
      </div>

      <!-- ✅ Markdown Editor / Viewer -->
      <div class="editor-container kb-card">
        <!-- 編輯模式：Vditor 掛載點，key 強制重建避免殘留 DOM -->
        <template v-if="isEditing || mode === 'create'">
          <div :key="editorKey" ref="vditorRef" class="vditor-host" />
        </template>

        <!-- 閱讀模式：Vditor.preview 靜態渲染 -->
        <div v-else ref="vditorPreviewRef" class="markdown-body" />
      </div>

      <!-- AI Result Preview -->
      <transition name="fade">
        <div v-if="aiPreview" class="ai-preview kb-card">
          <div class="ai-preview-header">
            <span>✨ AI 產生的內容預覽</span>
            <div class="ai-preview-actions">
              <el-button type="primary" size="small" @click="applyAiContent(aiPreview)">套用</el-button>
              <el-button size="small" @click="aiPreview = null">捨棄</el-button>
            </div>
          </div>
          <div ref="aiPreviewRef" class="markdown-body" />
        </div>
      </transition>
    </template>

    <!-- Panels -->
    <CommentPanel v-model="showCommentPanel" :article-id="id" />
    <VersionHistoryPanel v-model="showHistoryPanel" :article-id="id" @preview="onVersionPreview" />
    <AiChatPanel v-model="showAiPanel" :context-content="form.content" @apply="applyAiContent" />

    <!-- Pickers -->
    <el-dialog v-model="showDirPicker" title="選擇目錄" width="500px">
      <el-tree
        ref="dirTreeRef"
        :data="dirPickerTree"
        :props="{ label: 'label', children: 'children', disabled: data => data.type !== 'directory' }"
        show-checkbox check-strictly check-on-click-node
        node-key="id" default-expand-all
      />
      <template #footer>
        <el-button @click="showDirPicker = false">取消</el-button>
        <el-button type="primary" @click="confirmDirSelection">確認</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAttachPicker" title="關聯文件" width="600px">
      <el-table :data="allAttachments" @selection-change="handleAttachSelection" row-key="id" ref="attachTableRef">
        <el-table-column type="selection" width="55" />
        <el-table-column prop="files[0].name" label="檔名" />
        <el-table-column prop="description" label="描述" />
      </el-table>
      <template #footer>
        <el-button @click="showAttachPicker = false">取消</el-button>
        <el-button type="primary" @click="confirmAttachSelection">確認</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showEditorPicker" title="指定可編輯同仁" width="500px">
      <el-checkbox-group v-model="tempEditors" class="editor-checkbox-group">
        <div v-for="c in currentDeptColleagues" :key="c.員工工號" class="editor-checkbox-item">
          <el-checkbox :value="c.員工工號" :label="c.員工工號">
            {{ c.員工姓名 }} <span class="dept-name">({{ c.部門名稱 }})</span>
          </el-checkbox>
        </div>
      </el-checkbox-group>
      <div v-if="currentDeptColleagues.length === 0" class="no-data">該部門目前無同仁資料</div>
      <template #footer>
        <el-button @click="showEditorPicker = false">取消</el-button>
        <el-button type="primary" @click="confirmEditorSelection">確認</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch, markRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth.js'
import { useDirectoryStore } from '@/store/directory.js'
import { articleService, tagService, colleagueService, attachmentService } from '@/services/api.js'
import { formatDateTime } from '@/utils/dateFormat.js'
import { ElMessage, ElMessageBox } from 'element-plus'
// ✅ 正確 import：直接 default import，不需要 .default 取法
// ✅ CSS 已移至 main.js 全域載入，這裡不再 import
import Vditor from 'vditor'
import CommentPanel from '@/components/panels/CommentPanel.vue'
import VersionHistoryPanel from '@/components/panels/VersionHistoryPanel.vue'
import AiChatPanel from '@/components/panels/AiChatPanel.vue'

const props = defineProps({
  id: { type: Number, default: null },
  mode: { type: String, default: 'view' },
})

const auth = useAuthStore()
const dirStore = useDirectoryStore()
const router = useRouter()
const route = useRoute()

const loading = ref(false)
const saving = ref(false)
const article = ref(null)
const tags = ref([])
const colleagues = ref([])
const allAttachments = ref([])

// ✅ 關鍵修正：Vditor instance 不能放進 Vue reactive 系統
// 使用普通變數，避免 Proxy 包裹破壞 Vditor 內部狀態
let vditorInstance = null

// editorKey 用來強制重建 Vditor 掛載點 DOM
const editorKey = ref(0)
const vditorRef = ref(null)
const vditorPreviewRef = ref(null)
const aiPreviewRef = ref(null)
const aiPreview = ref(null)
const collaboratorName = ref('')

const showCommentPanel = ref(false)
const showHistoryPanel = ref(false)
const showAiPanel = ref(false)
const showDirPicker = ref(false)
const showAttachPicker = ref(false)
const showEditorPicker = ref(false)
const dirTreeRef = ref(null)
const attachTableRef = ref(null)
const tempEditors = ref([])
const tempAttachSelection = ref([])

const isEditing = ref(props.mode === 'edit')

const form = reactive({
  title: '',
  content: '',
  isPublished: true,
  isPublic: false,
  directories: [],
  tagIds: [],
  attachmentIds: [],
  editorIds: [],
  changeNote: '',
})

// ─── Computed ────────────────────────────────────────────────
const selectedEditors = computed(() =>
  colleagues.value.filter(c => form.editorIds.includes(c.員工工號))
)

const currentDeptColleagues = computed(() => {
  if (!dirStore.currentDept) return colleagues.value
  return colleagues.value.filter(c => c.部門代碼 === dirStore.currentDept)
})

const dirPickerTree = computed(() => {
  const DIR_TYPES = new Set(['company', 'department', 'directory'])
  function filterDirs(nodes) {
    if (!nodes) return []
    return nodes
      .filter(n => DIR_TYPES.has(n.type))
      .map(n => ({ ...n, children: n.children ? filterDirs(n.children) : undefined }))
  }
  return filterDirs(dirStore.filteredTree)
})

const canEdit = computed(() => {
  if (dirStore.viewScope === 'public') return false
  if (!article.value) return false
  if (route.query.version) return false // 預覽舊版本時不允許編輯
  if (auth.isAdmin || auth.isManager) return true
  return article.value.editorIds?.includes(auth.user?.員工工號) ||
         article.value.createdBy?.員工工號 === auth.user?.員工工號
})

// 取最新版本號（優先從 article 除取，如未存在則直接顯示 1）
const latestVersionNumber = computed(() => article.value?.versionNumber || 1)

// ─── Vditor ──────────────────────────────────────────────────
async function initVditor() {
  // 先銷毀舊實例
  destroyVditor()
  // 遞增 key → Vue 會重建 DOM → 確保拿到全新的空白 div
  editorKey.value++
  // 等 DOM 重建完成
  await nextTick()
  await nextTick() // 兩次 nextTick 確保 v-if + :key 都更新完

  if (!vditorRef.value) {
    console.warn('[Vditor] ref 還未掛載，初始化取消')
    return
  }

  const initialContent = form.content || ''

  // ✅ 不要把 new Vditor() 放進 ref/reactive，直接存到普通變數
  vditorInstance = new Vditor(vditorRef.value, {
    height: 520,
    mode: 'ir',
    placeholder: '使用 Markdown 撰寫文章內容...',
    toolbarConfig: { pin: true },
    cache: { enable: false }, // 關閉 localStorage cache，避免殘留舊內容
    after() {
      // after 是 Vditor 初始化完畢的 callback，此時才能 setValue
      vditorInstance?.setValue(initialContent)
    },
    input(val) {
      form.content = val
    },
    upload: {
      url: '/api/articles/upload-image',
      headers: { Authorization: `Bearer ${sessionStorage.getItem('kb_token')}` },
      fieldName: 'image',
    },
  })
}

function destroyVditor() {
  if (vditorInstance) {
    try { vditorInstance.destroy() } catch { /* ignore */ }
    vditorInstance = null
  }
}

// ─── Preview (閱讀模式) ───────────────────────────────────────
async function renderPreview() {
  await nextTick()
  if (!vditorPreviewRef.value || !article.value) return
  Vditor.preview(vditorPreviewRef.value, article.value.content || '', {
    mode: 'light',
  })
}

// ─── Actions ─────────────────────────────────────────────────
function startEdit() {
  isEditing.value = true
  initVditor()
}

function cancelEdit() {
  destroyVditor()
  isEditing.value = false
  // 在取消編輯後重新渲染預覽以確保內容正確
  nextTick(() => renderPreview())
}

async function saveArticle() {
  if (!form.title.trim()) return ElMessage.warning('請輸入文章標題')
  saving.value = true
  try {
    if (vditorInstance) form.content = vditorInstance.getValue()
    await articleService.update(props.id, { ...form })
    ElMessage.success('已儲存')
    form.changeNote = '' // 儲存後清空修改說明
    isEditing.value = false
    destroyVditor()
    await loadArticle()
    await renderPreview()
    await dirStore.fetchTree(dirStore.currentCompany, dirStore.currentDept)
  } finally {
    saving.value = false
  }
}

async function createArticle() {
  if (!form.title.trim()) return ElMessage.warning('請輸入文章標題')
  if (form.directories.length === 0) return ElMessage.warning('請選擇所屬目錄')
  saving.value = true
  try {
    if (vditorInstance) form.content = vditorInstance.getValue()
    const created = await articleService.create({ ...form })
    ElMessage.success('文章建立成功')
    await dirStore.fetchTree(dirStore.currentCompany, dirStore.currentDept)
    router.push(`/article/${created.id}`)
  } finally {
    saving.value = false
  }
}

function applyAiContent(content) {
  if (vditorInstance) vditorInstance.setValue(content)
  form.content = content
  aiPreview.value = null
}



function onVersionPreview(articleId, versionNumber) {
  showHistoryPanel.value = false
  router.push(`/article/${articleId}?version=${versionNumber}`)
}

function returnToLatestVersion() {
  router.push(`/article/${props.id}`)
}

// ─── Directory / Attachment / Editor Pickers ─────────────────
function removeDir(id) { form.directories = form.directories.filter(d => d !== id) }
function removeEditor(id) { form.editorIds = form.editorIds.filter(e => e !== id) }
function removeAttachment(id) { form.attachmentIds = form.attachmentIds.filter(a => a !== id) }

function confirmDirSelection() {
  const nodes = dirTreeRef.value?.getCheckedNodes(false, false) || []
  form.directories = nodes.filter(n => n.type === 'directory').map(n => n.id)
  showDirPicker.value = false
}
function getDirLabel(id) {
  let label = String(id)
  function find(nodes) {
    for (const n of nodes) {
      if (n.id === id) { label = n.label; return }
      if (n.children) find(n.children)
    }
  }
  find(dirStore.tree || [])
  return label
}

function handleAttachSelection(sel) { tempAttachSelection.value = sel }
function confirmAttachSelection() {
  form.attachmentIds = tempAttachSelection.value.map(a => a.id)
  showAttachPicker.value = false
}
function getAttachmentName(id) {
  return allAttachments.value.find(a => a.id === id)?.files?.[0]?.name || String(id)
}

watch(showEditorPicker, val => { if (val) tempEditors.value = [...form.editorIds] })
function confirmEditorSelection() {
  form.editorIds = [...tempEditors.value]
  showEditorPicker.value = false
}

watch(showDirPicker, async val => {
  if (val) { await nextTick(); dirTreeRef.value?.setCheckedKeys(form.directories) }
})
watch(showAttachPicker, async val => {
  if (val) {
    await nextTick()
    attachTableRef.value?.clearSelection()
    form.attachmentIds.forEach(id => {
      const row = allAttachments.value.find(a => a.id === id)
      if (row) attachTableRef.value?.toggleRowSelection(row, true)
    })
  }
})

watch(aiPreview, async val => {
  if (val && aiPreviewRef.value) {
    await nextTick()
    Vditor.preview(aiPreviewRef.value, val, { mode: 'light' })
  }
})

// ─── Load Article ─────────────────────────────────────────────
async function loadArticle() {
  if (!props.id) return
  loading.value = true
  try {
    const versionParam = route.query.version || null
    const res = await articleService.getById(props.id, versionParam)
    article.value = res
    Object.assign(form, {
      title: res.title || '',
      content: res.content || '',
      isPublished: res.isPublished ?? true,
      isPublic: res.isPublic ?? false,
      directories: res.directories || [],
      tagIds: res.tags?.map(t => t.id) || [],
      attachmentIds: res.attachmentIds || [],
      editorIds: res.editorIds || [],
      changeNote: '',
    })
  } catch (err) {
    ElMessage.error('無法載入文章：' + err.message)
  } finally {
    loading.value = false
  }
}

// ─── Tags ─────────────────────────────────────────────────────
async function createTag(name) {
  const t = await tagService.create(name)
  tags.value.push(t)
  form.tagIds.push(t.id)
}

// ─── Draft Auto-save ──────────────────────────────────────────
let draftTimer = null
function startDraftTimer() {
  draftTimer = setInterval(() => {
    if (vditorInstance) form.content = vditorInstance.getValue()
    sessionStorage.setItem('kb_draft_' + (props.id || 'new'), JSON.stringify(form))
  }, 60000)
}

// ─── Lifecycle ───────────────────────────────────────────────
onMounted(async () => {
  ;[tags.value, colleagues.value, allAttachments.value] = await Promise.all([
    tagService.getAll(),
    colleagueService.getAll(),
    attachmentService.getAll(),
  ])

  if (props.mode === 'create') {
    await initVditor()
  } else {
    await loadArticle()
    if (isEditing.value) {
      await initVditor()
    } else {
      await renderPreview()
    }
  }

  startDraftTimer()
})

onBeforeUnmount(() => {
  destroyVditor()
  clearInterval(draftTimer)
})

// 路由參數或查詢字串切換（例如切換文章或切換預覽版本）
watch(() => [props.mode, props.id, route.query.version], async ([newMode, newId, newVer], [oldMode, oldId, oldVer]) => {
  if (newMode === 'create') {
    isEditing.value = false
    article.value = null
    Object.assign(form, {
      title: '', content: '', isPublished: true, isPublic: false,
      directories: [], tagIds: [], attachmentIds: [], editorIds: [],
    })
    await initVditor()
  } else if ((newId && newId !== oldId) || newVer !== oldVer) {
    isEditing.value = newMode === 'edit'
    await loadArticle()
    if (isEditing.value) {
      await initVditor()
    } else {
      destroyVditor()
      await renderPreview()
    }
  }
})
</script>

<style scoped>
.article-view {
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-loading { padding: 24px 0; }

.article-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
}

.header-left-col {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #7c3aed, #a855f7);
  color: #fff;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 2px 8px rgba(124,58,237,.3);
}
.ai-badge:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(124,58,237,.4); }

.article-title {
  font-size: 22px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-input { font-size: 18px; font-weight: 600; }

.header-right-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.meta-dates { display: flex; gap: 12px; flex-wrap: wrap; }
.meta-item { font-size: 11px; color: var(--color-text-muted, #999); }
.header-actions { display: flex; gap: 8px; }

.form-fields { padding: 20px 24px; }
.field-group { margin-bottom: 16px; }

.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, #666);
  margin-bottom: 6px;
}

.full-width { width: 100%; }

.selected-dirs, .selected-editors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.side-btns { display: flex; gap: 8px; }

.collab-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 8px 12px;
  margin-top: 12px;
}

.view-action-bar { display: flex; gap: 10px; }

/* ✅ editor-container 要有明確高度，Vditor 才能正確撐開 */
.editor-container {
  min-height: 520px;
  overflow: hidden;
  padding: 0;
}

/* ✅ vditor-host 不設 height:100%，讓 Vditor options.height 自己控制 */
.vditor-host {
  width: 100%;
}

.markdown-body {
  padding: 28px 32px;
  line-height: 1.8;
  font-size: 14px;
}
:deep(.markdown-body h1) { font-size: 22px; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 16px; }
:deep(.markdown-body h2) { font-size: 18px; margin: 20px 0 10px; }
:deep(.markdown-body h3) { font-size: 15px; margin: 16px 0 8px; }
:deep(.markdown-body code) { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
:deep(.markdown-body pre) { margin: 12px 0; border-radius: 6px; overflow-x: auto; }
:deep(.markdown-body pre code) { background: none; padding: 0; }
:deep(.markdown-body blockquote) { border-left: 4px solid #6366f1; padding-left: 16px; color: #666; margin: 12px 0; }
:deep(.markdown-body table) { border-collapse: collapse; width: 100%; margin: 12px 0; }
:deep(.markdown-body th, .markdown-body td) { border: 1px solid #e5e7eb; padding: 8px 12px; font-size: 13px; }
:deep(.markdown-body th) { background: #f9fafb; font-weight: 600; }

.ai-preview { border: 2px solid #a855f7; }
.ai-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #e9d5ff;
  background: linear-gradient(135deg, #faf5ff, #f5f3ff);
  font-size: 13px;
  font-weight: 600;
  color: #7c3aed;
}
.ai-preview-actions { display: flex; gap: 8px; }

.editor-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}
.editor-checkbox-item { margin-bottom: 4px; }
.dept-name { color: #999; font-size: 12px; margin-left: 4px; }
.no-data { color: #999; text-align: center; padding: 20px; }

/* Vditor 覆蓋：讓 toolbar 跟主題一致 */
:deep(.vditor) { border-radius: 8px; border-color: #e5e7eb; }
:deep(.vditor-toolbar) { border-radius: 8px 8px 0 0; }
</style>
