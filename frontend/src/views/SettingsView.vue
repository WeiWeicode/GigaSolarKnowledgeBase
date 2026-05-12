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
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '@/store/auth.js'

const auth = useAuthStore()
const user = computed(() => auth.user)
const activeTab = ref('profile')
const notifEnabled = ref(true)

const roleLabel = computed(() => ({ ADMIN: '管理員', MANAGER: '主管', MEMBER: '一般同仁', GUEST: '訪客' }[auth.role] || ''))
const roleTagType = computed(() => ({ ADMIN: 'danger', MANAGER: 'warning', MEMBER: 'success', GUEST: 'info' }[auth.role] || 'info'))
</script>

<style scoped>
.settings-view { max-width: 720px; margin: 0 auto; }
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
</style>
