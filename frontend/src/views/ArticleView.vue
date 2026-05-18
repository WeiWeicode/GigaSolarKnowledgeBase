<template>
  <div class="article-view">
    <div v-if="loading" class="page-loading">
      <el-skeleton :rows="8" animated />
    </div>

    <template v-else>
      <div class="article-header">
        <div class="header-left-col">
          <el-button v-if="isEditing && mode !== 'create'" text circle class="back-btn" title="退回查看" @click="cancelEdit">
            <el-icon size="18"><ArrowLeft /></el-icon>
          </el-button>
          <div class="ai-badge" @click="showAiPanel = true">
            <el-icon><MagicStick /></el-icon>
            <span>AI 輔助</span>
          </div>
          <el-input v-if="isEditing || mode === 'create'" v-model="form.title" placeholder="輸入文章標題（將顯示於目錄樹）" size="large" class="title-input" />
          <h1 v-else class="article-title">{{ form.title || '（未命名文章）' }}</h1>
        </div>
        <div class="header-right-col">
          <div class="meta-dates">
            <span class="meta-item">建立：{{ formatDateTime(article?.createdAt) }}</span>
            <span class="meta-item">更新：{{ formatDateTime(article?.updatedAt) }}</span>
          </div>
          <div class="header-actions">
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

      <el-collapse-transition>
        <div v-if="isEditing || mode === 'create'" class="form-fields kb-card">

          <!-- 分類資訊 -->
          <div class="section-block">
            <div class="section-title-small"><el-icon><Collection /></el-icon> 分類資訊</div>
            <el-row :gutter="40">
              <el-col :span="12">
                <div class="field-group">
                  <label class="field-label">所屬目錄</label>
                  <el-button plain size="small" @click="showDirPicker = true" class="full-width" :disabled="!form.isPublished">
                    <el-icon><Folder /></el-icon> 選擇目錄
                  </el-button>
                  <div class="selected-dirs" v-if="form.directories.length">
                    <el-tag v-for="d in form.directories" :key="d" :closable="form.isPublished" size="small" @close="removeDir(d)">{{ getDirLabel(d) }}</el-tag>
                  </div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="field-group">
                  <label class="field-label">附件</label>
                  <el-button plain size="small" @click="showAttachPicker = true" class="full-width">
                    <el-icon><Paperclip /></el-icon> 關聯文件
                  </el-button>
                  <div v-if="form.attachmentIds.length" class="selected-tags-box">
                    <el-tag v-for="attId in form.attachmentIds" :key="attId" size="small" closable @close="removeAttachment(attId)">{{ getAttachmentName(attId) }}</el-tag>
                  </div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="field-group mb-0">
                  <label class="field-label">標籤</label>
                  <el-select v-model="form.tagIds" multiple filterable allow-create placeholder="選擇或輸入標籤" size="small" class="full-width" @create="createTag">
                    <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.id" />
                  </el-select>
                </div>
              </el-col>
            </el-row>
          </div>

          <el-divider />

          <!-- 權限設定 -->
          <div class="section-block">
            <div class="section-title-small"><el-icon><Lock /></el-icon> 權限設定</div>
            <el-row :gutter="40">
              <el-col :span="12">
                <div class="field-group">
                  <label class="field-label">是否公開</label>
                  <el-radio-group v-model="form.isPublic" size="small">
                    <el-radio :value="true">全集團公開</el-radio>
                    <el-radio :value="false">部門私有</el-radio>
                  </el-radio-group>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="field-group">
                  <label class="field-label">文章編輯權限</label>
                  <el-button plain size="small" @click="showEditorPicker = true" class="full-width">
                    <el-icon><User /></el-icon> 指定可編輯同仁
                  </el-button>
                  <div class="selected-tags-box" v-if="selectedEditors.length">
                    <el-tag v-for="e in selectedEditors" :key="e.員工工號" size="small" closable @close="removeEditor(e.員工工號)">{{ e.員工姓名 }}</el-tag>
                  </div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="field-group mb-0">
                  <label class="field-label">查看權限 – 指定人員</label>
                  <el-select v-model="form.hasAccess.人員" multiple filterable placeholder="空白代表部門全員" size="small" class="full-width">
                    <el-option v-for="c in currentDeptColleagues" :key="c.員工工號" :label="c.員工姓名" :value="c.員工工號" />
                  </el-select>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="field-group mb-0">
                  <!-- ✅ 查看職級門檻改用選項 -->
                  <label class="field-label">查看職級門檻</label>
                  <el-select v-model="form.hasAccess.職級" size="small" class="full-width">
                    <el-option label="一般人員（全員可見）" :value="10" />
                    <el-option label="課級以上" :value="7" />
                    <el-option label="理級以上" :value="6" />
                    <el-option label="處級以上" :value="4" />
                  </el-select>
                </div>
              </el-col>
            </el-row>
          </div>

          <el-divider />

          <!-- 其他與操作 -->
          <div class="section-block mb-0">
            <div class="section-title-small"><el-icon><MoreFilled /></el-icon> 其他與操作</div>
            <el-row :gutter="40">
              <el-col :span="12">
                <div class="field-group">
                  <label class="field-label">文件上架</label>
                  <el-radio-group v-model="form.isPublished" size="small">
                    <el-radio :value="true">上架</el-radio>
                    <el-radio :value="false">下架</el-radio>
                  </el-radio-group>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="field-group side-btns" style="margin-top:24px;">
                  <el-button plain size="small" @click="showCommentPanel = true">
                    <el-icon><ChatDotSquare /></el-icon> 評論
                  </el-button>
                  <el-button plain size="small" @click="showHistoryPanel = true">
                    <el-icon><Clock /></el-icon> 歷史紀錄
                  </el-button>
                  <div v-if="collaboratorName" class="collab-status">
                    <el-icon class="is-loading"><Loading /></el-icon> {{ collaboratorName }} 編輯中
                  </div>
                </div>
              </el-col>
              <!-- ✅ 修改說明改用 textarea -->
              <el-col :span="24">
                <div class="field-group mb-0">
                  <label class="field-label">修改說明</label>
                  <el-input
                    v-model="form.changeNote"
                    type="textarea"
                    :rows="3"
                    placeholder="簡述本次修改內容（選填，儲存後寫入版本歷史）"
                    resize="none"
                  />
                </div>
              </el-col>
            </el-row>
          </div>
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

      <!-- Metadata Display (View Mode) -->
      <div v-if="!isEditing && mode === 'view'" class="article-meta-info kb-card">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="標籤">
            <el-tag v-for="t in article?.tags" :key="t.id" size="small" effect="plain" class="mr-1 mb-1">{{ t.name }}</el-tag>
            <span v-if="!article?.tags?.length" class="text-muted">無標籤</span>
          </el-descriptions-item>
          <el-descriptions-item label="附件">
            <div v-if="form.attachmentIds.length" class="att-links">
              <template v-for="attId in form.attachmentIds" :key="attId">
                <el-link v-if="isAttachmentAccessible(attId)" type="primary" underline="never" @click="router.push(`/attachment/${attId}`)" class="mb-1 d-block">
                  <el-icon><Paperclip /></el-icon> {{ getAttachmentName(attId) }}
                </el-link>
              </template>
            </div>
            <span v-else class="text-muted">無附件</span>
          </el-descriptions-item>
          <el-descriptions-item label="文件上架">
            <el-tag :type="form.isPublished ? 'success' : 'info'" size="small">{{ form.isPublished ? '已上架' : '已下架' }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="是否公開">
            <el-tag :type="form.isPublic ? 'warning' : 'info'" size="small">{{ form.isPublic ? '全集團公開' : '部門私有' }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="所屬目錄">
            <el-tag v-for="dId in form.directories" :key="dId" size="small" type="info" class="mr-1 mb-1">{{ getDirLabel(dId) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="查看職級門檻">
            <el-tag size="small" type="warning">{{ gradeLevelLabel(form.hasAccess.職級) }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- Markdown Editor / Viewer -->
      <div class="editor-container kb-card">
        <template v-if="isEditing || mode === 'create'">
          <div :key="editorKey" ref="vditorRef" class="vditor-host" />
          <div v-if="!vditorReady" class="vditor-loading-mask">
            <el-skeleton :rows="4" animated />
          </div>
        </template>
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

    <CommentPanel v-model="showCommentPanel" :article-id="id" />
    <VersionHistoryPanel v-model="showHistoryPanel" :article-id="id" @preview="onVersionPreview" />
    <AiChatPanel v-model="showAiPanel" :context-content="form.content" @apply="applyAiContent" />

    <!-- Dir Picker -->
    <el-dialog v-model="showDirPicker" title="選擇目錄" width="500px">
      <el-tree ref="dirTreeRef" :data="dirPickerTree" :props="{ label: 'label', children: 'children', disabled: data => data.type !== 'directory' }" show-checkbox check-strictly check-on-click-node node-key="id" default-expand-all />
      <template #footer>
        <el-button @click="showDirPicker = false">取消</el-button>
        <el-button type="primary" @click="confirmDirSelection">確認</el-button>
      </template>
    </el-dialog>

    <!-- Attachment Picker -->
    <el-dialog v-model="showAttachPicker" title="關聯文件" width="800px">
      <el-table :data="filteredAttachments" @selection-change="handleAttachSelection" row-key="id" ref="attachTableRef">
        <el-table-column type="selection" width="55" />
        <!-- BUG-007: prop="files[0].name" 不支援陣列索引語法，改用 template slot -->
        <el-table-column label="檔名">
          <template #default="{ row }">
            {{ row.files?.[0]?.name || row.title || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="所屬目錄">
          <template #default="{ row }">
            <el-tag v-for="dId in row.directoryIds" :key="dId" size="small" type="info" class="mr-1">{{ getDirLabel(dId) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="描述">
          <template #default="{ row }">
            {{ row.description || '-' }}
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showAttachPicker = false">取消</el-button>
        <el-button type="primary" @click="confirmAttachSelection">確認</el-button>
      </template>
    </el-dialog>

    <!-- Editor Picker -->
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
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth.js'
import { useDirectoryStore } from '@/store/directory.js'
import { articleService, tagService, colleagueService, attachmentService, crossDeptService } from '@/services/api.js'
import { formatDateTime } from '@/utils/dateFormat.js'
import { ElMessage } from 'element-plus'
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
let vditorInstance = null
const editorKey = ref(0)
const vditorReady = ref(false)
const aiPreview = ref('')
const vditorRef = ref(null)
const vditorPreviewRef = ref(null)
const aiPreviewRef = ref(null)
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
const myGrantedDepts = ref([])  // 跨部門授權的部門代碼清單

// ✅ 職級選項
const GRADE_OPTIONS = [
  { label: '一般人員（全員可見）', value: 10 },
  { label: '課級以上', value: 8 },
  { label: '理級以上', value: 6 },
  { label: '處級以上', value: 4 },
]
function gradeLevelLabel(v) {
  return GRADE_OPTIONS.find(o => o.value === v)?.label ?? `職級 ${v} 以上`
}

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
  hasAccess: { 部門: '', 人員: [], 職級: 10 },
})

// ─── Computed ────────────────────────────────────────────────
const selectedEditors = computed(() => colleagues.value.filter(c => form.editorIds.includes(c.員工工號)))
const currentDeptColleagues = computed(() => {
  if (!dirStore.currentDept) return colleagues.value
  return colleagues.value.filter(c => c.部門代碼 === dirStore.currentDept)
})
const dirPickerTree = computed(() => {
  const DIR_TYPES = new Set(['company', 'department', 'directory'])
  function filterDirs(nodes) {
    if (!nodes) return []
    return nodes.filter(n => DIR_TYPES.has(n.type)).map(n => ({ ...n, children: n.children ? filterDirs(n.children) : undefined }))
  }
  return filterDirs(dirStore.filteredTree)
})
const filteredAttachments = computed(() => {
  // 後端 Attachment 不回傳 directories，直接顯示所有可存取的附件
  // TODO：待 B-03 後端補充 directoryIds 後，可再恙復目錄範圍過濾
  return allAttachments.value.filter(att => att.isPublished !== false)
})
const canEdit = computed(() => {
  if (dirStore.viewScope === 'public' || !article.value || route.query.version) return false
  if (auth.isAdmin || auth.isManager) return true
  // editors: string[] of accounts (after normalizeArticle)
  // createdBy: string account (after normalizeArticle)
  return article.value.editors?.includes(auth.user?.員工工號)
      || article.value.createdBy === auth.user?.員工工號
})
const latestVersionNumber = computed(() => article.value?.versionNumber || 1)

// ─── Vditor ──────────────────────────────────────────────────
async function initVditor() {
  destroyVditor()
  editorKey.value++
  await nextTick(); await nextTick()
  if (!vditorRef.value) return
  // F5 後第一次載入，Vditor 的 CSS / SVG icon sprite 可能尚未完全套用，
  // 用 rAF + setTimeout(0) 等瀏覽器完成當前 paint cycle 後再初始化，
  // 避免工具列 icon 渲染異常；SPA 內導航因資源已快取不受影響。
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))
  if (!vditorRef.value) return
  const initialContent = form.content || ''
  // Vditor 非同步 fetch SVG icon sprite，after() 在所有資源載完後才觸發。
  // await after() 可確保工具列圖示完全就緒後 Vue 才繼續，修復 F5 第一次進入圖示異常。
  await new Promise(resolve => {
    vditorInstance = new Vditor(vditorRef.value, {
    height: 520, mode: 'ir',
    placeholder: '使用 Markdown 撰寫文章內容...',
    toolbarConfig: { pin: true },
    cache: { enable: false },
    after() {
    vditorInstance?.setValue(initialContent)
    vditorReady.value = true
      resolve()
      },
    input(val) { form.content = val },
    upload: { url: '/api/articles/upload-image', headers: { Authorization: `Bearer ${sessionStorage.getItem('kb_token')}` }, fieldName: 'image' },
    })
  })
}
function destroyVditor() {
  if (vditorInstance) { try { vditorInstance.destroy() } catch { } vditorInstance = null }
  vditorReady.value = false
}
async function renderPreview() {
  await nextTick()
  if (!vditorPreviewRef.value || !article.value) return
  Vditor.preview(vditorPreviewRef.value, article.value.content || '', { mode: 'light' })
}

// ─── Actions ─────────────────────────────────────────────────
async function startEdit() {
  try {
    tags.value = await tagService.getAll()
  } catch {
    // 重載失敗時保留現有 tags，不阻斷進入編輯
  }
  isEditing.value = true
  initVditor()
}
function cancelEdit() { destroyVditor(); isEditing.value = false; nextTick(() => renderPreview()) }

// ─── 將 form 轉換為後端所需 payload ──────────────────────────────────
function buildPayload() {
  if (vditorInstance) form.content = vditorInstance.getValue()
  return {
    title:          form.title,
    content:        form.content,
    isPublished:    form.isPublished,
    isPublic:       form.isPublic,
    accessDept:     form.hasAccess.部門,
    accessMembers:  form.hasAccess.人員,
    accessLevel:    form.hasAccess.職級,
    tagIds:         form.tagIds,
    editorAccounts: form.editorIds,
    attachmentIds:  form.attachmentIds,
    directoryIds:   form.directories,
    changeNote:     form.changeNote,
  }
}

async function saveArticle() {
  if (!form.title.trim()) return ElMessage.warning('請輸入文章標題')
  if (!form.directories.length) return ElMessage.warning('請選擇所屬目錄')
  saving.value = true
  try {
    await articleService.update(props.id, buildPayload())
    ElMessage.success('已儲存')
    form.changeNote = ''
    isEditing.value = false
    destroyVditor()
    await loadArticle()
    await renderPreview()
    await dirStore.fetchTree(dirStore.currentCompany, dirStore.currentDept)
  } finally { saving.value = false }
}

async function createArticle() {
  if (!form.title.trim()) return ElMessage.warning('請輸入文章標題')
  if (!form.directories.length) return ElMessage.warning('請選擇所屬目錄')
  saving.value = true
  try {
    const created = await articleService.create(buildPayload())
    ElMessage.success('文章建立成功')
    await dirStore.fetchTree(dirStore.currentCompany, dirStore.currentDept)
    router.push(`/article/${created.id}`)
  } finally { saving.value = false }
}

function applyAiContent(content) { if (vditorInstance) vditorInstance.setValue(content); form.content = content; aiPreview.value = null }
function onVersionPreview(articleId, versionNumber) { showHistoryPanel.value = false; router.push(`/article/${articleId}?version=${versionNumber}`) }
function returnToLatestVersion() { router.push(`/article/${props.id}`) }

// ─── Pickers ─────────────────────────────────────────────────
function removeDir(id) { form.directories = form.directories.filter(d => d !== id) }
function removeEditor(id) { form.editorIds = form.editorIds.filter(e => e !== id) }
function removeAttachment(id) { form.attachmentIds = form.attachmentIds.filter(a => a !== id) }
function confirmDirSelection() {
  form.directories = (dirTreeRef.value?.getCheckedNodes(false, false) || []).filter(n => n.type === 'directory').map(n => n.id)
  showDirPicker.value = false
}
function getDirLabel(id) {
  let label = String(id)
  function find(nodes) { for (const n of nodes) { if (n.id === id) { label = n.label; return } if (n.children) find(n.children) } }
  find(dirStore.tree || [])
  return label
}
function handleAttachSelection(sel) { tempAttachSelection.value = sel }
function confirmAttachSelection() { form.attachmentIds = tempAttachSelection.value.map(a => a.id); showAttachPicker.value = false }
function getAttachmentName(id) {
  const att = allAttachments.value.find(a => a.id === id)
  // getAll 不包含 files，用 title 作為顏示名稱
  return att?.title || att?.files?.[0]?.name || String(id)
}
function isAttachmentAccessible(id) {
  if (auth.isAdmin) return true
  const att = allAttachments.value.find(a => a.id === id)
  if (!att) return false
  const isPublic = att.isPublic === true
  if (dirStore.viewScope === 'public' && !isPublic) return false
  const ha = att.hasAccess || {}
  return (isPublic || !ha.部門 || ha.部門 === auth.user?.部門代碼)
      && (isPublic || !ha.人員?.length || ha.人員.includes(auth.user?.員工工號))
      && (!ha.職級 || (auth.user?.級職 || 99) <= ha.職級)
}
watch(showEditorPicker, v => { if (v) tempEditors.value = [...form.editorIds] })
function confirmEditorSelection() { form.editorIds = [...tempEditors.value]; showEditorPicker.value = false }
watch(showDirPicker, async v => { if (v) { await nextTick(); dirTreeRef.value?.setCheckedKeys(form.directories) } })
watch(showAttachPicker, async v => {
  if (v) { await nextTick(); attachTableRef.value?.clearSelection(); form.attachmentIds.forEach(id => { const row = allAttachments.value.find(a => a.id === id); if (row) attachTableRef.value?.toggleRowSelection(row, true) }) }
})
watch(aiPreview, async v => { if (v && aiPreviewRef.value) { await nextTick(); Vditor.preview(aiPreviewRef.value, v, { mode: 'light' }) } })

watch(() => form.isPublished, (val) => {
  const trashNode = findTrashNode(dirStore.tree)
  if (!val) { if (trashNode) { form.directories = [trashNode.id]; ElMessage.warning('文件已下架並移至垃圾桶') } }
  else { if (trashNode && form.directories.includes(trashNode.id)) { form.directories = form.directories.filter(id => id !== trashNode.id); if (!form.directories.length) { ElMessage.info('文件重新上架，請選擇存放目錄'); showDirPicker.value = true } } }
})
function findTrashNode(nodes) { if (!nodes) return null; for (const n of nodes) { if (n.type === 'trash') return n; if (n.children) { const f = findTrashNode(n.children); if (f) return f } } return null }

async function createTag(name) { const t = await tagService.create(name); tags.value.push(t); form.tagIds.push(t.id) }

async function loadArticle() {
  if (!props.id) return
  loading.value = true
  try {
    const res = await articleService.getById(props.id, route.query.version || null)
    article.value = res
    if (!auth.isAdmin) {
      const isPublic = res.isPublic === true
      const members  = Array.isArray(res.accessMembers) ? res.accessMembers : []

      // 公開瀏覽模式：非公開文件 → 跳回首頁
      if (dirStore.viewScope === 'public' && !isPublic) {
        ElMessage.warning('此文章非公開，無法在公開瀏覽模式下檢視')
        router.push('/')
        return
      }

      if (!isPublic) {
        let primaryAccess = false
        // 查看職級門檻：access_level=10 代表全員可見（跳過檢查）；否則 級職 須 ≤ 門檻
        const passLevel = (res.accessLevel ?? 10) >= 10
                       || (auth.user?.級職 ?? 99) <= (res.accessLevel ?? 10)

        if (members.length > 0) {
          // 【最高優先】指定人員：僅名單內帳號可存取
          primaryAccess = members.map(String).includes(String(auth.user?.員工工號))
        } else {
          // 無指定人員：依部門代碼前三碼 + 跨部門授權
          const rDept = res.accessDept || ''
          const uDept = auth.user?.部門代碼 || ''
          if (!rDept) {
            // 無部門限制 → 全員均可存取
            primaryAccess = true
          } else {
            const exactMatch  = uDept === rDept
            const prefixMatch = uDept.length >= 3 && rDept.length >= 3
                             && uDept.substring(0, 3) === rDept.substring(0, 3)
            const crossMatch  = myGrantedDepts.value.includes(rDept)
            primaryAccess = exactMatch || prefixMatch || crossMatch
          }
        }

        if (!primaryAccess || !passLevel) {
          ElMessage.warning('您沒有存取此文章的權限')
          router.push('/')
          return
        }
      }
    }
    Object.assign(form, {
      title:        res.title || '',
      content:      res.content || '',
      isPublished:  res.isPublished ?? true,
      isPublic:     res.isPublic ?? false,
      // directoryIds 待後端補充（B-03），暫時用空陣列
      directories:  res.directoryIds || [],
      tagIds:       res.tags?.map(t => t.id) || [],
      attachmentIds: res.attachmentIds || [],
      editorIds:    res.editors || [],
      changeNote:   '',
      hasAccess: {
        // Bug B fix: 不再 fallback 到 auth.user?.部門代碼
        // 否則空值文章儲存後 access_dept 會被汙染為建立者的部門代碼
        部門: res.accessDept || '',
        人員: [...(Array.isArray(res.accessMembers) ? res.accessMembers : [])],
        職級: res.accessLevel ?? 10,
      },
    })
  } catch (err) { ElMessage.error('無法載入文章：' + (err.message || '')) }
  finally { loading.value = false }
}

let draftTimer = null
function startDraftTimer() {
  draftTimer = setInterval(() => {
    if (vditorInstance) form.content = vditorInstance.getValue()
    sessionStorage.setItem('kb_draft_' + (props.id || 'new'), JSON.stringify(form))
  }, 60000)
}

onMounted(async () => {
  try {
    ;[tags.value, colleagues.value, allAttachments.value] = await Promise.all([
      tagService.getAll(),
      colleagueService.getAll(),
      attachmentService.getAll(),
    ])
  } catch {
    // 輔助資料載入失敗不阻斷主要功能
  }
  // 取得跨部門授權清單（失敗不阻斷主流程）
  try {
    const grants = await crossDeptService.getMyGrants()
    myGrantedDepts.value = grants.map(g => g.dept_code)
  } catch {
    // 靜默失敗，退回無跨部門授權
  }
  if (props.mode === 'create') { await initVditor() }
  else { await loadArticle(); if (isEditing.value) await initVditor(); else await renderPreview() }
  startDraftTimer()
})
onBeforeUnmount(() => { destroyVditor(); clearInterval(draftTimer) })

watch(() => [props.mode, props.id, route.query.version], async ([newMode, newId, newVer], [oldMode, oldId, oldVer]) => {
  if (newMode === 'create') {
    isEditing.value = false; article.value = null
    Object.assign(form, { title: '', content: '', isPublished: true, isPublic: false, directories: [], tagIds: [], attachmentIds: [], editorIds: [], changeNote: '' })
    await initVditor()
  } else if ((newId && newId !== oldId) || newVer !== oldVer) {
    isEditing.value = newMode === 'edit'
    await loadArticle()
    if (isEditing.value) await initVditor(); else { destroyVditor(); await renderPreview() }
  }
})
</script>

<style scoped>
.article-view { max-width: 980px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.page-loading { padding: 24px 0; }
.access-denied-banner { display: flex; justify-content: center; align-items: center; min-height: 400px; }
.article-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
.header-left-col { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
.ai-badge { display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg,#7c3aed,#a855f7); color:#fff; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0; transition: transform .15s,box-shadow .15s; box-shadow: 0 2px 8px rgba(124,58,237,.3); }
.ai-badge:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(124,58,237,.4); }
.article-title { font-size: 22px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title-input { font-size: 18px; font-weight: 600; }
.header-right-col { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; flex-shrink: 0; }
.meta-dates { display: flex; gap: 12px; flex-wrap: wrap; }
.meta-item { font-size: 11px; color: var(--color-text-muted,#999); }
.header-actions { display: flex; gap: 8px; }
.form-fields { padding: 24px; }
.field-group { margin-bottom: 20px; }
.section-title-small { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--color-primary,#6366f1); margin-bottom: 18px; padding-bottom: 8px; border-bottom: 1px dashed #e5e7eb; }
.field-label { display: block; font-size: 12px; font-weight: 600; color: var(--color-text-secondary,#666); margin-bottom: 8px; }
.section-block { margin-bottom: 24px; }
.full-width { width: 100%; }
.collab-status { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #b45309; background: #fffbeb; padding: 4px 10px; border-radius: 20px; border: 1px solid #fef3c7; }
.selected-dirs, .selected-tags-box { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; padding: 8px; background: #f9fafb; border-radius: 6px; border: 1px solid #f3f4f6; min-height: 32px; }
.side-btns { display: flex; gap: 8px; }
.view-action-bar { display: flex; gap: 10px; }
.article-meta-info { padding: 0; overflow: hidden; }
:deep(.el-descriptions__label) { background-color: var(--color-surface-2)!important; font-weight: 600; color: var(--color-text-secondary); width: 120px; }
.att-links { display: flex; flex-direction: column; gap: 4px; }
.mr-1 { margin-right: 4px; } .mb-1 { margin-bottom: 4px; }
.text-muted { color: var(--color-text-muted,#999); font-size: 12px; font-style: italic; }
.d-block { display: block; }
.editor-container { min-height: 520px; overflow: hidden; padding: 0; position: relative; }
.vditor-host { width: 100%; }
.vditor-loading-mask {
  position: absolute;
  inset: 0;
  background: var(--color-surface, #fff);
  z-index: 10;
  padding: 20px 24px;
  border-radius: inherit;
}
.markdown-body { padding: 28px 32px; line-height: 1.8; font-size: 14px; }
:deep(.markdown-body h1) { font-size: 22px; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 16px; }
:deep(.markdown-body h2) { font-size: 18px; margin: 20px 0 10px; }
:deep(.markdown-body h3) { font-size: 15px; margin: 16px 0 8px; }
:deep(.markdown-body code) { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
:deep(.markdown-body pre) { margin: 12px 0; border-radius: 6px; overflow-x: auto; }
:deep(.markdown-body pre code) { background: none; padding: 0; }
:deep(.markdown-body blockquote) { border-left: 4px solid #6366f1; padding-left: 16px; color: #666; margin: 12px 0; }
:deep(.markdown-body table) { border-collapse: collapse; width: 100%; margin: 12px 0; }
:deep(.markdown-body th,.markdown-body td) { border: 1px solid #e5e7eb; padding: 8px 12px; font-size: 13px; }
:deep(.markdown-body th) { background: #f9fafb; font-weight: 600; }
.ai-preview { border: 2px solid #a855f7; }
.ai-preview-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 1px solid #e9d5ff; background: linear-gradient(135deg,#faf5ff,#f5f3ff); font-size: 13px; font-weight: 600; color: #7c3aed; }
.ai-preview-actions { display: flex; gap: 8px; }
.editor-checkbox-group { display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto; }
.editor-checkbox-item { margin-bottom: 4px; }
.dept-name { color: #999; font-size: 12px; margin-left: 4px; }
.no-data { color: #999; text-align: center; padding: 20px; }
:deep(.vditor) { border-radius: 8px; border-color: #e5e7eb; }
:deep(.vditor-toolbar) { border-radius: 8px 8px 0 0; }
</style>
