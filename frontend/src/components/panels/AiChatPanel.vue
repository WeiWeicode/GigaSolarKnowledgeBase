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
              <!-- 思考過程（可摺疊） -->
              <div
                v-if="msg.role === 'ai' && msg.thinkContent"
                class="think-block"
                :class="{ expanded: msg.thinkExpanded, thinking: msg.streaming && msg.thinkStreaming }"
              >
                <button class="think-toggle" @click="msg.thinkExpanded = !msg.thinkExpanded">
                  <span class="think-icon">
                    <span v-if="msg.streaming && msg.thinkStreaming" class="think-spinner">⟳</span>
                    <span v-else>💡</span>
                  </span>
                  <span class="think-label">
                    {{ msg.streaming && msg.thinkStreaming ? '思考中...' : '已完成思考' }}
                  </span>
                  <span class="think-chevron">{{ msg.thinkExpanded ? '▲' : '▼' }}</span>
                </button>
                <div v-show="msg.thinkExpanded" class="think-content">{{ msg.thinkContent }}</div>
              </div>

              <!-- 串流中：純文字逐字顯示；串流結束：轉為 Markdown HTML -->
              <div v-if="msg.streaming" class="msg-content streaming-content">{{ msg.content }}</div>
              <div v-else class="msg-content markdown-body" v-html="msg.htmlContent || msg.content" />
              <span v-if="msg.streaming" class="typing-cursor">▊</span>

              <!-- 引用來源（獨立區塊，與上方「思考過程」摺疊區分開顯示） -->
              <div
                v-if="msg.role === 'ai' && !msg.streaming && msg.sources?.length"
                class="sources-block"
              >
                <div class="sources-header">
                  <el-icon><Document /></el-icon>
                  參考來源（{{ msg.sources.length }}）
                </div>
                <div
                  v-for="(src, idx) in msg.sources"
                  :key="src.chunk_id || idx"
                  class="source-item"
                  @click="src._expanded = !src._expanded"
                >
                  <div class="source-row">
                    <span class="source-name">
                      {{ src.metadata?.chunk_type === 'image' ? '🖼️' : '📄' }}
                      {{ src.metadata?.filename || '未知檔案' }}
                      <span class="source-chunk-idx">#{{ src.metadata?.chunk_index ?? src.chunk_index ?? '?' }}</span>
                    </span>
                    <span class="source-badges">
                      <el-tag
                        size="small"
                        :type="src.metadata?.included_in_ai_context === false ? 'info' : 'success'"
                        effect="plain"
                      >{{ src.metadata?.included_in_ai_context === false ? '未採納' : '已採納' }}</el-tag>
                      <el-tag size="small" type="primary" effect="plain">
                        相似度 {{ (src.semantic_score ?? src.score ?? 0).toFixed(2) }}
                      </el-tag>
                      <span class="source-chevron">{{ src._expanded ? '▲' : '▼' }}</span>
                    </span>
                  </div>
                  <div v-show="src._expanded" class="source-content">{{ src.content || '無內容' }}</div>
                </div>
              </div>

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

          <!-- Word / PDF 上傳（generate 模式） -->
          <div v-if="currentMode === 'generate'" class="upload-area">
            <input
              ref="fileInputRef"
              type="file"
              accept=".doc,.docx,.pdf"
              style="display:none"
              @change="onFileSelected"
            />
            <div class="upload-row">
              <el-button plain size="small" @click="fileInputRef.click()">
                <el-icon><Upload /></el-icon> 上傳 Word / PDF
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

          <!-- 快速指令（有指定文章且在 chat 模式時顯示） -->
          <div v-if="currentMode === 'chat' && (referencedArticles.length || props.articleId)" class="quick-commands">
            <span class="quick-cmd-label">快速指令：</span>
            <el-button
              v-for="cmd in QUICK_COMMANDS"
              :key="cmd.key"
              size="small"
              plain
              :disabled="streaming"
              class="quick-cmd-btn"
              @click="sendCommand(cmd.key)"
            >{{ cmd.label }}</el-button>
          </div>

          <!-- 檢索嚴謹度拉桿區（僅 chat 模式顯示） -->
          <div v-if="currentMode === 'chat'" class="search-strictness-bar">
            <div class="strictness-header">
              <span class="strictness-label">
                資料撈取：
                <strong class="strictness-value-text">{{ strictnessLabel }}</strong>
              </span>
              <el-tooltip
                content="寬鬆：AI 取得資料較多，會思考較久；嚴謹：精準篩選資料"
                placement="top"
                effect="dark"
              >
                <span class="info-pop-icon">!</span>
              </el-tooltip>
            </div>
            <div class="strictness-slider-wrapper">
              <span class="slider-node-label">寬鬆</span>
              <el-slider
                v-model="strictnessLevel"
                :min="1"
                :max="10"
                :step="1"
                :show-tooltip="true"
                :format-tooltip="formatStrictnessTooltip"
                size="small"
                class="strictness-slider"
              />
              <span class="slider-node-label">嚴謹</span>
            </div>
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
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { marked } from 'marked'
import { aiService, articleService, crossDeptService } from '@/services/api.js'
import { sendExternalChat } from '@/services/AiRAGApi.js'
import { useDirectoryStore } from '@/store/directory.js'
import { useAuthStore } from '@/store/auth.js'

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

const dirStore  = useDirectoryStore()
const authStore = useAuthStore()

// 跨部門授權（同 DirectoryTree.vue，用於 # 篩選）
const myGrantedDepts = ref([])
onMounted(async () => {
  try {
    const grants = await crossDeptService.getMyGrants()
    myGrantedDepts.value = grants.map(g => g.dept_code)
  } catch { /* 無授權資料，忽略 */ }
})

const QUICK_COMMANDS = [
  { key: 'quick_summary',    label: '簡易摘要' },
  { key: 'detailed_summary', label: '詳細摘要' },
  { key: 'step_guide',       label: '步驟詳解' },
]

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

// ── 檢索嚴謹度 (10個等級：1=寬鬆 ~ 10=嚴謹) ──────────────────
const strictnessLevel = ref(8)

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

// 根據拉桿等級 (1~10) 動態計算 API 參數
// top_k: 50 => 5
// score_threshold: 0.1 => 0.7
// ai_summary_score_threshold: 0.1 => 0.6
const computedRAGParams = computed(() => {
  const L = strictnessLevel.value
  const top_k = Math.round(50 - (L - 1) * (45 / 9))
  const score_threshold = Number((0.1 + (L - 1) * (0.6 / 9)).toFixed(2))
  const ai_summary_score_threshold = Number((0.1 + (L - 1) * (0.5 / 9)).toFixed(2))

  return {
    top_k,
    score_threshold,
    ai_summary_score_threshold,
  }
})

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
  generate: '請輸入提示詞或上傳 Word / PDF 檔案（.doc/.docx/.pdf，最大 5 MB），我將為你產生 Markdown 文章。',
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

  const capturedRefs = [...referencedArticles.value]
  referencedArticles.value = []
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

    // 抓指定文章內容
    let articleContent = ''
    if (capturedRefs.length) {
      const fetched = await Promise.allSettled(
        capturedRefs.map(a => articleService.getById(a.id))
      )
      articleContent = fetched
        .filter(r => r.status === 'fulfilled')
        .map(r => `\n\n---\n📄 文章「${r.value.title}」：\n${r.value.content || ''}`)
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
    thinkContent: '', thinkExpanded: false, thinkStreaming: false,
  })
  const aiMsg = messages.value[messages.value.length - 1]

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
      if (capturedRefs.length > 0) {
        // 組合 prompt：使用者問題 + 指定文章內容 + 當前文章內文
        const fetched = await Promise.allSettled(
          capturedRefs.map(a => articleService.getById(a.id)),
        )
        const articleContext = fetched
          .filter(r => r.status === 'fulfilled')
          .map(r => `\n\n---\n📄 指定文章「${r.value.title}」：\n${r.value.content || ''}`)
          .join('')

        const contextPart = useContext.value && props.contextContent
          ? `\n\n---\n文章內文：\n${props.contextContent}`
          : ''

        const fullContent = (capturedInput || '請分析以上文章內容') + articleContext + contextPart
        await aiService.streamSummarize(fullContent, { onThinking, onDelta, onDone, onError }, signal)

      } else {
        // 無 # 指定文章：直接呼叫 AiRAGApi 進行外部問答
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

/* Think block */
.think-block {
  margin-bottom: 8px;
  border: 1px solid rgba(124,58,237,.2);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(124,58,237,.03);
}
.think-block.thinking {
  border-color: rgba(124,58,237,.4);
  background: rgba(124,58,237,.06);
}
.think-toggle {
  width: 100%; display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; border: none; background: none; cursor: pointer;
  font-size: 12px; color: #7c3aed; text-align: left;
  transition: background var(--transition);
}
.think-toggle:hover { background: rgba(124,58,237,.08); }
.think-icon { font-size: 13px; flex-shrink: 0; }
.think-label { flex: 1; font-weight: 500; }
.think-chevron { font-size: 10px; color: var(--color-text-muted); }
.think-spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.think-content {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  border-top: 1px solid rgba(124,58,237,.15);
  max-height: 200px;
  overflow-y: auto;
  background: rgba(255,255,255,.5);
}

/* Sources block（引用來源，獨立於 think-block） */
.sources-block {
  margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-border);
  display: flex; flex-direction: column; gap: 6px;
}
.sources-header {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600; color: var(--color-text-muted);
}
.source-item {
  border: 1px solid var(--color-border); border-radius: 8px;
  background: var(--color-surface); cursor: pointer;
  transition: background var(--transition);
  overflow: hidden;
}
.source-item:hover { background: var(--color-surface-2); }
.source-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 10px;
}
.source-name {
  font-size: 12px; color: var(--color-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
}
.source-chunk-idx { color: var(--color-text-muted); font-size: 11px; }
.source-badges { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.source-chevron { font-size: 10px; color: var(--color-text-muted); }
.source-content {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  border-top: 1px solid var(--color-border);
  max-height: 200px;
  overflow-y: auto;
  background: var(--color-surface-2);
}

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

/* Quick commands */
.quick-commands {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  padding: 6px 8px; background: rgba(124,58,237,.04);
  border-radius: 6px; border: 1px dashed rgba(124,58,237,.25);
}
.quick-cmd-label { font-size: 11px; color: var(--color-text-muted); flex-shrink: 0; }
.quick-cmd-btn { border-color: rgba(124,58,237,.35) !important; color: #7c3aed !important; }
.quick-cmd-btn:hover { background: rgba(124,58,237,.08) !important; }

/* Upload */
.upload-area { display: flex; flex-direction: column; gap: 4px; }
.upload-row  { display: flex; align-items: center; gap: 8px; }
.file-name {
  flex: 1; font-size: 12px; color: var(--color-text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.file-error { font-size: 12px; color: var(--el-color-danger); }

.context-toggle { font-size: 12px; }

/* 檢索嚴謹度拉桿樣式 */
.search-strictness-bar {
  display: flex; flex-direction: column; gap: 4px;
  padding: 6px 10px;
  background: var(--color-surface-2, #f8fafc);
  border-radius: 8px;
  border: 1px solid var(--color-border, #e2e8f0);
}
.strictness-header {
  display: flex; align-items: center; justify-content: space-between;
}
.strictness-label {
  font-size: 12px; color: var(--color-text-secondary, #475569);
  display: flex; align-items: center; gap: 4px;
}
.strictness-value-text {
  color: var(--el-color-primary, #409eff);
  font-weight: 600;
}
.info-pop-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--el-color-primary-light-9, #ecf5ff);
  color: var(--el-color-primary, #409eff);
  font-size: 11px; font-weight: bold;
  cursor: help;
  border: 1px solid var(--el-color-primary-light-6, #b3d8ff);
  transition: all 0.2s ease;
  user-select: none;
}
.info-pop-icon:hover {
  background: var(--el-color-primary, #409eff);
  color: #ffffff;
}
.strictness-slider-wrapper {
  display: flex; align-items: center; gap: 10px;
  padding: 0 4px;
}
.slider-node-label {
  font-size: 11px; color: var(--color-text-muted, #94a3b8);
  white-space: nowrap; font-weight: 500;
}
.strictness-slider {
  flex: 1;
  --el-slider-main-bg-color: var(--el-color-primary, #409eff);
}

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
