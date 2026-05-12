<template>
  <div class="attachment-view">
    <div v-if="loading" class="page-loading"><el-skeleton :rows="6" animated /></div>

    <template v-else>
      <!-- Header -->
      <div class="att-header">
        <div class="header-left">
          <h1 class="att-title">
            {{ mode === 'create' ? '上傳文件' : (isEditing ? '編輯附件' : (attachment?.files?.[0]?.name || '附件')) }}
          </h1>
          <div class="meta-dates">
            <span class="meta-item" v-if="attachment">建立：{{ formatDateTime(attachment.createdAt) }}</span>
            <span class="meta-item" v-if="attachment">更新：{{ formatDateTime(attachment.updatedAt) }}</span>
          </div>
        </div>
        <div class="header-actions">
          <el-button v-if="!isEditing && mode !== 'create' && canEdit" type="primary" @click="isEditing = true">
            <el-icon><Edit /></el-icon> 編輯
          </el-button>
          <el-button v-if="isEditing" type="success" :loading="saving" @click="saveAttachment">
            <el-icon><Check /></el-icon> 儲存
          </el-button>
          <el-button v-if="mode === 'create' && dirStore.viewScope !== 'public'" type="warning" :loading="saving" @click="createAttachment">
            <el-icon><Upload /></el-icon> 建立
          </el-button>
        </div>
      </div>

      <el-row :gutter="20">
        <!-- Left: Meta fields -->
        <el-col :span="12">
          <div class="kb-card field-card">
            <!-- Directory -->
            <div class="field-group">
              <label class="field-label">所屬目錄</label>
              <el-button plain size="small" :disabled="!isEditing && mode !== 'create'">
                <el-icon><Folder /></el-icon> 選擇目錄（可多選）
              </el-button>
              <div class="selected-items" v-if="form.directories.length">
                <el-tag v-for="d in form.directories" :key="d" size="small" closable @close="removeDir(d)">{{ d }}</el-tag>
              </div>
            </div>

            <!-- Tags -->
            <div class="field-group">
              <label class="field-label">標籤</label>
              <el-select
                v-model="form.tagIds"
                multiple filterable allow-create
                placeholder="選擇或新增標籤"
                size="small"
                class="full-width"
                :disabled="!isEditing && mode !== 'create'"
              >
                <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.id" />
              </el-select>
            </div>

            <!-- Publish -->
            <div class="field-group">
              <label class="field-label">文件上架</label>
              <el-radio-group v-model="form.isPublished" size="small" :disabled="!isEditing && mode !== 'create'">
                <el-radio :value="true">上架</el-radio>
                <el-radio :value="false">下架（移至垃圾桶）</el-radio>
              </el-radio-group>
            </div>

            <!-- Edit permission -->
            <div class="field-group">
              <label class="field-label">編輯權限</label>
              <el-button plain size="small" :disabled="!isEditing && mode !== 'create'">
                <el-icon><User /></el-icon> 指定可編輯同仁
              </el-button>
              <div class="selected-items" v-if="selectedEditors.length">
                <el-tag v-for="e in selectedEditors" :key="e.員工工號" size="small" closable @close="removeEditor(e.員工工號)">
                  {{ e.員工姓名 }}
                </el-tag>
              </div>
            </div>
          </div>
        </el-col>

        <!-- Right: Relations + Actions -->
        <el-col :span="12">
          <div class="kb-card field-card">
            <!-- Linked Articles -->
            <div class="field-group">
              <label class="field-label">關聯文章</label>
              <el-button plain size="small" :disabled="!isEditing && mode !== 'create'">
                <el-icon><Document /></el-icon> 選擇關聯文章（可多選）
              </el-button>
              <div class="selected-items" v-if="form.linkedArticleIds.length">
                <el-tag v-for="aid in form.linkedArticleIds" :key="aid" size="small">文章 #{{ aid }}</el-tag>
              </div>
            </div>

            <!-- Public -->
            <div class="field-group">
              <label class="field-label">是否公開</label>
              <el-radio-group v-model="form.isPublic" size="small" :disabled="!isEditing && mode !== 'create'">
                <el-radio :value="true">公開</el-radio>
                <el-radio :value="false">部門私有</el-radio>
              </el-radio-group>
            </div>

            <!-- Comment & History -->
            <div class="field-group side-btns" v-if="mode !== 'create'">
              <el-button plain @click="showCommentPanel = true">
                <el-icon><ChatDotSquare /></el-icon> 評論
              </el-button>
              <el-button plain @click="showHistoryPanel = true">
                <el-icon><Clock /></el-icon> 修改紀錄
              </el-button>
            </div>
          </div>
        </el-col>
      </el-row>

      <!-- Description Textarea -->
      <div class="kb-card desc-card">
        <label class="field-label">附件說明</label>
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="4"
          placeholder="描述附件內容、用途、注意事項..."
          :readonly="!isEditing && mode !== 'create'"
          resize="none"
        />
      </div>

      <!-- File upload area -->
      <div class="kb-card upload-card">
        <label class="field-label">檔案</label>

        <el-upload
          v-if="isEditing || mode === 'create'"
          drag
          multiple
          :auto-upload="false"
          :file-list="fileList"
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

        <!-- Existing files -->
        <div class="file-list" v-if="attachment?.files?.length">
          <div v-for="f in attachment.files" :key="f.uuid" class="file-item">
            <el-icon class="file-icon"><Paperclip /></el-icon>
            <span class="file-name">{{ f.name }}</span>
            <span class="file-size">{{ formatFileSize(f.size) }}</span>
            <el-button text size="small" type="primary" :href="f.url" tag="a" target="_blank">
              下載
            </el-button>
          </div>
        </div>
      </div>
    </template>

    <!-- Panels -->
    <CommentPanel v-model="showCommentPanel" :article-id="id" />
    <VersionHistoryPanel v-model="showHistoryPanel" :article-id="id" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth.js'
import { useDirectoryStore } from '@/store/directory.js'
import { attachmentService, tagService, colleagueService } from '@/services/api.js'
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
const fileList = ref([])
const isEditing = ref(props.mode === 'edit')
const showCommentPanel = ref(false)
const showHistoryPanel = ref(false)

const form = reactive({
  description: '',
  isPublished: true,
  isPublic: false,
  directories: [],
  tagIds: [],
  linkedArticleIds: [],
  editorIds: [],
})

const selectedEditors = computed(() =>
  colleagues.value.filter(c => form.editorIds.includes(c.員工工號))
)

const canEdit = computed(() => {
  if (!attachment.value) return false
  return auth.isAdmin || auth.isManager ||
    attachment.value.editorIds?.includes(auth.user?.員工工號) ||
    attachment.value.createdBy?.員工工號 === auth.user?.員工工號
})

function removeDir(id) { form.directories = form.directories.filter(d => d !== id) }
function removeEditor(id) { form.editorIds = form.editorIds.filter(e => e !== id) }
function onFileChange(file) { fileList.value = [...fileList.value, file] }

async function saveAttachment() {
  saving.value = true
  try {
    await attachmentService.update(props.id, { ...form })
    ElMessage.success('已儲存')
    isEditing.value = false
    await loadAttachment()
  } finally { saving.value = false }
}

async function createAttachment() {
  if (form.directories.length === 0) return ElMessage.warning('請選擇所屬目錄')
  saving.value = true
  try {
    const created = await attachmentService.create({ ...form })
    ElMessage.success('附件建立成功')
    router.push(`/attachment/${created.id}`)
  } finally { saving.value = false }
}

async function loadAttachment() {
  if (!props.id) return
  loading.value = true
  try {
    attachment.value = await attachmentService.getById(props.id)
    Object.assign(form, {
      description: attachment.value.description,
      isPublished: attachment.value.isPublished,
      isPublic: attachment.value.isPublic,
      directories: [...(attachment.value.directories || [])],
      tagIds: attachment.value.tags?.map(t => t.id) || [],
      linkedArticleIds: [...(attachment.value.linkedArticleIds || [])],
      editorIds: [...(attachment.value.editorIds || [])],
    })
  } catch {
    ElMessage.error('附件不存在或無權限')
    router.push('/home')
  } finally { loading.value = false }
}

onMounted(async () => {
  ;[tags.value, colleagues.value] = await Promise.all([tagService.getAll(), colleagueService.getAll()])
  if (props.mode !== 'create') await loadAttachment()
})
</script>

<style scoped>
.attachment-view {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.att-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
}

.att-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.meta-dates { display: flex; gap: 12px; }
.meta-item { font-size: 11px; color: var(--color-text-muted); }
.header-actions { display: flex; gap: 8px; }

.field-card { padding: 20px 24px; }

.field-group { margin-bottom: 16px; }
.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}
.full-width { width: 100%; }
.selected-items { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.side-btns { display: flex; gap: 8px; }

/* Description */
.desc-card { padding: 20px 24px; }

/* Upload */
.upload-card { padding: 20px 24px; }
.upload-dragger { width: 100%; margin-top: 8px; }

.upload-inner { text-align: center; padding: 20px 0; }
.upload-icon { font-size: 40px; color: var(--color-text-muted); margin-bottom: 10px; }
.upload-text { font-size: 14px; color: var(--color-text-secondary); margin-bottom: 4px; }
.upload-text em { color: var(--color-primary); font-style: normal; cursor: pointer; }
.upload-hint { font-size: 12px; color: var(--color-text-muted); }

.file-list { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--color-surface-2);
  border-radius: var(--border-radius-sm);
  font-size: 13px;
}
.file-icon { color: var(--color-success); flex-shrink: 0; }
.file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-size { color: var(--color-text-muted); font-size: 11px; flex-shrink: 0; }
</style>
