<template>
  <div class="home-view">
    <!-- Search Section -->
    <section class="search-section kb-card">
      <h2 class="search-heading">搜尋知識庫</h2>
      <div class="search-row">
        <div class="search-input-wrap">
          <div style="display: flex; gap: 8px;">
            <el-input
              v-model="keyword"
              placeholder="輸入關鍵字搜尋文章標題或內文..."
              size="large"
              clearable
              prefix-icon="Search"
              class="search-input"
              @input="onSearch"
            />
            <el-button size="large" @click="clearSearch">重置搜尋</el-button>
          </div>
          <div class="tag-filter">
            <span class="filter-label">標籤：</span>
            <el-check-tag
              v-for="tag in tags"
              :key="tag.id"
              :checked="selectedTags.includes(tag.id)"
              class="tag-chip"
              @change="toggleTag(tag.id)"
            >
              {{ tag.name }}
            </el-check-tag>
          </div>
        </div>
        <div class="ai-badge" @click="aiPanelVisible = true">
          <el-icon><MagicStick /></el-icon>
          <span>AI 模式</span>
        </div>
      </div>

      <!-- Search results -->
      <div v-if="hasSearched" class="search-results">
        <div v-if="searchLoading" class="search-loading">
          <el-skeleton :rows="3" animated />
        </div>
        <template v-else>
          <p class="results-count">找到 {{ searchResults.length }} 筆結果</p>
          <div v-for="r in searchResults" :key="r.itemType + '-' + r.id" class="result-item" @click="goToResult(r)">
            <div class="result-title">
              <el-tag size="small" :type="r.itemType === 'article' ? 'primary' : 'success'" class="mr-2" style="margin-right: 8px;">
                {{ r.itemType === 'article' ? '文章' : '附件' }}
              </el-tag>
              {{ r.title }}
            </div>
            <div class="result-meta">
              <el-tag v-for="t in r.tags" :key="t.id" size="small" class="result-tag">{{ t.name }}</el-tag>
              <span class="result-date">更新：{{ formatDateTime(r.updatedAt) }}</span>
            </div>
          </div>
          <el-empty v-if="searchResults.length === 0" description="找不到相關文章" :image-size="80" />
        </template>
      </div>
    </section>

    <!-- Notifications -->
    <div class="notif-grid">
      <!-- Unread -->
      <section class="notif-section">
        <div class="section-header">
          <h3 class="section-heading">
            <span class="dot dot-unread"></span>
            未讀通知
            <el-badge :value="unread.length" class="count-badge" v-if="unread.length" />
          </h3>
        </div>
        <div v-if="unread.length === 0" class="empty-notif">
          <el-empty description="目前沒有未讀通知" :image-size="60" />
        </div>
        <div class="notif-list">
          <div v-for="n in unread" :key="n.id" class="notif-card unread" @click="goArticle(n)">
            <div class="notif-header-row">
              <span class="notif-article">{{ n.articleTitle }}</span>
              <el-tag size="small" type="danger" effect="light">未讀</el-tag>
            </div>
            <p class="notif-preview">{{ n.commentPreview }}</p>
            <div class="notif-footer">
              <span class="notif-author">{{ n.mentionedBy.員工姓名 }} 提及了你</span>
              <span class="notif-time">{{ timeAgo(n.createdAt) }}</span>
            </div>
            <el-button
              size="small" type="danger" plain
              class="mark-read-btn"
              @click.stop="markRead(n.id)"
            >
              已查看
            </el-button>
          </div>
        </div>
      </section>

      <!-- Read -->
      <section class="notif-section">
        <div class="section-header">
          <h3 class="section-heading">
            <span class="dot dot-read"></span>
            已讀通知
            <span class="read-hint">（近 30 天）</span>
          </h3>
        </div>
        <div v-if="read.length === 0" class="empty-notif">
          <el-empty description="沒有已讀通知" :image-size="60" />
        </div>
        <div class="notif-list">
          <div v-for="n in read" :key="n.id" class="notif-card read" @click="goArticle(n)">
            <div class="notif-header-row">
              <span class="notif-article">{{ n.articleTitle }}</span>
              <el-tag size="small" type="info" effect="light">已讀</el-tag>
            </div>
            <p class="notif-preview">{{ n.commentPreview }}</p>
            <div class="notif-footer">
              <span class="notif-author">{{ n.mentionedBy.員工姓名 }} 提及了你</span>
              <span class="notif-time">{{ timeAgo(n.createdAt) }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- AI Chat Panel -->
    <AiChatPanel v-model="aiPanelVisible" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationStore } from '@/store/notification.js'
import { useDirectoryStore } from '@/store/directory.js'
import { useAuthStore } from '@/store/auth.js'
import { articleService, attachmentService, tagService } from '@/services/api.js'
import { timeAgo, formatDateTime } from '@/utils/dateFormat.js'
import AiChatPanel from '@/components/panels/AiChatPanel.vue'
import { ElMessage } from 'element-plus'

const router = useRouter()
const notifStore = useNotificationStore()
const dirStore = useDirectoryStore()
const auth = useAuthStore()

const keyword = ref('')
const selectedTags = ref([])
const tags = ref([])
const searchResults = ref([])
const searchLoading = ref(false)
const hasSearched = ref(false)
const aiPanelVisible = ref(false)

let searchTimer = null
const unread = computed(() => notifStore.unread)
const read = computed(() => notifStore.read)

/**
 * 依當前模式載入對應的標籤列表
 * - public 模式：只載 is_public=true，依熱度排序
 * - dept 模式：預載 departments 包含當前部門的標籤，依自訂順序
 */
async function loadTags() {
  try {
    const scope    = dirStore.viewScope         // 'public' | 'dept'
    const deptCode = dirStore.currentDept || auth.user?.['部門代碼']
    tags.value = await tagService.getAll(scope, scope === 'dept' ? deptCode : undefined)
  } catch {
    // 標籤載入失敗不影響主要功能，靜默失敗
  }
}

// scope 或部門切換時重新載入標籤，带清除已勾選項目
watch(
  [() => dirStore.viewScope, () => dirStore.currentDept],
  () => {
    selectedTags.value = []
    loadTags()
  }
)

function toggleTag(id) {
  const idx = selectedTags.value.indexOf(id)
  const isSelecting = idx < 0
  if (isSelecting) {
    selectedTags.value.push(id)
    // 公開模式下點選 tag 累加熱度（fire-and-forget，不阻塞 UI）
    if (dirStore.viewScope === 'public') {
      tagService.incrementClick(id).catch(() => {})
    }
  } else {
    selectedTags.value.splice(idx, 1)
  }
  onSearch()
}

function onSearch() {
  clearTimeout(searchTimer)
  if (!keyword.value.trim() && selectedTags.value.length === 0) {
    hasSearched.value = false
    searchResults.value = []
    return
  }
  hasSearched.value = true
  searchLoading.value = true
  searchTimer = setTimeout(async () => {
    try {
      const scope = dirStore.viewScope
      const deptCode = dirStore.currentDept || auth.user?.['部門代碼']
      
      const [articles, attachments] = await Promise.all([
        articleService.search(keyword.value, selectedTags.value, scope, deptCode),
        attachmentService.search(keyword.value, selectedTags.value, scope, deptCode)
      ])
      
      // BUG-025: 記錄搜尋時使用的部門代碼，供 goToResult 切換部門使用
      const searchDeptCode = scope === 'dept' ? deptCode : null
      const allResults = [
        ...articles.map(a => ({ ...a, itemType: 'article', searchDeptCode })),
        ...attachments.map(a => ({ ...a, itemType: 'attachment', searchDeptCode }))
      ]
      
      // 依更新時間排序
      allResults.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      
      searchResults.value = allResults
    } catch (e) {
      searchResults.value = []
      ElMessage.error('搜尋失敗，請稍後再試')
    } finally {
      searchLoading.value = false
    }
  }, 300)
}

function clearSearch() {
  clearTimeout(searchTimer)
  keyword.value = ''
  selectedTags.value = []
  hasSearched.value = false
  searchResults.value = []
}

// BUG-025: 若搜尋結果屬於不同部門，先切換目錄樹再導航
// 確保文章頁的 getDirLabel 能正確解析 directoryIds（getTree 只含當前部門節點）
async function goToResult(r) {
  if (r.searchDeptCode && r.searchDeptCode !== dirStore.currentDept) {
    await dirStore.fetchTree(dirStore.currentCompany, r.searchDeptCode)
  }
  if (r.itemType === 'attachment') {
    router.push(`/attachment/${r.id}`)
  } else {
    router.push(`/article/${r.id}`)
  }
}

function goArticle(n) {
  router.push(`/article/${n.articleId}`)
}

async function markRead(id) {
  await notifStore.markAsRead(id)
}

onMounted(async () => {
  await loadTags()
  try {
    await notifStore.fetchAll()
  } catch {
    // 通知載入失敗不影響頁面，靜默失敗
  }
})
</script>

<style scoped>
.home-view {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Search */
.search-section {
  padding: 28px 32px;
}

.search-heading {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 20px;
}

.search-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.search-input-wrap {
  flex: 1;
}

.search-input { width: 100%; }

.tag-filter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.filter-label {
  font-size: 12px;
  color: var(--color-text-muted);
}

.tag-chip {
  cursor: pointer;
  font-size: 12px;
  border-radius: 20px;
}

.ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #7c3aed, #a855f7);
  color: #fff;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform .15s, box-shadow .15s;
  box-shadow: 0 2px 8px rgba(124, 58, 237, .3);
}
.ai-badge:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(124, 58, 237, .4);
}

/* Search results */
.search-results {
  margin-top: 20px;
  border-top: 1px solid var(--color-border);
  padding-top: 16px;
}
.results-count {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 12px;
}
.result-item {
  padding: 12px 16px;
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  transition: background var(--transition);
  margin-bottom: 4px;
}
.result-item:hover { background: var(--color-surface-2); }
.result-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 6px;
}
.result-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.result-date { font-size: 11px; color: var(--color-text-muted); }

/* Notifications */
.notif-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 768px) {
  .notif-grid { grid-template-columns: 1fr; }
}

.section-header { margin-bottom: 14px; }

.section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-unread { background: var(--color-unread-accent); }
.dot-read   { background: var(--color-read-accent); }

.read-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-muted);
}

.count-badge {
  --el-badge-size: 18px;
  --el-badge-font-size: 11px;
}

.notif-list { display: flex; flex-direction: column; gap: 10px; }

.notif-card {
  padding: 14px 16px;
  border-radius: var(--border-radius);
  border: 1px solid;
  cursor: pointer;
  transition: all var(--transition);
  position: relative;
}
.notif-card:hover { transform: translateY(-1px); box-shadow: var(--shadow); }

.notif-card.unread {
  background: var(--color-unread-bg);
  border-color: #fbcfe8;
}
.notif-card.read {
  background: var(--color-read-bg);
  border-color: #bfdbfe;
}

.notif-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.notif-article {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.notif-preview {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notif-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--color-text-muted);
}

.mark-read-btn {
  margin-top: 8px;
  width: 100%;
}

.empty-notif {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: 16px;
}
</style>
