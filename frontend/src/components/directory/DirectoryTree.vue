<template>
  <div class="dir-tree-container">
    <div class="tree-header">
      <span class="tree-title">目錄</span>
      <div>
        <el-button text circle size="small" class="action-btn" title="重新整理" @click="refreshTree">
          <el-icon><RefreshRight /></el-icon>
        </el-button>
        <el-button
          v-if="auth.isManager"
          text circle size="small" class="action-btn" title="新增最上層目錄"
          @click="startAddDirectory(null)"
        >
          <el-icon><Plus /></el-icon>
        </el-button>
      </div>
    </div>

    <div v-if="loading" class="tree-loading">
      <el-skeleton :rows="5" animated />
    </div>

    <el-tree
      v-else
      :data="dirStore.filteredTree"
      :props="treeProps"
      node-key="id"
      default-expand-all
      highlight-current
      draggable
      :allow-drag="allowDrag"
      :allow-drop="allowDrop"
      class="kb-tree"
      @node-click="onNodeClick"
      @node-drop="onNodeDrop"
    >
      <template #default="{ node, data }">
        <span class="tree-node" :class="['type-' + data.type, { highlighted: highlightedIds.includes(data.id) }]">
          <el-icon class="node-icon"><component :is="nodeIcon(data)" /></el-icon>
          <el-tooltip :content="data.label" placement="top-start" :show-after="400">
            <span
              class="node-label"
              :class="{ 'no-access-text': (data.type === 'article' || data.type === 'attachment') && !checkItemAccess(data) }"
            >{{ data.label }}</span>
          </el-tooltip>
          <span
            v-if="(data.type === 'article' || data.type === 'attachment') && !checkItemAccess(data)"
            class="no-access-icon" title="無存取權限"
          >
            <el-icon color="#f56c6c"><Hide /></el-icon>
          </span>

          <!-- sortOrder badge（僅 MANAGER/ADMIN 可看，debug 用） -->
          <!-- <span v-if="auth.isManager && data.type === 'directory'" class="sort-badge">{{ data.sortOrder }}</span> -->

          <span v-if="auth.isManager && data.type === 'directory'" class="node-actions" @click.stop>
            <el-dropdown trigger="click" placement="bottom-end">
              <el-button text circle size="small" class="more-btn">
                <el-icon size="12"><More /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="startAddDirectory(data)">
                    <el-icon><Plus /></el-icon> 新增子目錄
                  </el-dropdown-item>
                  <el-dropdown-item @click="startRename(data)">
                    <el-icon><Edit /></el-icon> 重新命名
                  </el-dropdown-item>
                  <el-dropdown-item divided @click="removeDirectory(node, data)">
                    <span style="color:var(--el-color-danger);display:flex;align-items:center;gap:4px;">
                      <el-icon><Delete /></el-icon> 移除目錄
                    </span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </span>
        </span>
      </template>
    </el-tree>

    <!-- 新增目錄 Dialog -->
    <el-dialog v-model="showAddDialog" title="新增目錄" width="360px" :append-to-body="true">
      <div class="add-dir-hint" v-if="targetParentLabel">
        新增位置：<el-tag size="small">{{ targetParentLabel }}</el-tag>
      </div>
      <el-input
        v-model="newDirName"
        placeholder="請輸入目錄名稱"
        maxlength="30"
        show-word-limit
        autofocus
        @keydown.enter="addDirectory"
      />
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="adding" @click="addDirectory">確認新增</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useDirectoryStore } from '@/store/directory.js'
import { useAuthStore } from '@/store/auth.js'
import { directoryService } from '@/services/api.js'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

const dirStore = useDirectoryStore()
const auth = useAuthStore()
const router = useRouter()

const loading = computed(() => dirStore.loading)
const highlightedIds = computed(() => dirStore.searchHighlightIds)

const showAddDialog = ref(false)
const newDirName = ref('')
const adding = ref(false)
const targetParentNode = ref(null)
const targetParentLabel = computed(() => targetParentNode.value?.label ?? '')

const treeProps = { label: 'label', children: 'children' }

// ─── 工具：在原始 tree.value 中找節點（非 filteredTree 拷貝）──────
function findNodeById(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) { const f = findNodeById(node.children, id); if (f) return f }
  }
  return null
}

function findDeptNode(nodes, deptCode) {
  for (const node of nodes) {
    if (node.type === 'department' && node.dept_code === deptCode) return node
    if (node.children) { const f = findDeptNode(node.children, deptCode); if (f) return f }
  }
  return null
}

// ─── Icon ──────────────────────────────────────────────────
function nodeIcon(data) {
  return { company: 'OfficeBuilding', department: 'Briefcase', directory: 'Folder', article: 'Document', attachment: 'Paperclip', trash: 'Delete' }[data.type] || 'Folder'
}

// ─── 拖曳控制 ──────────────────────────────────────────────
/** 只有 directory 類型的節點可以拖曳 */
function allowDrag(node) {
  return node.data.type === 'directory'
}

/**
 * 拖曳放置規則：
 * - 只能放入 directory 或 department 節點內（inner）
 * - 只能放在 directory 節點的 before / after
 * - 不能放入 trash、article、attachment、company
 */
function allowDrop(draggingNode, dropNode, type) {
  const dropType = dropNode.data.type
  if (['article', 'attachment', 'company', 'trash'].includes(dropType)) return false
  if (type === 'inner') return ['directory', 'department'].includes(dropType)
  // before / after：只允許同層 directory 之間重排
  return dropType === 'directory'
}

/**
 * 拖曳完成事件
 * el-tree 已在前端視覺上移動節點，這裡同步更新 mockDirectoryTree，
 * 再 refreshTree() 讓 filteredTree 從更新後的來源重新計算。
 */
async function onNodeDrop(draggingNode, dropNode, dropType) {
  const draggingId = draggingNode.data.id
  const dropId     = dropNode.data.id

  // 避免拖到垃圾桶旁
  if (dropType !== 'inner' && dropNode.data.type === 'trash') {
    ElMessage.warning('無法在垃圾桶附近排序')
    refreshTree()
    return
  }

  try {
    await directoryService.moveNode(draggingId, dropId, dropType)
    ElMessage.success('排序已更新')
  } catch (e) {
    ElMessage.error('排序更新失敗：' + (e.message || ''))
  }
  // 重新從更新後的 mockDirectoryTree 渲染
  refreshTree()
}

// ─── 存取權限檢查 ────────────────────────────────────────────
function checkItemAccess(data) {
  if (auth.isAdmin) return true
  const user = auth.user; if (!user) return true

  // 欄位直接從目錄樹節點讀取（後端 Directory model 上有 is_public / access_* 鏡像欄位）
  const isPublic     = data.is_public
  const accessDept   = data.access_dept
  const accessLevel  = data.access_level

  // access_members 後端以 JSON 字串儲存，需解析
  let accessMembers = data.access_members
  if (typeof accessMembers === 'string') {
    try { accessMembers = JSON.parse(accessMembers) } catch { accessMembers = [] }
  }

  if (isPublic) return true

  // 部門權限
  if (accessDept && accessDept !== user.部門代碼) return false

  // 人員權限
  if (Array.isArray(accessMembers) && accessMembers.length > 0) {
    if (!accessMembers.includes(user.員工工號)) return false
  }

  // 職級權限（數字越小職等越高）
  if (accessLevel != null && (user.級職 ?? 99) > accessLevel) return false

  return true
}

// ─── 節點點擊 ────────────────────────────────────────────────
function onNodeClick(data) {
  if ((data.type === 'article' || data.type === 'attachment') && !checkItemAccess(data)) {
    ElMessage.warning('目前無存取該文件的權限'); return
  }
  if (data.type === 'article')    router.push(`/article/${data.article_id}`)
  if (data.type === 'attachment') router.push(`/attachment/${data.attachment_id}`)
}

// ─── 重新整理 ────────────────────────────────────────────────
function refreshTree() {
  const companyId = dirStore.currentCompany || auth.user?.組織OID
  const deptCode  = dirStore.currentDept   || auth.user?.部門代碼
  if (companyId && deptCode) dirStore.fetchTree(companyId, deptCode)
}

// ─── 新增目錄 ────────────────────────────────────────────────
function startAddDirectory(parentData) {
  if (parentData === null) {
    const deptNode = findDeptNode(dirStore.tree, dirStore.currentDept)
    if (!deptNode) { ElMessage.error('找不到部門節點，請先重新整理目錄'); return }
    targetParentNode.value = deptNode
  } else {
    const actual = findNodeById(dirStore.tree, parentData.id)
    if (!actual) { ElMessage.error('找不到目標目錄，請重新整理後再試'); return }
    targetParentNode.value = actual
  }
  newDirName.value = ''
  showAddDialog.value = true
}

async function addDirectory() {
  const name = newDirName.value.trim()
  if (!name) return ElMessage.warning('請輸入目錄名稱')
  const parentId = targetParentNode.value?.id
  if (!parentId) return ElMessage.error('父目錄遺失，請重新操作')

  adding.value = true
  try {
    await directoryService.createNode(parentId, name, dirStore.currentDept)
    showAddDialog.value = false
    newDirName.value = ''
    targetParentNode.value = null
    ElMessage.success('目錄已建立')
    refreshTree()
  } catch (e) {
    ElMessage.error('建立失敗：' + (e.message || '未知錯誤'))
  } finally {
    adding.value = false
  }
}

// ─── 重新命名 ────────────────────────────────────────────────
function startRename(data) {
  ElMessageBox.prompt('請輸入新的目錄名稱', '重新命名目錄', {
    confirmButtonText: '確認', cancelButtonText: '取消',
    inputValue: data.label,
    inputValidator: val => (val && val.trim()) ? true : '目錄名稱不能為空',
  }).then(async ({ value }) => {
    if (!value?.trim()) return
    try {
      await directoryService.renameNode(data.id, value.trim())
      ElMessage.success('重新命名成功')
      refreshTree()
    } catch (e) {
      ElMessage.error('重新命名失敗：' + (e.message || '未知錯誤'))
    }
  }).catch(() => {})
}

// ─── 移除目錄 ────────────────────────────────────────────────
// TODO: 後端需補 DELETE /api/v1/directories/:id 端點，api.js 需補 directoryService.removeNode()
function removeDirectory(node, data) {
  if (data.children?.length) { ElMessage.warning('目錄內還有檔案或子目錄，無法直接移除！'); return }
  ElMessageBox.confirm(`確定要移除空目錄「${data.label}」嗎？`, '移除確認', {
    type: 'warning', confirmButtonText: '確定移除', cancelButtonText: '取消',
  }).then(async () => {
    try {
      await directoryService.removeNode(data.id)
      ElMessage.success('目錄已移除')
      refreshTree()
    } catch (e) {
      ElMessage.error('移除失敗：' + (e.message || '未知錯誤'))
    }
  }).catch(() => {})
}
</script>

<style scoped>
.dir-tree-container { padding: 12px 8px; }

.tree-header {
  display: flex; align-items: center; justify-content: space-between; padding: 0 4px 10px;
}

.tree-title { font-size: 11px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.08em; }

.action-btn { color: var(--color-text-muted) !important; }
.action-btn:hover { color: var(--color-primary) !important; }
.tree-loading { padding: 8px; }

:deep(.el-tree) { background: transparent; font-size: 13px; }
:deep(.el-tree-node__content) { height: 32px; border-radius: 6px; transition: background var(--transition); }
:deep(.el-tree-node__content:hover) { background: var(--color-surface-2); }
:deep(.el-tree-node.is-current > .el-tree-node__content) { background: var(--color-primary-light); color: var(--color-primary); font-weight: 600; }

/* 拖曳時的佔位線樣式 */
:deep(.el-tree__drop-indicator) { background: var(--color-primary); height: 2px; border-radius: 1px; }

.tree-node { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; position: relative; }
.node-icon { flex-shrink: 0; font-size: 14px; }
.node-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.highlighted .node-label { color: var(--color-primary); font-weight: 600; }

.type-company    .node-icon { color: var(--color-primary); }
.type-department .node-icon { color: var(--color-info); }
.type-directory  .node-icon { color: var(--color-warning); }
.type-article    .node-icon { color: var(--color-text-secondary); }
.type-attachment .node-icon { color: var(--color-success); }
.type-trash      .node-icon { color: var(--color-text-muted); }
.type-trash { opacity: 0.6; }

/* 拖曳中的節點樣式 */
.type-directory:has(.more-btn) { cursor: grab; }
:deep(.el-tree-node.is-drop-inner > .el-tree-node__content) { background: var(--color-primary-light) !important; outline: 2px dashed var(--color-primary); outline-offset: -2px; border-radius: 6px; }

.node-actions { opacity: 0; transition: opacity var(--transition); }
.tree-node:hover .node-actions { opacity: 1; }

.no-access-text { color: var(--color-text-muted); }
.no-access-icon { margin-left: 4px; display: flex; align-items: center; font-size: 14px; }

.add-dir-hint { margin-bottom: 12px; font-size: 13px; color: var(--color-text-secondary); }
</style>
