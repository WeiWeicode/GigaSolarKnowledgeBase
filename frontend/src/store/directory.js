// src/store/directory.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { directoryService } from '@/services/api.js'

export const useDirectoryStore = defineStore('directory', () => {
  const tree = ref([])
  const loading = ref(false)
  const searchHighlightIds = ref([])
  const viewScope = ref('dept') // 'public' | 'dept'
  const currentCompany = ref(null)
  const currentDept = ref(null)

  const filteredTree = computed(() => {
    if (viewScope.value === 'public') {
      return filterPublic(tree.value)
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

  function setSearchHighlight(ids) {
    searchHighlightIds.value = ids
  }

  return { tree, loading, searchHighlightIds, viewScope, currentCompany, currentDept, filteredTree, fetchTree, setSearchHighlight }
})
