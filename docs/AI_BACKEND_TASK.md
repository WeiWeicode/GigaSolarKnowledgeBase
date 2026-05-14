# AI 後端實作任務書
# GigaSolar Knowledge Base — Backend

> 本文件供 AI 逐步實作後端使用。
> **技術棧：Node.js + Express + Sequelize（KB DB）+ 原生 mssql（NaNa DB）**
> 請依照任務編號順序執行，每完成一個任務後回報結果再繼續下一個。

---

## 專案概覽

```
backend/
├── src/
│   ├── config/
│   │   ├── db.js          ← Sequelize 實例（KB DB）+ mssql pool（NaNa DB）
│   │   └── sequelize.js   ← Sequelize 設定與初始化
│   ├── models/            ← Sequelize Model 定義（KB DB）
│   │   ├── index.js       ← 統一匯出 + 建立 associations
│   │   ├── UserToken.js
│   │   ├── Tag.js
│   │   ├── Article.js
│   │   ├── ArticleVersionHistory.js
│   │   ├── ArticleTag.js
│   │   ├── ArticleEditor.js
│   │   ├── Attachment.js
│   │   ├── AttachmentFile.js
│   │   ├── AttachmentVersionHistory.js
│   │   ├── AttachmentTag.js
│   │   ├── AttachmentEditor.js
│   │   ├── ArticleAttachment.js
│   │   ├── Directory.js
│   │   ├── Comment.js
│   │   ├── CommentRead.js
│   │   └── Notification.js
│   ├── services/
│   │   ├── nanaService.js ← NaNa DB 原生 mssql（唯讀，不用 Sequelize）
│   │   └── bpmService.js  ← BPM HTTP API
│   ├── middlewares/
│   │   └── auth.js        ← token 驗證
│   ├── controllers/       ← 業務邏輯（呼叫 models + services）
│   ├── routes/            ← Express 路由
│   ├── helpers/
│   │   ├── accessHelper.js ← canAccess 權限判斷
│   │   └── treeHelper.js   ← buildTree 平面→巢狀
│   └── index.js
├── .env
└── package.json
```

---

## 分層架構說明

| 層 | 目錄 | 職責 | 使用技術 |
|----|------|------|----------|
| **Model** | `models/` | KB DB CRUD，Sequelize Model 定義 | Sequelize + tedious |
| **Service** | `services/` | 外部系統：NaNa DB（原生 SQL）、BPM（axios） | mssql、axios |
| **Controller** | `controllers/` | 業務邏輯，呼叫 model/service，組裝回應 | — |
| **Route** | `routes/` | URL 對應 controller，掛 middleware | Express Router |
| **Helper** | `helpers/` | 純函式工具，無 DB 呼叫 | — |

> **NaNa DB 繼續使用原生 mssql**，不納入 Sequelize（唯讀外部系統，schema 不屬於本專案）。

---

## 環境變數（.env）

```env
PORT=5155
NODE_ENV=development

# ── KB DB（Sequelize 連線）──────────────────
KB_DB_HOST=10.10.130.220
KB_DB_PORT=1433
KB_DB_NAME=KnowledgeBase
KB_DB_USER=sa
KB_DB_PASS=@!5984455

# ── NaNa DB（原生 mssql，唯讀）──────────────
NANA_DB_HOST=10.10.130.190
NANA_DB_PORT=1433
NANA_DB_NAME=NaNa
NANA_DB_USER=sa
NANA_DB_PASS=Sql#dsc2022

# ── BPM 登入系統 ─────────────────────────────
BPM_LOGIN_URL=http://10.10.130.122:5123/v1/api/auth/login/ad
BPM_ADSERVER=碩禾_新

# ── 上傳路徑 ─────────────────────────────────
UPLOAD_DIR=./uploads
```

---

## TASK-01｜專案初始化與資料庫連線
> ✅ 已完成

---

## TASK-02｜Auth Middleware + BPM 登入
> ✅ 已完成

### 完成的檔案
- `src/middlewares/auth.js`
- `src/services/nanaService.js`（原生 mssql）
- `src/services/bpmService.js`
- `src/controllers/authController.js`
- `src/routes/auth.js`

---

## TASK-03｜Sequelize 設定與 Model 定義

### 目標
建立 Sequelize 連線、定義所有 KB DB Model、建立 associations、sync 資料表。

### 3.1 安裝套件

```bash
npm install sequelize tedious
```

> `tedious` 是 Sequelize 連接 MS SQL Server 的驅動（`dialect: 'mssql'`）。

---

### 3.2 建立 `src/config/sequelize.js`

```js
const { Sequelize } = require('sequelize')

const sequelize = new Sequelize(
  process.env.KB_DB_NAME,
  process.env.KB_DB_USER,
  process.env.KB_DB_PASS,
  {
    host:    process.env.KB_DB_HOST,
    port:    parseInt(process.env.KB_DB_PORT || '1433'),
    dialect: 'mssql',
    dialectOptions: {
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
    },
    pool: { max: 10, min: 0, idle: 30000 },
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
  }
)

module.exports = sequelize
```

---

### 3.3 Model 定義規範

- 所有 Model 使用 `Model.init(attributes, options)`
- `tableName` 手動指定（snake_case），`timestamps: false`（時間欄位手動定義）
- `underscored: true`（JS camelCase ↔ DB snake_case 自動對應）
- 中文欄位名稱（如 `員工工號`）只出現在 `nanaService` 回傳物件，Model 欄位一律用英文

---

### 3.4 建立各 Model

#### `src/models/Tag.js`
```js
// 欄位：id (AUTO), name, created_at
// 唯一限制：name UNIQUE
```

#### `src/models/Article.js`
```js
// 欄位：id (AUTO), title, content, is_published, is_public,
//       access_dept, access_members, access_level,
//       version_number (DEFAULT 1),
//       created_by, created_by_name, updated_by, updated_by_name,
//       created_at, updated_at
```

#### `src/models/ArticleVersionHistory.js`
```js
// 欄位：id (AUTO), article_id (FK), version_number,
//       content, diff_summary, editor_id, editor_name, saved_at
```

#### `src/models/ArticleTag.js`（中間表）
```js
// 欄位：article_id (FK), tag_id (FK)
// 複合 PK，無額外欄位
```

#### `src/models/ArticleEditor.js`（中間表）
```js
// 欄位：article_id (FK), editor_account
```

#### `src/models/Attachment.js`
```js
// 欄位：id (AUTO), title, description, is_published, is_public,
//       access_dept, access_members, access_level,
//       version_number (DEFAULT 1),
//       created_by, created_by_name, updated_by, updated_by_name,
//       created_at, updated_at
```

#### `src/models/AttachmentFile.js`
```js
// 欄位：id (AUTO), attachment_id (FK), uuid (UNIQUE),
//       name, size, mime_type, storage_path, url,
//       version_number, created_at
```

#### `src/models/AttachmentVersionHistory.js`
```js
// 欄位：id (AUTO), attachment_id (FK), version_number,
//       diff_summary, editor_id, editor_name, saved_at
```

#### `src/models/AttachmentTag.js`（中間表）
```js
// 欄位：attachment_id (FK), tag_id (FK)
```

#### `src/models/AttachmentEditor.js`（中間表）
```js
// 欄位：attachment_id (FK), editor_account
```

#### `src/models/ArticleAttachment.js`（中間表）
```js
// 欄位：article_id (FK), attachment_id (FK)
```

#### `src/models/Directory.js`
```js
// 欄位：id (STRING PK 非 AUTO), parent_id (FK self),
//       type, label, sort_order,
//       org_oid, dept_code, article_id (FK), attachment_id (FK), is_public,
//       created_at, updated_at
// ENUM check: type IN ('company','department','directory','article','attachment','trash')
```

#### `src/models/Comment.js`
```js
// 欄位：id (AUTO), article_id (FK), author_account, author_name,
//       content, mentions (TEXT, 存 JSON 字串), created_at
```

#### `src/models/CommentRead.js`（中間表）
```js
// 欄位：comment_id (FK), account
// 複合 PK
```

#### `src/models/Notification.js`
```js
// 欄位：id (AUTO), target_account, article_id (FK),
//       article_title, mentioned_by_account, mentioned_by_name,
//       comment_id (FK), comment_preview, is_read (DEFAULT false),
//       created_at
```

#### `src/models/UserToken.js`
```js
// 欄位：id (AUTO), account, token (TEXT), token_hash (UNIQUE),
//       login_at, expires_at, ip_address, is_revoked (DEFAULT false), created_at
```

---

### 3.5 建立 `src/models/index.js`（統一 associations）

```js
const sequelize = require('../config/sequelize')

// 載入所有 model
const Tag                    = require('./Tag')
const Article                = require('./Article')
const ArticleVersionHistory  = require('./ArticleVersionHistory')
const ArticleTag             = require('./ArticleTag')
const ArticleEditor          = require('./ArticleEditor')
const Attachment             = require('./Attachment')
const AttachmentFile         = require('./AttachmentFile')
const AttachmentVersionHistory = require('./AttachmentVersionHistory')
const AttachmentTag          = require('./AttachmentTag')
const AttachmentEditor       = require('./AttachmentEditor')
const ArticleAttachment      = require('./ArticleAttachment')
const Directory              = require('./Directory')
const Comment                = require('./Comment')
const CommentRead            = require('./CommentRead')
const Notification           = require('./Notification')
const UserToken              = require('./UserToken')

// ── Associations ──────────────────────────────────────────

// Article ↔ Tag（N:M）
Article.belongsToMany(Tag, { through: ArticleTag, foreignKey: 'article_id', otherKey: 'tag_id' })
Tag.belongsToMany(Article, { through: ArticleTag, foreignKey: 'tag_id', otherKey: 'article_id' })

// Article → ArticleEditor（1:N）
Article.hasMany(ArticleEditor, { foreignKey: 'article_id' })
ArticleEditor.belongsTo(Article, { foreignKey: 'article_id' })

// Article → ArticleVersionHistory（1:N）
Article.hasMany(ArticleVersionHistory, { foreignKey: 'article_id' })
ArticleVersionHistory.belongsTo(Article, { foreignKey: 'article_id' })

// Article ↔ Attachment（N:M）
Article.belongsToMany(Attachment, { through: ArticleAttachment, foreignKey: 'article_id', otherKey: 'attachment_id' })
Attachment.belongsToMany(Article, { through: ArticleAttachment, foreignKey: 'attachment_id', otherKey: 'article_id' })

// Attachment ↔ Tag（N:M）
Attachment.belongsToMany(Tag, { through: AttachmentTag, foreignKey: 'attachment_id', otherKey: 'tag_id' })
Tag.belongsToMany(Attachment, { through: AttachmentTag, foreignKey: 'tag_id', otherKey: 'attachment_id' })

// Attachment → AttachmentFile（1:N）
Attachment.hasMany(AttachmentFile, { foreignKey: 'attachment_id' })
AttachmentFile.belongsTo(Attachment, { foreignKey: 'attachment_id' })

// Attachment → AttachmentEditor（1:N）
Attachment.hasMany(AttachmentEditor, { foreignKey: 'attachment_id' })
AttachmentEditor.belongsTo(Attachment, { foreignKey: 'attachment_id' })

// Attachment → AttachmentVersionHistory（1:N）
Attachment.hasMany(AttachmentVersionHistory, { foreignKey: 'attachment_id' })
AttachmentVersionHistory.belongsTo(Attachment, { foreignKey: 'attachment_id' })

// Directory 自我參照（巢狀樹）
Directory.hasMany(Directory, { foreignKey: 'parent_id', as: 'children' })
Directory.belongsTo(Directory, { foreignKey: 'parent_id', as: 'parent' })

// Directory → Article / Attachment（捷徑節點）
Directory.belongsTo(Article, { foreignKey: 'article_id' })
Directory.belongsTo(Attachment, { foreignKey: 'attachment_id' })

// Article → Comment（1:N）
Article.hasMany(Comment, { foreignKey: 'article_id' })
Comment.belongsTo(Article, { foreignKey: 'article_id' })

// Comment → CommentRead（1:N）
Comment.hasMany(CommentRead, { foreignKey: 'comment_id' })
CommentRead.belongsTo(Comment, { foreignKey: 'comment_id' })

// Article → Notification（1:N）
Article.hasMany(Notification, { foreignKey: 'article_id' })
Comment.hasMany(Notification, { foreignKey: 'comment_id' })

module.exports = {
  sequelize,
  Tag, Article, ArticleVersionHistory, ArticleTag, ArticleEditor,
  Attachment, AttachmentFile, AttachmentVersionHistory, AttachmentTag,
  AttachmentEditor, ArticleAttachment,
  Directory, Comment, CommentRead, Notification, UserToken,
}
```

---

### 3.6 Sync 資料表

在 `src/index.js` 啟動時執行：

```js
const { sequelize } = require('./models')

// alter: true → 新增欄位但不刪除既有欄位（開發用）
// force: false → 不刪表重建
await sequelize.sync({ alter: true })
console.log('✅ Sequelize sync 完成')
```

> 生產環境建議改用 `sequelize-cli` migration，開發期間用 `alter: true` 即可。

---

## TASK-04｜Auth 路由
> ✅ 已完成

`authController.js` 中 `UserToken` 的 INSERT / UPDATE 改用 Sequelize：

```js
const { UserToken } = require('../models')

// 寫入 token
await UserToken.create({ account, token, tokenHash, loginAt, expiresAt, ipAddress })

// 登出撤銷
await UserToken.update({ isRevoked: true }, { where: { tokenHash } })
```

`auth middleware` 驗證查詢也改用 Sequelize：

```js
const record = await UserToken.findOne({
  where: { tokenHash, isRevoked: false },
  where: sequelize.literal('expires_at > GETDATE()'),
})
```

---

## TASK-05｜Meta 路由（公司 / 部門）

### 建立檔案
- `src/controllers/metaController.js`
- `src/routes/meta.js`

> SQL 封裝在 `nanaService`（原生 mssql），controller 直接呼叫，無需 Sequelize。

---

## TASK-06｜Colleague 路由

### 建立檔案
- `src/controllers/colleagueController.js`
- `src/routes/colleagues.js`

> 同上，呼叫 `nanaService.getAllColleagues()`。

---

## TASK-07｜Tag 路由

### 建立檔案
- `src/controllers/tagController.js`
- `src/routes/tags.js`

### Controller 使用 Sequelize

```js
const { Tag } = require('../models')

// GET /api/tags
const tags = await Tag.findAll({ order: [['id', 'ASC']] })

// POST /api/tags
const tag = await Tag.create({ name })
```

---

## TASK-08｜Directory 路由

### 建立檔案
- `src/helpers/treeHelper.js`
- `src/helpers/accessHelper.js`
- `src/controllers/directoryController.js`
- `src/routes/directories.js`

### Controller 使用 Sequelize

```js
const { Directory } = require('../models')

// 查詢部門節點（平面，由 treeHelper.buildTree 組裝巢狀）
const rows = await Directory.findAll({
  where: { dept_code: deptCode },
  order: [['sort_order', 'ASC']],
})

// 新增 directory 節點
await Directory.create({ id, parentId, type: 'directory', label, sortOrder })

// 重命名
await Directory.update({ label }, { where: { id } })

// 移動（更換父節點）
await Directory.update({ parentId: newParentId }, { where: { id: draggingId } })

// 重算 sortOrder（同層 directory 節點）
const siblings = await Directory.findAll({
  where: { parentId, type: 'directory' },
  order: [['sort_order', 'ASC']],
})
for (let i = 0; i < siblings.length; i++) {
  await siblings[i].update({ sortOrder: i + 1 })
}
```

### helpers/accessHelper.js

```js
function canAccess(user, resource) {
  if (resource.isPublic)              return true
  if (user.role === 'ADMIN')          return true
  if (user.部門代碼 === resource.accessDept) return true

  const members = JSON.parse(resource.accessMembers || '[]')
  if (members.includes(user.員工工號))     return true

  if (resource.accessLevel != null && user.級職 <= resource.accessLevel) return true

  return false
}
module.exports = { canAccess }
```

---

## TASK-09｜Article 路由

### 建立檔案
- `src/controllers/articleController.js`
- `src/routes/articles.js`

### Controller 使用 Sequelize

```js
const {
  Article, Tag, ArticleEditor, ArticleVersionHistory,
  ArticleAttachment, Directory, sequelize,
} = require('../models')

// ── 查詢所有文章（含 tags、editors）──────────────────────
const articles = await Article.findAll({
  include: [
    { model: Tag, through: { attributes: [] } },
    { model: ArticleEditor, attributes: ['editorAccount'] },
  ],
})

// ── 查詢單篇 ─────────────────────────────────────────────
const article = await Article.findByPk(id, {
  include: [Tag, ArticleEditor],
})

// ── 全文搜尋 ─────────────────────────────────────────────
const { Op } = require('sequelize')
await Article.findAll({
  where: {
    isPublished: true,
    [Op.or]: [
      { title:   { [Op.like]: `%${keyword}%` } },
      { content: { [Op.like]: `%${keyword}%` } },
    ],
  },
  include: [{ model: Tag, through: { attributes: [] } }],
})

// ── 新增文章（Transaction）───────────────────────────────
const t = await sequelize.transaction()
try {
  const article = await Article.create({ title, content, ... }, { transaction: t })
  await article.setTags(tagIds, { transaction: t })                 // N:M 自動管理
  await ArticleEditor.bulkCreate(
    editorIds.map(e => ({ articleId: article.id, editorAccount: e })),
    { transaction: t }
  )
  await article.setAttachments(attachmentIds, { transaction: t })   // N:M 自動管理
  // 建立 directory 捷徑節點
  for (const dirId of directories) {
    await Directory.create({
      id: `art-${article.id}-${dirId}`, parentId: dirId,
      type: 'article', label: title, articleId: article.id, isPublic,
    }, { transaction: t })
  }
  await t.commit()
} catch (err) {
  await t.rollback()
  throw err
}

// ── 更新文章（Transaction）───────────────────────────────
const t = await sequelize.transaction()
try {
  const old = await Article.findByPk(id, { transaction: t })
  const newVer = old.versionNumber + 1
  // 寫版本快照
  await ArticleVersionHistory.create({
    articleId: id, versionNumber: newVer,
    content: old.content, diffSummary: changeNote,
    editorId: req.user.員工工號, editorName: req.user.員工姓名,
  }, { transaction: t })
  // 更新主表
  await old.update({ ...fields, versionNumber: newVer }, { transaction: t })
  // 重設關聯
  await old.setTags(tagIds, { transaction: t })
  await ArticleEditor.destroy({ where: { articleId: id }, transaction: t })
  await ArticleEditor.bulkCreate(
    editorIds.map(e => ({ articleId: id, editorAccount: e })),
    { transaction: t }
  )
  await old.setAttachments(attachmentIds, { transaction: t })
  await t.commit()
} catch (err) {
  await t.rollback()
  throw err
}
```

---

## TASK-10｜Attachment 路由

### 建立檔案
- `src/controllers/attachmentController.js`
- `src/routes/attachments.js`

### Controller 使用 Sequelize

```js
const {
  Attachment, AttachmentFile, Tag, AttachmentEditor,
  AttachmentVersionHistory, ArticleAttachment, Directory, sequelize,
} = require('../models')

// ── 新增附件包（Transaction）─────────────────────────────
const t = await sequelize.transaction()
try {
  const att = await Attachment.create({ title, description, ... }, { transaction: t })
  await AttachmentFile.bulkCreate(
    files.map(f => ({ ...f, attachmentId: att.id, versionNumber: 1 })),
    { transaction: t }
  )
  await att.setTags(tagIds, { transaction: t })
  await AttachmentEditor.bulkCreate(...)
  await att.setArticles(linkedArticleIds, { transaction: t })
  // directory 捷徑節點
  await t.commit()
} catch (err) {
  await t.rollback(); throw err
}

// ── 更新附件包（Transaction）─────────────────────────────
const t = await sequelize.transaction()
try {
  const old = await Attachment.findByPk(id, { transaction: t })
  const newVer = old.versionNumber + 1
  await AttachmentVersionHistory.create({ ... }, { transaction: t })
  // 新上傳檔案打版本號
  const newFiles = files.filter(f => !f.versionNumber)
  if (newFiles.length) {
    await AttachmentFile.bulkCreate(
      newFiles.map(f => ({ ...f, attachmentId: id, versionNumber: newVer })),
      { transaction: t }
    )
  }
  await old.update({ ...fields, versionNumber: newVer }, { transaction: t })
  await att.setTags(tagIds, { transaction: t })
  await att.setArticles(linkedArticleIds, { transaction: t })
  await t.commit()
} catch (err) {
  await t.rollback(); throw err
}
```

---

## TASK-11｜Comment 路由

### 建立檔案
- `src/controllers/commentController.js`
- `src/routes/comments.js`

### Controller 使用 Sequelize

```js
const { Comment, CommentRead, Notification, Article, sequelize } = require('../models')

// ── 查詢留言（含已讀狀態）────────────────────────────────
const comments = await Comment.findAll({
  where: { articleId },
  include: [{ model: CommentRead, attributes: ['account'] }],
  order: [['createdAt', 'ASC']],
})
// 組裝 isRead: { [account]: true }
const result = comments.map(c => ({
  ...c.toJSON(),
  isRead: Object.fromEntries(c.CommentReads.map(r => [r.account, true]))
}))

// ── 新增留言 + 通知（Transaction）────────────────────────
const t = await sequelize.transaction()
try {
  const mentions = [...content.matchAll(/@([A-Za-z0-9]+)/g)].map(m => m[1])
  const comment  = await Comment.create({
    articleId, authorAccount, authorName, content,
    mentions: JSON.stringify(mentions),
  }, { transaction: t })
  // 自動已讀（作者）
  await CommentRead.create({ commentId: comment.id, account: authorAccount }, { transaction: t })
  // 產生 Mention 通知
  if (mentions.length) {
    const article = await Article.findByPk(articleId, { transaction: t })
    await Notification.bulkCreate(
      mentions.map(acc => ({
        targetAccount: acc, articleId, articleTitle: article.title,
        mentionedByAccount: authorAccount, mentionedByName: authorName,
        commentId: comment.id,
        commentPreview: content.substring(0, 100),
      })),
      { transaction: t }
    )
  }
  await t.commit()
  res.json(comment)
} catch (err) {
  await t.rollback(); throw err
}

// ── 標記已讀（findOrCreate，避免重複）────────────────────
await CommentRead.findOrCreate({
  where: { commentId, account },
  defaults: { commentId, account },
})
```

---

## TASK-12｜Notification 路由

### 建立檔案
- `src/controllers/notificationController.js`
- `src/routes/notifications.js`

### Controller 使用 Sequelize

```js
const { Notification, CommentRead } = require('../models')

// GET /api/notifications
const notifications = await Notification.findAll({
  where: { targetAccount: req.user.員工工號 },
  order: [['createdAt', 'DESC']],
})

// PATCH /api/notifications/:id/read
const notif = await Notification.findByPk(id)
await notif.update({ isRead: true })
// 同步留言已讀
await CommentRead.findOrCreate({
  where: { commentId: notif.commentId, account: req.user.員工工號 },
})
```

---

## TASK-13｜Version 路由

### 建立檔案
- `src/controllers/versionController.js`
- `src/routes/versions.js`

### Controller 使用 Sequelize

```js
const { ArticleVersionHistory, AttachmentVersionHistory, Article, sequelize } = require('../models')

// 查詢文章版本
await ArticleVersionHistory.findAll({
  where: { articleId },
  order: [['versionNumber', 'DESC']],
})

// 回滾（Transaction）
const t = await sequelize.transaction()
try {
  const ver     = await ArticleVersionHistory.findOne({ where: { articleId, versionNumber }, transaction: t })
  const article = await Article.findByPk(articleId, { transaction: t })
  const newVer  = article.versionNumber + 1
  await ArticleVersionHistory.create({
    articleId, versionNumber: newVer, content: ver.content,
    diffSummary: `回滾至版本 ${versionNumber}`,
    editorId: req.user.員工工號, editorName: req.user.員工姓名,
  }, { transaction: t })
  await article.update({ content: ver.content, versionNumber: newVer }, { transaction: t })
  await t.commit()
  res.json({ success: true, newVersionNumber: newVer })
} catch (err) {
  await t.rollback(); throw err
}
```

---

## TASK-14｜靜態檔案服務

```js
app.use('/uploads', express.static(process.env.UPLOAD_DIR))
```

---

## TASK-15｜錯誤處理與收尾

```js
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '伺服器內部錯誤',
  })
})
```

### 路由掛載確認清單

```
/api/auth          ← TASK-02 ✅
/api/meta          ← TASK-05
/api/colleagues    ← TASK-06
/api/tags          ← TASK-07
/api/directories   ← TASK-08
/api/articles      ← TASK-09（含 comments、versions 子路由）
/api/attachments   ← TASK-10（含 versions 子路由）
/api/notifications ← TASK-12
```

---

## 任務執行順序總覽

| # | 任務 | 關鍵新增 | 狀態 |
|---|------|----------|------|
| TASK-01 | 專案初始化、DB 連線 | `config/db.js`、`index.js` | ✅ |
| TASK-02 | Auth Middleware + BPM 登入 | `middlewares/auth.js`、`services/*`、`controllers/authController.js` | ✅ |
| TASK-03 | Sequelize 設定 + 全部 Model 定義 + sync | `config/sequelize.js`、`models/*.js`、`models/index.js` | — |
| TASK-05 | Meta 路由 | `controllers/metaController.js` | ✅ |
| TASK-06 | Colleague 路由 | `controllers/colleagueController.js` | ✅ |
| TASK-07 | Tag 路由 | `controllers/tagController.js` | ✅ |
| TASK-08 | Directory 路由 | `helpers/*`、`controllers/directoryController.js` | ✅ |
| TASK-09 | Article 路由（含 Transaction） | `controllers/articleController.js` | ✅ |
| TASK-10 | Attachment 路由（含 Transaction） | `controllers/attachmentController.js` | ✅ |
| TASK-11 | Comment + Notification 建立 | `controllers/commentController.js` | ✅ |
| TASK-12 | Notification 路由 | `controllers/notificationController.js` | ✅ |
| TASK-13 | Version 路由 + Rollback | `controllers/versionController.js` | ✅ |
| TASK-14 | 靜態檔案服務 | `index.js` 補一行 | — |
| TASK-15 | 錯誤處理收尾 | — | — |

---

## 完成後驗收清單

- [ ] `npm run dev` 啟動無錯誤，Sequelize sync 成功，NaNa DB 連線成功
- [ ] `POST /api/auth/login` 成功對接 BPM，token 寫入 `user_tokens`
- [ ] 未帶 token 呼叫 `GET /api/articles` 回傳 401
- [ ] 帶有效 token 呼叫 `GET /api/articles` 回傳文章列表
- [ ] hasAccess 無權限回傳 403
- [ ] MEMBER 角色無法呼叫目錄管理端點（403）
- [ ] 新增文章後 `GET /api/articles/:id` 可取回
- [ ] 更新文章自動產生 `article_version_history`
- [ ] 留言含 @工號 後 `notifications` 自動新增
- [ ] 前端 `USE_MOCK = false` 後功能正常運作
