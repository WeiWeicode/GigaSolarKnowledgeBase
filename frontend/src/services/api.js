// src/services/api.js
import axios from 'axios'
import {
  mockCurrentUser, mockDirectoryTree, mockTags, mockColleagues,
  mockArticles, mockAttachments, mockNotifications, mockComments,
  mockVersionHistory, mockAttachmentVersionHistory, mockCompanies, mockDepartments,
} from './mockData.js'

const delay = (ms = 300) => new Promise(r => setTimeout(r, ms))

const http = axios.create({ baseURL: '/api', timeout: 10000, headers: { 'Content-Type': 'application/json' } })
http.interceptors.request.use(config => {
  const token = sessionStorage.getItem('kb_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})


// ============================================================
// 目錄樹共用工具
// ============================================================

/** 在 mockDirectoryTree 中依 id 找節點 */
function findTreeNodeById(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) { const f = findTreeNodeById(node.children, id); if (f) return f }
  }
  return null
}

/**
 * 從樹中抽出指定節點，回傳 { node, siblings } (siblings 為該節點所在的陣列)
 * 用於拖曳移動前先把節點取出
 */
function extractNodeById(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      const [node] = nodes.splice(i, 1)
      return { node, siblings: nodes }
    }
    if (nodes[i].children) {
      const result = extractNodeById(nodes[i].children, id)
      if (result) return result
    }
  }
  return null
}

/**
 * 重新計算同層 directory 節點的 sortOrder（1 起始，trash 跳過不計）
 * 拖曳或新增後呼叫，保持 sortOrder 連續
 */
function recalcSortOrder(siblings) {
  let order = 1
  for (const node of siblings) {
    if (node.type === 'directory') node.sortOrder = order++
  }
}

/**
 * 在父節點的 children 中，找到「垃圾桶之前」的最後一個 directory 位置並插入
 * 確保新目錄永遠在垃圾桶上方
 */
function insertBeforeTrash(children, newNode) {
  const trashIdx = children.findIndex(c => c.type === 'trash')
  if (trashIdx !== -1) {
    children.splice(trashIdx, 0, newNode)
  } else {
    children.push(newNode)
  }
  recalcSortOrder(children)
}


// ============================================================
// Auth Service
// ============================================================
export const authService = {
  async login(employeeId, password) {
    await delay(600)
    const token = 'mock-jwt-token-' + Date.now()
    sessionStorage.setItem('kb_token', token)
    return { token, user: mockCurrentUser }
  },
  async logout() { sessionStorage.removeItem('kb_token') },
  async getCurrentUser() { await delay(200); return mockCurrentUser },
}


// ============================================================
// Directory Service
// ============================================================
export const directoryService = {
  async getTree(組織OID, 部門代碼) {
    await delay(300)
    if (組織OID === 'aae8e849cdd2100486ce62c68f92dc43') {
      return JSON.parse(JSON.stringify(mockDirectoryTree))
    }
    return []
  },

  /**
   * 建立目錄節點
   * ✅ 修正：插入到父節點的垃圾桶之前（而非 push 到末尾），並重算 sortOrder
   */
  async createNode(parentId, label) {
    await delay(300)
    const newNode = { id: 'dir-new-' + Date.now(), type: 'directory', label, sortOrder: 0, children: [] }
    const parent = findTreeNodeById(mockDirectoryTree, parentId)
    if (!parent) return newNode          // 找不到父節點時回傳但不插入（呼叫端會報錯）
    if (!parent.children) parent.children = []
    insertBeforeTrash(parent.children, newNode)  // ✅ 插到垃圾桶前
    return newNode
  },

  /**
   * 移動 / 拖曳排序
   * ✅ 修正：真正在 mockDirectoryTree 中移動節點，重算 sortOrder
   *
   * @param draggingId  被拖曳的節點 id
   * @param dropId      目標節點 id
   * @param dropType    'before' | 'after' | 'inner'
   */
  async moveNode(draggingId, dropId, dropType) {
    await delay(200)

    // 1. 從樹中取出被拖曳的節點
    const extracted = extractNodeById(mockDirectoryTree, draggingId)
    if (!extracted) return { success: false, message: '找不到被拖曳節點' }
    const { node: draggedNode } = extracted

    if (dropType === 'inner') {
      // ── 拖曳至目標節點「內部」（成為其子節點）──────────────────
      const dropNode = findTreeNodeById(mockDirectoryTree, dropId)
      if (!dropNode) return { success: false }
      if (!dropNode.children) dropNode.children = []
      insertBeforeTrash(dropNode.children, draggedNode)

    } else {
      // ── 拖曳至目標節點「前面」或「後面」（成為同層兄弟節點）────
      function insertRelative(nodes) {
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].id === dropId) {
            const insertIdx = dropType === 'before' ? i : i + 1
            nodes.splice(insertIdx, 0, draggedNode)
            recalcSortOrder(nodes)    // 重算這一層的 sortOrder
            return true
          }
          if (nodes[i].children && insertRelative(nodes[i].children)) return true
        }
        return false
      }
      insertRelative(mockDirectoryTree)
    }

    return { success: true }
  },

  async renameNode(id, label) {
    await delay(200)
    const node = findTreeNodeById(mockDirectoryTree, id)
    if (node) node.label = label
    return { id, label }
  },
}


// ============================================================
// Article Service
// ============================================================
export const articleService = {
  async getById(id, versionParam = null) {
    await delay(300)
    let article = mockArticles.find(a => a.id === Number(id))
    if (!article) throw new Error('文章不存在')
    const vh = mockVersionHistory[id]
    const latestVersion = vh?.length ? vh[0].versionNumber : 1
    article = { ...article, versionNumber: article.versionNumber || latestVersion }
    if (versionParam && vh) {
      const tv = vh.find(v => v.versionNumber === Number(versionParam))
      if (tv?.content) { article.content = tv.content; article.versionNumber = tv.versionNumber }
    }
    return article
  },

  async create(data) {
    await delay(500)
    const newArticle = {
      id: Date.now(), ...data,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      versionNumber: 1, hasAccess: { 部門: mockCurrentUser.部門代碼, 人員: [], 職級: 10 },
    }
    mockArticles.push(newArticle)
    if (data.directories?.length) {
      for (const dirId of data.directories) {
        const parent = findTreeNodeById(mockDirectoryTree, dirId)
        if (parent) {
          if (!parent.children) parent.children = []
          if (!parent.children.some(c => c.articleId === newArticle.id))
            parent.children.push({ id: 'art-' + newArticle.id, type: 'article', label: newArticle.title, articleId: newArticle.id, isPublic: newArticle.isPublic })
        }
      }
    }
    data.attachmentIds?.forEach(attId => {
      const att = mockAttachments.find(a => a.id === Number(attId))
      if (att) { if (!att.linkedArticleIds) att.linkedArticleIds = []; if (!att.linkedArticleIds.includes(newArticle.id)) att.linkedArticleIds.push(newArticle.id) }
    })
    return newArticle
  },

  async update(id, data) {
    await delay(400)
    const index = mockArticles.findIndex(a => a.id === Number(id))
    if (!mockVersionHistory[id]) mockVersionHistory[id] = []
    const lastVer = mockVersionHistory[id][0]?.versionNumber || (mockArticles[index]?.versionNumber || 0)
    const newVer = lastVer + 1
    mockVersionHistory[id].unshift({
      versionNumber: newVer, editorId: mockCurrentUser.員工工號, editorName: mockCurrentUser.員工姓名,
      savedAt: new Date().toISOString(), diffSummary: data.changeNote || '（未填寫修改說明）',
    })
    if (index !== -1) mockArticles[index] = { ...mockArticles[index], ...data, updatedAt: new Date().toISOString(), versionNumber: newVer }
    function removeArticleFromTree(nodes, artId) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        if (nodes[i].type === 'article' && nodes[i].articleId === Number(artId)) nodes.splice(i, 1)
        else if (nodes[i].children) removeArticleFromTree(nodes[i].children, artId)
      }
    }
    removeArticleFromTree(mockDirectoryTree, id)
    const ua = mockArticles[index]
    ua?.directories?.forEach(dirId => {
      const parent = findTreeNodeById(mockDirectoryTree, dirId)
      if (parent) {
        if (!parent.children) parent.children = []
        if (!parent.children.some(c => c.type === 'article' && c.articleId === ua.id))
          parent.children.push({ id: 'art-' + ua.id, type: 'article', label: ua.title, articleId: ua.id, isPublic: ua.isPublic })
      }
    })
    const oldAtts = mockArticles[index]?.attachmentIds || [], newAtts = data.attachmentIds || []
    newAtts.forEach(attId => { const a = mockAttachments.find(a => a.id === Number(attId)); if (a) { if (!a.linkedArticleIds) a.linkedArticleIds = []; if (!a.linkedArticleIds.includes(Number(id))) a.linkedArticleIds.push(Number(id)) } })
    oldAtts.filter(aid => !newAtts.includes(aid)).forEach(attId => { const a = mockAttachments.find(a => a.id === Number(attId)); if (a?.linkedArticleIds) a.linkedArticleIds = a.linkedArticleIds.filter(x => x !== Number(id)) })
    return { ...(mockArticles[index] || data), id, updatedAt: new Date().toISOString(), versionNumber: newVer }
  },

  async search(keyword, tags) {
    await delay(350)
    let r = mockArticles.filter(a => a.isPublished)
    if (keyword) { const kw = keyword.toLowerCase(); r = r.filter(a => a.title.toLowerCase().includes(kw) || a.content.toLowerCase().includes(kw)) }
    if (tags?.length) r = r.filter(a => a.tags.some(t => tags.includes(t.id)))
    return r
  },

  async uploadImage(file) { await delay(800); return { url: '/uploads/demo/' + file.name } },
  async getAll() { await delay(200); return mockArticles },
}


// ============================================================
// Attachment Service
// ============================================================
export const attachmentService = {
  async getAll() { await delay(200); return mockAttachments },
  async getById(id) { await delay(300); const a = mockAttachments.find(a => a.id === Number(id)); if (!a) throw new Error('附件不存在'); return a },

  async create(data) {
    await delay(500)
    const newAtt = { id: Date.now(), ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), versionNumber: 1, hasAccess: { 部門: mockCurrentUser.部門代碼, 人員: [], 職級: 20 } }
    // 建立時所有檔案均為 v1
    if (newAtt.files?.length) {
      newAtt.files = newAtt.files.map(f => ({ ...f, versionNumber: 1 }))
    }
    mockAttachments.push(newAtt)
    data.directories?.forEach(dirId => {
      const parent = findTreeNodeById(mockDirectoryTree, dirId)
      if (parent) { if (!parent.children) parent.children = []; parent.children.push({ id: 'att-' + newAtt.id, type: 'attachment', label: newAtt.title || newAtt.files?.[0]?.name || ('附件 ' + newAtt.id), attachmentId: newAtt.id, isPublic: newAtt.isPublic }) }
    })
    data.linkedArticleIds?.forEach(articleId => { const a = mockArticles.find(a => a.id === Number(articleId)); if (a) { if (!a.attachmentIds) a.attachmentIds = []; if (!a.attachmentIds.includes(newAtt.id)) a.attachmentIds.push(newAtt.id) } })
    return newAtt
  },

  async update(id, data) {
    await delay(400)
    const index = mockAttachments.findIndex(a => a.id === Number(id))
    // ── 寫入版本歷史（與 articleService.update 一致）──────────────
    if (!mockAttachmentVersionHistory[id]) mockAttachmentVersionHistory[id] = []
    const lastVer = mockAttachmentVersionHistory[id][0]?.versionNumber || (mockAttachments[index]?.versionNumber || 0)
    const newVer = lastVer + 1
    mockAttachmentVersionHistory[id].unshift({
      versionNumber: newVer,
      editorId:   mockCurrentUser.員工工號,
      editorName: mockCurrentUser.員工姓名,
      savedAt:    new Date().toISOString(),
      diffSummary: data.changeNote || '（未填寫修改說明）',
    })
    // ─────────────────────────────────────────────────────────────
    const oldLinks = mockAttachments[index]?.linkedArticleIds || []
    // 本次新上傳的檔案（尚未有 versionNumber）打上當次版本號
    if (data.files?.length) {
      data = { ...data, files: data.files.map(f => f.versionNumber ? f : { ...f, versionNumber: newVer }) }
    }
    if (index !== -1) mockAttachments[index] = { ...mockAttachments[index], ...data, updatedAt: new Date().toISOString() }
    function removeAttFromTree(nodes, attId) { for (let i = nodes.length - 1; i >= 0; i--) { if (nodes[i].type === 'attachment' && nodes[i].attachmentId === Number(attId)) nodes.splice(i, 1); else if (nodes[i].children) removeAttFromTree(nodes[i].children, attId) } }
    removeAttFromTree(mockDirectoryTree, id)
    const ua = mockAttachments[index]
    ua?.directories?.forEach(dirId => {
      const parent = findTreeNodeById(mockDirectoryTree, dirId)
      if (parent) { if (!parent.children) parent.children = []; if (!parent.children.some(c => c.type === 'attachment' && c.attachmentId === ua.id)) parent.children.push({ id: 'att-' + ua.id, type: 'attachment', label: ua.title || ua.files?.[0]?.name || '附件 ' + ua.id, attachmentId: ua.id, isPublic: ua.isPublic }) }
    })
    const newLinks = data.linkedArticleIds || []
    newLinks.forEach(articleId => { const a = mockArticles.find(a => a.id === Number(articleId)); if (a) { if (!a.attachmentIds) a.attachmentIds = []; if (!a.attachmentIds.includes(Number(id))) a.attachmentIds.push(Number(id)) } })
    oldLinks.filter(aid => !newLinks.includes(aid)).forEach(articleId => { const a = mockArticles.find(a => a.id === Number(articleId)); if (a?.attachmentIds) a.attachmentIds = a.attachmentIds.filter(x => x !== Number(id)) })
    if (index !== -1) mockAttachments[index] = { ...mockAttachments[index], versionNumber: newVer }
    return { ...(mockAttachments[index] || data), id, updatedAt: new Date().toISOString(), versionNumber: newVer }
  },

  async uploadFiles(files) { await delay(1000); return files.map(f => ({ uuid: 'uuid-' + Date.now(), name: f.name, size: f.size, url: '/uploads/demo/' + f.name })) },
}


// ============================================================
// Notification / Comment / Version / Tag / Colleague / Meta
// ============================================================
export const notificationService = {
  async getAll() { await delay(200); return mockNotifications },
  async markAsRead(id) {
    await delay(150)
    const n = mockNotifications.find(n => n.id === id)
    if (n) { n.isRead = true; if (n.commentId && n.articleId) await commentService.markAsRead(n.articleId, n.commentId) }
    return { success: true }
  },
}

export const commentService = {
  async getByArticleId(articleId) { await delay(200); return mockComments[articleId] || [] },
  async create(articleId, content) {
    await delay(300)
    const c = { id: Date.now(), articleId, author: mockCurrentUser, content, mentions: [], createdAt: new Date().toISOString(), isRead: { [mockCurrentUser.員工工號]: true } }
    if (!mockComments[articleId]) mockComments[articleId] = []
    mockComments[articleId].push(c)
    return c
  },
  async markAsRead(articleId, commentId) {
    await delay(200)
    const c = (mockComments[articleId] || []).find(c => c.id === commentId)
    if (c) { if (!c.isRead) c.isRead = {}; c.isRead[mockCurrentUser.員工工號] = true }
    return { success: true }
  },
}

export const versionService = {
  async getByArticleId(articleId) { await delay(200); return mockVersionHistory[articleId] || [] },
  async rollback(articleId, versionNumber) { await delay(500); return { success: true, newVersionNumber: (mockVersionHistory[articleId]?.length || 0) + 1 } },
}

export const attachmentVersionService = {
  async getByAttachmentId(attachmentId) { await delay(200); return mockAttachmentVersionHistory[attachmentId] || [] },
}

export const tagService = {
  async getAll() { await delay(150); return mockTags },
  async create(name) { await delay(200); const t = { id: Date.now(), name }; mockTags.push(t); return t },
}

export const colleagueService = {
  async getAll() { await delay(200); return mockColleagues },
}

export const metaService = {
  async getCompanies() { await delay(150); return mockCompanies },
  async getDepartments(組織OID) { await delay(150); return mockDepartments[組織OID] || [] },
}

export default http
