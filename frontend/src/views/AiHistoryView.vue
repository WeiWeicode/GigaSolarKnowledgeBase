<template>
  <div class="ai-history-page">
    <div class="page-header">
      <span class="page-title">
        <el-icon><Clock /></el-icon> AI 歷史訊息
      </span>
      <el-tag size="small" type="info" effect="light">{{ total }} 筆對話</el-tag>
    </div>

    <div class="page-body">
      <!-- 左：對話清單 -->
      <aside class="history-list">
        <div class="list-toolbar">
          <el-input
            v-model="keyword"
            size="small"
            placeholder="搜尋標題或對話內容"
            clearable
            @keyup.enter="reload"
            @clear="reload"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-radio-group v-model="filterMode" size="small" @change="reload">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="pinned">釘選</el-radio-button>
            <el-radio-button value="favorite">最愛</el-radio-button>
          </el-radio-group>
        </div>

        <div v-loading="listLoading" class="list-scroll">
          <p v-if="!listLoading && sessions.length === 0" class="list-empty">
            {{ keyword ? '找不到符合的對話' : '尚無對話紀錄' }}
          </p>

          <button
            v-for="s in sessions"
            :key="s.id"
            class="session-card"
            :class="{ active: s.id === currentId }"
            @click="openSession(s.id)"
          >
            <div class="card-head">
              <span class="card-title">{{ s.displayTitle }}</span>
              <span class="card-flags">
                <el-icon v-if="s.isPinned" class="flag pinned"><Top /></el-icon>
                <el-icon v-if="s.isFavorite" class="flag fav"><StarFilled /></el-icon>
              </span>
            </div>
            <div class="card-meta">
              <span>{{ formatTime(s.lastMessageAt || s.createdAt) }}</span>
              <span>{{ s.messageCount }} 則</span>
            </div>
            <div class="card-actions" @click.stop>
              <el-tooltip content="釘選" placement="top">
                <el-button text size="small" :type="s.isPinned ? 'primary' : ''" @click="togglePin(s)">
                  <el-icon><Top /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="加入最愛" placement="top">
                <el-button text size="small" :type="s.isFavorite ? 'warning' : ''" @click="toggleFavorite(s)">
                  <el-icon><Star /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="自訂標題" placement="top">
                <el-button text size="small" @click="renameSession(s)">
                  <el-icon><EditPen /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="刪除" placement="top">
                <el-button text size="small" type="danger" @click="removeSession(s)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </button>
        </div>

        <el-pagination
          v-if="total > pageSize"
          class="list-pager"
          layout="prev, pager, next"
          small
          background
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          @current-change="onPageChange"
        />
      </aside>

      <!-- 右：對話內容（唯讀） -->
      <section v-loading="detailLoading" class="history-detail">
        <div v-if="!detail" class="detail-empty">
          <div class="empty-icon">💬</div>
          <p>從左側選擇一段對話檢視內容</p>
        </div>

        <template v-else>
          <div class="detail-head">
            <h2 class="detail-title">{{ detail.displayTitle }}</h2>
            <div class="detail-meta">
              <span>{{ formatTime(detail.createdAt) }}</span>
              <span v-if="detail.searchType">檢索模式：{{ detail.searchType }}</span>
            </div>
          </div>

          <div class="detail-messages">
            <div v-for="m in detail.messages" :key="m.id" class="message" :class="m.role">
              <div class="msg-bubble">
                <div v-if="m.role === 'user'" class="msg-content">{{ m.content }}</div>
                <div v-else class="msg-content markdown-body" v-html="renderMarkdown(m.content)" />

                <div v-if="m.sources && m.sources.length" class="msg-sources">
                  <span class="sources-label">參考來源</span>
                  <el-tag
                    v-for="(src, i) in m.sources"
                    :key="i"
                    size="small"
                    type="info"
                    effect="plain"
                  >
                    {{ src.filename || '（未命名檔案）' }}
                  </el-tag>
                </div>

                <div v-if="m.role === 'ai' && m.elapsedMs" class="msg-elapsed">
                  耗時 {{ (m.elapsedMs / 1000).toFixed(1) }} 秒
                </div>
              </div>
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup>
// AI 歷史訊息頁（見 docs/DevelopmentProcess/AI_CHAT_HISTORY_PLAN.md 6.2）
// 唯讀檢視 + 釘選／最愛／自訂標題／刪除（軟刪除）。
// 第一期不做「繼續此對話」與回收桶還原。
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { marked } from 'marked'
import { aiChatHistoryService } from '@/services/api.js'
import { useAiChatStore } from '@/store/aiChat.js'

const aiChat = useAiChatStore()

const sessions      = ref([])
const total         = ref(0)
const page          = ref(1)
const pageSize      = ref(20)
const keyword       = ref('')
const filterMode    = ref('all')
const listLoading   = ref(false)

const detail        = ref(null)
const currentId     = ref(null)
const detailLoading = ref(false)

// 存進 DB 的 content 在落地前已由 useAiChat.updateHtml() 去除 <think> 標籤，
// 這裡只需要單純轉 Markdown，不必複製那段容錯邏輯
function renderMarkdown(content) {
  try { return marked.parse(content || '') }
  catch { return content || '' }
}

function formatTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-TW', { hour12: false })
}

async function fetchSessions() {
  listLoading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (keyword.value.trim()) params.keyword = keyword.value.trim()
    if (filterMode.value === 'pinned')   params.isPinned   = true
    if (filterMode.value === 'favorite') params.isFavorite = true

    const res = await aiChatHistoryService.getSessions(params)
    sessions.value = res.items || []
    total.value    = res.total || 0
  } catch (err) {
    ElMessage.error(err.message || '取得 AI 歷史對話失敗')
  } finally {
    listLoading.value = false
  }
}

function reload() {
  page.value = 1
  fetchSessions()
}

function onPageChange(next) {
  page.value = next
  fetchSessions()
}

async function openSession(id) {
  currentId.value = id
  detailLoading.value = true
  try {
    detail.value = await aiChatHistoryService.getSessionDetail(id)
  } catch (err) {
    detail.value = null
    ElMessage.error(err.message || '取得對話內容失敗')
  } finally {
    detailLoading.value = false
  }
}

/**
 * 樂觀更新：先改畫面再送 API，失敗才回復。
 * 釘選／最愛是高頻的一鍵操作，等待往返會讓按鈕感覺遲鈍。
 */
async function patchSession(session, patch, revert) {
  try {
    await aiChatHistoryService.updateSession(session.id, patch)
  } catch (err) {
    revert()
    ElMessage.error(err.message || '更新失敗')
  }
}

function togglePin(session) {
  const before = session.isPinned
  session.isPinned = !before
  patchSession(session, { isPinned: session.isPinned }, () => { session.isPinned = before })
    .then(() => { if (session.isPinned !== before) fetchSessions() })
}

function toggleFavorite(session) {
  const before = session.isFavorite
  session.isFavorite = !before
  patchSession(session, { isFavorite: session.isFavorite }, () => { session.isFavorite = before })
}

async function renameSession(session) {
  try {
    const { value } = await ElMessageBox.prompt('自訂標題（清空則回復系統自動標題）', '重新命名對話', {
      confirmButtonText: '儲存',
      cancelButtonText:  '取消',
      inputValue:        session.customTitle || '',
      inputValidator: (val) => (val || '').length <= 200 || '標題不可超過 200 字',
    })
    const updated = await aiChatHistoryService.updateSession(session.id, { customTitle: value ?? '' })
    session.customTitle  = updated.customTitle
    session.displayTitle = updated.displayTitle
    if (detail.value?.id === session.id) detail.value.displayTitle = updated.displayTitle
    ElMessage.success('已更新標題')
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(err.message || '更新標題失敗')
  }
}

async function removeSession(session) {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${session.displayTitle}」嗎？刪除後不會顯示在列表中。`,
      '刪除對話',
      { type: 'warning', confirmButtonText: '刪除', cancelButtonText: '取消' },
    )
    await aiChatHistoryService.deleteSession(session.id)
    if (currentId.value === session.id) {
      currentId.value = null
      detail.value    = null
    }
    // 刪掉的正好是 /ai-chat 仍在進行中的那段對話：一併把問答頁重置為新對話，
    // 否則回到 AI 問答會看到一段已被刪除的對話，繼續問也接不回任何歷史串
    if (aiChat.currentSessionId === session.id) {
      aiChat.startNewConversation()
    }
    ElMessage.success('已刪除')
    fetchSessions()
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(err.message || '刪除失敗')
  }
}

onMounted(fetchSessions)
</script>

<style scoped>
.ai-history-page {
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
  flex: 1; display: flex; min-height: 0;
}

/* ── 左側清單 ───────────────────────────────── */
.history-list {
  width: 320px; flex-shrink: 0;
  display: flex; flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: #fff;
}
.list-toolbar {
  padding: 12px; display: flex; flex-direction: column; gap: 8px;
  border-bottom: 1px solid var(--color-border);
}
.list-scroll { flex: 1; overflow-y: auto; padding: 8px; }
.list-empty { text-align: center; color: #9ca3af; font-size: 13px; padding: 32px 0; }
.list-pager { padding: 8px; justify-content: center; border-top: 1px solid var(--color-border); }

.session-card {
  width: 100%; text-align: left; cursor: pointer;
  border: 1px solid transparent; border-radius: var(--border-radius-sm);
  background: transparent; padding: 10px; margin-bottom: 4px;
  transition: all var(--transition);
}
.session-card:hover { background: #f9fafb; border-color: var(--color-border); }
.session-card.active { background: #f5f3ff; border-color: #7c3aed; }

.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; }
.card-title {
  font-size: 13px; font-weight: 600; color: #1f2937; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden;
}
.card-flags { display: flex; gap: 2px; flex-shrink: 0; }
.flag { font-size: 13px; }
.flag.pinned { color: #7c3aed; }
.flag.fav    { color: #f59e0b; }

.card-meta {
  display: flex; gap: 10px; margin-top: 4px;
  font-size: 11px; color: #9ca3af;
}
.card-actions {
  display: flex; gap: 0; margin-top: 4px;
  opacity: 0; transition: opacity var(--transition);
}
.session-card:hover .card-actions,
.session-card.active .card-actions { opacity: 1; }

/* ── 右側詳情 ───────────────────────────────── */
.history-detail { flex: 1; overflow-y: auto; padding: 20px 24px; min-width: 0; }
.detail-empty {
  height: 100%; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px; color: #9ca3af;
}
.empty-icon { font-size: 40px; }

.detail-head { padding-bottom: 12px; border-bottom: 1px solid var(--color-border); margin-bottom: 16px; }
.detail-title { font-size: 17px; font-weight: 700; color: #1f2937; margin: 0; }
.detail-meta { display: flex; gap: 16px; margin-top: 6px; font-size: 12px; color: #9ca3af; }

.detail-messages { display: flex; flex-direction: column; gap: 12px; }
.message { display: flex; }
.message.user { justify-content: flex-end; }
.message.ai   { justify-content: flex-start; }

.msg-bubble {
  max-width: 85%; padding: 12px 16px;
  border-radius: var(--border-radius-sm);
  font-size: 14px; line-height: 1.7;
  box-sizing: border-box;
  overflow-wrap: break-word;
  word-break: break-word;
}
.message.user .msg-bubble { background: #7c3aed; color: #fff; border-bottom-right-radius: 2px; }
.message.ai   .msg-bubble {
  background: #f9fafb; border: 1px solid var(--color-border); color: #1f2937;
  border-bottom-left-radius: 2px; width: 100%; max-width: 800px;
}
.msg-content { white-space: pre-wrap; word-break: break-word; }
.msg-content.markdown-body { white-space: normal; }

:deep(.markdown-body) { font-size: 14px; line-height: 1.7; word-break: break-word; overflow-wrap: break-word; }
:deep(.markdown-body p) { margin: 6px 0; }
:deep(.markdown-body h1) { font-size: 16px; font-weight: 700; margin: 14px 0 6px; border-bottom: 1px solid var(--color-border); padding-bottom: 4px; }
:deep(.markdown-body h2) { font-size: 15px; font-weight: 700; margin: 12px 0 5px; }
:deep(.markdown-body h3) { font-size: 14px; font-weight: 600; margin: 10px 0 4px; }
:deep(.markdown-body h4) { font-size: 13px; font-weight: 600; margin: 8px 0 4px; }
:deep(.markdown-body ul), :deep(.markdown-body ol) { padding-left: 20px; margin: 6px 0; }
:deep(.markdown-body li) { margin: 3px 0; }
:deep(.markdown-body li p) { margin: 2px 0; }
:deep(.markdown-body strong) { font-weight: 700; color: #1f2937; }
:deep(.markdown-body em) { font-style: italic; }
:deep(.markdown-body blockquote) {
  margin: 8px 0; padding: 6px 12px; border-left: 3px solid #7c3aed;
  background: rgba(124,58,237,.06); border-radius: 0 6px 6px 0; color: #4b5563;
}
:deep(.markdown-body code) { background: rgba(0,0,0,.07); padding: 1px 5px; border-radius: 3px; font-size: 13px; font-family: monospace; }
:deep(.markdown-body pre) { background: #f1f5f9; padding: 10px 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0; max-width: 100%; }
:deep(.markdown-body pre code) { background: none; padding: 0; font-size: 13px; line-height: 1.5; }
:deep(.markdown-body hr) { border: none; border-top: 1px solid var(--color-border); margin: 12px 0; }
:deep(.markdown-body table) { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; display: block; overflow-x: auto; }
:deep(.markdown-body th), :deep(.markdown-body td) { border: 1px solid var(--color-border); padding: 5px 10px; text-align: left; }
:deep(.markdown-body th) { background: #f3f4f6; font-weight: 600; }

.msg-sources {
  display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
  margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--color-border);
}
.sources-label { font-size: 11px; color: #9ca3af; margin-right: 4px; }
.msg-elapsed { margin-top: 6px; font-size: 11px; color: #9ca3af; }
</style>
