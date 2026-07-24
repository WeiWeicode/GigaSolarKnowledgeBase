<template>
  <nav class="kb-nav-sidebar">
    <!-- 文件範圍切換 -->
    <div class="scope-selector">
      <el-select v-model="dirStore.viewScope" size="small" class="scope-select" @change="onScopeChange">
        <el-option label="公開文件" value="public" />
        <el-option label="部門文件" value="dept" />
      </el-select>
    </div>

    <!-- 主導覽選單 -->
    <div class="nav-list">
      <router-link
        v-for="item in computedNavItems"
        :key="item.to"
        :to="item.to"
        custom
        v-slot="{ isActive, navigate }"
      >
        <button
          class="nav-item"
          :class="{ active: isActive }"
          @click="navigate"
        >
          <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </router-link>
    </div>

    <!-- 底部 -->
    <div class="nav-bottom">
      <router-link to="/settings" custom v-slot="{ isActive, navigate }">
        <button class="nav-item" :class="{ active: isActive }" @click="navigate">
          <el-icon class="nav-icon"><Setting /></el-icon>
          <span class="nav-label">設定</span>
        </button>
      </router-link>
      <router-link v-if="auth.isAdmin" to="/admin" custom v-slot="{ isActive, navigate }">
        <button class="nav-item" :class="{ active: isActive }" @click="navigate">
          <el-icon class="nav-icon"><Tools /></el-icon>
          <span class="nav-label">管理員設定</span>
        </button>
      </router-link>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth.js'
import { useDirectoryStore } from '@/store/directory.js'

const router = useRouter()

const auth = useAuthStore()
const dirStore = useDirectoryStore()

const navItems = [
  { to: '/home', label: '首頁', icon: 'House' },
  { to: '/article/new', label: '建立文章', icon: 'EditPen' },
  { to: '/attachment/new', label: '上傳文件', icon: 'Upload' },
]

const computedNavItems = computed(() => {
  if (dirStore.viewScope === 'public') {
    return navItems.filter(item => item.to === '/home')
  }
  return navItems
})

async function onScopeChange(newScope) {
  const oid = auth.user?.組織OID || dirStore.currentCompany
  if (newScope === 'public') {
    // 切到公開文件時，重新抓取跨部門公開樹
    if (oid) dirStore.fetchPublicTree(oid)
  } else if (newScope === 'dept') {
    // 切回部門文件時，還原為使用者自己的部門並重新載入部門樹
    const userDept = auth.user?.部門代碼
    if (oid && userDept) {
      await dirStore.fetchTree(oid, userDept)
    }
  }
  router.push('/home')
}
</script>

<style scoped>
.kb-nav-sidebar {
  width: var(--sidebar-nav-width);
  background: var(--sidebar-nav-bg);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  padding: 12px 8px;
}

.scope-selector {
  padding: 0 4px 12px;
}

:deep(.scope-select .el-input__wrapper) {
  background: rgba(255,255,255,.1) !important;
  border: none !important;
  box-shadow: none !important;
}
:deep(.scope-select .el-input__inner) {
  color: rgba(255,255,255,.85) !important;
  font-size: 12px;
}
:deep(.scope-select .el-select__caret) {
  color: rgba(255,255,255,.5) !important;
}

.nav-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 10px 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--border-radius-sm);
  color: rgba(255,255,255,.6);
  transition: all var(--transition);
  text-decoration: none;
}

.nav-item:hover {
  background: rgba(255,255,255,.08);
  color: rgba(255,255,255,.9);
}

.nav-item.active {
  background: var(--color-primary);
  color: #fff;
  box-shadow: 0 2px 8px rgba(37,99,235,.4);
}

.nav-icon {
  font-size: 20px;
}

.nav-label {
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  line-height: 1.3;
  white-space: nowrap;
}

.nav-bottom {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,.1);
}
</style>
