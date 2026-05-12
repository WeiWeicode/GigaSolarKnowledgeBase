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
          <el-table :data="users" size="small" border>
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
          <div class="storage-info">
            <div class="storage-stat">
              <span class="stat-label">已使用</span>
              <span class="stat-value">2.4 GB</span>
            </div>
            <div class="storage-stat">
              <span class="stat-label">總容量</span>
              <span class="stat-value">50 GB</span>
            </div>
            <div class="storage-stat">
              <span class="stat-label">使用率</span>
              <span class="stat-value">4.8%</span>
            </div>
          </div>
          <el-progress :percentage="4.8" :stroke-width="12" class="storage-progress" />
          <p class="storage-hint">備份策略由維運團隊自行設定</p>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { metaService, tagService } from '@/services/api.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { mockColleagues } from '@/services/mockData.js'

const activeTab = ref('company')
const companies = ref([])
const allTags = ref([])
const showAddTag = ref(false)

const users = ref(mockColleagues.map(c => ({ ...c, role: 'MEMBER' })))
users.value[2].role = 'MANAGER' // 鄭智寬 is manager

const trashItems = ref([
  { id: 999, type: 'article', title: '舊版部署文件（已下架）', deletedAt: '2026-05-01 10:00' },
])

const systemLogs = ref([
  { id: 1, actor: '蔣佳緯', action: '建立文章「Vue 3 Coding Style」', time: '2026-05-10 14:30' },
  { id: 2, actor: '陳志豪', action: '下架文章「舊版部署文件」', time: '2026-05-01 10:00' },
  { id: 3, actor: '鄭智寬', action: '新增目錄「系統開發規範」', time: '2026-04-15 09:00' },
])

const aiConfig = ref({
  endpoint: 'http://ai-host:11434',
  model: 'qwen3.6:35b',
  systemPrompt: '你是集團知識庫的 AI 助手，請以繁體中文回答，並根據所給的文章內容提供準確的資訊。',
})

function roleLabel(r) { return { ADMIN: '管理員', MANAGER: '主管', MEMBER: '同仁', GUEST: '訪客' }[r] || r }
function roleType(r)  { return { ADMIN: 'danger', MANAGER: 'warning', MEMBER: 'success', GUEST: 'info' }[r] || 'info' }

function upgradeRole(row) {
  const order = ['GUEST', 'MEMBER', 'MANAGER', 'ADMIN']
  const idx = order.indexOf(row.role)
  if (idx < order.length - 1) { row.role = order[idx + 1]; ElMessage.success(`${row.員工姓名} 已升級為 ${roleLabel(row.role)}`) }
}
function downgradeRole(row) {
  const order = ['GUEST', 'MEMBER', 'MANAGER', 'ADMIN']
  const idx = order.indexOf(row.role)
  if (idx > 0) { row.role = order[idx - 1]; ElMessage.warning(`${row.員工姓名} 已降級為 ${roleLabel(row.role)}`) }
}

async function permanentDelete(row) {
  await ElMessageBox.confirm(`確定要永久刪除「${row.title}」嗎？此操作無法復原。`, '永久刪除', { type: 'error', confirmButtonText: '確認刪除', cancelButtonText: '取消' })
  trashItems.value = trashItems.value.filter(t => t.id !== row.id)
  ElMessage.success('已永久刪除')
}

function deleteTag(tag) { allTags.value = allTags.value.filter(t => t.id !== tag.id) }

function saveAiConfig() { ElMessage.success('AI 設定已儲存') }

onMounted(async () => {
  companies.value = await metaService.getCompanies()
  allTags.value = await tagService.getAll()
})
</script>

<style scoped>
.admin-view { max-width: 960px; margin: 0 auto; }
.page-title { font-size: 22px; font-weight: 700; color: var(--color-text-primary); margin-bottom: 24px; }

.admin-tabs { --el-tabs-header-height: 40px; }
:deep(.el-tabs__item) { font-size: 13px; }

.tab-card { padding: 24px; }
.card-title { font-size: 15px; font-weight: 700; margin-bottom: 16px; color: var(--color-text-primary); }

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
.storage-progress { margin-bottom: 12px; }
.storage-hint { font-size: 12px; color: var(--color-text-muted); }
</style>
