<template>
  <div class="ai-chat-page">
    <div class="page-header">
      <span class="page-title">
        <el-icon><ChatDotRound /></el-icon> AI 問答
      </span>
      <el-tag size="small" type="success" effect="light">qwen3.6:35b</el-tag>
    </div>

    <!-- Chat messages -->
    <div
      class="page-body"
      ref="messageArea"
      :class="{ 'drag-active': isDragActive }"
      @dragenter.prevent="onDragEnter"
      @dragleave.prevent="onDragLeave"
      @dragover.prevent="onDragOver"
      @drop.prevent="onDrop"
    >
      <div v-if="messages.length === 0" class="ai-welcome">
        <div class="ai-icon">🤖</div>
        <p class="ai-welcome-text">{{ welcomeText }}</p>
        <p class="ai-hint">
          輸入 <code>#</code> 可指定詢問特定文章
        </p>
        <p class="ai-hint drag-hint">
          💡 提示：可從左側目錄樹拖曳文章或附件到這裡，直接向 AI 提問
        </p>
      </div>
      <div v-if="isDragActive" class="drop-hint-overlay">
        <div class="drop-hint-box">📥 放開以引用文章／附件</div>
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

          <!-- 引用來源 -->
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

          <!-- AI 建議關鍵字 -->
          <div
            v-if="msg.role === 'ai' && !msg.streaming && msg.keywords?.length"
            class="keyword-area"
          >
            <div class="keyword-row">
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
        </div>
      </div>
    </div>

    <!-- Input area -->
    <div class="page-footer">
      <!-- 已引用內容：文章 + 附件檔案 -->
      <div v-if="referencedArticles.length || referencedFiles.length" class="ref-articles">
        <span class="ref-label">已引用內容：</span>
        <el-tag
          v-for="a in referencedArticles"
          :key="'article-' + a.id"
          closable
          size="small"
          type="info"
          class="ref-tag"
          @close="removeRef(a.id)"
        >📄 {{ a.title }}</el-tag>
        <el-tag
          v-for="f in referencedFiles"
          :key="'file-' + f.uuid"
          closable
          size="small"
          type="info"
          class="ref-tag"
          @close="removeFileRef(f.uuid)"
        >📎 {{ f.name }}</el-tag>
        <span v-if="referencedFiles.length" class="ref-char-count">
          （附件文字合計 {{ totalReferencedChars }} / {{ MAX_REFERENCED_CHARS }} 字）
        </span>
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

      <!-- 快速指令（有指定文章時顯示） -->
      <div v-if="referencedArticles.length" class="quick-commands">
        <span class="quick-cmd-label">或使用快速指令：</span>
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

      <!-- 檢索與思考模式拉桿 -->
      <div class="search-strictness-bar">
        <div class="strictness-row">
          <div class="strictness-col think-mode-col">
            <div class="strictness-header">
              <span class="strictness-label">
                思考模式：
                <strong class="strictness-value-text">{{ searchModeLabel }}</strong>
              </span>
              <el-tooltip
                content="快速：使用 KB_hybrid 檢索，回應速度較快；嚴謹：使用 KB_semantic_hybrid 檢索，品質較佳但速度較慢"
                placement="top"
                effect="dark"
              >
                <span class="info-pop-icon">!</span>
              </el-tooltip>
            </div>
            <div class="strictness-slider-wrapper">
              <span class="slider-node-label">快速</span>
              <el-slider
                v-model="searchModeLevel"
                :min="1"
                :max="2"
                :step="1"
                :show-tooltip="false"
                size="small"
                class="strictness-slider"
              />
              <span class="slider-node-label">嚴謹</span>
            </div>
          </div>

          <div class="strictness-col data-fetch-col">
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
        </div>
      </div>

      <div class="input-row">
        <el-input
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
          @click="sendMessage"
        >
          <el-icon><Position /></el-icon>
        </el-button>
      </div>
      <div class="input-footer-row">
        <div class="input-hints">
          <p class="input-hint">可直接輸入你的問題，或點擊上方快速指令。Enter 送出，Shift+Enter 換行，輸入 # 指定文章</p>
          <p class="input-hint">💡 提示：可從左側目錄樹拖曳文章或附件到這裡，直接向 AI 提問</p>
        </div>
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

    <!-- 附件檔案選擇對話框（拖曳附件節點後彈出） -->
    <el-dialog v-model="showFileDialog" title="選擇要引用的檔案" width="480px" append-to-body>
      <div class="file-picker-header">
        <span class="file-picker-title">{{ pendingAttachmentTitle }}</span>
        <el-checkbox
          v-if="pendingFiles.some(f => f.supported)"
          :model-value="allSelected"
          @change="toggleSelectAll"
        >全選</el-checkbox>
      </div>
      <div class="file-picker-list">
        <div v-for="f in pendingFiles" :key="f.uuid" class="file-picker-item">
          <el-checkbox v-model="f.selected" :disabled="!f.supported">
            {{ f.name }}
            <span class="file-picker-meta">（{{ formatSize(f.size) }}）</span>
            <span v-if="!f.supported" class="file-picker-unsupported">AI 暫不支援此格式</span>
          </el-checkbox>
        </div>
      </div>
      <template #footer>
        <el-button @click="showFileDialog = false">取消</el-button>
        <el-button type="primary" :loading="extracting" @click="confirmFileSelection">確認引用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { useAiChat, MAX_REFERENCED_CHARS } from '@/composables/useAiChat.js'
import { useAiChatStore } from '@/store/aiChat.js'
import { useDirectoryStore } from '@/store/directory.js'
import { attachmentService } from '@/services/api.js'

const dirStore = useDirectoryStore()
const store = useAiChatStore()

// AI 問答頁面沒有文章編輯上下文，僅開放 chat 模式
const pageProps = {
  contextContent: '',
  articleId: null,
  contextTags: [],
  allowedModes: ['chat'],
}

const {
  messageArea, inputRef,
  QUICK_COMMANDS,
  welcomeText, inputPlaceholder, canSend,
  strictnessLabel, searchModeLabel, formatStrictnessTooltip,
  clearMessages, onInputChange, onInputBlur, selectMention, removeRef,
  requestAddKeyword, sendCommand, sendMessage,
  addFileReferences, removeFileRef, totalReferencedChars,
  currentMode, inputText, messages, streaming, strictnessLevel, searchModeLevel,
  showMentionDropdown, mentionResults, referencedArticles, referencedFiles,
} = useAiChat(storeToRefs(store), pageProps)

// ── 目錄樹拖曳文章/附件到此頁面（見 AI_CHAT_MAIN_PAGE_PLAN.md 2.3 節） ──
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

// dragenter/dragleave 在子元素間移動時會頻繁觸發，用計數器避免高亮閃爍
const dragCounter  = ref(0)
const isDragActive = computed(() => dragCounter.value > 0)

function onDragEnter() { dragCounter.value++ }
function onDragLeave() { dragCounter.value = Math.max(0, dragCounter.value - 1) }
function onDragOver(event) {
  event.dataTransfer.dropEffect = 'copy'
}

const showFileDialog        = ref(false)
const pendingAttachmentTitle = ref('')
const pendingFiles           = ref([])
const extracting             = ref(false)

const allSelected = computed(() => {
  const supported = pendingFiles.value.filter(f => f.supported)
  return supported.length > 0 && supported.every(f => f.selected)
})

function toggleSelectAll(val) {
  pendingFiles.value.forEach(f => { if (f.supported) f.selected = val })
}

function formatSize(bytes) {
  if (!bytes) return '0 KB'
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

async function onDrop(event) {
  dragCounter.value = 0
  const raw = event.dataTransfer.getData('application/json')
  if (!raw) return

  let payload
  try { payload = JSON.parse(raw) } catch { return }

  if (payload.kind === 'article') {
    selectMention({ id: payload.id, title: payload.title })
    return
  }

  if (payload.kind === 'attachment') {
    try {
      const attachment = await attachmentService.getById(payload.id)
      pendingAttachmentTitle.value = attachment.title || payload.title
      pendingFiles.value = (attachment.files || []).map(f => ({
        uuid: f.uuid,
        name: f.name,
        size: f.size,
        supported: SUPPORTED_MIME_TYPES.includes(f.mimeType),
        selected: SUPPORTED_MIME_TYPES.includes(f.mimeType),
      }))
      if (pendingFiles.value.length === 0) {
        ElMessage.warning('此附件內沒有檔案')
        return
      }
      showFileDialog.value = true
    } catch (err) {
      ElMessage.error('取得附件檔案清單失敗：' + (err.message || ''))
    }
  }
}

async function confirmFileSelection() {
  const selected = pendingFiles.value.filter(f => f.selected && f.supported)
  if (selected.length === 0) {
    ElMessage.warning('請至少選擇一個檔案')
    return
  }

  extracting.value = true
  try {
    const results = await Promise.allSettled(selected.map(f => attachmentService.extractFileText(f.uuid)))
    const extracted  = []
    const emptyNames = []

    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        const { uuid, name, text } = r.value
        if (text?.trim()) extracted.push({ uuid, name, content: text })
        else emptyNames.push(selected[idx].name)
      } else {
        ElMessage.error(`「${selected[idx].name}」擷取失敗：${r.reason?.message || '未知錯誤'}`)
      }
    })

    if (emptyNames.length) {
      ElMessage.warning(`⚠️ 無法從「${emptyNames.join('、')}」擷取文字（可能是掃描圖片檔或加密文件）`)
    }

    if (extracted.length) {
      const result = addFileReferences(extracted)
      if (!result.ok) {
        ElMessage.warning(result.message)
        return  // 超過上限，保留對話框讓使用者重新勾選
      }
    }
    showFileDialog.value = false
  } finally {
    extracting.value = false
  }
}
</script>

<style scoped>
.ai-chat-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
}

.page-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
  background: linear-gradient(135deg, #faf5ff, #f5f3ff);
}
.page-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 16px; font-weight: 700; color: #7c3aed;
}

.page-body {
  flex: 1; overflow-y: auto; padding: 20px 24px;
  display: flex; flex-direction: column; gap: 12px;
  position: relative;
}
.page-body.drag-active {
  outline: 2px dashed var(--color-primary);
  outline-offset: -6px;
  background: rgba(124,58,237,.04);
}
.drop-hint-overlay {
  position: sticky; top: 0; left: 0; right: 0;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none; z-index: 5; padding: 8px 0;
}
.drop-hint-box {
  background: var(--color-primary); color: #fff; font-size: 13px; font-weight: 600;
  padding: 8px 16px; border-radius: 999px; box-shadow: var(--shadow-lg);
}
.drag-hint { color: #7c3aed; }

.ai-welcome { text-align: center; padding: 48px 20px; }
.ai-icon { font-size: 48px; margin-bottom: 12px; }
.ai-welcome-text { font-size: 14px; color: var(--color-text-muted); line-height: 1.6; max-width: 560px; margin: 0 auto; }
.ai-hint { margin-top: 8px; font-size: 12px; color: var(--color-text-muted); }
.ai-hint code { background: rgba(124,58,237,.1); color: #7c3aed; padding: 1px 5px; border-radius: 3px; }

.message { display: flex; }
.message.user { justify-content: flex-end; }
.message.ai   { justify-content: flex-start; }
.msg-bubble {
  max-width: 70%; padding: 12px 14px; border-radius: 12px;
  font-size: 13px; line-height: 1.6;
}
.message.user .msg-bubble {
  background: var(--color-primary); color: #fff; border-bottom-right-radius: 4px;
}
.message.ai .msg-bubble {
  background: var(--color-surface-2); color: var(--color-text-primary);
  border-bottom-left-radius: 4px; border: 1px solid var(--color-border); width: 100%; max-width: 720px;
}
.msg-content { font-size: 13px; }
.streaming-content { white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6; font-family: inherit; }
:deep(.markdown-body) { font-size: 13px; line-height: 1.7; word-break: break-word; }
:deep(.markdown-body p) { margin: 6px 0; }
:deep(.markdown-body h1) { font-size: 16px; font-weight: 700; margin: 14px 0 6px; border-bottom: 1px solid var(--color-border); padding-bottom: 4px; }
:deep(.markdown-body h2) { font-size: 15px; font-weight: 700; margin: 12px 0 5px; }
:deep(.markdown-body h3) { font-size: 14px; font-weight: 600; margin: 10px 0 4px; }
:deep(.markdown-body ul), :deep(.markdown-body ol) { padding-left: 20px; margin: 6px 0; }
:deep(.markdown-body li) { margin: 3px 0; }
:deep(.markdown-body strong) { font-weight: 700; color: var(--color-text-primary); }
:deep(.markdown-body blockquote) {
  margin: 8px 0; padding: 6px 12px; border-left: 3px solid #7c3aed;
  background: rgba(124,58,237,.06); border-radius: 0 6px 6px 0; color: var(--color-text-secondary);
}
:deep(.markdown-body code) { background: rgba(0,0,0,.07); padding: 1px 5px; border-radius: 3px; font-size: 12px; font-family: 'Courier New', monospace; }
:deep(.markdown-body pre) { background: #f1f5f9; padding: 10px 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0; }
:deep(.markdown-body pre code) { background: none; padding: 0; font-size: 12px; line-height: 1.5; }
:deep(.markdown-body table) { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
:deep(.markdown-body th), :deep(.markdown-body td) { border: 1px solid var(--color-border); padding: 5px 10px; text-align: left; }
:deep(.markdown-body th) { background: var(--color-surface-2); font-weight: 600; }

.typing-cursor { display: inline-block; animation: blink 0.7s infinite; color: var(--color-primary); font-weight: 700; }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

.think-block { margin-bottom: 8px; border: 1px solid rgba(124,58,237,.2); border-radius: 8px; overflow: hidden; background: rgba(124,58,237,.03); }
.think-block.thinking { border-color: rgba(124,58,237,.4); background: rgba(124,58,237,.06); }
.think-toggle { width: 100%; display: flex; align-items: center; gap: 6px; padding: 6px 10px; border: none; background: none; cursor: pointer; font-size: 12px; color: #7c3aed; text-align: left; transition: background var(--transition); }
.think-toggle:hover { background: rgba(124,58,237,.08); }
.think-icon { font-size: 13px; flex-shrink: 0; }
.think-label { flex: 1; font-weight: 500; }
.think-chevron { font-size: 10px; color: var(--color-text-muted); }
.think-spinner { display: inline-block; animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.think-content {
  padding: 8px 12px; font-size: 12px; color: var(--color-text-secondary); line-height: 1.6;
  white-space: pre-wrap; word-break: break-word; border-top: 1px solid rgba(124,58,237,.15);
  max-height: 200px; overflow-y: auto; background: rgba(255,255,255,.5);
}

.sources-block { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 6px; }
.sources-header { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--color-text-muted); }
.source-item { border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); cursor: pointer; transition: background var(--transition); overflow: hidden; }
.source-item:hover { background: var(--color-surface-2); }
.source-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; }
.source-name { font-size: 12px; color: var(--color-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.source-chunk-idx { color: var(--color-text-muted); font-size: 11px; }
.source-badges { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.source-chevron { font-size: 10px; color: var(--color-text-muted); }
.source-content {
  padding: 8px 10px; font-size: 12px; color: var(--color-text-secondary); line-height: 1.6;
  white-space: pre-wrap; word-break: break-word; border-top: 1px solid var(--color-border);
  max-height: 200px; overflow-y: auto; background: var(--color-surface-2);
}

.keyword-area { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 8px; }
.keyword-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.keyword-label { font-size: 11px; color: var(--color-text-muted); flex-shrink: 0; }
.keyword-chip { cursor: pointer; display: inline-flex; align-items: center; gap: 3px; }
.keyword-chip:hover { opacity: .8; }

.page-footer {
  padding: 14px 24px; border-top: 1px solid var(--color-border);
  flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; position: relative;
}

.ref-articles { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 6px 8px; background: var(--color-surface-2); border-radius: 6px; border: 1px solid var(--color-border); }
.ref-label { font-size: 11px; color: var(--color-text-muted); flex-shrink: 0; }
.ref-tag { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.ref-char-count { font-size: 11px; color: var(--color-text-muted); margin-left: 4px; }

.file-picker-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-size: 13px; font-weight: 600; }
.file-picker-title { color: var(--color-text-primary); }
.file-picker-list { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; }
.file-picker-item { padding: 6px 8px; border-radius: 6px; border: 1px solid var(--color-border); }
.file-picker-meta { font-size: 12px; color: var(--color-text-muted); }
.file-picker-unsupported { font-size: 11px; color: var(--el-color-danger); margin-left: 6px; }

.mention-dropdown {
  position: absolute; bottom: calc(100% + 4px); left: 24px; right: 24px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 8px; box-shadow: var(--shadow-lg); z-index: 10; max-height: 240px; overflow-y: auto;
}
.mention-header { display: flex; align-items: center; gap: 6px; padding: 8px 12px; font-size: 11px; color: var(--color-text-muted); border-bottom: 1px solid var(--color-border); position: sticky; top: 0; background: var(--color-surface); }
.mention-item { padding: 8px 12px; font-size: 13px; cursor: pointer; transition: background var(--transition); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mention-item:hover { background: var(--color-surface-2); color: var(--color-primary); }
.mention-empty { padding: 12px; font-size: 12px; color: var(--color-text-muted); text-align: center; }

.quick-commands { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 6px 8px; background: rgba(124,58,237,.04); border-radius: 6px; border: 1px dashed rgba(124,58,237,.25); }
.quick-cmd-label { font-size: 11px; color: var(--color-text-muted); flex-shrink: 0; }
.quick-cmd-btn { border-color: rgba(124,58,237,.35) !important; color: #7c3aed !important; }
.quick-cmd-btn:hover { background: rgba(124,58,237,.08) !important; }

.search-strictness-bar { display: flex; flex-direction: column; gap: 4px; padding: 6px 12px; background: var(--color-surface-2, #f8fafc); border-radius: 8px; border: 1px solid var(--color-border, #e2e8f0); }
.strictness-row { display: flex; gap: 16px; flex-wrap: wrap; }
.strictness-col { display: flex; flex-direction: column; gap: 4px; }
.strictness-col.think-mode-col { flex: 2; min-width: 140px; }
.strictness-col.data-fetch-col { flex: 8; min-width: 240px; }
.strictness-header { display: flex; align-items: center; justify-content: space-between; }
.strictness-label { font-size: 12px; color: var(--color-text-secondary, #475569); display: flex; align-items: center; gap: 4px; }
.strictness-value-text { color: var(--el-color-primary, #409eff); font-weight: 600; }
.info-pop-icon {
  display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%;
  background: var(--el-color-primary-light-9, #ecf5ff); color: var(--el-color-primary, #409eff); font-size: 11px; font-weight: bold;
  cursor: help; border: 1px solid var(--el-color-primary-light-6, #b3d8ff); transition: all 0.2s ease; user-select: none;
}
.info-pop-icon:hover { background: var(--el-color-primary, #409eff); color: #ffffff; }
.strictness-slider-wrapper { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
.slider-node-label { font-size: 11px; color: var(--color-text-muted, #94a3b8); white-space: nowrap; font-weight: 500; }
.strictness-slider { flex: 1; --el-slider-main-bg-color: var(--el-color-primary, #409eff); }

.input-row { display: flex; gap: 8px; align-items: stretch; }
.input-row :deep(.el-textarea) { flex: 1; }
.send-btn { width: 44px; height: auto; align-self: stretch; flex-shrink: 0; padding: 0; display: inline-flex; align-items: center; justify-content: center; }

.input-footer-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.input-hints { display: flex; flex-direction: column; gap: 2px; }
.input-hint { font-size: 11px; color: var(--color-text-muted); margin: 0; }
.new-chat-btn { padding: 4px 8px; height: 24px; font-size: 11px; }
</style>
