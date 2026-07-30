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
// 自動偵測主機：本地開發 (localhost) 或生產 (10.10.130.122)，後端固定 port 5155
const _backendBase = `http://${window.location.hostname}:5155`

const http = axios.create({
  baseURL: `${_backendBase}/api/v1`,
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

// 用於補全上傳檔案的相對路徑（/uploads/...）
const BACKEND_ORIGIN = http.defaults.baseURL.replace(/\/api\/v1\/?$/, '')

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1'
  }
  return Boolean(value)
}

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
    isRead:         normalizeBoolean(n.is_read ?? n.isRead),
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
    // BUG-017: access_members 在 MSSQL 以 JSON 字串儲存，需解析為陣列
    accessMembers: (() => {
      const raw = a.access_members
      if (Array.isArray(raw)) return raw
      if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return [] } }
      return []
    })(),
    accessLevel:   a.access_level,
    versionNumber: a.version_number,
    createdBy:     a.created_by,
    createdByName: a.created_by_name,
    updatedBy:     a.updated_by,
    updatedByName: a.updated_by_name,
    createdAt:     a.created_at,
    updatedAt:     a.updated_at,
    // Sequelize association 以大寫 alias 回傳，統一轉小寫
    tags:          (a.Tags    || a.tags    || []).map(t => ({ id: t.id, name: t.name })),
    editors:       (a.Editors || a.editors || []).map(e => e.editor_account || e.editorAccount || e),
    // BUG-006: 關聯附件 id 陣列，後端 getArticleById 已補回
    attachmentIds: a.attachmentIds || [],
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
      // BUG-011: 改用 /api/v1/attachments/files/:uuid/download
      // 後端會設定 Content-Disposition 帶原始檔名，而非 storage 的隨機檔名
      url: f.uuid
        ? `${BACKEND_ORIGIN}/api/v1/attachments/files/${f.uuid}/download`
        : (f.url ? (f.url.startsWith('http') ? f.url : `${BACKEND_ORIGIN}${f.url}`) : null),
      storagePath:   f.storage_path,
      versionNumber: f.version_number,
      ragSyncStatus: f.ragSyncStatus || null,
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
  /**
   * 取得標籤列表
   * @param {string} [scope]    - 'public' | 'dept' | 無（管理介面全部）
   * @param {string} [deptCode] - scope='dept' 時必填
   */
  async getAll(scope, deptCode) {
    if (USE_MOCK) { await delay(150); return mockTags }

    // GET /api/v1/tags?scope=xxx&deptCode=xxx
    const params = {}
    if (scope)    params.scope    = scope
    if (deptCode) params.deptCode = deptCode
    const res = await http.get('/tags', { params })
    return res.data  // Tag[]
  },

  /**
   * 新增標籤
   * @param {{ name: string, departments?: string[], customOrder?: number, isPublic?: boolean }} data
   */
  async create(data) {
    if (USE_MOCK) {
      await delay(200)
      const t = { id: Date.now(), name: data.name || data, departments: [], customOrder: 0, clickCount: 0, isPublic: false }
      mockTags.push(t); return t
    }

    // POST /api/v1/tags
    // 後小小相容：若傳入的是純字串（舊呼叫方式），包裝為物件
    const body = typeof data === 'string' ? { name: data } : data
    const res = await http.post('/tags', body)
    return res.data  // Tag
  },

  /**
   * 更新標籤
   * @param {number} id
   * @param {{ name?: string, departments?: string[], customOrder?: number, isPublic?: boolean }} data
   */
  async update(id, data) {
    if (USE_MOCK) {
      await delay(200)
      const t = mockTags.find(t => t.id === id)
      if (t) Object.assign(t, data)
      return t
    }

    // PATCH /api/v1/tags/:id
    const res = await http.patch(`/tags/${id}`, data)
    return res.data  // Tag
  },

  /**
   * 刪除標籤
   */
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

  /**
   * 累加點擊次數（公開模式下 tag chip 被點選時呼叫）
   * @param {number} id
   */
  async incrementClick(id) {
    if (USE_MOCK) { await delay(50); return { success: true } }

    // POST /api/v1/tags/:id/click
    const res = await http.post(`/tags/${id}/click`)
    return res  // { success, data: { id, click_count } }
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

  async getPublicTree(組織OID) {
    if (USE_MOCK) {
      await delay(300)
      return JSON.parse(JSON.stringify(mockDirectoryTree))
    }

    // GET /api/v1/directories?組織OID=xxx&scope=public
    // 不帶 部門代碼，後端回傳跨部門的所有公開已發佈節點
    const res = await http.get('/directories', { params: { 組織OID, scope: 'public' } })
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

  async search(keyword, tags, scope, deptCode) {
    if (USE_MOCK) {
      await delay(350)
      let r = mockArticles.filter(a => a.isPublished)
      if (keyword) { const kw = keyword.toLowerCase(); r = r.filter(a => a.title.toLowerCase().includes(kw) || a.content.toLowerCase().includes(kw)) }
      if (tags?.length) r = r.filter(a => a.tags?.some(t => tags.includes(t.id)))
      if (scope === 'public') r = r.filter(a => a.isPublic)
      if (scope === 'dept') { r = r.filter(a => !a.isPublic); if (deptCode) r = r.filter(a => a.accessDept === deptCode) }
      return r
    }

    // GET /api/v1/articles/search?q=xxx&tags=1,2
    const res = await http.get('/articles/search', {
      params: {
        q:    keyword  || undefined,
        tags: tags?.length ? tags.join(',') : undefined,
        scope,
        deptCode,
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

  async addTags(id, tagNames) {
    if (USE_MOCK) {
      await delay(200)
      return { success: true, data: tagNames.map((name, i) => ({ id: Date.now() + i, name })) }
    }
    // PATCH /api/v1/articles/:id/tags
    const res = await http.patch(`/articles/${id}/tags`, { tagNames })
    return res.data  // { success: true, data: Tag[] }
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

  async search(keyword, tags, scope, deptCode) {
    if (USE_MOCK) {
      await delay(350)
      let r = mockAttachments.filter(a => a.isPublished)
      if (keyword) { const kw = keyword.toLowerCase(); r = r.filter(a => a.title.toLowerCase().includes(kw) || (a.description && a.description.toLowerCase().includes(kw))) }
      if (tags?.length) r = r.filter(a => a.tags?.some(t => tags.includes(t.id)))
      if (scope === 'public') r = r.filter(a => a.isPublic)
      if (scope === 'dept') { r = r.filter(a => !a.isPublic); if (deptCode) r = r.filter(a => a.accessDept === deptCode) }
      return r
    }

    const res = await http.get('/attachments/search', {
      params: {
        q:    keyword  || undefined,
        tags: tags?.length ? tags.join(',') : undefined,
        scope,
        deptCode,
      },
    })
    return res.data.map(normalizeAttachment)
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

  // 抽取附件檔案文字內容（AI 問答頁面拖曳附件引用用）
  async extractFileText(uuid) {
    // GET /api/v1/attachments/files/:uuid/extract-text
    const res = await http.get(`/attachments/files/${uuid}/extract-text`)
    return res.data  // { uuid, name, text }
  },
}


// ============================================================
// Comment Service
// ============================================================

/** 後端 flat snake_case → 前端巢狀 camelCase */
function normalizeComment(c) {
  const readMap = {}
  Object.entries(c.isRead || {}).forEach(([account, value]) => {
    readMap[account] = normalizeBoolean(value)
  })

  return {
    id:        c.id,
    articleId: c.article_id,
    content:   c.content,
    mentions:  c.mentions || [],
    isRead:    readMap,
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


// ============================================================
// Cross Department Service（跨部門授權）
// ============================================================
export const crossDeptService = {
  /** 取得當前使用者被授權的跨部門清單（任何角色都可呼叫） */
  async getMyGrants() {
    const res = await http.get('/cross-departments/my-grants')
    return res.data   // [{ id, account, org_oid, dept_code, dept_name, created_by, created_at }]
  },

  /** 取得所有跨部門授權清單（用於 @提及過濾） */
  async getAllGrants() {
    const res = await http.get('/cross-departments/all')
    return res.data
  },

  /** 取得當前 MANAGER 自己建立的授權紀錄（僅 MANAGER） */
  async getCreated() {
    const res = await http.get('/cross-departments/created')
    return res.data
  },

  /**
   * 新增跨部門授權（僅 MANAGER）
   * @param {string} account   - 被授權同仁工號
   * @param {string} org_oid   - 目標公司 OID
   * @param {string} dept_code - 目標部門代碼
   * @param {string} dept_name - 目標部門名稱
   */
  async create({ account, org_oid, dept_code, dept_name }) {
    const res = await http.post('/cross-departments', { account, org_oid, dept_code, dept_name })
    return res.data
  },

  /** 刪除跨部門授權（只能刪自己建立的，僅 MANAGER） */
  async remove(id) {
    const res = await http.delete(`/cross-departments/${id}`)
    return res.data
  },
}


// ============================================================
// RAG Sync Service（RAG 向量同步管理，僅 ADMIN）
// 對應文檔：docs/DevelopmentProcess/RAG_SYNC_PLAN.md 4.4 節
// ============================================================
function normalizeRagSyncStatusRow(r) {
  return {
    id:                 r.id,
    sourceType:         r.source_type,
    sourceId:           r.source_id,
    parentAttachmentId: r.parent_attachment_id,
    title:              r.title,
    status:             r.status,
    targetVersion:      r.target_version,
    progress:           r.progress,
    lastSyncedVersion:  r.last_synced_version,
    lastSyncedAt:       r.last_synced_at,
    lastCheckedAt:      r.last_checked_at,
    triggeredBy:        r.triggered_by,
    captionFailedCount: r.caption_failed_count ?? 0,
    errorMessage:       r.error_message,
    updatedAt:          r.updated_at,
  }
}

function normalizeRagSyncLog(l) {
  return {
    id:         l.id,
    sourceType: l.source_type,
    sourceId:   l.source_id,
    stage:      l.stage,
    level:      l.level,
    message:    l.message,
    occurredAt: l.occurred_at,
  }
}

export const ragSyncService = {
  /** 取得目前排程設定 */
  async getConfig() {
    const res = await http.get('/rag-sync/config')
    return res.data   // { cronExpression, isEnabled, batchSize, lastRunAt, lastRunSummary }
  },

  /** 更新排程設定，儲存後後端會立即套用新的 cron 表達式 */
  async updateConfig({ cronExpression, isEnabled, batchSize }) {
    const res = await http.put('/rag-sync/config', { cronExpression, isEnabled, batchSize })
    return res.data
  },

  /** 比對狀態列表（分頁 + 篩選：status / sourceType / keyword） */
  async getStatusList(params = {}) {
    const res = await http.get('/rag-sync/status', { params })
    return {
      items:    (res.data.items || []).map(normalizeRagSyncStatusRow),
      total:    res.data.total,
      page:     res.data.page,
      pageSize: res.data.pageSize,
    }
  },

  /** 手動指定項目重新執行切分：items = [{ sourceType, sourceId }] */
  async executeManual(items) {
    const res = await http.post('/rag-sync/status/execute', { items })
    return res.data
  },

  /** 錯誤/事件 Log 列表（分頁 + 篩選：stage / level / startDate / endDate） */
  async getLogs(params = {}) {
    const res = await http.get('/rag-sync/logs', { params })
    return {
      items:    (res.data.items || []).map(normalizeRagSyncLog),
      total:    res.data.total,
      page:     res.data.page,
      pageSize: res.data.pageSize,
    }
  },

  /** 觸發全量校驗（立即回應，實際校驗在後端背景執行） */
  async runAudit() {
    const res = await http.post('/rag-sync/audit')
    return res.data
  },
}


// ── AI SSE Stream Helper ──────────────────────────────────────
async function readSSEStream(response, { onThinking, onDelta, onDone, onError } = {}) {
  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') { onDone?.(); return }
        try {
          const parsed = JSON.parse(data)
          if (parsed.error)   { onError?.(parsed.error); return }
          if (parsed.thinking) onThinking?.(parsed.thinking)
          if (parsed.delta)    onDelta?.(parsed.delta)
        } catch { /* 略過格式異常 chunk */ }
      }
    }
    onDone?.()
  } catch (err) {
    onError?.(err.message)
  } finally {
    reader.releaseLock()
  }
}

export const aiService = {
  /**
   * 取得 AI 配置資訊（如知識庫 ID、API Key）
   */
  async getConfig() {
    const res = await http.get('/ai/config')
    return res.data  // { knowledgeBaseId, apiKey }
  },

  /**
   * 更新 AI 配置資訊（知識庫 ID、API Key）
   */
  async updateConfig(payload) {
    return await http.post('/ai/config', payload)
  },

  /**
   * 文章解析助手（首頁 AI 問答）
   * @param {string} content 參考資料內容
   * @param {{ onDelta, onDone, onError }} callbacks
   * @param {AbortSignal} [signal]
   * @param {string} [mode] 模板 mode_key；'qa' 為針對問題直接作答
   * @param {string} [question] 使用者的問題（qa 模式使用，與 content 分開傳避免被當成素材）
   */
  async streamSummarize(content, callbacks, signal, mode = 'default', question) {
    const token = sessionStorage.getItem('kb_token')
    const res = await fetch(`${http.defaults.baseURL}/ai/summarize`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body:   JSON.stringify({ content, mode, question }),
      signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `HTTP ${res.status}`)
    }
    await readSSEStream(res, callbacks)
  },

  /**
   * 寫作助手（文章編輯 / 新建頁）
   * @param {FormData|{ content: string }} payload
   * @param {{ onDelta, onDone, onError }} callbacks
   * @param {AbortSignal} [signal]
   */
  async streamWritingAssist(payload, callbacks, signal) {
    const token      = sessionStorage.getItem('kb_token')
    const isFormData = payload instanceof FormData
    const res = await fetch(`${http.defaults.baseURL}/ai/writing-assist`, {
      method:  'POST',
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body:   isFormData ? payload : JSON.stringify(payload),
      signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `HTTP ${res.status}`)
    }
    await readSSEStream(res, callbacks)
  },
}


export default http
