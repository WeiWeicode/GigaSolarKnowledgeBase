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
  // 本次對話在 KB DB 的識別碼（見 AI_CHAT_HISTORY_PLAN.md 6.3）。
  // sessionUid 由前端產生，第一輪問答結束時才連同內容送到後端建立對話，
  // 之後同一段對話的每一輪都追加到同一個 sessionId。
  const currentSessionUid   = ref(null)
  const currentSessionId    = ref(null)

  // 開始一段新對話：清掉訊息與 session 識別碼，但保留思考模式、嚴謹度等
  // 使用者偏好設定（那些不屬於「這一段對話」，不該被連帶重設）。
  //
  // ⚠️ currentSessionUid / currentSessionId 一定要一起清掉：留著的話，
  // 下一輪問答會被 append 進上一段對話；若上一段已在 AI 歷史被刪除（is_hidden），
  // 新訊息更會寫進一個列表看不到的對話裡。
  function startNewConversation() {
    inputText.value           = ''
    messages.value            = []
    selectedFile.value        = null
    fileError.value           = ''
    referencedArticles.value  = []
    referencedFiles.value     = []
    currentSessionUid.value   = null
    currentSessionId.value    = null
  }

  // 登出時呼叫（見 store/auth.js 的 logout()）：清空對話與已引用內容。
  // 因為登出／切換帳號是 SPA 內的路由跳轉（非整頁重新整理），Pinia store
  // 會繼續存活在記憶體中；若不主動清空，換下一位使用者登入同一分頁時，
  // 仍會看到前一位使用者的 AI 對話內容與已引用的文章/附件內容。
  function reset() {
    startNewConversation()
    currentMode.value         = 'chat'
    streaming.value           = false
    useContext.value          = true
    strictnessLevel.value     = 8
    searchModeLevel.value     = 1
    showMentionDropdown.value = false
    mentionResults.value      = []
  }

  return {
    currentMode, inputText, messages, streaming, useContext,
    selectedFile, fileError, strictnessLevel, searchModeLevel,
    showMentionDropdown, mentionResults, referencedArticles, referencedFiles,
    currentSessionUid, currentSessionId,
    startNewConversation, reset,
  }
})
