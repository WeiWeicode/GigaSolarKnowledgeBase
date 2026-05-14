// src/store/auth.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/api.js'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(sessionStorage.getItem('kb_token') || null)

  const isLoggedIn = computed(() => !!token.value && !!user.value)
  const role = computed(() => user.value?.role || 'GUEST')
  const isAdmin = computed(() => role.value === 'ADMIN')
  const isManager = computed(() => ['MANAGER', 'ADMIN'].includes(role.value))

  async function login(employeeId, password) {
    const res = await authService.login(employeeId, password)
    token.value = res.token
    user.value = res.user
  }

  async function fetchCurrentUser() {
    try {
      user.value = await authService.getCurrentUser()
    } catch {
      // token 無效或過期，一併清除 sessionStorage
      token.value = null
      sessionStorage.removeItem('kb_token')
    }
  }

  async function logout() {
    await authService.logout()
    user.value = null
    token.value = null
  }

  return { user, token, isLoggedIn, role, isAdmin, isManager, login, logout, fetchCurrentUser }
})
