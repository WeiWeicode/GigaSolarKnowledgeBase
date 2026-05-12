// src/store/notification.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { notificationService } from '@/services/api.js'

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref([])

  const unread = computed(() => notifications.value.filter(n => !n.isRead))
  const read = computed(() => notifications.value.filter(n => n.isRead))

  async function fetchAll() {
    notifications.value = await notificationService.getAll()
  }

  async function markAsRead(id) {
    await notificationService.markAsRead(id)
    const n = notifications.value.find(n => n.id === id)
    if (n) n.isRead = true
  }

  return { notifications, unread, read, fetchAll, markAsRead }
})
