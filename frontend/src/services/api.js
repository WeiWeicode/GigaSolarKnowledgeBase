// src/services/api.js
import axios from 'axios'

// ============================================================
// 切換開關：true = Mock 模式，false = 真實後端
// ============================================================
const USE_MOCK = false

// ── Mock import（只在 USE_MOCK 時使用）───────────────────────
let mockCurrentUser, mockDirectoryTree, mockTags, mockColleagues,
    mockArticles, mockAttachments, mockNotifications, mockComments,
    mockVersionHistory, mockAttachmentVersionHistory, mockCompanies, mockDepartments

if (USE_MOCK) {
  const m = await import('./mockData.js')
  mockCurrentUser              = m.mockCurrentUser
  mockDirectoryTree            = m.mockDirectoryTree
  mockTags                     = m.mockTags
  mockColleagues               = m.mockColleagues
  mockArticles                 = m.mockArticles
  mockAttachments              = m.mockAttachments
  mockNotifications            = m.mockNotifications
  mockComments                 = m.mockComments
  mockVersionHistory           = m.mockVersionHistory
  mockAttachmentVersionHistory = m.mockAttachmentVersionHistory
  mockCompanies                = m.mockCompanies
  mockDepartments              = m.mockDepartments
}

const delay = (ms = 300) => new Promise(r => setTimeout(r, ms))

// ── Axios 實例 ────────────────────────────────────────────────
const http = axios.create({
  baseURL: 'http://localhost:5155/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// Request：自動帶入 token
http.interceptors.request.use(config => {
  const token = sessionStorage.getItem('kb_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response：統一解包 / 401 導回登入
// 注意：登入端點本身的 401（帳密錯誤）不應觸發重導，否則 ElMessage 來不及顯示
http.interceptors.response.use(
  res => res.data,
  err => {
    const isLoginEndpoint = err.config?.url?.includes('/auth/login')
    if (err.response?.status === 401 && !isLoginEndpoint) {
      sessionStorage.removeItem('kb_token')
      window.location.href = '/login'
    }
    return Promise.reject(err?.response?.data || err)
  }
)

// ============================================================
// Normalizers：後端 snake_case → 前端 camelCase
// ============================================================

/**
 * 將後端 Notification 欄位轉換為前端所需格式
 * 後端：target_account / article_id / mentioned_by_name / is_read ...
 * 前端：targetUserId / articleId / mentionedBy.員工姓名 / isRead ...
 */
function normalizeNotification(n) {
  return {
    id:           n.id,
    targetUserId: n.target_account,
    articleId:    n.article_id,
    articleTitle: n.article_title,
    mentionedBy: {
      員工工號: n.mentioned_by_account,
      員工姓名: n.mentioned_by_name,
    },
    commentId:      n.comment_id,
    commentPreview: n.comment_preview,
    isRead:         n.is_read,
    createdAt:      n.created_at,
  }
}

/**
 * 將後端 Article 欄位轉換為前端所需格式
 * 主要處理：snake_case → camelCase、Tags → tags（小寫）
 */
function normalizeArticle(a) {
  return {
    ...a,
    isPublished:   a.is_published,
    isPublic:      a.is_public,
    accessDept:    a.access_dept,
    accessMembers: a.access_members,
    accessLevel:   a.access_level,
    versionNumber: a.version_number,
    createdBy:     a.created_by,
    createdByName: a.created_by_name,
    updatedBy:     a.updated_by,
    updatedByName: a.updated_by_name,
    createdAt:     a.created_at,
    updatedAt:     a.updated_at,
    // Sequelize association 以大寫 alias 回傳，統一轉小寫
    tags:    (a.Tags    || a.tags    || []).map(t => ({ id: t.id, name: t.name })),
    editors: (a.Editors || a.editors || []).map(e => e.editor_account || e.editorAccount || e),
  }
}

/**
 * 將後端 Attachment 欄位轉換為前端所需格式
 */
function normalizeAttachment(a) {
  return {
    ...a,
    isPublished:   a.is_published,
    isPublic:      a.is_public,
    accessDept:    a.access_dept,
    accessMembers: a.access_members,
    accessLevel:   a.access_level,
    versionNumber: a.version_number,
    createdBy:     a.created_by,
    createdByName: a.created_by_name,
    updatedBy:     a.updated_by,
    updatedByName: a.updated_by_name,
    createdAt:     a.created_at,
    updatedAt:     a.updated_at,
    tags:    (a.Tags    || a.tags    || []).map(t => ({ id: t.id, name: t.name })),
    editors: (a.Editors || a.editors || []).map(e => e.editor_account || e.editorAccount || e),
    // Files 只在 getById 時有，列表 API 不包含
    files: (a.Files || a.files || []).map(f => ({
      id:            f.id,
      uuid:          f.uuid,
      name:          f.name,
      size:          f.size,
      mimeType:      f.mime_type,
      url:           f.url,
      storagePath:   f.storage_path,
      versionNumber: f.version_number,
    })),
  }
}

// ── Mock 用：目錄樹工具函式 ───────────────────────────────────
function findTreeNodeById(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) { const f = findTreeNodeById(node.children, id); if (f) return f }
  }
  return null
}
function extractNodeById(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) { const [node] = nodes.splice(i, 1); return { node, siblings: nodes } }
    if (nodes[i].children) { const r = extractNodeById(nodes[i].children, id); if (r) return r }
  }
  return null
}
function recalcSortOrder(siblings) {
  let o = 1; for (const n of siblings) if (n.type === 'directory') n.sortOrder = o++
}
function insertBeforeTrash(children, newNode) {
  const i = children.findIndex(c => c.type === 'trash')
  i !== -1 ? children.splice(i, 0, newNode) : children.push(newNode)
  recalcSortOrder(children)
}


// ============================================================
// Auth Service
// ============================================================
export const authService = {
  async login(account, password) {
    if (USE_MOCK) {
      await delay(600)
      const token = 'mock-jwt-token-' + Date.now()
      sessionStorage.setItem('kb_token', token)
      return { token, user: mockCurrentUser }
    }

    // POST /api/v1/auth/login
    const res = await http.post('/auth/login', { account, password })
    sessionStorage.setItem('kb_token', res.token)
    return res  // { success, message, token, user }
  },

  async logout() {
    if (USE_MOCK) {
      sessionStorage.removeItem('kb_token')
      return
    }

    // POST /api/v1/auth/logout
    await http.post('/auth/logout')
    sessionStorage.removeItem('kb_token')
  },

  async getCurrentUser() {
    if (USE_MOCK) {
      await delay(200)
      return mockCurrentUser
    }

    // GET /api/v1/auth/me
    const res = await http.get('/auth/me')
    return res.user  // CurrentUser
  },
}


// ============================================================
// Meta Service（公司 / 部門）
// ============================================================
export const metaService = {
  async getCompanies() {
    if (USE_MOCK) { await delay(150); return mockCompanies }

    // GET /api/v1/meta/companies
    const res = await http.get('/meta/companies')
    return res.data  // Company[]
  },

  async getDepartments(組織OID) {
    if (USE_MOCK) { await delay(150); return mockDepartments[組織OID] || [] }

    // GET /api/v1/meta/departments?組織OID=xxx
    const res = await http.get('/meta/departments', { params: { 組織OID } })
    return res.data  // Department[]
  },
}


// ============================================================
// Colleague Service
// ============================================================
export const colleagueService = {
  async getAll() {
    if (USE_MOCK) { await delay(200); return mockColleagues }

    // GET /api/v1/colleagues
    const res = await http.get('/colleagues')
    return res.data  // Colleague[]
  },
}


// ============================================================
// Tag Service
// ============================================================
export const tagService = {
  async getAll() {
    if (USE_MOCK) { await delay(150); return mockTags }

    // GET /api/v1/tags
    const res = await http.get('/tags')
    return res.data  // Tag[]
  },

  async create(name) {
    if (USE_MOCK) {
      await delay(200)
      const t = { id: Date.now(), name }; mockTags.push(t); return t
    }

    // POST /api/v1/tags
    const res = await http.post('/tags', { name })
    return res.data  // Tag
  },

  async remove(id) {
    if (USE_MOCK) {
      await delay(200)
      const idx = mockTags.findIndex(t => t.id === id)
      if (idx !== -1) mockTags.splice(idx, 1)
      return { success: true }
    }

    // DELETE /api/v1/tags/:id
    const res = await http.delete(`/tags/${id}`)
    return res  // { success, message }
  },
}


// ============================================================
// Directory Service
// ============================================================
export const directoryService = {
  async getTree(組織OID, 部門代碼) {
    if (USE_MOCK) {
      await delay(300)
      return JSON.parse(JSON.stringify(mockDirectoryTree))
    }

    // GET /api/v1/directories?組織OID=xxx&部門代碼=xxx
    const res = await http.get('/directories', { params: { 組織OID, 部門代碼 } })
    return res.data  // DirectoryNode[]
  },

  async createNode(parentId, label, deptCode) {
    if (USE_MOCK) {
      await delay(300)
      const newNode = { id: 'dir-new-' + Date.now(), type: 'directory', label, sortOrder: 0, children: [] }
      const parent = findTreeNodeById(mockDirectoryTree, parentId)
      if (parent) { if (!parent.children) parent.children = []; insertBeforeTrash(parent.children, newNode) }
      return newNode
    }

    // POST /api/v1/directories
    // id 由前端產生（後端必填）
    const id = `dir-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const res = await http.post('/directories', { id, parentId, label, deptCode, sortOrder: 1 })
    return res.data  // DirectoryNode
  },

  async renameNode(id, label) {
    if (USE_MOCK) {
      await delay(200)
      const node = findTreeNodeById(mockDirectoryTree, id)
      if (node) node.label = label
      return { id, label }
    }

    // PATCH /api/v1/directories/:id/rename
    const res = await http.patch(`/directories/${id}/rename`, { label })
    return res.data  // { id, label }
  },

  async moveNode(draggingId, dropId, dropType) {
    if (USE_MOCK) {
      await delay(200)
      const extracted = extractNodeById(mockDirectoryTree, draggingId)
      if (!extracted) return { success: false }
      const { node: draggedNode } = extracted
      if (dropType === 'inner') {
        const dropNode = findTreeNodeById(mockDirectoryTree, dropId)
        if (dropNode) { if (!dropNode.children) dropNode.children = []; insertBeforeTrash(dropNode.children, draggedNode) }
      } else {
        function insertRelative(nodes) {
          for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === dropId) {
              nodes.splice(dropType === 'before' ? i : i + 1, 0, draggedNode)
              recalcSortOrder(nodes); return true
            }
            if (nodes[i].children && insertRelative(nodes[i].children)) return true
          }
        }
        insertRelative(mockDirectoryTree)
      }
      return { success: true }
    }

    // PATCH /api/v1/directories/move
    const res = await http.patch('/directories/move', { draggingId, dropId, dropType })
    return res  // { success, message }
  },

  async removeNode(id) {
    if (USE_MOCK) {
      await delay(300)
      extractNodeById(mockDirectoryTree, id)
      return { success: true }
    }

    // DELETE /api/v1/directories/:id
    const res = await http.delete(`/directories/${id}`)
    return res  // { success, message }
  },
}


// ============================================================
// Article Service
// ============================================================
export const articleService = {
  async getAll() {
    if (USE_MOCK) { await delay(200); return mockArticles }

    // GET /api/v1/articles
    const res = await http.get('/articles')
    return res.data.map(normalizeArticle)  // Article[]
  },

  async getById(id, versionParam = null) {
    if (USE_MOCK) {
      await delay(300)
      let article = mockArticles.find(a => a.id === Number(id))
      if (!article) throw new Error('文章不存在')
      article = { ...article }
      if (versionParam) {
        const vh = mockVersionHistory[id]
        const tv = vh?.find(v => v.versionNumber === Number(versionParam))
        if (tv?.content) { article.content = tv.content; article.versionNumber = tv.versionNumber }
      }
      return article
    }

    // GET /api/v1/articles/:id?version=xxx
    const params = versionParam ? { version: versionParam } : {}
    const res = await http.get(`/articles/${id}`, { params })
    return normalizeArticle(res.data)  // Article
  },

  async search(keyword, tags) {
    if (USE_MOCK) {
      await delay(350)
      let r = mockArticles.filter(a => a.isPublished)
      if (keyword) { const kw = keyword.toLowerCase(); r = r.filter(a => a.title.toLowerCase().includes(kw) || a.content.toLowerCase().includes(kw)) }
      if (tags?.length) r = r.filter(a => a.tags?.some(t => tags.includes(t.id)))
      return r
    }

    // GET /api/v1/articles/search?q=xxx&tags=1,2
    const res = await http.get('/articles/search', {
      params: {
        q:    keyword  || undefined,
        tags: tags?.length ? tags.join(',') : undefined,
      },
    })
    return res.data.map(normalizeArticle)  // Article[]
  },

  async create(formData) {
    if (USE_MOCK) {
      await delay(500)
      const newArticle = {
        id: Date.now(), ...formData,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        versionNumber: 1,
      }
      mockArticles.push(newArticle)
      return newArticle
    }

    // POST /api/v1/articles
    const res = await http.post('/articles', formData)
    return normalizeArticle(res.data)  // Article
  },

  async update(id, formData) {
    if (USE_MOCK) {
      await delay(400)
      const index = mockArticles.findIndex(a => a.id === Number(id))
      if (!mockVersionHistory[id]) mockVersionHistory[id] = []
      const newVer = (mockArticles[index]?.versionNumber || 1) + 1
      mockVersionHistory[id].unshift({ versionNumber: newVer, editorId: mockCurrentUser.員工工號, savedAt: new Date().toISOString(), diffSummary: formData.changeNote || '' })
      if (index !== -1) mockArticles[index] = { ...mockArticles[index], ...formData, updatedAt: new Date().toISOString(), versionNumber: newVer }
      return { ...mockArticles[index], id, versionNumber: newVer }
    }

    // PUT /api/v1/articles/:id
    const res = await http.put(`/articles/${id}`, formData)
    return normalizeArticle(res.data)  // Article
  },

  async uploadImage(file) {
    if (USE_MOCK) { await delay(800); return { url: '/uploads/demo/' + file.name } }

    // POST /api/v1/articles/upload-image（multer 欄位名為 image）
    const form = new FormData()
    form.append('image', file)
    const res = await http.post('/articles/upload-image', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res  // { success, url }
  },
}


// ============================================================
// Attachment Service
// ============================================================
export const attachmentService = {
  async getAll() {
    if (USE_MOCK) { await delay(200); return mockAttachments }

    // GET /api/v1/attachments
    const res = await http.get('/attachments')
    return res.data.map(normalizeAttachment)  // Attachment[]
  },

  async getById(id) {
    if (USE_MOCK) {
      await delay(300)
      const a = mockAttachments.find(a => a.id === Number(id))
      if (!a) throw new Error('附件不存在')
      return a
    }

    // GET /api/v1/attachments/:id
    const res = await http.get(`/attachments/${id}`)
    return normalizeAttachment(res.data)  // Attachment
  },

  async uploadFiles(files) {
    if (USE_MOCK) {
      await delay(1000)
      return files.map(f => ({ uuid: 'uuid-' + Date.now(), name: f.name, size: f.size, url: '/uploads/demo/' + f.name }))
    }

    // POST /api/v1/attachments/upload（multer 欄位名為 files）
    const form = new FormData()
    files.forEach(f => form.append('files', f))
    const res = await http.post('/attachments/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data  // FileInfo[]（不需 normalize，屬於中途資料）
  },

  async create(formData) {
    if (USE_MOCK) {
      await delay(500)
      const newAtt = { id: Date.now(), ...formData, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), versionNumber: 1 }
      mockAttachments.push(newAtt)
      return newAtt
    }

    // POST /api/v1/attachments
    const res = await http.post('/attachments', formData)
    return normalizeAttachment(res.data)  // Attachment
  },

  async update(id, formData) {
    if (USE_MOCK) {
      await delay(400)
      const index = mockAttachments.findIndex(a => a.id === Number(id))
      if (!mockAttachmentVersionHistory[id]) mockAttachmentVersionHistory[id] = []
      const newVer = (mockAttachments[index]?.versionNumber || 1) + 1
      mockAttachmentVersionHistory[id].unshift({ versionNumber: newVer, savedAt: new Date().toISOString(), diffSummary: formData.changeNote || '' })
      if (index !== -1) mockAttachments[index] = { ...mockAttachments[index], ...formData, versionNumber: newVer, updatedAt: new Date().toISOString() }
      return { ...mockAttachments[index], id, versionNumber: newVer }
    }

    // PUT /api/v1/attachments/:id
    const res = await http.put(`/attachments/${id}`, formData)
    return normalizeAttachment(res.data)  // Attachment
  },
}


// ============================================================
// Comment Service
// ============================================================

/** 後端 flat snake_case → 前端巢狀 camelCase */
function normalizeComment(c) {
  return {
    id:        c.id,
    articleId: c.article_id,
    content:   c.content,
    mentions:  c.mentions || [],
    isRead:    c.isRead   || {},
    createdAt: c.created_at,
    author: {
      員工工號: c.author_account,
      員工姓名: c.author_name,
    },
  }
}

export const commentService = {
  async getByArticleId(articleId) {
    if (USE_MOCK) { await delay(200); return mockComments[articleId] || [] }

    // GET /api/v1/articles/:articleId/comments
    const res = await http.get(`/articles/${articleId}/comments`)
    return res.data.map(normalizeComment)  // Comment[]
  },

  async create(articleId, content, mentions = []) {
    if (USE_MOCK) {
      await delay(300)
      const c = { id: Date.now(), articleId, author: mockCurrentUser, content, mentions, createdAt: new Date().toISOString(), isRead: { [mockCurrentUser.員工工號]: true } }
      if (!mockComments[articleId]) mockComments[articleId] = []
      mockComments[articleId].push(c)
      return c
    }

    // POST /api/v1/articles/:articleId/comments
    const res = await http.post(`/articles/${articleId}/comments`, { content, mentions })
    return normalizeComment(res.data)  // Comment
  },

  async markAsRead(articleId, commentId) {
    if (USE_MOCK) {
      await delay(200)
      const c = (mockComments[articleId] || []).find(c => c.id === commentId)
      if (c) { if (!c.isRead) c.isRead = {}; c.isRead[mockCurrentUser.員工工號] = true }
      return { success: true }
    }

    // PATCH /api/v1/comments/:id/read
    // 注意：此端點掛在 /comments（非 /articles 子路由）
    const res = await http.patch(`/comments/${commentId}/read`)
    return res  // { success, message }
  },
}


// ============================================================
// Notification Service
// ============================================================
export const notificationService = {
  async getAll() {
    if (USE_MOCK) { await delay(200); return mockNotifications }

    // GET /api/v1/notifications
    const res = await http.get('/notifications')
    return res.data.map(normalizeNotification)  // Notification[]
  },

  async markAsRead(id) {
    if (USE_MOCK) {
      await delay(150)
      const n = mockNotifications.find(n => n.id === id)
      if (n) n.isRead = true
      return { success: true }
    }

    // PATCH /api/v1/notifications/:id/read
    const res = await http.patch(`/notifications/${id}/read`)
    return res  // { success, message }
  },

  async markAllAsRead() {
    if (USE_MOCK) {
      await delay(150)
      mockNotifications.forEach(n => n.isRead = true)
      return { success: true }
    }

    // PATCH /api/v1/notifications/read-all
    const res = await http.patch('/notifications/read-all')
    return res  // { success, message }
  },
}


// ============================================================
// Version Service（文章版本）
// ============================================================

/** 後端 snake_case → 前端 camelCase */
function normalizeVersion(v) {
  return {
    id:            v.id,
    articleId:     v.article_id,
    versionNumber: v.version_number,
    content:       v.content,
    diffSummary:   v.diff_summary,
    editorId:      v.editor_id,
    editorName:    v.editor_name,
    savedAt:       v.saved_at || v.created_at,
  }
}

/** 後端 snake_case → 前端 camelCase（附件版本） */
function normalizeAttachmentVersion(v) {
  return {
    id:             v.id,
    attachmentId:   v.attachment_id,
    versionNumber:  v.version_number,
    diffSummary:    v.diff_summary,
    editorId:       v.editor_id,
    editorName:     v.editor_name,
    savedAt:        v.saved_at || v.created_at,
  }
}

export const versionService = {
  async getByArticleId(articleId) {
    if (USE_MOCK) { await delay(200); return mockVersionHistory[articleId] || [] }

    // GET /api/v1/articles/:articleId/versions
    const res = await http.get(`/articles/${articleId}/versions`)
    return res.data.map(normalizeVersion)  // ArticleVersionHistory[]
  },

  async rollback(articleId, versionNumber) {
    if (USE_MOCK) {
      await delay(500)
      return { success: true, newVersionNumber: (mockVersionHistory[articleId]?.length || 0) + 1 }
    }

    // POST /api/v1/articles/:articleId/versions/:versionNum/rollback
    const res = await http.post(`/articles/${articleId}/versions/${versionNumber}/rollback`)
    return res  // { success, message }
  },
}


// ============================================================
// Attachment Version Service（附件版本）
// ============================================================
export const attachmentVersionService = {
  async getByAttachmentId(attachmentId) {
    if (USE_MOCK) { await delay(200); return mockAttachmentVersionHistory[attachmentId] || [] }

    // GET /api/v1/attachments/:attachmentId/versions
    const res = await http.get(`/attachments/${attachmentId}/versions`)
    return res.data.map(normalizeAttachmentVersion)  // AttachmentVersionHistory[]
  },
}


export default http
