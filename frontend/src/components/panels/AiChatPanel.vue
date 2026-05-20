<template>
  <transition name="panel">
    <div v-if="modelValue" class="panel-overlay" @click.self="close">
      <div class="side-panel ai-panel">
        <div class="panel-header">
          <span class="panel-title">
            <el-icon><MagicStick /></el-icon> AI 助手
          </span>
          <div class="panel-header-right">
            <el-tag size="small" type="success" effect="light">qwen3.6:35b</el-tag>
            <el-button text circle @click="close"><el-icon><Close /></el-icon></el-button>
          </div>
        </div>

        <!-- Mode tabs（多 mode 才顯示） -->
        <div v-if="visibleModes.length > 1" class="ai-mode-tabs">
          <button
            v-for="m in visibleModes"
            :key="m.key"
            class="mode-tab"
            :class="{ active: currentMode === m.key }"
            @click="currentMode = m.key"
          >
            {{ m.label }}
          </button>
        </div>

        <!-- Chat messages -->
        <div class="panel-body" ref="messageArea">
          <div v-if="messages.length === 0" class="ai-welcome">
            <div class="ai-icon">🤖</div>
            <p class="ai-welcome-text">{{ welcomeText }}</p>
            <p v-if="currentMode === 'chat'" class="ai-hint">
              輸入 <code>#</code> 可指定詢問特定文章
            </p>
          </div>
          <div v-for="msg in messages" :key="msg.id" class="message" :class="msg.role">
            <div class="msg-bubble">
              <!-- 串流中：純文字逐字顯示；串流結束：轉為 Markdown HTML -->
              <div v-if="msg.streaming" class="msg-content streaming-content">{{ msg.content }}</div>
              <div v-else class="msg-content markdown-body" v-html="msg.htmlContent || msg.content" />
              <span v-if="msg.streaming" class="typing-cursor">▊</span>

              <!-- 標籤區（chat 模式）：文章現有標籤 + AI 建議新增 -->
              <div
                v-if="msg.role === 'ai' && !msg.streaming && (msg.keywords?.length || contextTags?.length)"
                class="keyword-area"
              >
                <!-- 文章現有標籤（唯讀） -->
                <div v-if="contextTags?.length" class="keyword-row">
                  <span class="keyword-label">文章現有標籤：</span>
                  <el-tag
                    v-for="t in contextTags"
                    :key="t.id"
                    size="small"
                    type="info"
                    effect="plain"
                  >{{ t.name }}</el-tag>
                </div>
                <!-- AI 建議關鍵字（點擊可新增至文章） -->
                <div v-if="msg.keywords?.length" class="keyword-row">
                  <span class="keyword-label">AI 建議關鍵字：</span>
                  <el-tag
                    v-for="kw in msg.keywords"
                    :key="kw"
                    size="small"
                    :type="msg.addedKeywords?.includes(kw) ? 'success' : 'primary'"
                    effect="plain"
                    class="keyword-chip"
                    :title="msg.addedKeywords?.includes(kw) ? '已新增至文章標籤' : '點擊新增為文章標籤'"
                    @click="requestAddKeyword(msg, kw)"
                  >
                    <el-icon v-if="msg.addedKeywords?.includes(kw)"><Check /></el-icon>
                    <el-icon v-else><Plus /></el-icon>
                    {{ kw }}
                  </el-tag>
                </div>
              </div>

              <!-- 一鍵貼入（generate / correct 模式） -->
              <div v-if="msg.role === 'ai' && !msg.streaming && msg.canApply" class="apply-area">
                <el-button type="primary" size="small" @click="confirmApply(msg.content)">
                  <el-icon><DocumentCopy /></el-icon> 一鍵貼入編輯器
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- Input area -->
        <div class="panel-footer">
          <!-- 已指定文章 -->
          <div v-if="referencedArticles.length" class="ref-articles">
            <span class="ref-label">指定文章：</span>
            <el-tag
              v-for="a in referencedArticles"
              :key="a.id"
              closable
              size="small"
              type="info"
              class="ref-tag"
              @close="removeRef(a.id)"
            >{{ a.title }}</el-tag>
          </div>

          <!-- # 文章下拉選單 -->
          <div v-if="showMentionDropdown" class="mention-dropdown">
            <div class="mention-header">
              <el-icon><Document /></el-icon>
              {{ dirStore.viewScope === 'public' ? '公開文章' : '部門文章' }}（輸入繼續篩選）
            </div>
            <div
              v-for="art in mentionResults"
              :key="art.id"
              class="mention-item"
              @mousedown.prevent="selectMention(art)"
            >{{ art.title }}</div>
            <div v-if="mentionResults.length === 0" class="mention-empty">找不到相關文章</div>
          </div>

          <!-- Word 上傳（generate 模式） -->
          <div v-if="currentMode === 'generate'" class="upload-area">
            <input
              ref="fileInputRef"
              type="file"
              accept=".doc,.docx"
              style="display:none"
              @change="onFileSelected"
            />
            <div class="upload-row">
              <el-button plain size="small" @click="fileInputRef.click()">
                <el-icon><Upload /></el-icon> 上傳 Word
              </el-button>
              <span v-if="selectedFile" class="file-name" :title="selectedFile.name">
                {{ selectedFile.name }}
              </span>
              <el-button v-if="selectedFile" text circle size="small" @click="clearFile">
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
            <div v-if="fileError" class="file-error">{{ fileError }}</div>
          </div>

          <div v-if="contextContent && currentMode === 'chat'" class="context-toggle">
            <el-checkbox v-model="useContext" size="small">包含目前文章內容作為上下文</el-checkbox>
          </div>

          <div class="input-row">
            <el-input
              v-if="currentMode !== 'correct'"
              ref="inputRef"
              v-model="inputText"
              type="textarea"
              :rows="2"
              :placeholder="inputPlaceholder"
              resize="none"
              @keydown.enter.exact.prevent="sendMessage"
              @input="onInputChange"
              @blur="onInputBlur"
            />
            <el-button
              type="primary"
              :loading="streaming"
              :disabled="!canSend"
              class="send-btn"
              :class="{ 'full-send': currentMode === 'correct' }"
              @click="sendMessage"
            >
              <el-icon><Position /></el-icon>
            </el-button>
          </div>
          <div class="input-footer-row">
            <p class="input-hint">
              {{ currentMode === 'correct'
                ? '點擊送出以 AI 校正目前文章'
                : 'Enter 送出，Shift+Enter 換行，輸入 # 指定文章' }}
            </p>
            <el-button 
              size="small" 
              plain 
              class="new-chat-btn"
              @click="clearMessages" 
              title="清空對話，重新開始"
            >
              <el-icon><Refresh /></el-icon> 新對話
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { marked } from 'marked'
import { aiService, articleService } from '@/services/api.js'
import { useDirectoryStore } from '@/store/directory.js'

const props = defineProps({
  modelValue:     Boolean,
  contextContent: { type: String, default: '' },
  // 當前文章 ID（ArticleView 傳入），供 AI 建議標籤直接關聯此文章
  articleId: { type: [Number, String], default: null },
  // 文章現有標籤 [{ id, name }]，用於 AI 建議關鍵字區顯示對比
  contextTags: { type: Array, default: () => [] },
  // 傳入陣列限制顯示的 Tab，例如 ['chat']、['generate']、['correct']
  // 不傳則顯示全部
  allowedModes: {
    type:    Array,
    default: () => ['chat', 'generate', 'correct'],
  },
})
const emit = defineEmits(['update:modelValue', 'apply', 'tagAdded'])

const dirStore = useDirectoryStore()

const currentMode  = ref('chat')
const inputText    = ref('')
const messages     = ref([])
const streaming    = ref(false)
const useContext   = ref(true)
const messageArea  = ref(null)
const fileInputRef = ref(null)
const inputRef     = ref(null)
const selectedFile = ref(null)
const fileError    = ref('')

// # mention
const showMentionDropdown = ref(false)
const mentionResults      = ref([])
const referencedArticles  = ref([])
let mentionTimer          = null

let abortController = null

const ALL_MODES = [
  { key: 'chat',     label: 'AI 問答' },
  { key: 'generate', label: '產生文章' },
  { key: 'correct',  label: '校正文章' },
]

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
  chat:     '請輸入問題或貼入文章內容，我將解析並提供關鍵摘要與相關關鍵字。',
  generate: '請輸入提示詞或上傳 Word 檔案（.doc/.docx，最大 5 MB），我將為你產生 Markdown 文章。',
  correct:  '點擊送出，我將校正目前編輯中的文章內容。',
}[currentMode.value]))

const inputPlaceholder = computed(() => ({
  chat:     '輸入問題，或輸入 # 指定文章...',
  generate: '輸入提示詞，例：「撰寫一篇關於 Redis 快取策略的技術文章」',
  correct:  '',
}[currentMode.value]))

const canSend = computed(() => {
  if (streaming.value) return false
  if (currentMode.value === 'correct')  return !!props.contextContent?.trim()
  if (currentMode.value === 'generate') return !!(inputText.value.trim() || selectedFile.value)
  return !!(inputText.value.trim() || referencedArticles.value.length)
})

function close() {
  if (abortController) { abortController.abort(); abortController = null }
  emit('update:modelValue', false)
}

function clearMessages() {
  messages.value          = []
  referencedArticles.value = []
  inputText.value          = ''
  clearFile()
}

// ── 檔案處理 ─────────────────────────────────────────────────
function onFileSelected(e) {
  const file = e.target.files?.[0]
  fileError.value = ''
  if (!file) return
  const allowedMime = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]
  if (!allowedMime.includes(file.type) && !/\.(doc|docx)$/i.test(file.name)) {
    fileError.value = '僅接受 .doc 或 .docx 格式'
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

async function fetchMentionArticles(q) {
  try {
    const scope    = dirStore.viewScope || 'dept'
    const deptCode = dirStore.currentDept
    const results  = await articleService.search(q || '', [], scope, deptCode)
    mentionResults.value      = results.slice(0, 8)
    showMentionDropdown.value = mentionResults.value.length > 0 || q === ''
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
    emit('tagAdded', kw, [...targetIds], results.map(r => r.data).flat())
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
    emit('apply', content)
    ElMessage.success('AI 內容已貼入編輯器')
  } catch { /* 使用者取消 */ }
}

// ── Markdown 渲染 ─────────────────────────────────────────────
function updateHtml(msg) {
  try { msg.htmlContent = marked.parse(msg.content || '') }
  catch { msg.htmlContent = msg.content }
}

async function scrollToBottom() {
  await nextTick()
  if (messageArea.value) messageArea.value.scrollTop = messageArea.value.scrollHeight
}

// ── 送出訊息 ─────────────────────────────────────────────────
async function sendMessage() {
  const isCorrect = currentMode.value === 'correct'

  const userInputText = isCorrect ? '請校正目前文章' : inputText.value.trim()
  if (!userInputText && !selectedFile.value && !referencedArticles.value.length) return

  const userMsg = { id: Date.now(), role: 'user', content: userInputText || '（指定文章問答）', htmlContent: '' }
  messages.value.push(userMsg)
  updateHtml(userMsg)

  const capturedFile    = selectedFile.value
  const capturedInput   = inputText.value.trim()
  const capturedRefs    = [...referencedArticles.value]
  inputText.value        = ''
  referencedArticles.value = []
  clearFile()
  await scrollToBottom()

  streaming.value = true
  // ⚠️ 重要：push 後取 reactive proxy，直接修改原始物件不會觸發 Vue re-render
  messages.value.push({
    id: Date.now() + 1, role: 'ai',
    content: '', htmlContent: '', streaming: true, keywords: [], addedKeywords: [], canApply: false,
  })
  const aiMsg = messages.value[messages.value.length - 1]

  // 串流中直接更新 content（template 用純文字顯示）；結束後才轉 HTML
  const onDelta = (delta) => {
    aiMsg.content += delta
    scrollToBottom()
  }
  const onDone  = async () => {
    // 串流結束：先轉換 Markdown HTML，下一 tick 才切換顯示模式避免閃爍
    updateHtml(aiMsg)
    await nextTick()
    aiMsg.streaming = false
    streaming.value = false
    if (currentMode.value === 'chat') {
      aiMsg.keywords = extractKeywords(aiMsg.content)
    } else {
      aiMsg.canApply = true
    }
    scrollToBottom()
  }
  const onError = async () => {
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
      // 組合 prompt：使用者問題 + 指定文章內容 + 當前文章內文
      let articleContext = ''
      if (capturedRefs.length) {
        const fetched = await Promise.allSettled(
          capturedRefs.map(a => articleService.getById(a.id)),
        )
        articleContext = fetched
          .filter(r => r.status === 'fulfilled')
          .map(r => `\n\n---\n📄 指定文章「${r.value.title}」：\n${r.value.content || ''}`)
          .join('')
      }

      const contextPart = useContext.value && props.contextContent
        ? `\n\n---\n文章內文：\n${props.contextContent}`
        : ''

      const fullContent = (capturedInput || '請分析以上文章內容') + articleContext + contextPart
      await aiService.streamSummarize(fullContent, { onDelta, onDone, onError }, signal)

    } else if (capturedFile) {
      const fd = new FormData()
      fd.append('file', capturedFile)
      await aiService.streamWritingAssist(fd, { onDelta, onDone, onError }, signal)

    } else {
      const content = isCorrect ? props.contextContent : capturedInput
      await aiService.streamWritingAssist({ content }, { onDelta, onDone, onError }, signal)
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
</script>

<style scoped>
.panel-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.3); z-index: 1000;
  display: flex; justify-content: flex-end;
}
.ai-panel {
  width: 420px; background: var(--color-surface);
  height: 100%; display: flex; flex-direction: column;
  box-shadow: var(--shadow-lg);
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
  background: linear-gradient(135deg, #faf5ff, #f5f3ff);
}
.panel-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 700; color: #7c3aed;
}
.panel-header-right { display: flex; align-items: center; gap: 4px; }

/* Mode tabs */
.ai-mode-tabs {
  display: flex; border-bottom: 1px solid var(--color-border);
  flex-shrink: 0; background: var(--color-surface-2);
}
.mode-tab {
  flex: 1; padding: 10px 0;
  border: none; background: none; cursor: pointer;
  font-size: 13px; font-weight: 500; color: var(--color-text-secondary);
  transition: all var(--transition);
  border-bottom: 2px solid transparent;
}
.mode-tab:hover { color: #7c3aed; background: var(--color-surface); }
.mode-tab.active { color: #7c3aed; font-weight: 700; border-bottom-color: #7c3aed; background: var(--color-surface); }

.panel-body {
  flex: 1; overflow-y: auto; padding: 16px 20px;
  display: flex; flex-direction: column; gap: 12px;
}

/* Welcome */
.ai-welcome { text-align: center; padding: 32px 20px; }
.ai-icon { font-size: 48px; margin-bottom: 12px; }
.ai-welcome-text { font-size: 13px; color: var(--color-text-muted); line-height: 1.6; }
.ai-hint {
  margin-top: 8px; font-size: 12px; color: var(--color-text-muted);
}
.ai-hint code {
  background: rgba(124,58,237,.1); color: #7c3aed;
  padding: 1px 5px; border-radius: 3px;
}

/* Messages */
.message { display: flex; }
.message.user { justify-content: flex-end; }
.message.ai   { justify-content: flex-start; }
.msg-bubble {
  max-width: 90%; padding: 12px 14px; border-radius: 12px;
  font-size: 13px; line-height: 1.6;
}
.message.user .msg-bubble {
  background: var(--color-primary); color: #fff; border-bottom-right-radius: 4px;
}
.message.ai .msg-bubble {
  background: var(--color-surface-2); color: var(--color-text-primary);
  border-bottom-left-radius: 4px; border: 1px solid var(--color-border); width: 100%;
}
.msg-content { font-size: 13px; }
/* 串流中：純文字模式，逐字顯示 */
.streaming-content {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.6;
  font-family: inherit;
}
/* Markdown 渲染後樣式 */
:deep(.markdown-body) { font-size: 13px; line-height: 1.7; word-break: break-word; }
:deep(.markdown-body p) { margin: 6px 0; }
:deep(.markdown-body h1) { font-size: 16px; font-weight: 700; margin: 14px 0 6px; border-bottom: 1px solid var(--color-border); padding-bottom: 4px; }
:deep(.markdown-body h2) { font-size: 15px; font-weight: 700; margin: 12px 0 5px; }
:deep(.markdown-body h3) { font-size: 14px; font-weight: 600; margin: 10px 0 4px; }
:deep(.markdown-body h4) { font-size: 13px; font-weight: 600; margin: 8px 0 4px; }
:deep(.markdown-body ul),
:deep(.markdown-body ol) { padding-left: 20px; margin: 6px 0; }
:deep(.markdown-body li) { margin: 3px 0; }
:deep(.markdown-body li p) { margin: 2px 0; }
:deep(.markdown-body strong) { font-weight: 700; color: var(--color-text-primary); }
:deep(.markdown-body em) { font-style: italic; }
:deep(.markdown-body blockquote) {
  margin: 8px 0; padding: 6px 12px;
  border-left: 3px solid #7c3aed;
  background: rgba(124,58,237,.06);
  border-radius: 0 6px 6px 0; color: var(--color-text-secondary);
}
:deep(.markdown-body code) {
  background: rgba(0,0,0,.07); padding: 1px 5px;
  border-radius: 3px; font-size: 12px; font-family: 'Courier New', monospace;
}
:deep(.markdown-body pre) {
  background: #f1f5f9; padding: 10px 12px;
  border-radius: 6px; overflow-x: auto; margin: 8px 0;
}
:deep(.markdown-body pre code) {
  background: none; padding: 0; font-size: 12px; line-height: 1.5;
}
:deep(.markdown-body hr) {
  border: none; border-top: 1px solid var(--color-border); margin: 12px 0;
}
:deep(.markdown-body table) {
  width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px;
}
:deep(.markdown-body th),
:deep(.markdown-body td) {
  border: 1px solid var(--color-border); padding: 5px 10px; text-align: left;
}
:deep(.markdown-body th) { background: var(--color-surface-2); font-weight: 600; }

.typing-cursor {
  display: inline-block; animation: blink 0.7s infinite;
  color: var(--color-primary); font-weight: 700;
}
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

/* Keyword area */
.keyword-area {
  margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-border);
  display: flex; flex-direction: column; gap: 8px;
}
.keyword-row {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
}
.keyword-label { font-size: 11px; color: var(--color-text-muted); flex-shrink: 0; }
.keyword-chip  { cursor: pointer; display: inline-flex; align-items: center; gap: 3px; }
.keyword-chip:hover { opacity: .8; }

/* Apply button */
.apply-area {
  margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-border);
  display: flex; justify-content: flex-end;
}

/* Footer */
.panel-footer {
  padding: 12px 16px; border-top: 1px solid var(--color-border);
  flex-shrink: 0; display: flex; flex-direction: column; gap: 8px;
  position: relative;
}

/* Referenced articles */
.ref-articles {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  padding: 6px 8px; background: var(--color-surface-2);
  border-radius: 6px; border: 1px solid var(--color-border);
}
.ref-label { font-size: 11px; color: var(--color-text-muted); flex-shrink: 0; }
.ref-tag   { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }

/* # mention dropdown */
.mention-dropdown {
  position: absolute; bottom: calc(100% + 4px); left: 16px; right: 16px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 8px; box-shadow: var(--shadow-lg); z-index: 10;
  max-height: 200px; overflow-y: auto;
}
.mention-header {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; font-size: 11px; color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
  position: sticky; top: 0; background: var(--color-surface);
}
.mention-item {
  padding: 8px 12px; font-size: 13px; cursor: pointer;
  transition: background var(--transition);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mention-item:hover { background: var(--color-surface-2); color: var(--color-primary); }
.mention-empty { padding: 12px; font-size: 12px; color: var(--color-text-muted); text-align: center; }

/* Upload */
.upload-area { display: flex; flex-direction: column; gap: 4px; }
.upload-row  { display: flex; align-items: center; gap: 8px; }
.file-name {
  flex: 1; font-size: 12px; color: var(--color-text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.file-error { font-size: 12px; color: var(--el-color-danger); }

.context-toggle { font-size: 12px; }

.input-row { display: flex; gap: 8px; align-items: stretch; }
.input-row :deep(.el-textarea) { flex: 1; }
.send-btn {
  width: 44px;
  height: auto;
  align-self: stretch;
  flex-shrink: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.send-btn.full-send { width: 100%; height: 36px; }

.input-footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.input-hint { 
  font-size: 11px; 
  color: var(--color-text-muted); 
  margin: 0;
}

.new-chat-btn {
  padding: 4px 8px;
  height: 24px;
  font-size: 11px;
}

.panel-enter-active, .panel-leave-active { transition: opacity 0.25s ease; }
.panel-enter-active .ai-panel, .panel-leave-active .ai-panel { transition: transform 0.28s cubic-bezier(.4,0,.2,1); }
.panel-enter-from, .panel-leave-to { opacity: 0; }
.panel-enter-from .ai-panel, .panel-leave-to .ai-panel { transform: translateX(100%); }
</style>
