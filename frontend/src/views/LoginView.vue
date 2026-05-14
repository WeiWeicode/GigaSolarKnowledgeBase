<template>
  <div class="login-page">
    <div class="login-card kb-card">
      <div class="login-logo">📚</div>
      <h1 class="login-title">集團知識庫</h1>
      <p class="login-subtitle">GigaSolar Knowledge Base</p>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="login-form"
        @submit.prevent="handleLogin">
        <el-form-item label="員工工號" prop="employeeId">
          <el-input v-model="form.employeeId" placeholder="請輸入員工工號" size="large" prefix-icon="User"
            :disabled="loading" />
        </el-form-item>
        <el-form-item label="密碼" prop="password">
          <el-input v-model="form.password" type="password" placeholder="請輸入密碼" size="large" prefix-icon="Lock"
            show-password :disabled="loading" @keyup.enter="handleLogin" />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" class="login-btn" @click="handleLogin">
          登入
        </el-button>
      </el-form>

      <p class="login-hint">使用 BPM 帳號登入，系統不另行管理密碼</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth.js'
import { ElMessage } from 'element-plus'

const router = useRouter()
const auth = useAuthStore()

const formRef = ref()
const loading = ref(false)

const form = reactive({ employeeId: '', password: '' })
const rules = {
  employeeId: [{ required: true, message: '請輸入員工工號', trigger: 'blur' }],
  password: [{ required: true, message: '請輸入密碼', trigger: 'blur' }],
}

async function handleLogin() {
  // 先做表單驗證，驗證失敗直接返回，不顯示登入失敗訊息
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await auth.login(form.employeeId, form.password)
    router.push('/home')
  } catch (e) {
    ElMessage({
      message: '登入失敗，請確認工號與密碼',
      type: 'error',
      duration: 3000,
      showClose: true,
    })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #e0f2fe 0%, #e8f5e9 50%, #fce4ec 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-card {
  width: 400px;
  padding: 48px 40px;
  text-align: center;
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-lg);
}

.login-logo {
  font-size: 52px;
  margin-bottom: 12px;
}

.login-title {
  font-size: 26px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.login-subtitle {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-bottom: 32px;
}

.login-form {
  text-align: left;
}

.login-btn {
  width: 100%;
  margin-top: 8px;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.login-hint {
  margin-top: 20px;
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>
