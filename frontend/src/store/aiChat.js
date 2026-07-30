// src/store/aiChat.js
// AI 問答獨立頁面（AiChatView.vue）的對話狀態，集中於 Pinia store
// 讓使用者切去看文章、或拖曳文章/附件回到 /ai-chat 時，對話與已引用內容不會消失。
// 只放狀態，邏輯統一由 composables/useAiChat.js 提供（見 AI_CHAT_MAIN_PAGE_PLAN.md 決策 B）。
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAiChatStore = defineStore('aiChat', () => {
  const currentMode         = ref('chat')
  const inputText           = ref('')
  const messages            = ref([])
  const streaming           = ref(false)
  const useContext          = ref(true)
  const selectedFile        = ref(null)
  const fileError           = ref('')
  const strictnessLevel     = ref(8)
  const searchModeLevel     = ref(1) // 1: 快速 (KB_hybrid), 2: 嚴謹 (KB_semantic_hybrid)
  const showMentionDropdown = ref(false)
  const mentionResults      = ref([])
  const referencedArticles  = ref([])
  const referencedFiles     = ref([])

  return {
    currentMode, inputText, messages, streaming, useContext,
    selectedFile, fileError, strictnessLevel, searchModeLevel,
    showMentionDropdown, mentionResults, referencedArticles, referencedFiles,
  }
})
