// src/services/api.js
// ============================================================
// Axios 實例 + Mock 攔截器
// 目前以 Mock 資料回傳，後端完成後只需移除攔截器並設定 baseURL
// ============================================================
import axios from 'axios'
import {
  mockCurrentUser,
  mockDirectoryTree,
  mockTags,
  mockColleagues,
  mockArticles,
  mockAttachments,
  mockNotifications,
  mockComments,
  mockVersionHistory,
  mockCompanies,
  mockDepartments,
} from './mockData.js'

// 模擬 API 延遲
const delay = (ms = 300) => new Promise(r => setTimeout(r, ms))

// ── Axios 實例（後端串接時填入 baseURL）
const http = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// ── JWT Interceptor（Token 注入）
http.interceptors.request.use(config => {
  const token = sessionStorage.getItem('kb_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})


// ============================================================
// Auth Service
// ============================================================
export const authService = {
  /** 模擬 BPM 登入，任意帳密皆成功 */
  async login(employeeId, password) {
    await delay(600)
    const token = 'mock-jwt-token-' + Date.now()
    sessionStorage.setItem('kb_token', token)
    return { token, user: mockCurrentUser }
  },

  async logout() {
    sessionStorage.removeItem('kb_token')
  },

  async getCurrentUser() {
    await delay(200)
    return mockCurrentUser
  },
}


// ============================================================
// Directory Service
// ============================================================
export const directoryService = {
  async getTree(組織OID, 部門代碼) {
    await delay(300)
    // 只有碩禾電子材料有 mock 資料
    if (組織OID === 'aae8e849cdd2100486ce62c68f92dc43') {
      return JSON.parse(JSON.stringify(mockDirectoryTree))
    }
    return []
  },

  async createNode(parentId, label) {
    await delay(300)
    return { id: 'dir-new-' + Date.now(), type: 'directory', label, children: [] }
  },

  async renameNode(id, label) {
    await delay(200)
    return { id, label }
  },

  async moveNode(id, newParentId) {
    await delay(200)
    return { success: true }
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
    
    // dynamically add versionNumber from history if not present
    const vh = mockVersionHistory[id]
    const latestVersion = vh && vh.length > 0 ? vh[0].versionNumber : 1
    article = { ...article, versionNumber: article.versionNumber || latestVersion }

    // If specific version is requested, load its content
    if (versionParam && vh) {
      const targetVersion = vh.find(v => v.versionNumber === Number(versionParam))
      if (targetVersion && targetVersion.content) {
        article.content = targetVersion.content
        article.versionNumber = targetVersion.versionNumber // 替換為預覽的版本號
      }
    }
    
    return article
  },

  async create(data) {
    await delay(500)
    const newArticle = { id: Date.now(), ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), versionNumber: 1 }
    mockArticles.push(newArticle)

    // Simulate backend updating the directory tree
    if (data.directories && data.directories.length > 0) {
      function appendToTree(nodes, dirId) {
        for (const node of nodes) {
          if (node.id === dirId) {
            if (!node.children) node.children = []
            // Prevent duplicate entries for the same article
            const alreadyExists = node.children.some(c => c.articleId === newArticle.id)
            if (!alreadyExists) {
              node.children.push({
                id: 'art-' + newArticle.id,
                type: 'article',
                label: newArticle.title,
                articleId: newArticle.id,
                isPublic: newArticle.isPublic,
              })
            }
            return true
          }
          if (node.children && appendToTree(node.children, dirId)) return true
        }
        return false
      }
      for (const dirId of data.directories) {
        appendToTree(mockDirectoryTree, dirId)
      }
    }

    return newArticle
  },

  /**
   * 💡 關聯資料庫設計備註 (給後端參考)：
   * 文章資料採用「表頭(Master) - 表身(Detail)」的關聯設計。
   * 表頭：文章主檔 (包含 Title, isPublic, Tags 等共用資訊)
   * 表身：文章版本歷史 (包含 Content(MD), VersionNumber, ChangeNote, 修改人等)
   * 
   * 每次呼叫 update 修改文章時：
   * 1. 表頭 (Article) 僅更新 Title, 設定等。
   * 2. 表身 (Article_Version) 必須「新增」一筆紀錄，並將 VersionNumber + 1，同時記錄此次的「修改說明 (changeNote)」。
   * 讀取文章 (getById) 時，請撈取表頭資訊加上表身中最新的一筆 Version 紀錄。
   */
  async update(id, data) {
    await delay(400)
    const index = mockArticles.findIndex(a => a.id === Number(id))
    
    // Append to version history
    if (!mockVersionHistory[id]) mockVersionHistory[id] = []
    const lastVer = mockVersionHistory[id][0]?.versionNumber || (mockArticles[index]?.versionNumber || 0)
    const newVer = lastVer + 1
    mockVersionHistory[id].unshift({
      versionNumber: newVer,
      editorId: mockCurrentUser.員工工號,
      editorName: mockCurrentUser.員工姓名,
      savedAt: new Date().toISOString(),
      diffSummary: data.changeNote || '（未填寫修改說明）',
    })

    if (index !== -1) {
      mockArticles[index] = { ...mockArticles[index], ...data, updatedAt: new Date().toISOString(), versionNumber: newVer }
    }

    // Simulate updating title in tree
    function updateTitleInTree(nodes) {
      for (const node of nodes) {
        if (node.type === 'article' && node.articleId === Number(id)) {
          node.label = data.title
          node.isPublic = data.isPublic
        }
        if (node.children) updateTitleInTree(node.children)
      }
    }
    updateTitleInTree(mockDirectoryTree)

    return { ...(mockArticles[index] || data), id, updatedAt: new Date().toISOString(), versionNumber: newVer }
  },

  async search(keyword, tags) {
    await delay(350)
    let results = mockArticles.filter(a => a.isPublished)
    if (keyword) {
      const kw = keyword.toLowerCase()
      results = results.filter(a => a.title.toLowerCase().includes(kw) || a.content.toLowerCase().includes(kw))
    }
    if (tags && tags.length > 0) {
      results = results.filter(a => a.tags.some(t => tags.includes(t.id)))
    }
    return results
  },

  async uploadImage(file) {
    await delay(800)
    return { url: '/uploads/demo/' + file.name }
  },
}


// ============================================================
// Attachment Service
// ============================================================
export const attachmentService = {
  async getAll() {
    await delay(200)
    return mockAttachments
  },

  async getById(id) {
    await delay(300)
    const att = mockAttachments.find(a => a.id === Number(id))
    if (!att) throw new Error('附件不存在')
    return att
  },

  async create(data) {
    await delay(500)
    const newAtt = { id: Date.now(), ...data, createdAt: new Date().toISOString(), versionNumber: 1 }
    mockAttachments.push(newAtt)

    if (data.directories && data.directories.length > 0) {
      function appendToTree(nodes, dirId) {
        for (const node of nodes) {
          if (node.id === dirId) {
            if (!node.children) node.children = []
            node.children.push({
              id: 'att-' + newAtt.id,
              type: 'attachment',
              label: newAtt.description || ('附件 ' + newAtt.id),
              attachmentId: newAtt.id,
              isPublic: newAtt.isPublic,
            })
            return true
          }
          if (node.children && appendToTree(node.children, dirId)) return true
        }
        return false
      }
      for (const dirId of data.directories) {
        appendToTree(mockDirectoryTree, dirId)
      }
    }
    
    return newAtt
  },

  async update(id, data) {
    await delay(400)
    return { ...data, id, updatedAt: new Date().toISOString() }
  },

  async uploadFiles(files) {
    await delay(1000)
    return files.map(f => ({ uuid: 'uuid-' + Date.now(), name: f.name, size: f.size, url: '/uploads/demo/' + f.name }))
  },
}


// ============================================================
// Notification Service
// ============================================================
export const notificationService = {
  async getAll() {
    await delay(200)
    return mockNotifications
  },

  async markAsRead(id) {
    await delay(150)
    const n = mockNotifications.find(n => n.id === id)
    if (n) n.isRead = true
    return { success: true }
  },
}


// ============================================================
// Comment Service
// ============================================================
export const commentService = {
  async getByArticleId(articleId) {
    await delay(200)
    return mockComments[articleId] || []
  },

  async create(articleId, content) {
    await delay(300)
    const newComment = {
      id: Date.now(),
      articleId,
      author: mockCurrentUser,
      content,
      createdAt: new Date().toISOString(),
    }
    if (!mockComments[articleId]) mockComments[articleId] = []
    mockComments[articleId].push(newComment)
    return newComment
  },
}


// ============================================================
// Version History Service
// ============================================================
export const versionService = {
  async getByArticleId(articleId) {
    await delay(200)
    return mockVersionHistory[articleId] || []
  },

  async rollback(articleId, versionNumber) {
    await delay(500)
    return { success: true, newVersionNumber: (mockVersionHistory[articleId]?.length || 0) + 1 }
  },
}


// ============================================================
// Tag Service
// ============================================================
export const tagService = {
  async getAll() {
    await delay(150)
    return mockTags
  },

  async create(name) {
    await delay(200)
    const newTag = { id: Date.now(), name }
    mockTags.push(newTag)
    return newTag
  },
}


// ============================================================
// Colleague Service（BPM 同仁列表，TTL 1hr，Redis 快取）
// ============================================================
export const colleagueService = {
  async getAll() {
    await delay(200)
    return mockColleagues
  },
}


// ============================================================
// Meta（公司 / 部門）
// ============================================================
export const metaService = {
  async getCompanies() {
    await delay(150)
    return mockCompanies
  },

  async getDepartments(組織OID) {
    await delay(150)
    return mockDepartments[組織OID] || []
  },
}

export default http
