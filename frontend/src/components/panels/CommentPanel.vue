<template>
  <transition name="panel">
    <div v-if="modelValue" class="panel-overlay" @click.self="close">
      <div class="side-panel">
        <div class="panel-header">
          <span class="panel-title">
            <el-icon><ChatDotSquare /></el-icon> 評論
          </span>
          <el-button text circle @click="close"><el-icon><Close /></el-icon></el-button>
        </div>

        <div class="panel-body" ref="bodyRef">
          <div v-if="loading" class="panel-loading"><el-skeleton :rows="4" animated /></div>
          <div v-else>
            <div v-if="comments.length === 0" class="empty-state">
              <el-empty description="目前沒有留言" :image-size="60" />
            </div>
            <div v-else class="comment-list">
              <div v-for="(c, idx) in comments" :key="c.id" class="comment-item">
                <div class="comment-header">
                  <el-avatar :size="28" class="comment-avatar">{{ c.author.員工姓名.charAt(0) }}</el-avatar>
                  <span class="comment-author">{{ c.author.員工姓名 }}</span>
                  <span class="comment-time">{{ timeAgo(c.createdAt) }}</span>
                </div>
                <div class="comment-body-row">
                  <div class="comment-body" v-html="renderComment(c.content)" />

                  <!-- ✅ 只有「有被 @tag 到自己」的留言才顯示已讀按鈕 -->
                  <template v-if="isMentionedMe(c)">
                    <el-button
                      v-if="!isReadByMe(c)"
                      size="small" type="primary" plain
                      class="read-check-btn"
                      :loading="readingId === c.id"
                      @click="markAsRead(idx, c.id)"
                    >
                      已查看
                    </el-button>
                    <span v-else class="read-done-tag">
                      <el-icon><CircleCheck /></el-icon> 已讀
                    </span>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Input area -->
        <div class="panel-footer">
          <!-- @mention dropdown -->
          <div v-if="mentionList.length > 0" class="mention-dropdown">
            <div
              v-for="col in mentionList"
              :key="col.員工工號"
              class="mention-item"
              @mousedown.prevent="insertMention(col)"
            >
              <el-avatar :size="22" class="mention-avatar">{{ col.員工姓名.charAt(0) }}</el-avatar>
              <span class="mention-name">{{ col.員工姓名 }}</span>
              <span class="mention-dept">{{ col.部門名稱 }}</span>
            </div>
          </div>

          <el-input
            ref="inputRef"
            v-model="newComment"
            type="textarea"
            :rows="3"
            placeholder="輸入留言，使用 @ 提及同仁..."
            resize="none"
            @input="onInput"
            @keydown.enter.exact.prevent="submitComment"
          />
          <el-button
            type="primary"
            :loading="submitting"
            :disabled="!newComment.trim()"
            class="submit-btn"
            @click="submitComment"
          >
            送出留言
          </el-button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useAuthStore } from '@/store/auth.js'
import { useNotificationStore } from '@/store/notification.js'
import { commentService, colleagueService } from '@/services/api.js'
import { useDirectoryStore } from '@/store/directory.js'
import { timeAgo } from '@/utils/dateFormat.js'
import { ElMessage } from 'element-plus'

const auth = useAuthStore()
const notifStore = useNotificationStore()

const props = defineProps({
  modelValue: Boolean,
  articleId: { type: Number, default: null },
})
const emit = defineEmits(['update:modelValue'])

const dirStore = useDirectoryStore()

const comments = ref([])
const loading = ref(false)
const submitting = ref(false)
const readingId = ref(null)   // 追蹤哪個留言正在標記中（loading 狀態）
const newComment = ref('')
const inputRef = ref(null)
const bodyRef = ref(null)
const allColleagues = ref([])
const mentionList = ref([])
let mentionStartIndex = -1
const mentionedAccounts = ref([])  // 追蹤本次留言已 @ 的工號

// ─── Helper：這則留言有沒有 @tag 到我 ─────────────────────────
function isMentionedMe(comment) {
  const myId = auth.user?.員工工號
  if (!myId) return false
  // 支援兩種格式：mentions 陣列 或 content 內有 @我的名字
  if (Array.isArray(comment.mentions)) {
    return comment.mentions.includes(myId)
  }
  // fallback：content 內搜尋
  const myName = auth.user?.員工姓名
  return myName ? comment.content.includes('@' + myName) : false
}

// ─── Helper：我有沒有讀過這則留言 ────────────────────────────
function isReadByMe(comment) {
  const myId = auth.user?.員工工號
  if (!myId) return true
  return !!comment.isRead?.[myId]
}

function close() {
  mentionList.value = []
  emit('update:modelValue', false)
}

function renderComment(text) {
  return text.replace(/@(\S+)/g, '<span class="mention">@$1</span>')
}

async function loadComments() {
  if (!props.articleId) return
  loading.value = true
  try {
    comments.value = await commentService.getByArticleId(props.articleId)
  } finally {
    loading.value = false
  }
}

// ─── 標記已讀 ────────────────────────────────────────────────
async function markAsRead(idx, commentId) {
  if (readingId.value === commentId) return
  readingId.value = commentId
  try {
    await commentService.markAsRead(props.articleId, commentId)

    // ✅ 用 splice 替換 item，確保 Vue 偵測到巢狀屬性變更
    const old = comments.value[idx]
    comments.value.splice(idx, 1, {
      ...old,
      isRead: { ...old.isRead, [auth.user.員工工號]: true },
    })

    // 同步更新首頁通知卡片（如果有對應通知）
    const matchingNotif = notifStore.notifications.find(
      n => n.commentId === commentId && n.targetUserId === auth.user.員工工號
    )
    if (matchingNotif && !matchingNotif.isRead) {
      await notifStore.markAsRead(matchingNotif.id)
    }
  } catch {
    ElMessage.error('標記已讀失敗')
  } finally {
    readingId.value = null
  }
}

// ─── @mention autocomplete ────────────────────────────────────
function onInput() {
  const text = newComment.value
  const cursorPos = inputRef.value?.$el?.querySelector('textarea')?.selectionStart ?? text.length
  const textBeforeCursor = text.slice(0, cursorPos)
  const atIdx = textBeforeCursor.lastIndexOf('@')

  if (atIdx === -1) { mentionList.value = []; return }

  const query = textBeforeCursor.slice(atIdx + 1)
  if (/\s/.test(query)) { mentionList.value = []; return }

  mentionStartIndex = atIdx
  const lowerQuery = query.toLowerCase()
  const pool = dirStore.currentDept
    ? allColleagues.value.filter(c => c.部門代碼 === dirStore.currentDept)
    : allColleagues.value

  mentionList.value = pool
    .filter(c => c.員工姓名.toLowerCase().includes(lowerQuery) || c.部門名稱.includes(query))
    .slice(0, 8)
}

function insertMention(colleague) {
  const text = newComment.value
  const cursorPos = inputRef.value?.$el?.querySelector('textarea')?.selectionStart ?? text.length
  const before = text.slice(0, mentionStartIndex)
  const after = text.slice(cursorPos)
  newComment.value = `${before}@${colleague.員工姓名} ${after}`
  mentionList.value = []
  // 記錄被 @ 的工號（去重）
  if (!mentionedAccounts.value.includes(colleague.員工工號)) {
    mentionedAccounts.value.push(colleague.員工工號)
  }
  nextTick(() => {
    const textarea = inputRef.value?.$el?.querySelector('textarea')
    if (textarea) {
      const pos = (before + '@' + colleague.員工姓名 + ' ').length
      textarea.setSelectionRange(pos, pos)
      textarea.focus()
    }
  })
}

// ─── 送出留言 ─────────────────────────────────────────────────
async function submitComment() {
  const text = newComment.value.trim()
  if (!text) return
  mentionList.value = []
  submitting.value = true
  try {
    await commentService.create(props.articleId, text, mentionedAccounts.value)
    newComment.value = ''
    mentionedAccounts.value = []  // 清除 mention 紀錄
    await loadComments()
    ElMessage.success('留言已送出')
    await nextTick()
    if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight
  } finally {
    submitting.value = false
  }
}

watch(() => props.modelValue, async (v) => {
  if (v) {
    allColleagues.value = await colleagueService.getAll()
    await loadComments()
  } else {
    mentionList.value = []
  }
})
</script>

<style scoped>
.panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.3);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.side-panel {
  width: 380px;
  background: var(--color-surface);
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.comment-list { display: flex; flex-direction: column; gap: 16px; }

.comment-item {
  padding: 12px;
  background: var(--color-surface-2);
  border-radius: var(--border-radius-sm);
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.comment-avatar {
  background: var(--color-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.comment-author { font-size: 13px; font-weight: 600; flex: 1; }
.comment-time   { font-size: 11px; color: var(--color-text-muted); }

.comment-body-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.comment-body {
  flex: 1;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

:deep(.mention) {
  color: var(--color-primary);
  font-weight: 600;
}

/* 已查看按鈕 */
.read-check-btn {
  flex-shrink: 0;
  margin-top: 2px;
  white-space: nowrap;
}

/* 已讀標記 */
.read-done-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-success);
  margin-top: 4px;
  white-space: nowrap;
}

/* ─── Footer ─────────────────────────────────────────────── */
.panel-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}

.submit-btn { width: 100%; }

/* ─── @mention dropdown ──────────────────────────────────── */
.mention-dropdown {
  position: absolute;
  bottom: calc(100% - 16px);
  left: 20px;
  right: 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12);
  max-height: 240px;
  overflow-y: auto;
  z-index: 10;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.mention-item:hover { background: var(--color-surface-2); }

.mention-avatar {
  background: var(--color-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.mention-name { font-size: 13px; font-weight: 600; color: var(--color-text-primary); }
.mention-dept { font-size: 11px; color: var(--color-text-muted); margin-left: auto; }

/* ─── Slide-in ───────────────────────────────────────────── */
.panel-enter-active, .panel-leave-active { transition: opacity 0.25s ease; }
.panel-enter-active .side-panel, .panel-leave-active .side-panel {
  transition: transform 0.28s cubic-bezier(.4,0,.2,1);
}
.panel-enter-from, .panel-leave-to { opacity: 0; }
.panel-enter-from .side-panel, .panel-leave-to .side-panel { transform: translateX(100%); }
</style>
