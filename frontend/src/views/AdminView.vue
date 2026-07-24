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

      <!-- API Key Settings -->
      <el-tab-pane label="API Key 設定" name="apiKey">
        <div class="kb-card tab-card" v-loading="apiKeyConfigLoading">
          <h3 class="card-title">AiRAG 存取金鑰與知識庫配置</h3>

          <!-- 當前切換環境選擇 -->
          <div class="field-group env-switch-group">
            <label class="field-label font-bold">當前啟用系統環境：</label>
            <el-radio-group v-model="apiKeyConfig.activeEnv" size="default">
              <el-radio-button label="prod">生產區 (Production)</el-radio-button>
              <el-radio-button label="test">測試區 (Test / Dev)</el-radio-button>
            </el-radio-group>
            <p class="storage-hint mt-8">切換後，系統 API 呼叫將自動使用該環境之 API Key 與 知識庫 ID</p>
          </div>

          <el-divider content-position="left">生產區 (Production) 設定</el-divider>
          <div class="field-group">
            <label class="field-label">生產區 Chat API Key</label>
            <el-input
              v-model="apiKeyConfig.prodApiKey"
              placeholder="請輸入生產區 AiRAG Chat API Key"
              show-password
            />
          </div>
          <div class="field-group">
            <label class="field-label">生產區 知識庫 ID (Knowledge Base ID)</label>
            <el-input
              v-model="apiKeyConfig.prodKnowledgeBaseId"
              placeholder="例如：6a6020afca0400ef553cc075"
            />
          </div>

          <el-divider content-position="left">測試區 (Test / Dev) 設定</el-divider>
          <div class="field-group">
            <label class="field-label">測試區 Chat API Key</label>
            <el-input
              v-model="apiKeyConfig.devApiKey"
              placeholder="請輸入測試區 AiRAG Chat API Key"
              show-password
            />
          </div>
          <div class="field-group">
            <label class="field-label">測試區 知識庫 ID (Knowledge Base ID)</label>
            <el-input
              v-model="apiKeyConfig.devKnowledgeBaseId"
              placeholder="例如：6a6020afca0400ef553cc075_test"
            />
          </div>

          <el-button type="primary" :loading="apiKeyConfigSaving" class="mt-16" @click="saveApiKeyConfig">
            儲存 API Key 設定
          </el-button>
        </div>
      </el-tab-pane>

      <!-- RAG Sync Schedule -->
      <el-tab-pane label="RAG 同步排程" name="ragSchedule">
        <div class="kb-card tab-card" v-loading="ragConfigLoading">
          <h3 class="card-title">排程設定</h3>
          <div class="field-group">
            <label class="field-label">Cron 表達式</label>
            <el-input v-model="ragConfig.cronExpression" placeholder="0 * * * *" />
          </div>
          <div class="field-group">
            <label class="field-label">啟用排程</label>
            <el-switch v-model="ragConfig.isEnabled" />
          </div>
          <div class="field-group">
            <label class="field-label">單次批次筆數</label>
            <el-input-number v-model="ragConfig.batchSize" :min="1" :max="200" />
          </div>
          <div class="field-group">
            <label class="field-label">上次執行摘要</label>
            <p class="storage-hint">
              {{ ragConfig.lastRunAt ? new Date(ragConfig.lastRunAt).toLocaleString() : '尚未執行' }}
              <template v-if="ragConfig.lastRunSummary">
                — 檢查 {{ ragConfig.lastRunSummary.checked ?? 0 }} 筆，
                觸發 {{ ragConfig.lastRunSummary.triggered ?? 0 }} 筆，
                失敗 {{ ragConfig.lastRunSummary.failed ?? 0 }} 筆
              </template>
            </p>
          </div>
          <el-button type="primary" :loading="ragConfigSaving" @click="saveRagConfig">儲存排程設定</el-button>
        </div>
      </el-tab-pane>

      <!-- RAG Sync Status -->
      <el-tab-pane label="RAG 同步比對" name="ragStatus">
        <div class="kb-card tab-card">
          <h3 class="card-title">同步狀態列表</h3>
          <div class="rag-filter-bar">
            <el-select v-model="ragStatusFilter.status" placeholder="狀態" clearable style="width:160px" @change="loadRagStatusList">
              <el-option label="AI 待處理" value="not_synced" />
              <el-option label="AI 待更新" value="outdated" />
              <el-option label="AI 處理中" value="processing" />
              <el-option label="AI 已就緒" value="completed" />
              <el-option label="AI 處理失敗" value="failed" />
              <el-option label="已下架 (已刪除向量)" value="unpublished_kept" />
              <el-option label="已下架 (移除問答)" value="unpublished_deleted" />
            </el-select>
            <el-select v-model="ragStatusFilter.sourceType" placeholder="類型" clearable style="width:120px" @change="loadRagStatusList">
              <el-option label="文章" value="article" />
              <el-option label="附件檔案" value="attachment_file" />
            </el-select>
            <el-input
              v-model="ragStatusFilter.keyword" placeholder="搜尋標題/檔名" style="width:200px" clearable
              @keydown.enter="loadRagStatusList" @clear="loadRagStatusList"
            />
            <el-button @click="loadRagStatusList">查詢</el-button>
            <el-button type="warning" plain :disabled="!ragStatusSelection.length" @click="executeRagStatusManual">
              指定執行切分
            </el-button>
            <el-button type="primary" plain :loading="ragAuditRunning" @click="runRagAudit">全量校驗</el-button>
          </div>

          <el-table
            :data="ragStatusList" size="small" border v-loading="ragStatusLoading"
            @selection-change="handleRagStatusSelectionChange"
          >
            <el-table-column type="selection" width="45" />
            <el-table-column label="類型" width="90">
              <template #default="{ row }">{{ ragSourceTypeLabel(row.sourceType) }}</template>
            </el-table-column>
            <el-table-column prop="title" label="標題 / 檔名" show-overflow-tooltip />
            <el-table-column label="狀態" width="130">
              <template #default="{ row }">
                <el-tooltip :content="ragStatusTooltip(row.status)" placement="top">
                  <el-tag size="small" :type="ragStatusTagType(row.status)" class="cursor-pointer">{{ ragStatusLabel(row.status) }}</el-tag>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="目標版本" prop="targetVersion" width="90" />
            <el-table-column label="最後檢查時間" width="160">
              <template #default="{ row }">{{ row.lastCheckedAt ? new Date(row.lastCheckedAt).toLocaleString() : '—' }}</template>
            </el-table-column>
            <el-table-column label="錯誤訊息" show-overflow-tooltip>
              <template #default="{ row }">{{ row.errorMessage || '—' }}</template>
            </el-table-column>
          </el-table>

          <el-pagination
            class="rag-pagination"
            background layout="prev, pager, next, total"
            v-model:current-page="ragStatusPage"
            v-model:page-size="ragStatusPageSize"
            :total="ragStatusTotal"
            @current-change="loadRagStatusList"
          />
        </div>
      </el-tab-pane>

      <!-- RAG Sync Logs -->
      <el-tab-pane label="RAG 同步日誌" name="ragLogs">
        <div class="kb-card tab-card">
          <h3 class="card-title">錯誤 / 事件日誌</h3>
          <div class="rag-filter-bar">
            <el-select v-model="ragLogFilter.stage" placeholder="階段" clearable style="width:170px" @change="loadRagLogs">
              <el-option label="比對 (compare)" value="compare" />
              <el-option label="通知 (notify)" value="notify" />
              <el-option label="拉取內容 (fetch_content)" value="fetch_content" />
              <el-option label="切分 (chunking)" value="chunking" />
              <el-option label="Embedding" value="embedding" />
              <el-option label="Qdrant 寫入" value="qdrant_upsert" />
            </el-select>
            <el-select v-model="ragLogFilter.level" placeholder="等級" clearable style="width:110px" @change="loadRagLogs">
              <el-option label="Info" value="info" />
              <el-option label="Warning" value="warning" />
              <el-option label="Error" value="error" />
            </el-select>
            <el-button @click="loadRagLogs">查詢</el-button>
          </div>

          <el-table :data="ragLogList" size="small" border v-loading="ragLogLoading">
            <el-table-column label="時間" width="160">
              <template #default="{ row }">{{ row.occurredAt ? new Date(row.occurredAt).toLocaleString() : '—' }}</template>
            </el-table-column>
            <el-table-column label="來源" width="150">
              <template #default="{ row }">
                <span v-if="row.sourceType">{{ ragSourceTypeLabel(row.sourceType) }} #{{ row.sourceId }}</span>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <el-table-column prop="stage" label="階段" width="130" />
            <el-table-column label="等級" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.level === 'error' ? 'danger' : (row.level === 'warning' ? 'warning' : 'info')">
                  {{ row.level }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="message" label="訊息" show-overflow-tooltip />
          </el-table>

          <el-pagination
            class="rag-pagination"
            background layout="prev, pager, next, total"
            v-model:current-page="ragLogPage"
            v-model:page-size="ragLogPageSize"
            :total="ragLogTotal"
            @current-change="loadRagLogs"
          />
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
import { ref, reactive, onMounted } from 'vue'
import { metaService, tagService, colleagueService, ragSyncService, aiService } from '@/services/api.js'
import { clearAiConfigCache } from '@/services/AiRAGApi.js'
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

// ── API Key 設定 ─────────────────────────────────────────────
const apiKeyConfig = reactive({
  activeEnv: 'prod',
  prodApiKey: '',
  prodKnowledgeBaseId: '',
  devApiKey: '',
  devKnowledgeBaseId: '',
})
const apiKeyConfigLoading = ref(false)
const apiKeyConfigSaving  = ref(false)

// ── RAG 同步排程 ─────────────────────────────────────────────
const ragConfig = reactive({
  cronExpression: '0 * * * *',
  isEnabled: true,
  batchSize: 20,
  lastRunAt: null,
  lastRunSummary: null,
})
const ragConfigLoading = ref(false)
const ragConfigSaving  = ref(false)

// ── RAG 同步比對 ─────────────────────────────────────────────
const ragStatusList      = ref([])
const ragStatusTotal     = ref(0)
const ragStatusPage      = ref(1)
const ragStatusPageSize  = ref(20)
const ragStatusLoading   = ref(false)
const ragStatusFilter    = reactive({ status: '', sourceType: '', keyword: '' })
const ragStatusSelection = ref([])
const ragAuditRunning    = ref(false)

// ── RAG 同步日誌 ─────────────────────────────────────────────
const ragLogList     = ref([])
const ragLogTotal    = ref(0)
const ragLogPage     = ref(1)
const ragLogPageSize = ref(20)
const ragLogLoading  = ref(false)
const ragLogFilter   = reactive({ stage: '', level: '' })

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

// ── API Key 設定 ─────────────────────────────────────────────
async function loadApiKeyConfig() {
  apiKeyConfigLoading.value = true
  try {
    const data = await aiService.getConfig()
    if (data) {
      apiKeyConfig.activeEnv = data.activeEnv || 'prod'
      apiKeyConfig.prodApiKey = data.prodApiKey || ''
      apiKeyConfig.prodKnowledgeBaseId = data.prodKnowledgeBaseId || ''
      apiKeyConfig.devApiKey = data.devApiKey || ''
      apiKeyConfig.devKnowledgeBaseId = data.devKnowledgeBaseId || ''
    }
  } catch (e) {
    ElMessage.error('API Key 設定載入失敗：' + (e.message || ''))
  } finally {
    apiKeyConfigLoading.value = false
  }
}

async function saveApiKeyConfig() {
  apiKeyConfigSaving.value = true
  try {
    await aiService.updateConfig({
      activeEnv: apiKeyConfig.activeEnv,
      prodApiKey: apiKeyConfig.prodApiKey,
      prodKnowledgeBaseId: apiKeyConfig.prodKnowledgeBaseId,
      devApiKey: apiKeyConfig.devApiKey,
      devKnowledgeBaseId: apiKeyConfig.devKnowledgeBaseId,
    })
    clearAiConfigCache()
    ElMessage.success('API Key 設定已成功儲存')
    await loadApiKeyConfig()
  } catch (e) {
    ElMessage.error('儲存失敗：' + (e.message || ''))
  } finally {
    apiKeyConfigSaving.value = false
  }
}

// ── RAG 同步：狀態顯示輔助 ───────────────────────────────────
function ragStatusLabel(status) {
  return {
    not_synced: 'AI 待處理', outdated: 'AI 待更新', processing: 'AI 處理中',
    completed: 'AI 已就緒', failed: 'AI 處理失敗',
    unpublished_kept: '已下架 (已刪除向量)', unpublished_deleted: '已下架 (移除問答)',
  }[status] || status
}
function ragStatusTooltip(status) {
  return {
    not_synced: 'AI 尚未處理此資料',
    outdated: '內容已修改，等待 AI 重新處理更新',
    processing: 'AI 正在將資料處理中',
    completed: 'AI 已經處理完成，可於問答中詢問',
    failed: 'AI 向量處理失敗，請告知資訊人員',
    unpublished_kept: '內容已下架，AI 檢索用的向量資料已刪除',
    unpublished_deleted: '內容已下架，並已移除 AI 檢索資料',
  }[status] || 'AI 尚未處理此資料'
}
function ragStatusTagType(status) {
  return {
    completed: 'success', processing: 'primary', not_synced: 'info',
    outdated: 'warning', failed: 'danger',
    unpublished_kept: 'info', unpublished_deleted: 'info',
  }[status] || 'info'
}
function ragSourceTypeLabel(type) {
  return type === 'article' ? '文章' : '附件檔案'
}

// ── RAG 同步排程 ─────────────────────────────────────────────
async function loadRagConfig() {
  ragConfigLoading.value = true
  try {
    const cfg = await ragSyncService.getConfig()
    Object.assign(ragConfig, cfg)
  } catch (e) {
    ElMessage.error('排程設定載入失敗：' + (e.message || ''))
  } finally {
    ragConfigLoading.value = false
  }
}

async function saveRagConfig() {
  ragConfigSaving.value = true
  try {
    await ragSyncService.updateConfig({
      cronExpression: ragConfig.cronExpression,
      isEnabled:      ragConfig.isEnabled,
      batchSize:       ragConfig.batchSize,
    })
    ElMessage.success('排程設定已儲存')
    await loadRagConfig()
  } catch (e) {
    ElMessage.error('儲存失敗：' + (e.message || ''))
  } finally {
    ragConfigSaving.value = false
  }
}

// ── RAG 同步比對 ─────────────────────────────────────────────
async function loadRagStatusList() {
  ragStatusLoading.value = true
  try {
    const res = await ragSyncService.getStatusList({
      page:       ragStatusPage.value,
      pageSize:   ragStatusPageSize.value,
      status:     ragStatusFilter.status || undefined,
      sourceType: ragStatusFilter.sourceType || undefined,
      keyword:    ragStatusFilter.keyword || undefined,
    })
    ragStatusList.value  = res.items
    ragStatusTotal.value = res.total
  } catch (e) {
    ElMessage.error('比對狀態列表載入失敗：' + (e.message || ''))
  } finally {
    ragStatusLoading.value = false
  }
}

function handleRagStatusSelectionChange(rows) {
  ragStatusSelection.value = rows
}

async function executeRagStatusManual() {
  if (!ragStatusSelection.value.length) return ElMessage.warning('請先勾選項目')
  try {
    await ragSyncService.executeManual(
      ragStatusSelection.value.map(r => ({ sourceType: r.sourceType, sourceId: r.sourceId }))
    )
    ElMessage.success('已送出重新執行請求')
    await loadRagStatusList()
  } catch (e) {
    ElMessage.error('執行失敗：' + (e.message || ''))
  }
}

async function runRagAudit() {
  ragAuditRunning.value = true
  try {
    await ragSyncService.runAudit()
    ElMessage.success('全量校驗已開始執行，完成後可重新查詢比對列表查看結果')
  } catch (e) {
    ElMessage.error('觸發全量校驗失敗：' + (e.message || ''))
  } finally {
    ragAuditRunning.value = false
  }
}

// ── RAG 同步日誌 ─────────────────────────────────────────────
async function loadRagLogs() {
  ragLogLoading.value = true
  try {
    const res = await ragSyncService.getLogs({
      page:     ragLogPage.value,
      pageSize: ragLogPageSize.value,
      stage:    ragLogFilter.stage || undefined,
      level:    ragLogFilter.level || undefined,
    })
    ragLogList.value  = res.items
    ragLogTotal.value = res.total
  } catch (e) {
    ElMessage.error('同步日誌載入失敗：' + (e.message || ''))
  } finally {
    ragLogLoading.value = false
  }
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

  await loadApiKeyConfig()
  await loadRagConfig()
  await loadRagStatusList()
  await loadRagLogs()
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

.rag-filter-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 16px; }
.rag-pagination { margin-top: 16px; justify-content: flex-end; }
</style>
