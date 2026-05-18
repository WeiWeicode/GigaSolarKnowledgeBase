<template>
  <div class="settings-view">
    <h1 class="page-title">個人設定</h1>

    <el-tabs v-model="activeTab" class="settings-tabs">
      <!-- Personal Info -->
      <el-tab-pane label="個人資訊" name="profile">
        <div class="kb-card settings-card">
          <h3 class="card-title">個人資訊（來源：BPM，唯讀）</h3>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="員工姓名">{{ user?.員工姓名 }}</el-descriptions-item>
            <el-descriptions-item label="員工工號">{{ user?.員工工號 }}</el-descriptions-item>
            <el-descriptions-item label="職稱">{{ user?.職稱 }}</el-descriptions-item>
            <el-descriptions-item label="級職">{{ user?.級職 }}</el-descriptions-item>
            <el-descriptions-item label="部門">{{ user?.部門名稱 }}</el-descriptions-item>
            <el-descriptions-item label="公司">{{ user?.組織名稱 }}</el-descriptions-item>
            <el-descriptions-item label="Email" :span="2">{{ user?.員工Mail }}</el-descriptions-item>
            <el-descriptions-item label="主管">{{ user?.主管姓名 }}（{{ user?.主管工號 }}）</el-descriptions-item>
            <el-descriptions-item label="角色">
              <el-tag :type="roleTagType" size="small">{{ roleLabel }}</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </el-tab-pane>

      <!-- Notification Settings -->
      <el-tab-pane label="通知設定" name="notification">
        <div class="kb-card settings-card">
          <h3 class="card-title">通知偏好設定</h3>
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">@提及 in-app 通知</span>
              <span class="setting-desc">當有人在留言中 @提及你時，顯示首頁通知卡片</span>
            </div>
            <el-switch v-model="notifEnabled" />
          </div>
        </div>
      </el-tab-pane>

      <!-- Default View -->
      <el-tab-pane label="預設顯示" name="defaults">
        <div class="kb-card settings-card">
          <h3 class="card-title">預設公司 / 部門</h3>
          <div class="field-group">
            <label class="field-label">預設公司</label>
            <el-input :value="user?.組織名稱" disabled />
          </div>
          <div class="field-group">
            <label class="field-label">預設部門</label>
            <el-input :value="user?.部門名稱" disabled />
          </div>
          <p class="setting-desc" style="margin-top: 8px;">預設值由 BPM 登入資料決定，目前不支援手動覆蓋。</p>
        </div>
      </el-tab-pane>

      <!-- Cross-Department Management（僅 MANAGER） -->
      <el-tab-pane v-if="auth.role === 'MANAGER'" label="跨部門管理" name="crossDept">
        <div class="kb-card settings-card">
          <h3 class="card-title">新增跨部門授權</h3>
          <p class="setting-desc" style="margin-bottom: 16px;">
            授權指定同仁切換至其他部門的知識庫目錄。授權後，該同仁的部門下拉選單將可選擇被授權的部門。
          </p>

          <!-- 新增授權表單 -->
          <div class="grant-form">
            <div class="grant-form-row">
              <div class="field-group">
                <label class="field-label">被授權同仁</label>
                <el-select
                  v-model="newGrant.account"
                  placeholder="請選擇同仁"
                  filterable
                  :loading="colleaguesLoading"
                  style="width: 200px"
                >
                  <el-option
                    v-for="c in colleagues"
                    :key="c.員工工號"
                    :label="`${c.員工姓名}（${c.員工工號}）`"
                    :value="String(c.員工工號)"
                  />
                </el-select>
              </div>

              <div class="field-group">
                <label class="field-label">目標公司</label>
                <el-select
                  v-model="newGrant.org_oid"
                  placeholder="請選擇公司"
                  :loading="companiesLoading"
                  style="width: 160px"
                  @change="onGrantCompanyChange"
                >
                  <el-option
                    v-for="c in companies"
                    :key="c.組織OID"
                    :label="c.組織名稱"
                    :value="c.組織OID"
                  />
                </el-select>
              </div>

              <div class="field-group">
                <label class="field-label">目標部門</label>
                <el-select
                  v-model="newGrant.dept_code"
                  placeholder="請先選公司"
                  filterable
                  :filter-method="filterDept"
                  :loading="deptLoading"
                  style="width: 240px"
                  @change="onGrantDeptChange"
                >
                  <el-option
                    v-for="d in filteredGrantDepts"
                    :key="d.部門代碼"
                    :label="`${d.部門名稱}（${d.部門代碼}）`"
                    :value="d.部門代碼"
                  />
                </el-select>
              </div>

              <el-button
                type="primary"
                :loading="creating"
                :disabled="!newGrant.account || !newGrant.org_oid || !newGrant.dept_code"
                @click="handleCreate"
              >
                新增授權
              </el-button>
            </div>
          </div>
        </div>

        <!-- 已建立的授權紀錄 -->
        <div class="kb-card settings-card" style="margin-top: 16px;">
          <h3 class="card-title">已建立的授權紀錄</h3>
          <el-table
            :data="createdGrants"
            v-loading="grantsLoading"
            empty-text="尚未建立任何跨部門授權"
            size="small"
          >
            <el-table-column label="被授權同仁" width="180">
              <template #default="{ row }">
                {{ colleagueName(row.account) }}（{{ row.account }}）
              </template>
            </el-table-column>
            <el-table-column label="目標公司 OID" prop="org_oid" width="140" />
            <el-table-column label="目標部門代碼" prop="dept_code" width="140" />
            <el-table-column label="目標部門名稱" prop="dept_name" min-width="120" />
            <el-table-column label="建立時間" width="160">
              <template #default="{ row }">
                {{ row.created_at ? new Date(row.created_at).toLocaleString('zh-TW') : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" fixed="right">
              <template #default="{ row }">
                <el-button
                  type="danger"
                  size="small"
                  text
                  @click="handleRemove(row)"
                >
                  刪除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/store/auth.js'
import { metaService, crossDeptService, colleagueService } from '@/services/api.js'

const auth = useAuthStore()
const user = computed(() => auth.user)
const activeTab = ref('profile')
const notifEnabled = ref(true)

const roleLabel = computed(() => ({ ADMIN: '管理員', MANAGER: '主管', MEMBER: '一般同仁', GUEST: '訪客' }[auth.role] || ''))
const roleTagType = computed(() => ({ ADMIN: 'danger', MANAGER: 'warning', MEMBER: 'success', GUEST: 'info' }[auth.role] || 'info'))

// ── 跨部門管理（僅 MANAGER） ─────────────────────────────────
const colleagues      = ref([])
const companies       = ref([])
const grantDepts      = ref([])
const deptFilterQuery = ref('')

// 支援中文名稱與部門代號同時搜尋
const filteredGrantDepts = computed(() => {
  const q = deptFilterQuery.value.trim().toLowerCase()
  if (!q) return grantDepts.value
  return grantDepts.value.filter(d =>
    d.部門名稱?.toLowerCase().includes(q) ||
    d.部門代碼?.toLowerCase().includes(q)
  )
})

function filterDept(query) {
  deptFilterQuery.value = query
}

/** 由工號查同仁姓名（列表未載入時回傳空字串） */
function colleagueName(account) {
  const found = colleagues.value.find(c => String(c.員工工號) === String(account))
  return found?.員工姓名 || ''
}
const createdGrants   = ref([])

const colleaguesLoading = ref(false)
const companiesLoading  = ref(false)
const deptLoading       = ref(false)
const grantsLoading     = ref(false)
const creating          = ref(false)

const newGrant = ref({ account: '', org_oid: '', dept_code: '', dept_name: '' })

async function onGrantCompanyChange(oid) {
  newGrant.value.dept_code = ''
  newGrant.value.dept_name = ''
  deptFilterQuery.value = ''
  if (!oid) { grantDepts.value = []; return }
  try {
    deptLoading.value = true
    grantDepts.value = await metaService.getDepartments(oid)
  } catch {
    ElMessage.error('載入部門清單失敗')
  } finally {
    deptLoading.value = false
  }
}

function onGrantDeptChange(deptCode) {
  const found = grantDepts.value.find(d => d.部門代碼 === deptCode)
  newGrant.value.dept_name = found?.部門名稱 || ''
}

async function handleCreate() {
  try {
    creating.value = true
    await crossDeptService.create({
      account:   newGrant.value.account,
      org_oid:   newGrant.value.org_oid,
      dept_code: newGrant.value.dept_code,
      dept_name: newGrant.value.dept_name,
    })
    ElMessage.success('跨部門授權已新增')
    newGrant.value = { account: '', org_oid: '', dept_code: '', dept_name: '' }
    grantDepts.value = []
    await loadCreatedGrants()
  } catch (e) {
    const msg = e?.response?.data?.message || '新增授權失敗'
    ElMessage.error(msg)
  } finally {
    creating.value = false
  }
}

async function handleRemove(row) {
  try {
    await ElMessageBox.confirm(
      `確定要刪除對「${row.account}」的「${row.dept_name || row.dept_code}」授權嗎？`,
      '刪除確認',
      { confirmButtonText: '刪除', cancelButtonText: '取消', type: 'warning' }
    )
    await crossDeptService.remove(row.id)
    ElMessage.success('授權紀錄已刪除')
    await loadCreatedGrants()
  } catch (e) {
    if (e === 'cancel') return
    const msg = e?.response?.data?.message || '刪除失敗'
    ElMessage.error(msg)
  }
}

async function loadCreatedGrants() {
  try {
    grantsLoading.value = true
    createdGrants.value = await crossDeptService.getCreated()
  } catch {
    ElMessage.error('載入授權紀錄失敗')
  } finally {
    grantsLoading.value = false
  }
}

// 切換到跨部門 Tab 時才載入資料（懶載入，避免無謂的 API 呼叫）
watch(activeTab, async (tab) => {
  if (tab !== 'crossDept' || auth.role !== 'MANAGER') return

  if (colleagues.value.length === 0) {
    try {
      colleaguesLoading.value = true
      colleagues.value = await colleagueService.getAll()
    } catch {
      ElMessage.error('載入同仁清單失敗')
    } finally {
      colleaguesLoading.value = false
    }
  }

  if (companies.value.length === 0) {
    try {
      companiesLoading.value = true
      companies.value = await metaService.getCompanies()
    } catch {
      ElMessage.error('載入公司清單失敗')
    } finally {
      companiesLoading.value = false
    }
  }

  await loadCreatedGrants()
})
</script>

<style scoped>
.settings-view { max-width: 800px; margin: 0 auto; }
.page-title { font-size: 22px; font-weight: 700; color: var(--color-text-primary); margin-bottom: 24px; }

.settings-tabs {
  --el-tabs-header-height: 40px;
}

.settings-card { padding: 24px; }
.card-title { font-size: 15px; font-weight: 700; color: var(--color-text-primary); margin-bottom: 16px; }

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid var(--color-border);
}
.setting-item:last-child { border-bottom: none; }

.setting-info { display: flex; flex-direction: column; gap: 4px; }
.setting-label { font-size: 13px; font-weight: 600; color: var(--color-text-primary); }
.setting-desc { font-size: 12px; color: var(--color-text-muted); }

.field-group { margin-bottom: 14px; }
.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.grant-form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
}
.grant-form-row .field-group {
  margin-bottom: 0;
}
</style>
