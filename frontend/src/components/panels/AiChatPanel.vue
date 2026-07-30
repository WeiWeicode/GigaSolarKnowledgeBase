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

          <!-- 檢索與思考模式拉桿區（僅 chat 模式顯示） -->
          <div v-if="currentMode === 'chat'" class="search-strictness-bar">
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
import { reactive, toRefs } from 'vue'
import { useAiChat } from '@/composables/useAiChat.js'
import { useDirectoryStore } from '@/store/directory.js'

const dirStore = useDirectoryStore()

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

// 本地狀態：隨元件掛載/卸載重置，與重構前的彈出視窗行為完全一致
const localState = reactive({
  currentMode: 'chat',
  inputText: '',
  messages: [],
  streaming: false,
  useContext: true,
  selectedFile: null,
  fileError: '',
  strictnessLevel: 8,
  searchModeLevel: 1,
  showMentionDropdown: false,
  mentionResults: [],
  referencedArticles: [],
  referencedFiles: [],
})

const {
  messageArea, fileInputRef, inputRef,
  QUICK_COMMANDS,
  visibleModes, welcomeText, inputPlaceholder, canSend,
  strictnessLabel, searchModeLabel, formatStrictnessTooltip,
  close: closeChat, clearMessages, onFileSelected, clearFile,
  onInputChange, onInputBlur, selectMention, removeRef,
  requestAddKeyword, confirmApply,
  sendCommand, sendMessage,
  currentMode, inputText, messages, streaming, useContext,
  selectedFile, fileError, strictnessLevel, searchModeLevel,
  showMentionDropdown, mentionResults, referencedArticles,
} = useAiChat(toRefs(localState), props, emit)

function close() {
  closeChat(() => emit('update:modelValue', false))
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

/* 檢索與思考模式拉桿樣式 */
.search-strictness-bar {
  display: flex; flex-direction: column; gap: 4px;
  padding: 6px 10px;
  background: var(--color-surface-2, #f8fafc);
  border-radius: 8px;
  border: 1px solid var(--color-border, #e2e8f0);
}
.strictness-row { display: flex; gap: 12px; flex-wrap: wrap; }
.strictness-col { display: flex; flex-direction: column; gap: 4px; }
.strictness-col.think-mode-col { flex: 2; min-width: 130px; }
.strictness-col.data-fetch-col { flex: 8; min-width: 200px; }
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
