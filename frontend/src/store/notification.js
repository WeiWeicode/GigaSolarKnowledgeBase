// src/store/notification.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { notificationService } from '@/services/api.js'
import { useAuthStore } from '@/store/auth.js'

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref([])

  // 只顯示「被 @tag 到自己」的通知
  const myNotifications = computed(() => {
    const auth = useAuthStore()
    const myId = auth.user?.員工工號
    if (!myId) return []
    return notifications.value.filter(n => n.targetUserId === myId)
  })

  const unread = computed(() => myNotifications.value.filter(n => !n.isRead))

  // 已讀只顯示近 30 天
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
  const read = computed(() => {
    const cutoff = Date.now() - THIRTY_DAYS_MS
    return myNotifications.value.filter(n => n.isRead && new Date(n.createdAt).getTime() >= cutoff)
  })

  async function fetchAll() {
    notifications.value = await notificationService.getAll()
  }

  async function markAsRead(id) {
    await notificationService.markAsRead(id)
    // ✅ 用 splice 替換整個 item，確保 Vue 偵測到變更
    const idx = notifications.value.findIndex(n => n.id === id)
    if (idx !== -1) {
      notifications.value.splice(idx, 1, {
        ...notifications.value[idx],
        isRead: true,
      })
    }
  }

  return { notifications, unread, read, fetchAll, markAsRead }
})
