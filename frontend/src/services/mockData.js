// src/services/mockData.js
// ============================================================
// 所有 Mock 資料集中於此，依照未來 API Contract 格式定義
// 後端串接時，只需將各 Service 中的 mock 函式替換為真實 Axios 呼叫
// ============================================================

// ── 當前登入使用者（模擬 BPM 登入回傳）
export const mockCurrentUser = {
  組織名稱: '碩禾電子材料',
  組織OID: 'aae8e849cdd2100486ce62c68f92dc43',
  員工工號: 'GV112001',
  員工姓名: '蔣佳緯',
  員工Mail: 'harryjiang@gigasolar.com.tw',
  職稱: '資深工程師',
  級職: 3,
  主要部門: 1,
  部門代碼: 'S1800',
  部門名稱: '資訊服務部',
  主管工號: 'S094009',
  主管姓名: '鄭智寬',
  主管電子郵件: 'eric@gigasolar.com.tw',
  role: 'MANAGER', // 系統計算後的角色（級職 <= 6 自動判定為主管）
}

// ── 集團公司列表
export const mockCompanies = [
  { 組織OID: 'aae8e849cdd2100486ce62c68f92dc43', 組織名稱: '碩禾電子材料' },
  { 組織OID: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6', 組織名稱: '集盛實業' },
  { 組織OID: 'c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7', 組織名稱: 'GigaSolar 集團總部' },
]

// ── 部門列表（依公司）
export const mockDepartments = {
  'aae8e849cdd2100486ce62c68f92dc43': [
    { 部門代碼: 'S1800', 部門名稱: '資訊服務部' },
    { 部門代碼: 'S1200', 部門名稱: '研發部' },
    { 部門代碼: 'S0900', 部門名稱: '品保部' },
    { 部門代碼: 'S0600', 部門名稱: '製造部' },
    { 部門代碼: 'S0300', 部門名稱: '業務部' },
  ],
}

// ── 目錄樹（樹狀結構，最多 6 階自訂）
export const mockDirectoryTree = [
  {
    id: 'dir-company-1',
    type: 'company',
    label: '碩禾電子材料',
    組織OID: 'aae8e849cdd2100486ce62c68f92dc43',
    children: [
      {
        id: 'dir-dept-s1800',
        type: 'department',
        label: '資訊服務部',
        部門代碼: 'S1800',
        children: [
          {
            id: 'dir-1',
            type: 'directory',
            label: '系統開發規範',
            children: [
              { id: 'dir-1-1', type: 'directory', label: '前端規範', children: [
                { id: 'art-101', type: 'article', label: 'Vue 3 Coding Style', articleId: 101, isPublic: true },
                { id: 'art-102', type: 'article', label: 'CSS 命名規範', articleId: 102, hasAccess: false, isPublic: false },
              ]},
              { id: 'dir-1-2', type: 'directory', label: '後端規範', children: [
                { id: 'art-103', type: 'article', label: 'Node.js 最佳實踐', articleId: 103 },
              ]},
            ],
          },
          {
            id: 'dir-2',
            type: 'directory',
            label: '維運文件',
            children: [
              { id: 'att-201', type: 'attachment', label: '伺服器清冊 Q1 2026.xlsx', attachmentId: 201, isPublic: false },
              { id: 'art-104', type: 'article', label: 'Docker 部署 SOP', articleId: 104, isPublic: true },
            ],
          },
          {
            id: 'dir-trash-s1800',
            type: 'trash',
            label: '🗑 垃圾桶',
            children: [
              { id: 'art-999', type: 'article', label: '舊版部署文件（已下架）', articleId: 999 },
            ],
          },
        ],
      },
      {
        id: 'dir-dept-s1200',
        type: 'department',
        label: '研發部',
        部門代碼: 'S1200',
        children: [
          { id: 'dir-3', type: 'directory', label: '製程技術', children: [
            { id: 'art-201', type: 'article', label: '漿料配方說明', articleId: 201, isPublic: true },
          ]},
        ],
      },
    ],
  },
]

// ── 標籤列表
export const mockTags = [
  { id: 1, name: 'Vue3' },
  { id: 2, name: 'Node.js' },
  { id: 3, name: 'Docker' },
  { id: 4, name: '規範' },
  { id: 5, name: 'SOP' },
  { id: 6, name: '製程' },
  { id: 7, name: '安全性' },
  { id: 8, name: '部署' },
]

// ── 同仁列表（BPM 同仁列表 API，供 @提及 / 編輯權限使用）
export const mockColleagues = [
  { 員工工號: 'GV112001', 員工姓名: '蔣佳緯', 部門名稱: '資訊服務部', 部門代碼: 'S1800', 員工Mail: 'harryjiang@gigasolar.com.tw' },
  { 員工工號: 'GV112002', 員工姓名: '陳志豪', 部門名稱: '資訊服務部', 部門代碼: 'S1800', 員工Mail: 'chenhao@gigasolar.com.tw' },
  { 員工工號: 'S094009',  員工姓名: '鄭智寬', 部門名稱: '資訊服務部', 部門代碼: 'S1800', 員工Mail: 'eric@gigasolar.com.tw' },
  { 員工工號: 'GV112010', 員工姓名: '王雅婷', 部門名稱: '研發部', 部門代碼: 'S1200', 員工Mail: 'yating@gigasolar.com.tw' },
  { 員工工號: 'GV112015', 員工姓名: '林建宏', 部門名稱: '品保部', 部門代碼: 'S0900', 員工Mail: 'jenhong@gigasolar.com.tw' },
]

// ── 文章列表 (表頭 Master 範例)
// 💡 關聯資料庫設計備註：
// 此為「表頭 (Master)」資料，存放文章共用屬性（如 Title, isPublic, Tags）。
// 由於文章支援版本控制，因此具體的「Markdown 內容 (content)」、「版本號 (versionNumber)」
// 以及「修改說明 (changeNote)」等欄位，在實際資料庫中應存放在「表身 (Detail / Article_Version)」中。
// 當修改文章時，表身應「新增」一筆版本紀錄，表頭則只需更新基礎設定。
export const mockArticles = [
  {
    id: 101,
    title: 'Vue 3 Coding Style',
    content: `# Vue 3 Coding Style\n\n## 命名規範\n\n元件名稱使用 **PascalCase**：\n\n\`\`\`vue\n<template>\n  <MyComponent />\n</template>\n\`\`\`\n\n## Composition API\n\n優先使用 \`<script setup>\` 語法糖：\n\n\`\`\`vue\n<script setup>\nimport { ref, computed } from 'vue'\nconst count = ref(0)\n</script>\n\`\`\`\n\n## Props 定義\n\n一律使用 \`defineProps\` 並標註型別。\n`,
    isPublished: true,
    isPublic: false,
    createdAt: '2026-04-10T09:00:00Z',
    updatedAt: '2026-05-01T14:30:00Z',
    createdBy: { 員工工號: 'GV112001', 員工姓名: '蔣佳緯' },
    updatedBy: { 員工工號: 'GV112001', 員工姓名: '蔣佳緯' },
    tags: [{ id: 1, name: 'Vue3' }, { id: 4, name: '規範' }],
    directories: ['dir-1-1'],
    attachmentIds: [],
    editorIds: ['GV112001', 'GV112002'],
    versionNumber: 3,
  },
  {
    id: 104,
    title: 'Docker 部署 SOP',
    content: `# Docker 部署 SOP\n\n## 前置作業\n\n確認伺服器已安裝 Docker Engine >= 24.x 及 Docker Compose v2。\n\n## 步驟\n\n1. Clone 專案至伺服器\n2. 複製 \`.env.example\` 為 \`.env\` 並填寫設定\n3. 執行 \`docker compose up -d\`\n\n\`\`\`bash\ngit clone https://github.com/gigasolar/kb.git\ncd kb\ncp .env.example .env\ndocker compose up -d\n\`\`\`\n`,
    isPublished: true,
    isPublic: true,
    createdAt: '2026-03-15T10:00:00Z',
    updatedAt: '2026-05-05T09:00:00Z',
    createdBy: { 員工工號: 'S094009', 員工姓名: '鄭智寬' },
    updatedBy: { 員工工號: 'GV112001', 員工姓名: '蔣佳緯' },
    tags: [{ id: 3, name: 'Docker' }, { id: 5, name: 'SOP' }, { id: 8, name: '部署' }],
    directories: ['dir-2'],
    attachmentIds: [201],
    editorIds: ['S094009', 'GV112001'],
    versionNumber: 7,
  },
  {
    id: 102,
    title: 'CSS 命名規範',
    content: '# CSS 命名規範\n\n使用 BEM 命名法：\n\n`.block__element--modifier`\n',
    isPublished: true,
    isPublic: false,
    createdAt: '2026-04-11T09:00:00Z',
    updatedAt: '2026-04-11T09:00:00Z',
    createdBy: { 員工工號: 'GV112001', 員工姓名: '蔣佳緯' },
    updatedBy: { 員工工號: 'GV112001', 員工姓名: '蔣佳緯' },
    tags: [{ id: 4, name: '規範' }],
    directories: ['dir-1-1'],
    attachmentIds: [],
    editorIds: [],
    versionNumber: 1,
  },
  {
    id: 103,
    title: 'Node.js 最佳實踐',
    content: '# Node.js 最佳實踐\n\n- 優先使用 async/await\n- 善用 error handling middleware\n',
    isPublished: true,
    isPublic: false,
    createdAt: '2026-04-12T09:00:00Z',
    updatedAt: '2026-04-12T09:00:00Z',
    createdBy: { 員工工號: 'GV112001', 員工姓名: '蔣佳緯' },
    updatedBy: { 員工工號: 'GV112001', 員工姓名: '蔣佳緯' },
    tags: [{ id: 2, name: 'Node.js' }],
    directories: ['dir-1-2'],
    attachmentIds: [],
    editorIds: [],
    versionNumber: 1,
  },
  {
    id: 201,
    title: '漿料配方說明',
    content: '# 漿料配方說明\n\n機密配方內容...\n',
    isPublished: true,
    isPublic: true,
    createdAt: '2026-04-13T09:00:00Z',
    updatedAt: '2026-04-13T09:00:00Z',
    createdBy: { 員工工號: 'GV112010', 員工姓名: '王雅婷' },
    updatedBy: { 員工工號: 'GV112010', 員工姓名: '王雅婷' },
    tags: [{ id: 6, name: '製程' }],
    directories: ['dir-3'],
    attachmentIds: [],
    editorIds: [],
    versionNumber: 1,
  },
  {
    id: 999,
    title: '舊版部署文件（已下架）',
    content: '# 舊版部署文件\n\n這份文件已經過期，請參考新版 SOP。\n',
    isPublished: false,
    isPublic: false,
    createdAt: '2025-01-01T09:00:00Z',
    updatedAt: '2025-01-01T09:00:00Z',
    createdBy: { 員工工號: 'GV112001', 員工姓名: '蔣佳緯' },
    updatedBy: { 員工工號: 'GV112001', 員工姓名: '蔣佳緯' },
    tags: [],
    directories: ['dir-trash-s1800'],
    attachmentIds: [],
    editorIds: [],
    versionNumber: 1,
  },
]

// ── 附件列表
export const mockAttachments = [
  {
    id: 201,
    description: '2026 年 Q1 伺服器清冊，包含主機 IP、規格、負責人資訊。',
    files: [
      { uuid: 'f1a2b3c4', name: '伺服器清冊 Q1 2026.xlsx', size: 45678, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', url: '/uploads/demo/伺服器清冊Q1_2026.xlsx' },
    ],
    isPublished: true,
    isPublic: false,
    createdAt: '2026-04-01T08:00:00Z',
    updatedAt: '2026-04-20T16:00:00Z',
    createdBy: { 員工工號: 'GV112001', 員工姓名: '蔣佳緯' },
    tags: [{ id: 3, name: 'Docker' }],
    directories: ['dir-2'],
    linkedArticleIds: [104],
    editorIds: ['GV112001', 'S094009'],
    versionNumber: 2,
  },
]

// ── 通知列表
export const mockNotifications = [
  {
    id: 1,
    articleId: 104,
    articleTitle: 'Docker 部署 SOP',
    mentionedBy: { 員工工號: 'GV112002', 員工姓名: '陳志豪' },
    commentPreview: '@蔣佳緯 請確認步驟 3 的環境變數設定是否需要更新...',
    commentId: 55,
    isRead: false,
    createdAt: '2026-05-10T14:22:00Z',
  },
  {
    id: 2,
    articleId: 101,
    articleTitle: 'Vue 3 Coding Style',
    mentionedBy: { 員工工號: 'S094009', 員工姓名: '鄭智寬' },
    commentPreview: '@蔣佳緯 這份文件可以加上 Pinia 的範例嗎？',
    commentId: 48,
    isRead: false,
    createdAt: '2026-05-09T10:05:00Z',
  },
  {
    id: 3,
    articleId: 101,
    articleTitle: 'Vue 3 Coding Style',
    mentionedBy: { 員工工號: 'GV112010', 員工姓名: '王雅婷' },
    commentPreview: '@蔣佳緯 感謝你整理這份文件，非常清楚！',
    commentId: 42,
    isRead: true,
    createdAt: '2026-05-01T09:30:00Z',
  },
  {
    id: 4,
    articleId: 104,
    articleTitle: 'Docker 部署 SOP',
    mentionedBy: { 員工工號: 'GV112015', 員工姓名: '林建宏' },
    commentPreview: '@蔣佳緯 我在步驟 2 遇到了問題，`.env` 範本缺少 REDIS_HOST 欄位。',
    commentId: 38,
    isRead: true,
    createdAt: '2026-04-28T16:45:00Z',
  },
]

// ── 評論列表（依 articleId）
export const mockComments = {
  104: [
    { id: 38, articleId: 104, author: { 員工工號: 'GV112015', 員工姓名: '林建宏' }, content: '@蔣佳緯 我在步驟 2 遇到了問題，`.env` 範本缺少 REDIS_HOST 欄位。', createdAt: '2026-04-28T16:45:00Z' },
    { id: 48, articleId: 104, author: { 員工工號: 'S094009', 員工姓名: '鄭智寬' }, content: '已確認，會在下次更新補上，謝謝回報！', createdAt: '2026-04-29T09:00:00Z' },
    { id: 55, articleId: 104, author: { 員工工號: 'GV112002', 員工姓名: '陳志豪' }, content: '@蔣佳緯 請確認步驟 3 的環境變數設定是否需要更新。', createdAt: '2026-05-10T14:22:00Z' },
  ],
  101: [
    { id: 42, articleId: 101, author: { 員工工號: 'GV112010', 員工姓名: '王雅婷' }, content: '@蔣佳緯 感謝你整理這份文件，非常清楚！', createdAt: '2026-05-01T09:30:00Z' },
    { id: 48, articleId: 101, author: { 員工工號: 'S094009', 員工姓名: '鄭智寬' }, content: '@蔣佳緯 這份文件可以加上 Pinia 的範例嗎？', createdAt: '2026-05-09T10:05:00Z' },
  ],
}

// ── 版本歷史（依 articleId）
export const mockVersionHistory = {
  101: [
    { versionNumber: 3, editorId: 'GV112001', editorName: '蔣佳緯', savedAt: '2026-05-01T14:30:00Z', diffSummary: '補充 Props 定義章節', content: `# Vue 3 Coding Style\n\n## 命名規範\n\n元件名稱使用 **PascalCase**：\n\n\`\`\`vue\n<template>\n  <MyComponent />\n</template>\n\`\`\`\n\n## Composition API\n\n優先使用 \`<script setup>\` 語法糖：\n\n\`\`\`vue\n<script setup>\nimport { ref, computed } from 'vue'\nconst count = ref(0)\n</script>\n\`\`\`\n\n## Props 定義\n\n一律使用 \`defineProps\` 並標註型別。\n` },
    { versionNumber: 2, editorId: 'GV112002', editorName: '陳志豪', savedAt: '2026-04-20T11:00:00Z', diffSummary: '新增 Composition API 範例', content: `# Vue 3 Coding Style\n\n## 命名規範\n\n元件名稱使用 **PascalCase**：\n\n\`\`\`vue\n<template>\n  <MyComponent />\n</template>\n\`\`\`\n\n## Composition API\n\n優先使用 \`<script setup>\` 語法糖：\n\n\`\`\`vue\n<script setup>\nimport { ref, computed } from 'vue'\nconst count = ref(0)\n</script>\n\`\`\`\n` },
    { versionNumber: 1, editorId: 'GV112001', editorName: '蔣佳緯', savedAt: '2026-04-10T09:00:00Z', diffSummary: '初始版本建立', content: `# Vue 3 Coding Style\n\n## 命名規範\n\n元件名稱使用 **PascalCase**：\n\n\`\`\`vue\n<template>\n  <MyComponent />\n</template>\n\`\`\`\n` },
  ],
  104: [
    { versionNumber: 7, editorId: 'GV112001', editorName: '蔣佳緯', savedAt: '2026-05-05T09:00:00Z', diffSummary: '更新 Docker Compose v2 說明', content: `# Docker 部署 SOP\n\n## 前置作業\n\n確認伺服器已安裝 Docker Engine >= 24.x 及 Docker Compose v2。\n\n## 步驟\n\n1. Clone 專案至伺服器\n2. 複製 \`.env.example\` 為 \`.env\` 並填寫設定\n3. 執行 \`docker compose up -d\`\n\n\`\`\`bash\ngit clone https://github.com/gigasolar/kb.git\ncd kb\ncp .env.example .env\ndocker compose up -d\n\`\`\`\n` },
    { versionNumber: 6, editorId: 'S094009', editorName: '鄭智寬', savedAt: '2026-04-18T10:00:00Z', diffSummary: '補充備份策略章節', content: `# Docker 部署 SOP\n\n## 前置作業\n\n確認伺服器已安裝 Docker Engine >= 24.x 及 Docker Compose v2。\n\n## 備份策略\n\n請定時使用 crontab 備份 DB...\n\n## 步驟\n\n1. Clone 專案至伺服器\n2. 執行 \`docker compose up -d\`\n` },
    { versionNumber: 5, editorId: 'GV112001', editorName: '蔣佳緯', savedAt: '2026-04-05T14:00:00Z', diffSummary: '修正環境變數清單', content: `# Docker 部署 SOP\n\n## 前置作業\n\n確認伺服器已安裝 Docker Engine >= 24.x 及 Docker Compose v2。\n` },
  ],
}
