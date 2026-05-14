<template>
  <div class="admin-view">
    <h1 class="page-title">管理員設定</h1>

    <el-tabs v-model="activeTab" tab-position="left" class="admin-tabs">
      <!-- Company -->
      <el-tab-pane label="公司管理" name="company">
        <div class="kb-card tab-card">
          <h3 class="card-title">集團旗下公司（同步自 BPM 組織OID）</h3>
          <el-table :data="companies" size="small" border>
            <el-table-column prop="組織名稱" label="公司名稱" />
            <el-table-column prop="組織OID" label="組織OID" :show-overflow-tooltip="true" />
          </el-table>
        </div>
      </el-tab-pane>

      <!-- Users -->
      <el-tab-pane label="使用者管理" name="users">
        <div class="kb-card tab-card">
          <h3 class="card-title">帳號列表</h3>
          <el-alert
            title="角色升降級功能建置中（待後端補充 user_roles 覆寫機制 B-01）"
            type="warning" :closable="false" show-icon class="mb-16"
          />
          <el-table :data="users" size="small" border v-loading="usersLoading">
            <el-table-column prop="員工工號" label="工號" width="100" />
            <el-table-column prop="員工姓名" label="姓名" width="90" />
            <el-table-column prop="部門名稱" label="部門" />
            <el-table-column prop="role" label="角色" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="roleType(row.role)">{{ roleLabel(row.role) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160">
              <template #default="{ row }">
                <el-button-group size="small">
                  <el-button @click="upgradeRole(row)">升級</el-button>
                  <el-button type="danger" plain @click="downgradeRole(row)">降級</el-button>
                </el-button-group>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- Trash -->
      <el-tab-pane label="垃圾桶管理" name="trash">
        <div class="kb-card tab-card">
          <h3 class="card-title">已下架內容</h3>
          <el-alert
            title="垃圾桶管理功能建置中，尚未串接後端"
            type="warning" :closable="false" show-icon class="mb-16"
          />
          <el-table :data="trashItems" size="small" border>
            <el-table-column prop="type" label="類型" width="70">
              <template #default="{ row }">
                <el-tag size="small" :type="row.type === 'article' ? 'primary' : 'success'">
                  {{ row.type === 'article' ? '文章' : '附件' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="title" label="標題 / 檔名" />
            <el-table-column prop="deletedAt" label="下架時間" width="140" />
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button size="small" type="danger" plain @click="permanentDelete(row)">
                  永久刪除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- Tags -->
      <el-tab-pane label="標籤管理" name="tags">
        <div class="kb-card tab-card">
          <h3 class="card-title">全域標籤</h3>
          <div class="tag-grid">
            <el-tag
              v-for="t in allTags"
              :key="t.id"
              closable
              size="large"
              class="admin-tag"
              @close="deleteTag(t)"
            >
              {{ t.name }}
            </el-tag>
            <el-button type="primary" plain size="small" class="add-tag-btn" @click="showAddTag = true">
              <el-icon><Plus /></el-icon> 新增標籤
            </el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- System Log -->
      <el-tab-pane label="系統日誌" name="logs">
        <div class="kb-card tab-card">
          <h3 class="card-title">操作紀錄</h3>
          <el-alert
            title="系統日誌功能建置中，尚未串接後端"
            type="info" :closable="false" show-icon class="mb-16"
          />
          <el-timeline>
            <el-timeline-item
              v-for="log in systemLogs"
              :key="log.id"
              :timestamp="log.time"
              placement="top"
            >
              <div class="log-item">
                <el-tag size="small" class="log-tag">{{ log.actor }}</el-tag>
                {{ log.action }}
              </div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </el-tab-pane>

      <!-- AI Settings -->
      <el-tab-pane label="AI 設定" name="ai">
        <div class="kb-card tab-card">
          <h3 class="card-title">Ollama 設定</h3>
          <el-alert
            title="AI 設定功能建置中，儲存尚未串接後端"
            type="warning" :closable="false" show-icon class="mb-16"
          />
          <div class="field-group">
            <label class="field-label">Ollama Endpoint</label>
            <el-input v-model="aiConfig.endpoint" placeholder="http://ai-host:11434" />
          </div>
          <div class="field-group">
            <label class="field-label">預設模型</label>
            <el-input v-model="aiConfig.model" placeholder="qwen3.6:35b" />
          </div>
          <div class="field-group">
            <label class="field-label">系統提示詞前綴</label>
            <el-input v-model="aiConfig.systemPrompt" type="textarea" :rows="3" placeholder="你是集團知識庫的 AI 助手..." />
          </div>
          <el-button type="primary" @click="saveAiConfig">儲存 AI 設定</el-button>
        </div>
      </el-tab-pane>

      <!-- File Storage -->
      <el-tab-pane label="檔案儲存" name="storage">
        <div class="kb-card tab-card">
          <h3 class="card-title">Docker Volume 使用量（kb_uploads）</h3>
          <el-alert
            title="儲存空間資訊功能建置中，尚未串接後端"
            type="info" :closable="false" show-icon class="mb-16"
          />
          <div class="storage-info">
            <div class="storage-stat">
              <span class="stat-label">已使用</span>
              <span class="stat-value">—</span>
            </div>
            <div class="storage-stat">
              <span class="stat-label">總容量</span>
              <span class="stat-value">—</span>
            </div>
            <div class="storage-stat">
              <span class="stat-label">使用率</span>
              <span class="stat-value">—</span>
            </div>
          </div>
          <p class="storage-hint">備份策略由維運團隊自行設定</p>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 新增標籤 Dialog -->
    <el-dialog v-model="showAddTag" title="新增標籤" width="360px">
      <el-input
        v-model="addTagName"
        placeholder="請輸入標籤名稱"
        maxlength="20"
        show-word-limit
        @keydown.enter="confirmAddTag"
      />
      <template #footer>
        <el-button @click="showAddTag = false">取消</el-button>
        <el-button type="primary" :loading="addingTag" @click="confirmAddTag">確認新增</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { metaService, tagService, colleagueService } from '@/services/api.js'
import { ElMessage, ElMessageBox } from 'element-plus'

const activeTab   = ref('company')
const companies   = ref([])
const allTags     = ref([])
const users       = ref([])
const usersLoading = ref(false)
const showAddTag  = ref(false)
const addTagName  = ref('')
const addingTag   = ref(false)

// ── hardcode placeholder data（待後端串接）──────────────────
const trashItems = ref([
  // TODO: 後端補 GET /api/v1/admin/trash 端點
])

const systemLogs = ref([
  // TODO: 後端補 GET /api/v1/admin/logs 端點
])

const aiConfig = ref({
  endpoint:     'http://ai-host:11434',
  model:        'qwen3.6:35b',
  systemPrompt: '你是集團知識庫的 AI 助手，請以繁體中文回答，並根據所給的文章內容提供準確的資訊。',
  // TODO: 後端補 GET/PATCH /api/v1/admin/ai-config 端點
})

// ── Helpers ──────────────────────────────────────────────────
function roleLabel(r) { return { ADMIN: '管理員', MANAGER: '主管', MEMBER: '同仁', GUEST: '訪客' }[r] || r }
function roleType(r)  { return { ADMIN: 'danger', MANAGER: 'warning', MEMBER: 'success', GUEST: 'info' }[r] || 'info' }

// ── 使用者角色（待 B-01 後端補完）───────────────────────────
function upgradeRole(row) {
  // TODO: 待後端補充 user_roles 覆寫機制（B-01）後實作
  ElMessage.warning('角色升降級功能建置中，尚未串接後端（B-01）')
}
function downgradeRole(row) {
  ElMessage.warning('角色升降級功能建置中，尚未串接後端（B-01）')
}

// ── 垃圾桶（待後端補完）──────────────────────────────────────
async function permanentDelete(row) {
  await ElMessageBox.confirm(
    `確定要永久刪除「${row.title}」嗎？此操作無法復原。`,
    '永久刪除', { type: 'error', confirmButtonText: '確認刪除', cancelButtonText: '取消' }
  )
  // TODO: 後端補 DELETE /api/v1/admin/trash/:id 端點
  ElMessage.warning('永久刪除功能建置中，尚未串接後端')
}

// ── 標籤管理 ──────────────────────────────────────────────────
async function confirmAddTag() {
  const name = addTagName.value.trim()
  if (!name) return ElMessage.warning('請輸入標籤名稱')
  addingTag.value = true
  try {
    const newTag = await tagService.create(name)
    allTags.value.push(newTag)
    addTagName.value = ''
    showAddTag.value = false
    ElMessage.success('標籤已新增')
  } catch (e) {
    ElMessage.error('新增失敗：' + (e.message || ''))
  } finally {
    addingTag.value = false
  }
}

async function deleteTag(tag) {
  try {
    await tagService.remove(tag.id)
    allTags.value = allTags.value.filter(t => t.id !== tag.id)
    ElMessage.success('標籤已刪除')
  } catch (e) {
    ElMessage.error('刪除失敗：' + (e.message || ''))
  }
}

// ── AI 設定 ──────────────────────────────────────────────────
function saveAiConfig() {
  // TODO: 後端補 PATCH /api/v1/admin/ai-config 端點
  ElMessage.warning('AI 設定儲存功能建置中，尚未串接後端')
}

// ── 初始化 ──────────────────────────────────────────────────
onMounted(async () => {
  try {
    companies.value = await metaService.getCompanies()
  } catch {
    ElMessage.error('公司資料載入失敗')
  }

  try {
    allTags.value = await tagService.getAll()
  } catch {
    ElMessage.error('標籤資料載入失敗')
  }

  usersLoading.value = true
  try {
    const cols = await colleagueService.getAll()
    // 顯示同仁列表，role 欄位待 B-01 後端補完後從 user_roles 取得
    users.value = cols.map(c => ({ ...c, role: 'MEMBER' }))
  } catch {
    ElMessage.error('同仁資料載入失敗')
  } finally {
    usersLoading.value = false
  }
})
</script>

<style scoped>
.admin-view { max-width: 960px; margin: 0 auto; }
.page-title { font-size: 22px; font-weight: 700; color: var(--color-text-primary); margin-bottom: 24px; }

.admin-tabs { --el-tabs-header-height: 40px; }
:deep(.el-tabs__item) { font-size: 13px; }

.tab-card { padding: 24px; }
.card-title { font-size: 15px; font-weight: 700; margin-bottom: 16px; color: var(--color-text-primary); }

.mb-16 { margin-bottom: 16px; }

.tag-grid { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.admin-tag { font-size: 13px; }
.add-tag-btn { height: 28px; }

.log-item { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.log-tag { font-size: 11px; }

.field-group { margin-bottom: 16px; }
.field-label { display: block; font-size: 12px; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 6px; }

.storage-info { display: flex; gap: 40px; margin-bottom: 16px; }
.storage-stat { display: flex; flex-direction: column; gap: 4px; }
.stat-label { font-size: 12px; color: var(--color-text-muted); }
.stat-value { font-size: 22px; font-weight: 700; color: var(--color-text-primary); }
.storage-hint { font-size: 12px; color: var(--color-text-muted); }
</style>
