<template>
  <header class="kb-header">
    <!-- Left: Brand -->
    <div class="header-left">
      <span class="brand-icon">📚</span>
      <span class="brand-name">集團知識庫</span>
    </div>

    <!-- Center: Company / Dept selectors -->
    <div class="header-center">
      <el-select v-model="selectedCompany" placeholder="選擇公司" size="small" class="header-select"
        @change="onCompanyChange">
        <el-option v-for="c in companies" :key="c.組織OID" :label="c.組織名稱" :value="c.組織OID" />
      </el-select>

      <span class="header-divider">｜</span>

      <el-select v-model="selectedDept" placeholder="選擇部門" size="small" class="header-select" @change="onDeptChange">
        <el-option v-for="d in departments" :key="d.部門代碼" :label="d.部門名稱" :value="d.部門代碼" />
      </el-select>
    </div>

    <!-- Right: User + Logout -->
    <div class="header-right">
      <el-badge :value="unreadCount" :hidden="!unreadCount" class="notif-badge">
        <el-popover placement="bottom-end" :width="320" trigger="click" popper-class="notif-popover">
          <template #reference>
            <el-button text circle class="notif-btn">
              <el-icon size="18">
                <Bell />
              </el-icon>
            </el-button>
          </template>

          <div class="notif-popover-header">
            <span>未讀通知 ({{ unreadCount }})</span>
            <el-button link type="primary" size="small" @click="$router.push('/home')">查看全部</el-button>
          </div>
          <div v-if="unreadCount === 0" class="notif-popover-empty">
            目前沒有未讀通知
          </div>
          <div v-else class="notif-popover-list">
            <div v-for="n in notifStore.unread.slice(0, 5)" :key="n.id" class="notif-popover-item"
              @click="$router.push(`/article/${n.articleId}`)">
              <div class="notif-popover-title">{{ n.articleTitle }}</div>
              <div class="notif-popover-preview">{{ n.commentPreview }}</div>
            </div>
          </div>
        </el-popover>
      </el-badge>

      <div class="user-info">
        <el-avatar :size="28" class="user-avatar">
          {{ auth.user?.員工姓名?.charAt(0) }}
        </el-avatar>
        <span class="user-name">{{ auth.user?.員工姓名 }}</span>
        <el-tag size="small" :type="roleTagType" effect="light" class="role-tag">{{ roleLabel }}</el-tag>
      </div>

      <el-button text size="small" class="logout-btn" @click="handleLogout">
        登出
      </el-button>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/store/auth.js'
import { useNotificationStore } from '@/store/notification.js'
import { useDirectoryStore } from '@/store/directory.js'
import { metaService, crossDeptService } from '@/services/api.js'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const notifStore = useNotificationStore()
const dirStore = useDirectoryStore()
const router = useRouter()

const companies = ref([])
const departments = ref([])
const selectedCompany = ref(auth.user?.組織OID || '')
const selectedDept = ref(auth.user?.部門代碼 || '')

const unreadCount = computed(() => notifStore.unread.length)

const roleLabel = computed(() => ({
  ADMIN: '管理員', MANAGER: '主管', MEMBER: '同仁', GUEST: '訪客'
}[auth.role] || ''))

const roleTagType = computed(() => ({
  ADMIN: 'danger', MANAGER: 'warning', MEMBER: 'success', GUEST: 'info'
}[auth.role] || 'info'))

async function onCompanyChange(oid) {
  const allDepts = await metaService.getDepartments(oid)
  // 顯示使用者前3碼相同的所有部門
  const userDeptPrefix = auth.user?.部門代碼?.substring(0, 3)
  const prefixDepts = allDepts.filter(d => userDeptPrefix && d.部門代碼?.startsWith(userDeptPrefix))

  // 合併跨部門授權（僅屬於當前選擇公司的）
  try {
    const grants = await crossDeptService.getMyGrants()
    const extraDepts = grants
      .filter(g => g.org_oid === oid && !prefixDepts.some(d => d.部門代碼 === g.dept_code))
      .map(g => ({ 部門代碼: g.dept_code, 部門名稱: g.dept_name || g.dept_code }))
    departments.value = [...prefixDepts, ...extraDepts]
  } catch {
    departments.value = prefixDepts
  }

  selectedDept.value = auth.user?.部門代碼 || null
  await dirStore.fetchTree(oid, selectedDept.value)
  router.push('/home')
}

async function onDeptChange(deptCode) {
  await dirStore.fetchTree(selectedCompany.value, deptCode)
  router.push('/home')
}

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}

onMounted(async () => {
  // 公司/部門資料載失敗不應阻斷通知載入
  try {
    companies.value = await metaService.getCompanies()
    if (selectedCompany.value) {
      const allDepts = await metaService.getDepartments(selectedCompany.value)
      // 顯示使用者前3碼相同的所有部門
      const userDeptPrefix = auth.user?.部門代碼?.substring(0, 3)
      const prefixDepts = allDepts.filter(d => userDeptPrefix && d.部門代碼?.startsWith(userDeptPrefix))

      // 合併跨部門授權清單（聯集，去除重複 dept_code）
      try {
        const grants = await crossDeptService.getMyGrants()
        const extraDepts = grants
          .filter(g => !prefixDepts.some(d => d.部門代碼 === g.dept_code))
          .map(g => ({ 部門代碼: g.dept_code, 部門名稱: g.dept_name || g.dept_code }))
        departments.value = [...prefixDepts, ...extraDepts]
      } catch {
        // 跨部門授權取得失敗時，退回只顯示前三碼篩選結果
        departments.value = prefixDepts
      }
    }
  } catch {
    // 靜默失敗
  }
  try {
    await notifStore.fetchAll()
  } catch {
    // 靜默失敗
  }
})
</script>

<style scoped>
.kb-header {
  height: var(--header-height);
  background: var(--header-bg);
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 16px;
  flex-shrink: 0;
  /* ✅ 修正：加上 position + z-index 才會真正生效 */
  /* sticky 讓 header 黏在最上方，fixed 的 Vditor fullscreen 也會被壓在下面 */
  position: sticky;
  top: 0;
  z-index: 1001;
  box-shadow: 0 2px 8px rgba(0, 0, 0, .2);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.brand-icon { font-size: 20px; }

.brand-name {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: center;
}

.header-select { width: 160px; }

.header-divider {
  color: rgba(255, 255, 255, .4);
  font-size: 18px;
}

:deep(.header-select .el-input__wrapper) {
  background: rgba(255, 255, 255, .12) !important;
  border: 1px solid rgba(255, 255, 255, .2) !important;
  box-shadow: none !important;
  border-radius: 6px;
}
:deep(.header-select .el-input__inner) {
  color: #fff !important;
  font-size: 13px;
}
:deep(.header-select .el-select__caret) {
  color: rgba(255, 255, 255, .6) !important;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.notif-btn {
  color: rgba(255, 255, 255, .8) !important;
}
.notif-btn:hover {
  color: #fff !important;
  background: rgba(255, 255, 255, .1) !important;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-avatar {
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-name {
  color: #fff;
  font-size: 13px;
  font-weight: 500;
}

.role-tag { font-size: 11px; }

.logout-btn {
  color: rgba(255, 255, 255, .7) !important;
  font-size: 13px;
}
.logout-btn:hover {
  color: #fff !important;
  background: rgba(255, 255, 255, .1) !important;
}

.notif-popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.notif-popover-empty {
  padding: 16px 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
}

.notif-popover-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.notif-popover-item {
  padding: 8px;
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  transition: background var(--transition);
}
.notif-popover-item:hover { background: var(--color-surface-2); }

.notif-popover-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notif-popover-preview {
  font-size: 12px;
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
