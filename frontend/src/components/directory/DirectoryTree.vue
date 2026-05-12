<template>
  <div class="dir-tree-container">
    <div class="tree-header">
      <span class="tree-title">目錄</span>
      <div>
        <el-button text circle size="small" class="action-btn" title="重新整理" @click="refreshTree">
          <el-icon>
            <RefreshRight />
          </el-icon>
        </el-button>
        <el-button v-if="auth.isManager" text circle size="small" class="action-btn" title="新增最上層目錄"
          @click="startAddDirectory(null)">
          <el-icon>
            <Plus />
          </el-icon>
        </el-button>
      </div>
    </div>

    <div v-if="loading" class="tree-loading">
      <el-skeleton :rows="5" animated />
    </div>

    <el-tree v-else :data="dirStore.filteredTree" :props="treeProps" node-key="id" default-expand-all highlight-current draggable
      :allow-drop="allowDrop" class="kb-tree" @node-click="onNodeClick">
      <template #default="{ node, data }">
        <span class="tree-node" :class="['type-' + data.type, { highlighted: highlightedIds.includes(data.id) }]">
          <!-- Node icon and label with tooltip -->
          <el-icon class="node-icon">
            <component :is="nodeIcon(data)" />
          </el-icon>
          <el-tooltip :content="data.label" placement="top-start" :show-after="400">
            <span class="node-label" :class="{ 'no-access-text': data.hasAccess === false }">{{ data.label }}</span>
          </el-tooltip>
          <span v-if="data.hasAccess === false" class="no-access-icon" title="無存取權限">
            <el-icon color="#f56c6c"><Hide /></el-icon>
          </span>
          <!-- Hover actions for managers -->
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
                    <span style="color: var(--el-color-danger); display: flex; align-items: center; gap: 4px;">
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

    <!-- Add directory dialog -->
    <el-dialog v-model="showAddDialog" title="新增目錄" width="360px" :append-to-body="true">
      <el-input v-model="newDirName" placeholder="請輸入目錄名稱" maxlength="30" show-word-limit />
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="addDirectory">確認</el-button>
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

const tree = computed(() => dirStore.tree)
const loading = computed(() => dirStore.loading)
const highlightedIds = computed(() => dirStore.searchHighlightIds)

const showAddDialog = ref(false)
const newDirName = ref('')
const targetParentNode = ref(null)

const treeProps = { label: 'label', children: 'children' }

function nodeIcon(data) {
  const map = {
    company: 'OfficeBuilding',
    department: 'Briefcase',
    directory: 'Folder',
    article: 'Document',
    attachment: 'Paperclip',
    trash: 'Delete',
  }
  return map[data.type] || 'Folder'
}

function allowDrop(dragging, drop, type) {
  // Cannot drag into article/attachment/company
  if (['article', 'attachment', 'company'].includes(drop.data.type)) return false
  if (drop.data.type === 'trash') return false
  return true
}

function onNodeClick(data) {
  if (data.hasAccess === false) {
    ElMessage.warning('目前無存取該文件的權限')
    return
  }
  if (data.type === 'article') router.push(`/article/${data.articleId}`)
  if (data.type === 'attachment') router.push(`/attachment/${data.attachmentId}`)
}

function refreshTree() {
  const companyId = dirStore.currentCompany || auth.user?.組織OID
  const deptCode = dirStore.currentDept || auth.user?.部門代碼
  if (companyId && deptCode) {
    dirStore.fetchTree(companyId, deptCode)
  }
}

function startRename(data) {
  ElMessageBox.prompt('請輸入新的目錄名稱', '重新命名目錄', {
    confirmButtonText: '確認',
    cancelButtonText: '取消',
    inputValue: data.label,
    inputValidator: (val) => val && val.trim() ? true : '目錄名稱不能為空',
  }).then(({ value }) => {
    if (value && value.trim()) {
      data.label = value.trim()
      ElMessage.success('重新命名成功')
    }
  }).catch(() => {})
}

function startAddDirectory(parentData) {
  targetParentNode.value = parentData
  newDirName.value = ''
  showAddDialog.value = true
}

async function addDirectory() {
  if (!newDirName.value.trim()) return
  const parentId = targetParentNode.value ? targetParentNode.value.id : null
  await directoryService.createNode(parentId, newDirName.value.trim())
  showAddDialog.value = false
  newDirName.value = ''
  targetParentNode.value = null
  refreshTree()
}

function removeDirectory(node, data) {
  if (data.children && data.children.length > 0) {
    ElMessage.warning('目錄內還有檔案或子目錄，無法直接移除！')
    return
  }
  ElMessageBox.confirm(`確定要移除空目錄「${data.label}」嗎？`, '移除確認', {
    type: 'warning',
    confirmButtonText: '確定移除',
    cancelButtonText: '取消'
  }).then(() => {
    // Mock remove action
    ElMessage.success('已移除目錄')
    refreshTree()
  }).catch(() => { })
}
</script>

<style scoped>
.dir-tree-container {
  padding: 12px 8px;
}

.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 10px;
}

.tree-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.action-btn {
  color: var(--color-text-muted) !important;
}

.action-btn:hover {
  color: var(--color-primary) !important;
}

.tree-loading {
  padding: 8px;
}

/* Element Plus Tree overrides */
:deep(.el-tree) {
  background: transparent;
  font-size: 13px;
}

:deep(.el-tree-node__content) {
  height: 32px;
  border-radius: 6px;
  transition: background var(--transition);
}

:deep(.el-tree-node__content:hover) {
  background: var(--color-surface-2);
}

:deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 600;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  position: relative;
}

.node-icon {
  flex-shrink: 0;
  font-size: 14px;
}

.node-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.highlighted .node-label {
  color: var(--color-primary);
  font-weight: 600;
}

.type-company .node-icon {
  color: var(--color-primary);
}

.type-department .node-icon {
  color: var(--color-info);
}

.type-directory .node-icon {
  color: var(--color-warning);
}

.type-article .node-icon {
  color: var(--color-text-secondary);
}

.type-attachment .node-icon {
  color: var(--color-success);
}

.type-trash .node-icon {
  color: var(--color-text-muted);
}

.type-trash {
  opacity: 0.6;
}

.node-actions {
  opacity: 0;
  transition: opacity var(--transition);
}

.tree-node:hover .node-actions {
  opacity: 1;
}

.no-access-text {
  color: var(--color-text-muted);
}
.no-access-icon {
  margin-left: 4px;
  display: flex;
  align-items: center;
  font-size: 14px;
}
</style>
