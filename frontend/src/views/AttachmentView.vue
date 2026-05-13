<template>
  <div class="attachment-view">
    <div v-if="loading" class="page-loading"><el-skeleton :rows="8" animated /></div>

    <div v-else-if="accessDenied" class="access-denied-banner">
      <el-result icon="warning" title="無權限查看" sub-title="您的職級或帳號不在本附件的存取清單內，無法檢視此附件。">
        <template #extra><el-button type="primary" @click="router.back()">返回</el-button></template>
      </el-result>
    </div>

    <template v-else-if="!accessDenied">
      <!-- Header -->
      <div class="article-header">
        <div class="header-left-col">
          <el-button v-if="isEditing && mode !== 'create'" text circle title="退回查看" @click="cancelEdit">
            <el-icon size="18"><ArrowLeft /></el-icon>
          </el-button>
          <el-input v-if="isEditing || mode === 'create'" v-model="form.title" placeholder="輸入附件標題" size="large" class="title-input" />
          <h1 v-else class="article-title">{{ form.title || attachment?.files?.[0]?.name || '附件' }}</h1>
        </div>
        <div class="header-right-col">
          <div class="meta-dates">
            <span class="meta-item">建立：{{ formatDateTime(attachment?.createdAt) }}</span>
            <span class="meta-item">更新：{{ formatDateTime(attachment?.updatedAt) }}</span>
          </div>
          <div class="header-actions">
            <el-button v-if="!isEditing && mode !== 'create' && canEdit" type="primary" @click="isEditing = true"><el-icon><Edit /></el-icon> 編輯</el-button>
            <el-button v-if="isEditing && mode !== 'create'" type="success" :loading="saving" @click="saveAttachment"><el-icon><Check /></el-icon> 儲存</el-button>
            <el-button v-if="mode === 'create'" type="warning" :loading="saving" @click="createAttachment"><el-icon><Upload /></el-icon> 建立</el-button>
          </div>
        </div>
      </div>

      <!-- Form Fields -->
      <el-collapse-transition>
        <div v-if="isEditing || mode === 'create'" class="form-fields kb-card">

          <!-- 分類資訊 -->
          <div class="section-block">
            <div class="section-title-small"><el-icon><Collection /></el-icon> 分類資訊</div>
            <el-row :gutter="40">
              <el-col :span="12">
                <div class="field-group">
                  <label class="field-label">所屬目錄</label>
                  <el-button plain size="small" @click="showDirPicker = true" class="full-width"><el-icon><Folder /></el-icon> 選擇目錄</el-button>
                  <div class="selected-dirs" v-if="form.directories.length">
                    <el-tag v-for="d in form.directories" :key="d" closable size="small" @close="removeDir(d)">{{ getDirLabel(d) }}</el-tag>
                  </div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="field-group">
                  <label class="field-label">關聯文章</label>
                  <el-button plain size="small" @click="showAttachPicker = true" class="full-width"><el-icon><Document /></el-icon> 選擇關聯文章</el-button>
                  <div class="selected-tags-box" v-if="form.linkedArticleIds.length">
                    <el-tag v-for="aid in form.linkedArticleIds" :key="aid" size="small" closable @close="removeLinkedArticle(aid)">{{ getArticleName(aid) }}</el-tag>
                  </div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="field-group mb-0">
                  <label class="field-label">標籤</label>
                  <el-select v-model="form.tagIds" multiple filterable allow-create placeholder="選擇或輸入標籤" size="small" class="full-width">
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
                  <label class="field-label">附件編輯權限</label>
                  <el-button plain size="small" @click="showEditorPicker = true" class="full-width"><el-icon><User /></el-icon> 指定可編輯同仁</el-button>
                  <div class="selected-tags-box" v-if="selectedEditors.length">
                    <el-tag v-for="e in selectedEditors" :key="e.員工工號" size="small" closable @close="removeEditor(e.員工工號)">{{ e.員工姓名 }}</el-tag>
                  </div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="field-group mb-0">
                  <label class="field-label">存取權限 – 指定人員</label>
                  <el-select v-model="form.hasAccess.人員" multiple filterable placeholder="空白代表部門全員" size="small" class="full-width">
                    <el-option v-for="c in currentDeptColleagues" :key="c.員工工號" :label="c.員工姓名" :value="c.員工工號" />
                  </el-select>
                </div>
              </el-col>
              <el-col :span="12">
                <!-- ✅ 職級門檻改用選項 -->
                <div class="field-group mb-0">
                  <label class="field-label">職級門檻</label>
                  <el-select v-model="form.hasAccess.職級" size="small" class="full-width">
                    <el-option label="一般人員（全員可見）" :value="10" />
                    <el-option label="課級以上" :value="8" />
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
                  <el-button plain size="small" @click="showCommentPanel = true"><el-icon><ChatDotSquare /></el-icon> 評論</el-button>
                  <el-button plain size="small" @click="showHistoryPanel = true"><el-icon><Clock /></el-icon> 歷史紀錄</el-button>
                </div>
              </el-col>
              <!-- ✅ 修改說明：label 已修正，binding 改為 form.changeNote，改用 textarea -->
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
        <el-button plain @click="showCommentPanel = true"><el-icon><ChatDotSquare /></el-icon> 評論</el-button>
        <el-button plain @click="showHistoryPanel = true" class="history-btn">
          <el-icon><Clock /></el-icon>
          <span>修改紀錄 v{{ latestVersionNumber }}</span>
          <span v-if="attachment?.updatedAt" class="history-date">&nbsp;· {{ formatDateTime(attachment.updatedAt) }}</span>
        </el-button>
      </div>

      <!-- Metadata -->
      <div v-if="!isEditing && mode === 'view'" class="article-meta-info kb-card">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="標籤">
            <el-tag v-for="t in attachment?.tags" :key="t.id" size="small" effect="plain" class="mr-1 mb-1">{{ t.name }}</el-tag>
            <span v-if="!attachment?.tags?.length" class="text-muted">無標籤</span>
          </el-descriptions-item>
          <el-descriptions-item label="關聯文章">
            <div v-if="form.linkedArticleIds.length" class="att-links">
              <template v-for="aid in form.linkedArticleIds" :key="aid">
                <el-link v-if="isArticleAccessible(aid)" type="primary" underline="never" @click="router.push(`/article/${aid}`)" class="mb-1 d-block">
                  <el-icon><Document /></el-icon> {{ getArticleName(aid) }}
                </el-link>
              </template>
            </div>
            <span v-else class="text-muted">無關聯文章</span>
          </el-descriptions-item>
          <el-descriptions-item label="文件上架">
            <el-tag :type="form.isPublished ? 'success' : 'info'" size="small">{{ form.isPublished ? '已上架' : '已下架' }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="是否公開">
            <el-tag :type="form.isPublic ? 'warning' : 'info'" size="small">{{ form.isPublic ? '全集團公開' : '部門私有' }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="所屬目錄">
            <el-tag v-for="d in form.directories" :key="d" size="small" type="info" class="mr-1 mb-1">{{ getDirLabel(d) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="職級門檻">
            <el-tag size="small" type="warning">{{ gradeLevelLabel(form.hasAccess.職級) }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- 附件說明（僅查看模式顯示，編輯區已在 detail-section） -->
      <div class="kb-card detail-section">
        <h3 class="section-title">附件說明</h3>
        <div v-if="!isEditing && mode === 'view'" class="desc-view">
          {{ form.description || '（無說明內容）' }}
        </div>
        <!-- 編輯 / 建立模式下的附件說明輸入框 -->
        <div v-else class="field-group mb-0">
          <el-input v-model="form.description" type="textarea" :rows="4" placeholder="描述附件內容、用途、注意事項..." resize="none" />
        </div>
      </div>

      <!-- File upload area -->
      <div class="kb-card detail-section">
        <h3 class="section-title">檔案清單</h3>
        <el-upload
          v-if="isEditing || mode === 'create'"
          drag multiple :auto-upload="false" :file-list="fileList"
          accept=".doc,.docx,.xls,.xlsx,.pdf,.jpg,.png,.txt"
          class="upload-dragger"
          @change="onFileChange"
        >
          <div class="upload-inner">
            <el-icon class="upload-icon"><UploadFilled /></el-icon>
            <p class="upload-text">拖曳檔案至此或 <em>點擊選取</em></p>
            <p class="upload-hint">支援：Word / Excel / PDF / 圖片 / 純文字，單檔 ≤ 5MB</p>
          </div>
        </el-upload>
        <div class="file-list" v-if="attachment?.files?.length">
          <div v-for="f in attachment.files" :key="f.uuid" class="file-item">
            <div class="file-info">
              <el-icon class="file-icon"><Paperclip /></el-icon>
              <span class="file-name">{{ f.name }}</span>
              <span class="file-size">{{ formatFileSize(f.size) }}</span>
            </div>
            <el-button size="small" type="primary" plain :href="f.url" tag="a" target="_blank">下載</el-button>
          </div>
        </div>
      </div>
    </template>

    <CommentPanel v-model="showCommentPanel" :article-id="id" />
    <VersionHistoryPanel v-model="showHistoryPanel" :article-id="id" />

    <!-- Dir Picker -->
    <el-dialog v-model="showDirPicker" title="選擇目錄" width="500px">
      <el-tree ref="dirTreeRef" :data="dirPickerTree" :props="{ label: 'label', children: 'children', disabled: data => data.type !== 'directory' }" show-checkbox check-strictly check-on-click-node node-key="id" default-expand-all />
      <template #footer>
        <el-button @click="showDirPicker = false">取消</el-button>
        <el-button type="primary" @click="confirmDirSelection">確認</el-button>
      </template>
    </el-dialog>

    <!-- Article Picker -->
    <el-dialog v-model="showAttachPicker" title="選擇關聯文章" width="800px">
      <el-table :data="filteredArticles" @selection-change="handleAttachSelection" row-key="id" ref="attachTableRef">
        <el-table-column type="selection" width="55" />
        <el-table-column prop="title" label="文章標題" />
        <el-table-column label="所屬目錄">
          <template #default="{ row }">
            <el-tag v-for="dId in row.directories" :key="dId" size="small" type="info" class="mr-1">{{ getDirLabel(dId) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新時間">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
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
          <el-checkbox :value="c.員工工號" :label="c.員工工號">{{ c.員工姓名 }} <span class="dept-name">({{ c.部門名稱 }})</span></el-checkbox>
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
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth.js'
import { useDirectoryStore } from '@/store/directory.js'
import { attachmentService, tagService, colleagueService, articleService } from '@/services/api.js'
import { formatDateTime, formatFileSize } from '@/utils/dateFormat.js'
import { ElMessage } from 'element-plus'
import CommentPanel from '@/components/panels/CommentPanel.vue'
import VersionHistoryPanel from '@/components/panels/VersionHistoryPanel.vue'

const props = defineProps({
  id: { type: Number, default: null },
  mode: { type: String, default: 'view' },
})

const auth = useAuthStore()
const dirStore = useDirectoryStore()
const router = useRouter()

const loading = ref(false)
const saving = ref(false)
const attachment = ref(null)
const tags = ref([])
const colleagues = ref([])
const allArticles = ref([])
const fileList = ref([])

const showCommentPanel = ref(false)
const showHistoryPanel = ref(false)
const showDirPicker = ref(false)
const showAttachPicker = ref(false)
const showEditorPicker = ref(false)
const dirTreeRef = ref(null)
const attachTableRef = ref(null)
const tempEditors = ref([])
const tempAttachSelection = ref([])
const isEditing = ref(props.mode === 'edit')
const accessDenied = ref(false)

// ✅ 職級選項（與 ArticleView 一致）
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
  description: '',   // 附件說明（detail-section 顯示用）
  changeNote: '',    // ✅ 修改說明（儲存時寫入版本歷史）
  isPublished: true,
  isPublic: false,
  directories: [],
  tagIds: [],
  linkedArticleIds: [],
  editorIds: [],
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
const filteredArticles = computed(() => {
  if (!dirStore.tree) return []
  function findDeptNode(nodes) { for (const n of nodes) { if (n.type === 'department' && n.部門代碼 === dirStore.currentDept) return n; if (n.children) { const f = findDeptNode(n.children); if (f) return f } } return null }
  const deptNode = findDeptNode(dirStore.tree)
  if (!deptNode) return []
  const validDirIds = new Set()
  function collectDirs(nodes) { for (const n of nodes) { if (n.type === 'directory') { validDirIds.add(n.id); if (n.children) collectDirs(n.children) } } }
  if (deptNode.children) collectDirs(deptNode.children)
  return allArticles.value.filter(art => art.directories.some(d => validDirIds.has(d)) && !art.directories.some(d => String(d).includes('trash')) && art.isPublished !== false)
})
const canEdit = computed(() => {
  if (dirStore.viewScope === 'public' || !attachment.value) return false
  if (auth.isAdmin || auth.isManager) return true
  return attachment.value.editorIds?.includes(auth.user?.員工工號) || attachment.value.createdBy?.員工工號 === auth.user?.員工工號
})
const latestVersionNumber = computed(() => attachment.value?.versionNumber || 1)

// ─── Actions ─────────────────────────────────────────────────
function cancelEdit() { isEditing.value = false; loadAttachment() }
function removeDir(id) { form.directories = form.directories.filter(d => d !== id) }
function removeEditor(id) { form.editorIds = form.editorIds.filter(e => e !== id) }
function removeLinkedArticle(id) { form.linkedArticleIds = form.linkedArticleIds.filter(a => a !== id) }
function onFileChange(file) {
  fileList.value = [...fileList.value, file]
  if (!form.title && fileList.value.length === 1) {
    const name = file.name || ''; const dot = name.lastIndexOf('.')
    form.title = dot > -1 ? name.slice(0, dot) : name
  }
}
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
function confirmAttachSelection() { form.linkedArticleIds = tempAttachSelection.value.map(a => a.id); showAttachPicker.value = false }
function getArticleName(id) { return allArticles.value.find(a => a.id === id)?.title || `文章 #${id}` }
function isArticleAccessible(id) {
  if (auth.isAdmin) return true
  const art = allArticles.value.find(a => a.id === id)
  if (!art) return false
  const isPublic = art.isPublic === true
  if (dirStore.viewScope === 'public' && !isPublic) return false
  const ha = art.hasAccess || {}
  return (isPublic || !ha.部門 || ha.部門 === auth.user?.部門代碼) && (isPublic || !ha.人員?.length || ha.人員.includes(auth.user?.員工工號)) && (!ha.職級 || (auth.user?.級職 || 99) <= ha.職級)
}
watch(showEditorPicker, v => { if (v) tempEditors.value = [...form.editorIds] })
function confirmEditorSelection() { form.editorIds = [...tempEditors.value]; showEditorPicker.value = false }
watch(showDirPicker, async v => { if (v) { await nextTick(); dirTreeRef.value?.setCheckedKeys(form.directories) } })
watch(showAttachPicker, async v => {
  if (v) { await nextTick(); attachTableRef.value?.clearSelection(); form.linkedArticleIds.forEach(id => { const row = allArticles.value.find(a => a.id === id); if (row) attachTableRef.value?.toggleRowSelection(row, true) }) }
})
watch(() => form.isPublished, (val) => {
  const trashNode = findTrashNode(dirStore.tree)
  if (!val) { if (trashNode) { form.directories = [trashNode.id]; ElMessage.warning('附件已下架並移至垃圾桶') } }
  else { if (trashNode && form.directories.includes(trashNode.id)) { form.directories = form.directories.filter(id => id !== trashNode.id); if (!form.directories.length) { ElMessage.info('附件重新上架，請選擇存放目錄'); showDirPicker.value = true } } }
})
function findTrashNode(nodes) { if (!nodes) return null; for (const n of nodes) { if (n.type === 'trash') return n; if (n.children) { const f = findTrashNode(n.children); if (f) return f } } return null }

async function saveAttachment() {
  if (!form.title.trim()) return ElMessage.warning('請輸入附件標題')
  if (!form.directories.length) return ElMessage.warning('請選擇所屬目錄')
  saving.value = true
  try {
    let newFiles = []
    if (fileList.value.length) {
      const raws = fileList.value.filter(f => f.raw).map(f => f.raw)
      if (raws.length) newFiles = await attachmentService.uploadFiles(raws)
    }
    await attachmentService.update(props.id, { ...form, files: [...(attachment.value?.files || []), ...newFiles] })
    ElMessage.success('已儲存')
    form.changeNote = ''
    isEditing.value = false
    fileList.value = []
    await loadAttachment()
    await dirStore.fetchTree(dirStore.currentCompany, dirStore.currentDept)
  } finally { saving.value = false }
}

async function createAttachment() {
  if (!form.title.trim()) return ElMessage.warning('請輸入附件標題')
  if (!form.directories.length) return ElMessage.warning('請選擇所屬目錄')
  saving.value = true
  try {
    let uploadedFiles = []
    if (fileList.value.length) {
      const raws = fileList.value.filter(f => f.raw).map(f => f.raw)
      if (raws.length) uploadedFiles = await attachmentService.uploadFiles(raws)
    }
    const created = await attachmentService.create({ ...form, files: uploadedFiles })
    ElMessage.success('附件建立成功')
    await dirStore.fetchTree(dirStore.currentCompany, dirStore.currentDept)
    router.push(`/attachment/${created.id}`)
  } finally { saving.value = false }
}

async function loadAttachment() {
  if (!props.id) return
  loading.value = true
  try {
    attachment.value = await attachmentService.getById(props.id)
    const ha = attachment.value.hasAccess || {}
    if (!auth.isAdmin) {
      const isPublic = attachment.value.isPublic === true
      if (dirStore.viewScope === 'public' && !isPublic) { accessDenied.value = true; return }
      if (!((isPublic || !ha.部門 || ha.部門 === auth.user?.部門代碼) && (isPublic || !ha.人員?.length || ha.人員.includes(auth.user?.員工工號)) && (!ha.職級 || (auth.user?.級職 || 99) <= ha.職級))) { accessDenied.value = true; return }
    }
    accessDenied.value = false
    Object.assign(form, {
      title: attachment.value.title || '', description: attachment.value.description || '',
      changeNote: '',
      isPublished: attachment.value.isPublished ?? true, isPublic: attachment.value.isPublic ?? false,
      directories: [...(attachment.value.directories || [])], tagIds: attachment.value.tags?.map(t => t.id) || [],
      linkedArticleIds: [...(attachment.value.linkedArticleIds || [])], editorIds: [...(attachment.value.editorIds || [])],
      hasAccess: { 部門: ha.部門 || auth.user?.部門代碼 || '', 人員: [...(ha.人員 || [])], 職級: ha.職級 ?? 10 },
    })
  } catch { ElMessage.error('附件不存在或無權限'); router.push('/home') }
  finally { loading.value = false }
}

onMounted(async () => {
  ;[tags.value, colleagues.value, allArticles.value] = await Promise.all([tagService.getAll(), colleagueService.getAll(), articleService.getAll()])
  if (props.mode !== 'create') await loadAttachment()
})

watch(() => [props.id, props.mode], async ([newId, newMode]) => {
  if (newMode === 'create') {
    isEditing.value = true; attachment.value = null; fileList.value = []
    Object.assign(form, { title: '', description: '', changeNote: '', isPublished: true, isPublic: false, directories: [], tagIds: [], linkedArticleIds: [], editorIds: [] })
  } else if (newId) { isEditing.value = newMode === 'edit'; await loadAttachment() }
})
</script>

<style scoped>
.attachment-view { max-width: 980px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.page-loading { padding: 24px 0; }
.access-denied-banner { display: flex; justify-content: center; align-items: center; min-height: 400px; }
.article-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
.header-left-col { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
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
.selected-dirs, .selected-tags-box { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; padding: 8px; background: #f9fafb; border-radius: 6px; border: 1px solid #f3f4f6; min-height: 32px; }
.side-btns { display: flex; gap: 8px; }
.view-action-bar { display: flex; gap: 10px; }
.article-meta-info { padding: 0; overflow: hidden; }
:deep(.el-descriptions__label) { background-color: var(--color-surface-2)!important; font-weight: 600; color: var(--color-text-secondary); width: 120px; }
.att-links { display: flex; flex-direction: column; gap: 4px; }
.mr-1 { margin-right: 4px; } .mb-1 { margin-bottom: 4px; }
.text-muted { color: var(--color-text-muted,#999); font-size: 12px; font-style: italic; }
.d-block { display: block; }
.detail-section { padding: 24px; }
.section-title { font-size: 14px; font-weight: 700; color: var(--color-text-primary); margin-bottom: 16px; padding-left: 10px; border-left: 4px solid var(--color-primary); line-height: 1; }
.desc-view { font-size: 14px; line-height: 1.6; color: var(--color-text-secondary); white-space: pre-wrap; padding: 12px; background: var(--color-surface-2); border-radius: var(--border-radius-sm); }
.upload-dragger { width: 100%; margin-top: 8px; }
.upload-inner { text-align: center; padding: 20px 0; }
.upload-icon { font-size: 40px; color: var(--color-text-muted); margin-bottom: 10px; }
.upload-text { font-size: 14px; color: var(--color-text-secondary); margin-bottom: 4px; }
.upload-text em { color: var(--color-primary); font-style: normal; cursor: pointer; }
.upload-hint { font-size: 12px; color: var(--color-text-muted); }
.file-list { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.file-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--color-surface-2); border-radius: var(--border-radius-sm); font-size: 13px; }
.file-info { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
.file-icon { color: var(--color-success); flex-shrink: 0; }
.file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-size { color: var(--color-text-muted); font-size: 11px; flex-shrink: 0; }
.editor-checkbox-group { display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto; }
.editor-checkbox-item { margin-bottom: 4px; }
.dept-name { color: #999; font-size: 12px; margin-left: 4px; }
.no-data { color: #999; text-align: center; padding: 20px; }
</style>
