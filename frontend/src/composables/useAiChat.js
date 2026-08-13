// src/composables/useAiChat.js
// 從 AiChatPanel.vue 抽出的共用 AI 問答邏輯，供彈出視窗（AiChatPanel.vue）
// 與獨立頁面（AiChatView.vue）共用，避免複製貼上。
//
// 狀態來源由呼叫端決定：
// - AiChatPanel.vue：傳入本地 reactive() 狀態（隨元件掛載/卸載重置，行為與現行一致）。
// - AiChatView.vue：傳入 store/aiChat.js（Pinia）的 storeToRefs()，讓對話跨頁面切換保留。
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { marked } from 'marked'
import { aiService, articleService, crossDeptService, aiChatHistoryService } from '@/services/api.js'
import { sendExternalChat } from '@/services/AiRAGApi.js'
import { useDirectoryStore } from '@/store/directory.js'
import { useAuthStore } from '@/store/auth.js'

export const QUICK_COMMANDS = [
  { key: 'quick_summary',    label: '簡易摘要' },
  { key: 'detailed_summary', label: '詳細摘要' },
  { key: 'step_guide',       label: '步驟詳解' },
]

const ALL_MODES = [
  { key: 'chat',     label: 'AI 問答' },
  { key: 'generate', label: '產生文章' },
  { key: 'correct',  label: '校正文章' },
]

// 已引用內容（文章＋附件檔案）合計文字上限，超過時不自動送出（見 AI_CHAT_MAIN_PAGE_PLAN.md 決策 A）
export const MAX_REFERENCED_CHARS = 50000

/**
 * @param {object} state 由呼叫端提供的 refs：currentMode, inputText, messages, streaming, useContext,
 *   selectedFile, fileError, strictnessLevel, showMentionDropdown, mentionResults, referencedArticles, referencedFiles
 * @param {object} props { contextContent, articleId, contextTags, allowedModes }（可為純物件，非必須是 defineProps 的 props）
 * @param {Function} [emit] 可選，用於 apply／tagAdded 事件通知（AiChatView 無編輯器上下文，可不傳）
 */
export function useAiChat(state, props, emit) {
  const {
    currentMode, inputText, messages, streaming, useContext,
    selectedFile, fileError, strictnessLevel, searchModeLevel = ref(1),
    showMentionDropdown, mentionResults, referencedArticles, referencedFiles,
    // AiChatPanel.vue 傳入的本地狀態沒有這兩個欄位，給預設 ref 讓彈窗
    // 也能落地歷史（各自一段對話），不必連帶修改該元件
    currentSessionUid = ref(null), currentSessionId = ref(null),
  } = state

  const dirStore  = useDirectoryStore()
  const authStore = useAuthStore()

  // ── 版面用的 template ref（由使用端 <template ref="xxx"> 綁定） ──────────
  const messageArea  = ref(null)
  const fileInputRef = ref(null)
  const inputRef     = ref(null)

  // 跨部門授權（用於 # 篩選與權限判斷）
  const myGrantedDepts = ref([])
  onMounted(async () => {
    try {
      const grants = await crossDeptService.getMyGrants()
      myGrantedDepts.value = grants.map(g => g.dept_code)
    } catch { /* 無授權資料，忽略 */ }
  })

  let mentionTimer     = null
  let abortController  = null

  const visibleModes = computed(() =>
    ALL_MODES.filter(m => props.allowedModes.includes(m.key)),
  )

  // allowedModes 改變時（或初始化）自動切換到第一個允許的 mode
  watch(
    visibleModes,
    (modes) => {
      if (!modes.find(m => m.key === currentMode.value)) {
        currentMode.value = modes[0]?.key ?? 'chat'
      }
    },
    { immediate: true },
  )

  const welcomeText = computed(() => ({
    chat:     '請輸入問題，或用 # 指定文章、拖曳目錄樹的文章/附件到這裡，我都能幫你解析並提供關鍵摘要。',
    generate: '請輸入提示詞或上傳 Word / PDF 檔案（.doc/.docx/.pdf，最大 5 MB），我將為你產生 Markdown 文章。',
    correct:  '點擊送出，我將校正目前編輯中的文章內容。',
  }[currentMode.value]))

  const inputPlaceholder = computed(() => {
    if (currentMode.value === 'generate') return '輸入提示詞，例：「撰寫一篇關於 Redis 快取策略的技術文章」'
    if (currentMode.value === 'correct') return ''
    if (referencedArticles.value.length || referencedFiles.value.length) {
      return '輸入你想問的問題，例如：特休怎麼計算？（或直接送出使用預設摘要）'
    }
    return '輸入問題，或輸入 # 指定文章...'
  })

  const totalReferencedChars = computed(() =>
    referencedFiles.value.reduce((sum, f) => sum + (f.charCount || 0), 0),
  )

  const canSend = computed(() => {
    if (streaming.value) return false
    if (currentMode.value === 'correct')  return !!props.contextContent?.trim()
    if (currentMode.value === 'generate') return !!(inputText.value.trim() || selectedFile.value)
    return !!(inputText.value.trim() || referencedArticles.value.length || referencedFiles.value.length)
  })

  function clearMessages() {
    messages.value          = []
    referencedArticles.value = []
    referencedFiles.value    = []
    inputText.value          = ''
    clearFile()
    // 「新對話」必須連 session 識別碼一起清掉，否則下一輪問答會被
    // append 進上一段對話的歷史串（見 AI_CHAT_HISTORY_PLAN.md 6.3）
    currentSessionUid.value = null
    currentSessionId.value  = null
  }

  // ── 檔案處理（generate 模式的 Word/PDF 上傳） ─────────────────────────
  function onFileSelected(e) {
    const file = e.target.files?.[0]
    fileError.value = ''
    if (!file) return
    const allowedMime = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
    ]
    if (!allowedMime.includes(file.type) && !/\.(doc|docx|pdf)$/i.test(file.name)) {
      fileError.value = '僅接受 .doc、.docx 或 .pdf 格式'
      if (fileInputRef.value) fileInputRef.value.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      fileError.value = '檔案大小不可超過 5 MB'
      if (fileInputRef.value) fileInputRef.value.value = ''
      return
    }
    selectedFile.value = file
  }

  function clearFile() {
    selectedFile.value = null
    fileError.value    = ''
    if (fileInputRef.value) fileInputRef.value.value = ''
  }

  // ── 已引用附件檔案（拖曳選取後呼叫，見 AiChatView.vue） ─────────────────
  /**
   * @param {{ uuid: string, name: string, content: string }[]} newFiles 已抽取文字的檔案
   * @returns {{ ok: boolean, message?: string }}
   */
  function addFileReferences(newFiles) {
    const additionalChars = newFiles.reduce((sum, f) => sum + (f.content?.length || 0), 0)
    if (totalReferencedChars.value + additionalChars > MAX_REFERENCED_CHARS) {
      return {
        ok: false,
        message: `引用內容過長（目前 ${totalReferencedChars.value} 字，加入後將達 ${totalReferencedChars.value + additionalChars} 字／上限 ${MAX_REFERENCED_CHARS} 字），請取消勾選部分文章或檔案`,
      }
    }
    for (const f of newFiles) {
      if (referencedFiles.value.find(r => r.uuid === f.uuid)) continue
      referencedFiles.value.push({ uuid: f.uuid, name: f.name, content: f.content, charCount: f.content.length })
    }
    return { ok: true }
  }

  function removeFileRef(uuid) {
    referencedFiles.value = referencedFiles.value.filter(f => f.uuid !== uuid)
  }

  // ── # 文章指定 ────────────────────────────────────────────────
  function onInputChange(val) {
    if (currentMode.value !== 'chat') return
    const match = val.match(/#([^#\s]*)$/)
    if (match) {
      clearTimeout(mentionTimer)
      mentionTimer = setTimeout(() => fetchMentionArticles(match[1]), 300)
    } else {
      showMentionDropdown.value = false
    }
  }

  function onInputBlur() {
    // 延遲關閉，讓 mousedown 事件先觸發
    setTimeout(() => { showMentionDropdown.value = false }, 200)
  }

  /**
   * 判斷目錄樹節點是否有存取權限（邏輯與 DirectoryTree.vue checkItemAccess 一致）
   */
  function hasTreeAccess(nodeData) {
    const user = authStore.user
    if (!user || authStore.isAdmin) return true

    const resource = nodeData.Article
    if (!resource) return true

    const isPublic = resource.is_public === true || resource.is_public === 1

    // 公開瀏覽模式：非公開文件不可見
    if (dirStore.viewScope === 'public' && !isPublic) return false
    if (isPublic) return true

    // 解析 access_members
    let accessMembers = resource.access_members
    if (typeof accessMembers === 'string') {
      try { accessMembers = JSON.parse(accessMembers) } catch { accessMembers = [] }
    }
    const members = Array.isArray(accessMembers) ? accessMembers : []

    // 職級門檻
    const accessLevel = resource.access_level ?? 10
    const passLevel   = accessLevel >= 10 || (user.級職 ?? 99) <= accessLevel

    let primaryAccess = false
    if (members.length > 0) {
      primaryAccess = members.map(String).includes(String(user.員工工號))
    } else {
      const rDept = resource.access_dept || ''
      const uDept = user.部門代碼 || ''
      if (!rDept) {
        primaryAccess = true
      } else {
        const exactMatch  = uDept === rDept
        const prefixMatch = uDept.length >= 3 && rDept.length >= 3
                         && uDept.substring(0, 3) === rDept.substring(0, 3)
        const crossMatch  = myGrantedDepts.value.includes(rDept)
        primaryAccess = exactMatch || prefixMatch || crossMatch
      }
    }
    return primaryAccess && passLevel
  }

  /**
   * 從 filteredTree 遍歷取出可見的文章清單
   * - 排除 trash 節點及其子孫（下架文章）
   * - 排除無存取權限的文章（禁止眼睛）
   */
  function collectVisibleArticles(nodes, inTrash = false) {
    const result = []
    for (const node of nodes) {
      if (node.type === 'trash') continue        // 完全跳過垃圾桶節點
      if (inTrash) continue                       // 不處理 trash 後代
      if (node.type === 'article') {
        if (hasTreeAccess(node)) {
          result.push({ id: node.article_id, title: node.label })
        }
      }
      if (node.children?.length) {
        result.push(...collectVisibleArticles(node.children, false))
      }
    }
    return result
  }

  async function fetchMentionArticles(q) {
    try {
      // 直接從已載入的目錄樹篩選，無需打 API
      const allVisible = collectVisibleArticles(dirStore.filteredTree)

      // 依關鍵字過濾（空字串 = 顯示全部）
      const keyword = (q || '').trim().toLowerCase()
      const filtered = keyword
        ? allVisible.filter(a => a.title.toLowerCase().includes(keyword))
        : allVisible

      mentionResults.value      = filtered.slice(0, 8)
      showMentionDropdown.value = mentionResults.value.length > 0 || keyword === ''
    } catch {
      showMentionDropdown.value = false
    }
  }

  function selectMention(article) {
    // 移除輸入框末尾的 #xxx
    inputText.value = inputText.value.replace(/#[^#\s]*$/, '').trimEnd()
    if (!referencedArticles.value.find(a => a.id === article.id)) {
      referencedArticles.value.push({ id: article.id, title: article.title })
    }
    showMentionDropdown.value = false
  }

  function removeRef(id) {
    referencedArticles.value = referencedArticles.value.filter(a => a.id !== id)
  }

  // ── 關鍵字提取（擷取 **粗體** 文字） ─────────────────────────
  function extractKeywords(markdown) {
    const keywords = new Set()
    for (const m of markdown.matchAll(/\*\*([^*\n]{2,20})\*\*/g)) {
      keywords.add(m[1].trim())
    }
    return [...keywords].slice(0, 8)
  }

  async function requestAddKeyword(msg, kw) {
    if (msg.addedKeywords?.includes(kw)) return

    // 收集目標文章 ID：prop 傳入的當前文章 + # 指定的文章
    const targetIds = new Set()
    if (props.articleId) targetIds.add(Number(props.articleId))
    referencedArticles.value.forEach(a => targetIds.add(a.id))

    if (targetIds.size === 0) {
      ElMessage.warning('請先使用 # 指定文章，或在文章頁使用此功能')
      return
    }

    try {
      const results = await Promise.all(
        [...targetIds].map(id => articleService.addTags(id, [kw]))
      )
      msg.addedKeywords.push(kw)
      ElMessage.success(`已將「${kw}」加入文章標籤`)
      // 通知 parent 刷新顯示（ArticleView 更新 article.tags）
      emit?.('tagAdded', kw, [...targetIds], results.map(r => r.data).flat())
    } catch {
      ElMessage.error(`新增標籤失敗，請稍後再試`)
    }
  }

  // ── 一鍵貼入確認 ─────────────────────────────────────────────
  async function confirmApply(content) {
    try {
      await ElMessageBox.confirm(
        '確認將 AI 產生的內容貼入編輯器？這將覆蓋現有的文章內容。',
        '一鍵貼入確認',
        { confirmButtonText: '確認貼入', cancelButtonText: '取消', type: 'warning' },
      )
      emit?.('apply', content)
      ElMessage.success('AI 內容已貼入編輯器')
    } catch { /* 使用者取消 */ }
  }

  // ── Markdown 渲染 ─────────────────────────────────────────────
  function updateHtml(msg) {
    if (msg.role === 'ai' && msg.content) {
      // 檢查是否有 <think>...</think> 或 <thought>...</thought>
      const thinkRegex = /<(think|thought)>([\s\S]*?)<\/\1>/gi;
      let match;
      let hasThink = false;
      let extractedThink = '';

      // 循環找出所有的思考標籤並提取內容
      while ((match = thinkRegex.exec(msg.content)) !== null) {
        hasThink = true;
        extractedThink += (extractedThink ? '\n' : '') + match[2].trim();
      }

      if (hasThink) {
        // 將標籤及內容從正文移除
        msg.content = msg.content.replace(thinkRegex, '').trim();

        // 如果 thinkContent 還沒有這段，就補上去
        if (!msg.thinkContent) {
          msg.thinkContent = extractedThink;
        } else if (!msg.thinkContent.includes(extractedThink)) {
          msg.thinkContent = (msg.thinkContent + '\n' + extractedThink).trim();
        }
      }

      // 容錯：處理可能還沒閉合的 <think> 或 <thought>（例如串流異常中斷或未完成的情況）
      const unclosedRegex = /<(think|thought)>([\s\S]*)$/i;
      const unclosedMatch = unclosedRegex.exec(msg.content);
      if (unclosedMatch) {
        const remainingThink = unclosedMatch[2].trim();
        msg.content = msg.content.replace(unclosedRegex, '').trim();
        if (!msg.thinkContent) {
          msg.thinkContent = remainingThink;
        } else if (!msg.thinkContent.includes(remainingThink)) {
          msg.thinkContent = (msg.thinkContent + '\n' + remainingThink).trim();
        }
      }
    }

    try { msg.htmlContent = marked.parse(msg.content || '') }
    catch { msg.htmlContent = msg.content }
  }

  // ── 防禦機制：串流正常結束但正文為空時的 fallback ──────────────
  // 對應情境：知識庫檢索問答時，模型思考過程（reasoning）可能耗盡 max_tokens
  // 額度，導致串流結束前從未送出正式回答（content），畫面會呈現完全空白。
  function applyEmptyContentFallback(msg) {
    if (!msg.content?.trim() && msg.thinkContent?.trim()) {
      msg.content = '> ⚠️ AI 回答被截斷，僅產生思考過程，尚未輸出正式回答，請重新提問或縮小問題範圍再試一次。'
      msg.thinkExpanded = true
    }
  }

  async function scrollToBottom() {
    await nextTick()
    if (messageArea.value) messageArea.value.scrollTop = messageArea.value.scrollHeight
  }

  // ── 快速指令：送出預設提示詞 ────────────────────────────────
  async function sendCommand(cmdKey) {
    if (streaming.value) return

    const cmd = QUICK_COMMANDS.find(c => c.key === cmdKey)
    const userDisplayText = cmd?.label || cmdKey

    const userMsg = { id: Date.now(), role: 'user', content: userDisplayText, htmlContent: '' }
    messages.value.push(userMsg)
    updateHtml(userMsg)

    const capturedRefs     = [...referencedArticles.value]
    const capturedFileRefs = [...referencedFiles.value]
    referencedArticles.value = []
    referencedFiles.value    = []
    await scrollToBottom()

    streaming.value = true
    messages.value.push({
      id: Date.now() + 1, role: 'ai',
      content: '', htmlContent: '', streaming: true, keywords: [], addedKeywords: [], canApply: false,
      thinkContent: '', thinkExpanded: false, thinkStreaming: false,
    })
    const aiMsg = messages.value[messages.value.length - 1]

    const onThinking = (chunk) => {
      aiMsg.thinkContent   += chunk
      aiMsg.thinkStreaming  = true
      scrollToBottom()
    }
    const onDelta = (delta) => {
      aiMsg.thinkStreaming = false  // thinking ended when first delta arrives
      aiMsg.content += delta
      scrollToBottom()
    }
    const onDone  = async () => {
      aiMsg.thinkStreaming = false
      applyEmptyContentFallback(aiMsg)
      updateHtml(aiMsg)
      await nextTick()
      aiMsg.streaming = false
      streaming.value = false
      aiMsg.keywords  = extractKeywords(aiMsg.content)
      scrollToBottom()
    }
    const onError = async () => {
      aiMsg.thinkStreaming = false
      aiMsg.streaming = false
      streaming.value = false
      aiMsg.content  += '\n\n> ⚠️ AI 服務發生錯誤，請稍後再試。'
      updateHtml(aiMsg)
      scrollToBottom()
    }

    try {
      abortController = new AbortController()
      const signal    = abortController.signal

      // 抓指定文章／附件檔案內容
      let articleContent = ''
      if (capturedRefs.length) {
        const fetched = await Promise.allSettled(
          capturedRefs.map(a => articleService.getById(a.id))
        )
        articleContent += fetched
          .filter(r => r.status === 'fulfilled')
          .map(r => `\n\n---\n📄 文章「${r.value.title}」：\n${r.value.content || ''}`)
          .join('')
      }
      if (capturedFileRefs.length) {
        articleContent += capturedFileRefs
          .map(f => `\n\n---\n📎 附件檔案「${f.name}」：\n${f.content}`)
          .join('')
      }
      if (!articleContent && props.contextContent) {
        articleContent = `\n\n---\n文章內文：\n${props.contextContent}`
      }

      await aiService.streamSummarize(articleContent, { onThinking, onDelta, onDone, onError }, signal, cmdKey)
    } catch (err) {
      if (err.name === 'AbortError') return
      streaming.value  = false
      aiMsg.streaming  = false
      aiMsg.content    = `> ⚠️ 錯誤：${err.message}`
      updateHtml(aiMsg)
      ElMessage.error(err.message || 'AI 服務呼叫失敗')
    } finally {
      abortController = null
    }
  }

  // ── 送出訊息 ─────────────────────────────────────────────────
  /**
   * 落地本輪問答到 KB DB（AI 歷史訊息，見 AI_CHAT_HISTORY_PLAN.md 6.3）。
   *
   * best-effort：使用者此刻已經看到回答了，落地失敗只記 console.warn，
   * 不跳錯誤訊息也不影響對話流程（規劃文件 10 節第 3 項）。
   */
  async function ensureSessionId(payload) {
    if (currentSessionId.value) return currentSessionId.value
    if (!currentSessionUid.value) {
      currentSessionUid.value = crypto.randomUUID
        ? crypto.randomUUID()
        : `kb-${Date.now()}-${Math.random().toString(16).slice(2)}`
    }
    const session = await aiChatHistoryService.createSession({
      sessionUid: currentSessionUid.value,
      title:      payload.question,
      searchType: payload.searchType,
    })
    currentSessionId.value = session.id
    return session.id
  }

  async function persistChatTurn(payload) {
    try {
      await aiChatHistoryService.appendMessages(await ensureSessionId(payload), payload)
    } catch (err) {
      // 對話在別處被刪掉（AI 歷史頁刪除、或另一個分頁刪除）時後端回 SESSION_NOT_FOUND：
      // 這一輪不該就此遺失，改開一段新對話重送一次
      if (err?.code === 'SESSION_NOT_FOUND') {
        currentSessionUid.value = null
        currentSessionId.value  = null
        try {
          await aiChatHistoryService.appendMessages(await ensureSessionId(payload), payload)
          return
        } catch (retryErr) {
          console.warn('[useAiChat] 改開新對話後仍落地失敗:', retryErr?.message || retryErr)
          return
        }
      }
      console.warn('[useAiChat] AI 歷史訊息落地失敗（不影響本次對話）:', err?.message || err)
    }
  }

  async function sendMessage() {
    const isCorrect = currentMode.value === 'correct'

    const userInputText = isCorrect ? '請校正目前文章' : inputText.value.trim()
    if (!userInputText && !selectedFile.value && !referencedArticles.value.length && !referencedFiles.value.length) return

    const userMsg = { id: Date.now(), role: 'user', content: userInputText || '（指定內容問答）', htmlContent: '' }
    messages.value.push(userMsg)
    updateHtml(userMsg)

    const capturedFile     = selectedFile.value
    const capturedInput    = inputText.value.trim()
    const capturedRefs     = [...referencedArticles.value]
    const capturedFileRefs = [...referencedFiles.value]
    inputText.value          = ''
    referencedArticles.value = []
    referencedFiles.value    = []
    clearFile()
    await scrollToBottom()

    streaming.value = true
    // ⚠️ 重要：push 後取 reactive proxy，直接修改原始物件不會觸發 Vue re-render
    messages.value.push({
      id: Date.now() + 1, role: 'ai',
      content: '', htmlContent: '', streaming: true, keywords: [], addedKeywords: [], canApply: false,
      thinkContent: '', thinkExpanded: false, thinkStreaming: false,
    })
    const aiMsg = messages.value[messages.value.length - 1]

    // 落地歷史用：送給 AiRAG 的問題字串會額外接上文章內文，與畫面顯示的
    // userMsg.content 不同；Mongo 回填必須用實際送出的那一份才比對得到
    let ragQuestion     = null
    let earlyTerminated = false

    // 串流中直接更新 content（template 用純文字顯示）；結束後才轉 HTML
    const onThinking = (chunk) => {
      aiMsg.thinkContent  += chunk
      aiMsg.thinkStreaming  = true
      scrollToBottom()
    }
    const onDelta = (delta) => {
      aiMsg.thinkStreaming = false  // thinking ended when first delta arrives
      aiMsg.content += delta
      scrollToBottom()
    }
    const onDone  = async () => {
      // 串流結束：先轉換 Markdown HTML，下一 tick 才切換顯示模式避免閃爍
      aiMsg.thinkStreaming = false
      applyEmptyContentFallback(aiMsg)
      updateHtml(aiMsg)
      await nextTick()
      aiMsg.streaming = false
      streaming.value = false
      if (currentMode.value === 'chat') {
        aiMsg.keywords = extractKeywords(aiMsg.content)
        // 只落地一般問答；產生／校正文章屬一次性操作，不記入歷史（規劃文件 8 節第 2 項）。
        // 刻意不 await：落地是加值行為，不該讓使用者等它完成
        persistChatTurn({
          question:          userMsg.content,
          matchQuestion:     ragQuestion,
          answer:            aiMsg.content,
          sources:           aiMsg.sources,
          isEarlyTerminated: earlyTerminated,
          searchType:        computedRAGParams.value.search_type,
        })
      } else {
        aiMsg.canApply = true
      }
      scrollToBottom()
    }
    const onError = async () => {
      aiMsg.thinkStreaming = false
      aiMsg.streaming = false
      streaming.value = false
      aiMsg.content += '\n\n> ⚠️ AI 服務發生錯誤，請稍後再試。'
      updateHtml(aiMsg)
      scrollToBottom()
    }

    try {
      abortController = new AbortController()
      const signal    = abortController.signal

      if (currentMode.value === 'chat') {
        // 組合參考資料：指定文章內容 + 指定附件檔案內容 + 當前文章內文
        const fetched = capturedRefs.length
          ? await Promise.allSettled(capturedRefs.map(a => articleService.getById(a.id)))
          : []
        const articleContext = fetched
          .filter(r => r.status === 'fulfilled')
          .map(r => `\n\n---\n📄 指定文章「${r.value.title}」：\n${r.value.content || ''}`)
          .join('')

        const fileContext = capturedFileRefs
          .map(f => `\n\n---\n📎 指定附件檔案「${f.name}」：\n${f.content}`)
          .join('')

        // 變數名與下方 else 分支的 contextPart 區隔，避免同名遮蔽（兩者格式不同）
        const currentArticlePart = useContext.value && props.contextContent
          ? `\n\n---\n文章內文：\n${props.contextContent}`
          : ''

        const referenceContent = (articleContext + fileContext + currentArticlePart).trim()

        // 以「實際取得的參考資料」而非「有無指定」判斷：
        // 指定的文章若全數抓取失敗，referenceContent 會是空的，
        // 此時改走一般 RAG 問答，避免送出空 content 被後端擋成 400。
        if (referenceContent) {
          if (capturedInput) {
            // 使用者有明確提問：走 qa 模式，問題與參考資料分開傳，
            // 避免問題被塞進 {content} 當成待分析素材而回出固定的摘要架構
            await aiService.streamSummarize(
              referenceContent, { onThinking, onDelta, onDone, onError }, signal, 'qa', capturedInput,
            )
          } else {
            // 沒有輸入問題（只拖曳/指定內容就送出）：維持預設的結構化解析
            await aiService.streamSummarize(
              referenceContent, { onThinking, onDelta, onDone, onError }, signal,
            )
          }

        } else {
          // 無 # 指定文章／拖曳附件：直接呼叫 AiRAGApi 進行外部問答
          const user = authStore.user || {}
          const externalUser = {
            employee_id: user.員工工號 || 'SYSTEM',
            name: user.員工姓名 || '使用者',
            department_code: user.部門代碼 || '',
            department_name: user.部門名稱 || '',
            job_title_name: user.職務名稱 || user.級職名稱 || '專員',
            job_title_level: Number(user.級職 ?? user.級職等級 ?? 10),
          }

          const contextPart = useContext.value && props.contextContent
            ? `\n\n---\n目前參考文章內容：\n${props.contextContent}`
            : ''
          const question = (capturedInput || '請解答以下問題') + contextPart
          ragQuestion = question

          await sendExternalChat(
            {
              question,
              externalUser,
              params: {
                ...computedRAGParams.value,
              },
            },
            {
              signal,
              onStep: (stepData) => {
                if (stepData.content) {
                  aiMsg.thinkContent += (aiMsg.thinkContent ? '\n' : '') + `[進度] ${stepData.content}`
                  aiMsg.thinkStreaming = true
                  scrollToBottom()
                }
              },
              onChunk: (chunkData) => {
                if (chunkData.type === 'reasoning' && chunkData.content) {
                  aiMsg.thinkContent += chunkData.content
                  aiMsg.thinkStreaming = true
                  scrollToBottom()
                } else if (chunkData.type === 'content' && chunkData.content) {
                  aiMsg.thinkStreaming = false
                  aiMsg.content += chunkData.content
                  scrollToBottom()
                }
              },
              onMessage: (msgData) => {
                aiMsg.thinkStreaming = false
                earlyTerminated = true
                if (msgData.delta) {
                  aiMsg.content = msgData.delta
                  scrollToBottom()
                }
              },
              onSources: (sourcesData) => {
                if (sourcesData.sources?.length) {
                  // 補上 _expanded 供引用區塊逐筆展開/收合使用
                  aiMsg.sources = sourcesData.sources.map(s => ({ ...s, _expanded: false }))
                }
              },
              onError: async (err) => {
                await onError()
              },
              onDone: async () => {
                await onDone()
              },
            }
          )
        }

      } else if (capturedFile) {
        const fd = new FormData()
        fd.append('file', capturedFile)
        await aiService.streamWritingAssist(fd, { onThinking, onDelta, onDone, onError }, signal)

      } else {
        const content = isCorrect ? props.contextContent : capturedInput
        await aiService.streamWritingAssist({ content }, { onThinking, onDelta, onDone, onError }, signal)
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      streaming.value = false
      aiMsg.streaming = false
      aiMsg.content   = `> ⚠️ 錯誤：${err.message}`
      updateHtml(aiMsg)
      ElMessage.error(err.message || 'AI 服務呼叫失敗')
    } finally {
      abortController = null
    }
  }

  // ── 思考模式 (1=快速: KB_hybrid, 2=嚴謹: KB_semantic_hybrid) ──
  const searchModeLabel = computed(() => {
    return Number(searchModeLevel.value) === 2 ? '嚴謹' : '快速'
  })

  // ── 檢索嚴謹度 (10個等級：1=寬鬆 ~ 10=嚴謹) ──────────────────
  const strictnessLabels = [
    '極寬鬆', '最寬鬆', '寬鬆', '稍寬鬆', '中等平衡',
    '稍嚴謹', '嚴謹', '較嚴謹', '最嚴謹', '極嚴謹'
  ]

  const strictnessLabel = computed(() => {
    return strictnessLabels[strictnessLevel.value - 1] || '中等平衡'
  })

  function formatStrictnessTooltip(val) {
    return `等級 ${val}：${strictnessLabels[val - 1] || ''}`
  }

  // 根據拉桿等級 (1~10) 與思考模式動態計算 API 參數
  const computedRAGParams = computed(() => {
    const L = strictnessLevel.value
    const top_k = Math.round(50 - (L - 1) * (45 / 9))
    const score_threshold = Number((0.1 + (L - 1) * (0.6 / 9)).toFixed(2))
    const ai_summary_score_threshold = Number((0.1 + (L - 1) * (0.5 / 9)).toFixed(2))
    const search_type = Number(searchModeLevel.value) === 2 ? 'KB_semantic_hybrid' : 'KB_hybrid'

    return { search_type, top_k, score_threshold, ai_summary_score_threshold }
  })

  function close(onClose) {
    if (abortController) { abortController.abort(); abortController = null }
    onClose?.()
  }

  return {
    // template refs
    messageArea, fileInputRef, inputRef,
    // 常數
    QUICK_COMMANDS,
    // computed
    visibleModes, welcomeText, inputPlaceholder, canSend,
    strictnessLabel, searchModeLabel, computedRAGParams, totalReferencedChars,
    // 方法
    close, clearMessages, onFileSelected, clearFile,
    addFileReferences, removeFileRef,
    onInputChange, onInputBlur, selectMention, removeRef,
    requestAddKeyword, confirmApply, formatStrictnessTooltip,
    sendCommand, sendMessage,
    // state（原樣傳回，方便使用端在模板中直接使用）
    currentMode, inputText, messages, streaming, useContext,
    selectedFile, fileError, strictnessLevel, searchModeLevel,
    showMentionDropdown, mentionResults, referencedArticles, referencedFiles,
  }
}
