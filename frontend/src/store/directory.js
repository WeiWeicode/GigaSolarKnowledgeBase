// src/store/directory.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { directoryService } from '@/services/api.js'

export const useDirectoryStore = defineStore('directory', () => {
  const tree = ref([])           // 部門模式樹（當前部門）
  const publicTree = ref([])     // 公開模式樹（跨部門，後端已過濾僅公開已發佈）
  const loading = ref(false)
  const searchHighlightIds = ref([])
  const viewScope = ref('dept')  // 'public' | 'dept'
  const currentCompany = ref(null)
  const currentDept = ref(null)

  const filteredTree = computed(() => {
    if (viewScope.value === 'public') {
      // publicTree 由後端保證只含已發佈公開資料，前端再修剪空容器
      return filterPublic(publicTree.value)
    } else {
      return filterDepartment(tree.value, currentDept.value)
    }
  })

  function filterDepartment(nodes, deptCode) {
    if (!deptCode) return nodes
    return nodes.map(node => {
      const newNode = { ...node }
      if (newNode.children) {
        newNode.children = filterDepartment(newNode.children, deptCode)
      }
      return newNode
    }).filter(node => {
      if (node.type === 'department') {
        return node.dept_code === deptCode
      }
      return true
    })
  }

  // 修剪空容器（目錄、部門、公司無子節點時隱藏）
  function filterPublic(nodes) {
    return nodes.map(node => {
      const newNode = { ...node }
      if (newNode.children) {
        newNode.children = filterPublic(newNode.children)
      }
      return newNode
    }).filter(node => {
      if (node.type === 'article' || node.type === 'attachment') {
        return node.is_public === true
      }
      if (['directory', 'department', 'company'].includes(node.type)) {
        return node.children && node.children.length > 0
      }
      return false
    })
  }

  // 載入部門模式目錄樹（含當前部門節點）
  async function fetchTree(組織OID, 部門代碼) {
    loading.value = true
    currentCompany.value = 組織OID
    currentDept.value = 部門代碼
    try {
      tree.value = await directoryService.getTree(組織OID, 部門代碼)
    } finally {
      loading.value = false
    }
  }

  // 載入公開模式目錄樹（跨所有部門，後端僅回傳公開已發佈節點）
  async function fetchPublicTree(組織OID) {
    loading.value = true
    if (組織OID) currentCompany.value = 組織OID
    try {
      publicTree.value = await directoryService.getPublicTree(
        組織OID || currentCompany.value
      )
    } finally {
      loading.value = false
    }
  }

  function setSearchHighlight(ids) {
    searchHighlightIds.value = ids
  }

  return {
    tree,
    publicTree,
    loading,
    searchHighlightIds,
    viewScope,
    currentCompany,
    currentDept,
    filteredTree,
    fetchTree,
    fetchPublicTree,
    setSearchHighlight,
  }
})
