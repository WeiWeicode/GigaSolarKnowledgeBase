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

        <!-- Mode tabs -->
        <div class="ai-mode-tabs">
          <button
            v-for="m in modes"
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
            <p class="ai-welcome-text">
              {{ currentMode === 'chat' ? '請輸入問題，我將搜尋知識庫並回答你。' : '請輸入提示詞，我將為你產生或校正文章內容。' }}
            </p>
          </div>
          <div v-for="msg in messages" :key="msg.id" class="message" :class="msg.role">
            <div class="msg-bubble">
              <div v-if="msg.role === 'ai' && msg.sources?.length" class="msg-sources">
                <span class="source-label">引用來源：</span>
                <a v-for="s in msg.sources" :key="s.id" :href="`/article/${s.id}`" class="source-link">{{ s.title }}</a>
              </div>
              <div class="msg-content markdown-body" v-html="msg.htmlContent || msg.content" />
              <span v-if="msg.streaming" class="typing-cursor">▊</span>
            </div>
          </div>
        </div>

        <!-- Input -->
        <div class="panel-footer">
          <div v-if="contextContent" class="context-toggle">
            <el-checkbox v-model="useContext" size="small">包含目前文章內容作為上下文</el-checkbox>
          </div>
          <div class="input-row">
            <el-input
              v-model="inputText"
              type="textarea"
              :rows="2"
              :placeholder="inputPlaceholder"
              resize="none"
              @keydown.enter.exact.prevent="sendMessage"
            />
            <el-button
              type="primary"
              :loading="streaming"
              :disabled="!inputText.trim()"
              class="send-btn"
              @click="sendMessage"
            >
              <el-icon><Position /></el-icon>
            </el-button>
          </div>
          <p class="input-hint">Enter 送出，Shift+Enter 換行</p>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import VditorImport from 'vditor'
const Vditor = VditorImport.default || VditorImport
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: Boolean,
  contextContent: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'apply'])



const currentMode = ref('chat')
const inputText = ref('')
const messages = ref([])
const streaming = ref(false)
const useContext = ref(true)
const messageArea = ref(null)

const modes = [
  { key: 'chat',     label: 'AI 問答' },
  { key: 'generate', label: '產生文章' },
  { key: 'correct',  label: '校正文章' },
]

const inputPlaceholder = computed(() => ({
  chat: '輸入問題，例：「如何設定 Docker Volume 備份？」',
  generate: '輸入提示詞，例：「撰寫一篇關於 Redis 快取策略的技術文章」',
  correct: '點擊「發送」以校正目前文章',
}[currentMode.value]))

function close() { emit('update:modelValue', false) }
async function updateHtml(msg) {
  try {
    msg.htmlContent = await Vditor.md2html(msg.content || '')
  } catch (e) {
    msg.htmlContent = msg.content
  }
}

async function scrollToBottom() {
  await nextTick()
  if (messageArea.value) messageArea.value.scrollTop = messageArea.value.scrollHeight
}

async function sendMessage() {
  const text = currentMode.value === 'correct'
    ? `請校正以下 Markdown 文章：\n\n${props.contextContent}`
    : inputText.value.trim()
  if (!text) return

  const userMsg = { id: Date.now(), role: 'user', content: inputText.value || '請校正目前文章', htmlContent: '' }
  messages.value.push(userMsg)
  updateHtml(userMsg)
  inputText.value = ''
  await scrollToBottom()

  streaming.value = true
  const aiMsg = { id: Date.now() + 1, role: 'ai', content: '', htmlContent: '', streaming: true, sources: [] }
  messages.value.push(aiMsg)

  // Mock streaming
  const mockResponse = currentMode.value === 'chat'
    ? `根據知識庫中的文章，以下是我的回答：\n\n**Docker Volume 備份策略**可以使用以下幾種方式：\n\n1. **定期快照**：使用 \`docker run --volumes-from\` 搭配備份容器\n2. **NAS 掛載**：將 Volume 掛載至 NAS 共享目錄\n3. **rsync 排程**：定期將 \`/app/uploads\` 同步至備援伺服器\n\n詳細設定請參考「Docker 部署 SOP」文章。`
    : `# 已校正的文章\n\n已完成校正，主要改動：\n- 修正標點符號使用\n- 統一術語：「Docker Compose」大小寫\n- 補充遺漏的步驟說明`

  aiMsg.sources = [{ id: 104, title: 'Docker 部署 SOP' }]

  let i = 0
  const chunk = async () => {
    if (i < mockResponse.length) {
      aiMsg.content += mockResponse[i++]
      await updateHtml(aiMsg)
      scrollToBottom()
      setTimeout(chunk, 18)
    } else {
      aiMsg.streaming = false
      streaming.value = false
      if (currentMode.value !== 'chat') {
        emit('apply', aiMsg.content)
        ElMessage.success('AI 內容已產生，請查看預覽')
      }
    }
  }
  chunk()
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

.panel-header-right { display: flex; align-items: center; gap: 8px; }

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
.mode-tab.active {
  color: #7c3aed; font-weight: 700;
  border-bottom-color: #7c3aed;
  background: var(--color-surface);
}

.panel-body {
  flex: 1; overflow-y: auto; padding: 16px 20px;
  display: flex; flex-direction: column; gap: 12px;
}

/* Welcome */
.ai-welcome { text-align: center; padding: 32px 20px; }
.ai-icon { font-size: 48px; margin-bottom: 12px; }
.ai-welcome-text { font-size: 13px; color: var(--color-text-muted); line-height: 1.6; }

/* Messages */
.message { display: flex; }
.message.user { justify-content: flex-end; }
.message.ai { justify-content: flex-start; }

.msg-bubble {
  max-width: 85%;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
}

.message.user .msg-bubble {
  background: var(--color-primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.message.ai .msg-bubble {
  background: var(--color-surface-2);
  color: var(--color-text-primary);
  border-bottom-left-radius: 4px;
  border: 1px solid var(--color-border);
}

.msg-sources {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border);
  font-size: 11px;
}
.source-label { color: var(--color-text-muted); }
.source-link { color: var(--color-primary); text-decoration: underline; }

.msg-content { font-size: 13px; }
:deep(.msg-content p) { margin: 4px 0; }
:deep(.msg-content pre) { background: #f1f5f9; padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
:deep(.msg-content code) { background: rgba(0,0,0,.06); padding: 1px 4px; border-radius: 3px; font-size: 12px; }

.typing-cursor {
  display: inline-block;
  animation: blink 0.7s infinite;
  color: var(--color-primary);
  font-weight: 700;
}
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

/* Footer */
.panel-footer {
  padding: 12px 16px; border-top: 1px solid var(--color-border);
  flex-shrink: 0; display: flex; flex-direction: column; gap: 8px;
}

.context-toggle { font-size: 12px; }

.input-row { display: flex; gap: 8px; align-items: flex-end; }

.input-row :deep(.el-textarea) { flex: 1; }

.send-btn {
  width: 44px; height: 64px; flex-shrink: 0;
  padding: 0;
}

.input-hint { font-size: 11px; color: var(--color-text-muted); }

.panel-enter-active, .panel-leave-active { transition: opacity 0.25s ease; }
.panel-enter-active .ai-panel, .panel-leave-active .ai-panel { transition: transform 0.28s cubic-bezier(.4,0,.2,1); }
.panel-enter-from, .panel-leave-to { opacity: 0; }
.panel-enter-from .ai-panel, .panel-leave-to .ai-panel { transform: translateX(100%); }
</style>
