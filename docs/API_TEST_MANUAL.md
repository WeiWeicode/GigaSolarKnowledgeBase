# API 測試手冊
# GigaSolar Knowledge Base — Backend

> Base URL：`http://localhost:5155/api/v1`
> 所有 🔐 端點需帶 `Authorization: Bearer {{token}}`

---

## 目錄

- [AI 前置任務（測試前必須完成）](#ai-前置任務測試前必須完成)
- [Postman 環境設定](#postman-環境設定)
- [測試順序與相依關係](#測試順序與相依關係)
- [T-01 健康檢查](#t-01-健康檢查)
- [T-02 Auth — 登入](#t-02-auth--登入)
- [T-03 Auth — 取得目前使用者](#t-03-auth--取得目前使用者)
- [T-04 Auth — 登出](#t-04-auth--登出)
- [T-05 Meta — 公司清單](#t-05-meta--公司清單)
- [T-06 Meta — 部門清單](#t-06-meta--部門清單)
- [T-07 Colleague — 同仁清單](#t-07-colleague--同仁清單)
- [T-08 Tag — 取得標籤](#t-08-tag--取得標籤)
- [T-09 Tag — 新增標籤](#t-09-tag--新增標籤)
- [T-10 Directory — 取得目錄樹](#t-10-directory--取得目錄樹)
- [T-11 Directory — 新增節點](#t-11-directory--新增節點)
- [T-12 Directory — 重命名節點](#t-12-directory--重命名節點)
- [T-13 Directory — 移動節點](#t-13-directory--移動節點)
- [T-14 Article — 取得列表](#t-14-article--取得列表)
- [T-15 Article — 搜尋](#t-15-article--搜尋)
- [T-16 Article — 新增](#t-16-article--新增)
- [T-17 Article — 取得單篇](#t-17-article--取得單篇)
- [T-18 Article — 更新](#t-18-article--更新)
- [T-19 Article — 圖片上傳](#t-19-article--圖片上傳)
- [T-20 Attachment — 上傳檔案](#t-20-attachment--上傳檔案)
- [T-21 Attachment — 新增附件包](#t-21-attachment--新增附件包)
- [T-22 Attachment — 取得列表](#t-22-attachment--取得列表)
- [T-23 Attachment — 取得單一](#t-23-attachment--取得單一)
- [T-24 Attachment — 更新](#t-24-attachment--更新)
- [T-25 Comment — 取得留言](#t-25-comment--取得留言)
- [T-26 Comment — 新增留言（含 Mention）](#t-26-comment--新增留言含-mention)
- [T-27 Notification — 取得通知](#t-27-notification--取得通知)
- [T-28 Notification — 標記已讀](#t-28-notification--標記已讀)
- [T-29 Notification — 全部已讀](#t-29-notification--全部已讀)
- [T-30 Version — 文章版本列表](#t-30-version--文章版本列表)
- [T-31 Version — 文章回滾](#t-31-version--文章回滾)
- [T-32 Version — 附件版本列表](#t-32-version--附件版本列表)
- [錯誤碼速查](#錯誤碼速查)

---

## AI 前置任務（測試前必須完成）

### 任務 A｜開啟所有路由（index.js）

`src/index.js` 目前只有 auth 路由掛上，其他都在註解。**取消所有 `//` 註解**：

```js
app.use(`${API}/auth`,          require('./routes/auth'));
app.use(`${API}/meta`,          require('./routes/meta'));
app.use(`${API}/colleagues`,    require('./routes/colleagues'));
app.use(`${API}/tags`,          require('./routes/tags'));
app.use(`${API}/directories`,   require('./routes/directories'));
app.use(`${API}/articles`,      require('./routes/articles'));
app.use(`${API}/attachments`,   require('./routes/attachments'));
app.use(`${API}/notifications`, require('./routes/notifications'));
```

---

### 任務 B｜新增靜態檔案服務（index.js）

在路由區塊之前加入：

```js
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads')));
```

---

### 任務 C｜確認 uuid 套件已安裝

`attachmentController.js` 使用 `uuid`，確認已安裝：

```bash
npm list uuid
# 若無 → npm install uuid
```

---

### 任務 D｜處理 comments_standalone.js 路由

`commentController.js` 有 `markCommentAsRead`（`PATCH /api/v1/comments/:id/read`），但目前 `comments.js` 路由沒有掛上。

在 `routes/comments_standalone.js` 確認並在 `index.js` 補上：

```js
app.use(`${API}/comments`, require('./routes/comments_standalone'));
```

`comments_standalone.js` 內容：
```js
const express = require('express');
const router  = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const commentController  = require('../controllers/commentController');

router.use(authMiddleware);
router.patch('/:id/read', commentController.markCommentAsRead);

module.exports = router;
```

---

### 任務 E｜驗收啟動

```bash
npm run dev
```

預期輸出（無錯誤）：
```
✅ KB DB 連線成功
✅ NaNa DB 連線成功
✅ Sequelize 連線驗證成功
✅ Server running on port 5155
```

---

## Postman 環境設定

| 變數 | 值 | 說明 |
|------|----|------|
| `base_url` | `http://localhost:5155/api/v1` | |
| `token` | *(登入後自動填入)* | |
| `article_id` | *(新增文章後填入)* | |
| `attachment_id` | *(新增附件後填入)* | |
| `comment_id` | *(新增留言後填入)* | |
| `notification_id` | *(取得通知後填入)* | |
| `org_oid` | *(從 T-05 回傳填入)* | |

**T-02 登入 Test Script（貼入 Postman Tests）：**
```javascript
const json = pm.response.json();
if (json.token) {
    pm.environment.set('token', json.token);
}
if (json.user?.組織OID) {
    pm.environment.set('org_oid', json.user.組織OID);
}
```

---

## 測試順序與相依關係

```
T-01 健康檢查
T-02 登入          → 取得 token、org_oid
T-03 取得使用者    → 需要 token
T-05 公司清單      → 需要 token
T-06 部門清單      → 需要 token + org_oid
T-07 同仁清單      → 需要 token
T-08 取得標籤      → 需要 token
T-09 新增標籤      → 需要 token（取得 tag_id 供後續用）
T-10 目錄樹        → 需要 token + dept_code
T-11 新增目錄      → 需要 token
T-16 新增文章      → 需要 token + tag_id（取得 article_id）
T-14 文章列表      → 需要 token
T-15 文章搜尋      → 需要 token
T-17 取得單篇      → 需要 token + article_id
T-18 更新文章      → 需要 token + article_id
T-19 圖片上傳      → 需要 token
T-20 上傳檔案      → 需要 token（取得 FileInfo）
T-21 新增附件包    → 需要 token + FileInfo（取得 attachment_id）
T-22 附件列表      → 需要 token
T-23 取得單一附件  → 需要 token + attachment_id
T-24 更新附件      → 需要 token + attachment_id
T-25 取得留言      → 需要 token + article_id
T-26 新增留言      → 需要 token + article_id（觸發 Notification）
T-27 取得通知      → 需要 token（被 Mention 的使用者）
T-28 標記已讀      → 需要 token + notification_id
T-29 全部已讀      → 需要 token
T-30 文章版本列表  → 需要 token + article_id（T-18 後才有版本）
T-31 文章回滾      → 需要 token + article_id + version_number
T-32 附件版本列表  → 需要 token + attachment_id
T-04 登出          → 需要 token（最後執行）
```

---

## T-01 健康檢查

```
GET {{base_url}}/../health
（實際路徑：http://localhost:5155/health）
```

**預期（200）**
```json
{ "success": true, "message": "Server is running", "timestamp": "..." }
```

- [ ] HTTP 200
- [ ] `success: true`

---

## T-02 Auth — 登入

```
POST {{base_url}}/auth/login
Content-Type: application/json

{
  "account": "S112009",
  "password": "Zxcv0359"
}
```

**預期（200）**
```json
{
  "success": true,
  "message": "登入成功",
  "token": "eyJhbGci...",
  "user": {
    "員工工號": "S112009",
    "員工姓名": "...",
    "部門代碼": "S...",
    "組織OID": "aae8e849...",
    "role": "MEMBER"
  }
}
```

- [ ] HTTP 200
- [ ] `token` 存在且格式為 JWT
- [ ] `user.員工工號` = `S112009`
- [ ] `user.role` 為 `MEMBER` 或 `MANAGER`
- [ ] **Postman Test Script 執行後** `{{token}}` 與 `{{org_oid}}` 有值

**錯誤情境**

| 情境 | Status | message |
|------|--------|---------|
| 密碼錯誤 | 401 | `帳號或密碼錯誤` |
| 缺少欄位 | 400 | `請提供 account 與 password` |

---

## T-03 Auth — 取得目前使用者

```
GET {{base_url}}/auth/me
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{ "success": true, "user": { "員工工號": "S112009", ... } }
```

- [ ] HTTP 200
- [ ] 員工資料完整（工號、姓名、部門、角色）

**錯誤情境**

| 情境 | Status | message |
|------|--------|---------|
| 無 header | 401 | `缺少 Authorization header` |
| 格式錯誤 | 401 | `Authorization 格式錯誤，應為 Bearer <token>` |
| 偽造 token | 401 | `Token 無效或已過期` |

---

## T-04 Auth — 登出

> ⚠️ 最後執行，登出後需重新登入才能繼續測試。

```
POST {{base_url}}/auth/logout
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{ "success": true, "message": "已登出" }
```

- [ ] HTTP 200
- [ ] 再次呼叫 `GET /auth/me` 回傳 401

---

## T-05 Meta — 公司清單

```
GET {{base_url}}/meta/companies
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{
  "success": true,
  "data": [
    { "組織OID": "aae8e849...", "組織名稱": "碩禾電子..." }
  ]
}
```

- [ ] HTTP 200
- [ ] `data` 為陣列，至少 1 筆
- [ ] 每筆有 `組織OID` 和 `組織名稱`
- [ ] 記錄 `組織OID` 存入 `{{org_oid}}`

---

## T-06 Meta — 部門清單

```
GET {{base_url}}/meta/departments?組織OID={{org_oid}}
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{
  "success": true,
  "data": [
    { "部門代碼": "S1800", "部門名稱": "..." }
  ]
}
```

- [ ] HTTP 200
- [ ] 所有 `部門代碼` 均以 `S` 開頭（metaController 有過濾邏輯）
- [ ] 記錄一筆 `部門代碼` 供 T-10 使用

**錯誤情境**

| 情境 | Status | message |
|------|--------|---------|
| 缺少 `組織OID` | 400 | `缺少組織OID參數` |

---

## T-07 Colleague — 同仁清單

```
GET {{base_url}}/colleagues
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{
  "success": true,
  "data": [
    { "員工工號": "S112009", "員工姓名": "...", "部門代碼": "...", "員工Mail": "..." }
  ]
}
```

- [ ] HTTP 200
- [ ] `data` 陣列不為空
- [ ] 每筆包含 `員工工號`、`員工姓名`、`部門代碼`、`員工Mail`

---

## T-08 Tag — 取得標籤

```
GET {{base_url}}/tags
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{ "success": true, "data": [] }
```

- [ ] HTTP 200
- [ ] `data` 為陣列（初始可為空）

---

## T-09 Tag — 新增標籤

```
POST {{base_url}}/tags
Authorization: Bearer {{token}}
Content-Type: application/json

{ "name": "測試標籤" }
```

**預期（201）**
```json
{ "success": true, "data": { "id": 1, "name": "測試標籤" } }
```

- [ ] HTTP 201
- [ ] `data.id` 存在（記錄為 `{{tag_id}}`）

**錯誤情境**

| 情境 | Status | message |
|------|--------|---------|
| 缺少 name | 400 | `標籤名稱為必填` |
| 重複名稱 | 400 | `標籤名稱已存在` |

---

## T-10 Directory — 取得目錄樹

```
GET {{base_url}}/directories?組織OID={{org_oid}}&部門代碼={{dept_code}}
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "type": "company",
      "label": "碩禾電子...",
      "children": [ ... ]
    }
  ]
}
```

- [ ] HTTP 200
- [ ] `data` 為巢狀樹狀陣列
- [ ] 節點包含 `id`、`type`、`label`、`children`

---

## T-11 Directory — 新增節點

```
POST {{base_url}}/directories
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "id": "dir-test-001",
  "parentId": "{{parent_dir_id}}",
  "label": "測試資料夾",
  "sortOrder": 1,
  "deptCode": "{{dept_code}}"
}
```

**預期（201）**
```json
{ "success": true, "data": { "id": "dir-test-001", "type": "directory", "label": "測試資料夾" } }
```

- [ ] HTTP 201
- [ ] 重新呼叫 T-10，確認新節點出現在樹中

**錯誤情境**

| 情境 | Status | message |
|------|--------|---------|
| 缺少 id 或 label | 400 | `ID 與標籤為必填` |

---

## T-12 Directory — 重命名節點

```
PATCH {{base_url}}/directories/dir-test-001/rename
Authorization: Bearer {{token}}
Content-Type: application/json

{ "label": "測試資料夾（已改名）" }
```

**預期（200）**
```json
{ "success": true, "data": { "id": "dir-test-001", "label": "測試資料夾（已改名）" } }
```

- [ ] HTTP 200
- [ ] 重新呼叫 T-10 確認名稱已更新

---

## T-13 Directory — 移動節點

```
PATCH {{base_url}}/directories/move
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "draggingId": "dir-test-001",
  "dropId": "{{another_dir_id}}",
  "dropType": "inner"
}
```

**預期（200）**
```json
{ "success": true, "message": "移動成功" }
```

- [ ] HTTP 200
- [ ] `dropType` 三種值（`before`、`after`、`inner`）各測一次

---

## T-14 Article — 取得列表

```
GET {{base_url}}/articles
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{ "success": true, "data": [] }
```

- [ ] HTTP 200
- [ ] `data` 為陣列（初始可為空）

---

## T-15 Article — 搜尋

```
GET {{base_url}}/articles/search?q=測試&tags={{tag_id}}
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{ "success": true, "data": [...] }
```

- [ ] HTTP 200
- [ ] 只回傳 `is_published: true` 的文章
- [ ] `q` 為空時回傳所有已發布文章

---

## T-16 Article — 新增

```
POST {{base_url}}/articles
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "title": "測試文章",
  "content": "# 標題\n\n這是測試內容。",
  "isPublished": true,
  "isPublic": false,
  "accessDept": "{{dept_code}}",
  "accessMembers": [],
  "accessLevel": 10,
  "tagIds": [{{tag_id}}],
  "editorAccounts": ["S112009"],
  "attachmentIds": [],
  "directoryIds": ["dir-test-001"]
}
```

**預期（201）**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "測試文章",
    "version_number": 1,
    ...
  }
}
```

- [ ] HTTP 201
- [ ] `data.id` 存在（記錄為 `{{article_id}}`）
- [ ] `version_number` = 1
- [ ] 重新呼叫 T-10，確認目錄節點出現文章捷徑

---

## T-17 Article — 取得單篇

```
GET {{base_url}}/articles/{{article_id}}
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "測試文章",
    "Tags": [...],
    "Editors": [...]
  }
}
```

- [ ] HTTP 200
- [ ] `Tags` 陣列包含 T-09 建立的標籤
- [ ] `Editors` 陣列包含 `editor_account: "S112009"`

**錯誤情境**

| 情境 | Status | message |
|------|--------|---------|
| 不存在的 id | 404 | `找不到該文章` |
| 無存取權限 | 403 | `您無權存取此文章` |

**指定版本（T-18 後才可測）**
```
GET {{base_url}}/articles/{{article_id}}?version=1
```
- [ ] `content` 為版本 1 的內容

---

## T-18 Article — 更新

```
PUT {{base_url}}/articles/{{article_id}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "title": "測試文章（已更新）",
  "content": "# 標題\n\n更新後的內容。",
  "isPublished": true,
  "isPublic": false,
  "accessDept": "{{dept_code}}",
  "accessMembers": [],
  "accessLevel": 10,
  "tagIds": [{{tag_id}}],
  "editorAccounts": ["S112009"],
  "attachmentIds": [],
  "directoryIds": ["dir-test-001"],
  "changeNote": "修改標題與內容"
}
```

**預期（200）**
```json
{
  "success": true,
  "data": {
    "title": "測試文章（已更新）",
    "version_number": 2
  }
}
```

- [ ] HTTP 200
- [ ] `version_number` = 2（自動遞增）
- [ ] 目錄捷徑節點 `label` 已同步更新

---

## T-19 Article — 圖片上傳

```
POST {{base_url}}/articles/upload-image
Authorization: Bearer {{token}}
Content-Type: multipart/form-data

image: [選擇一個 jpg/png/gif 檔案，欄位名稱為 image]
```

**預期（200）**
```json
{ "success": true, "url": "/uploads/images/1234567890-xxx.jpg" }
```

- [ ] HTTP 200
- [ ] `url` 存在
- [ ] 直接在瀏覽器開啟 `http://localhost:5155/uploads/images/...` 可看到圖片

**錯誤情境**

| 情境 | Status | message |
|------|--------|---------|
| 未上傳檔案 | 400 | `未上傳檔案` |
| 非圖片格式（如 .pdf） | 500 | Multer fileFilter 拒絕 |

---

## T-20 Attachment — 上傳檔案

```
POST {{base_url}}/attachments/upload
Authorization: Bearer {{token}}
Content-Type: multipart/form-data

files: [選擇一個或多個檔案，欄位名稱為 files]
```

**預期（200）**
```json
{
  "success": true,
  "data": [
    {
      "uuid": "xxxx-xxxx-xxxx",
      "name": "test.xlsx",
      "size": 12345,
      "mime_type": "application/vnd.openxmlformats...",
      "storage_path": "./uploads/attachments/xxx.xlsx",
      "url": "/uploads/attachments/xxx.xlsx"
    }
  ]
}
```

- [ ] HTTP 200
- [ ] `data` 陣列，每筆有 `uuid`、`name`、`url`
- [ ] 記錄整個 `data` 陣列供 T-21 使用

---

## T-21 Attachment — 新增附件包

```
POST {{base_url}}/attachments
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "title": "測試附件包",
  "description": "這是測試用的附件包",
  "isPublished": true,
  "isPublic": false,
  "accessDept": "{{dept_code}}",
  "accessMembers": [],
  "accessLevel": 10,
  "tagIds": [{{tag_id}}],
  "editorAccounts": ["S112009"],
  "articleIds": [{{article_id}}],
  "directoryIds": ["dir-test-001"],
  "files": [
    {
      "uuid": "{{file_uuid}}",
      "name": "test.xlsx",
      "size": 12345,
      "mime_type": "application/vnd.openxmlformats...",
      "storage_path": "./uploads/attachments/xxx.xlsx",
      "url": "/uploads/attachments/xxx.xlsx"
    }
  ]
}
```

**預期（201）**
```json
{
  "success": true,
  "data": { "id": 1, "title": "測試附件包", "version_number": 1 }
}
```

- [ ] HTTP 201
- [ ] `data.id` 存在（記錄為 `{{attachment_id}}`）
- [ ] 呼叫 `GET /articles/{{article_id}}` 確認 `Attachments` 關聯已建立

---

## T-22 Attachment — 取得列表

```
GET {{base_url}}/attachments
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{ "success": true, "data": [{ "id": 1, "title": "測試附件包", ... }] }
```

- [ ] HTTP 200
- [ ] T-21 建立的附件包出現在列表中

---

## T-23 Attachment — 取得單一

```
GET {{base_url}}/attachments/{{attachment_id}}
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "測試附件包",
    "Files": [{ "uuid": "...", "name": "test.xlsx", "url": "..." }],
    "Tags": [...],
    "Editors": [...]
  }
}
```

- [ ] HTTP 200
- [ ] `Files` 包含 T-20 上傳的檔案

---

## T-24 Attachment — 更新

```
PUT {{base_url}}/attachments/{{attachment_id}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "title": "測試附件包（已更新）",
  "description": "更新描述",
  "isPublished": true,
  "isPublic": false,
  "accessDept": "{{dept_code}}",
  "accessMembers": [],
  "accessLevel": 10,
  "tagIds": [{{tag_id}}],
  "editorAccounts": ["S112009"],
  "articleIds": [{{article_id}}],
  "files": [],
  "changeNote": "更新標題"
}
```

**預期（200）**
```json
{ "success": true, "data": { "version_number": 2, ... } }
```

- [ ] HTTP 200
- [ ] `version_number` = 2

---

## T-25 Comment — 取得留言

```
GET {{base_url}}/articles/{{article_id}}/comments
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{ "success": true, "data": [] }
```

- [ ] HTTP 200（初始為空）

---

## T-26 Comment — 新增留言（含 Mention）

> 需要先知道另一位員工的工號（如 `S112001`），讓該員工登入後可查看通知。

```
POST {{base_url}}/articles/{{article_id}}/comments
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "content": "這是一則測試留言，@S112001 請確認。"
}
```

**預期（201）**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "content": "這是一則測試留言，@S112001 請確認。",
    "mentions": ["S112001"],
    "isRead": { "S112009": true }
  }
}
```

- [ ] HTTP 201
- [ ] `mentions` = `["S112001"]`（正確解析 @工號）
- [ ] `isRead` 包含作者工號（作者自動已讀）
- [ ] 記錄 `data.id` 為 `{{comment_id}}`
- [ ] DB `notifications` 表有新增一筆 `target_account = S112001`

---

## T-27 Notification — 取得通知

> 使用 `S112001` 的 token 測試（需先以 S112001 登入取得 token）。

```
GET {{base_url}}/notifications
Authorization: Bearer {{token_S112001}}
```

**預期（200）**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "target_account": "S112001",
      "article_title": "測試文章（已更新）",
      "mentioned_by_account": "S112009",
      "comment_preview": "這是一則測試留言...",
      "is_read": false
    }
  ]
}
```

- [ ] HTTP 200
- [ ] 通知 `is_read` = `false`
- [ ] 記錄 `data[0].id` 為 `{{notification_id}}`

---

## T-28 Notification — 標記已讀

```
PATCH {{base_url}}/notifications/{{notification_id}}/read
Authorization: Bearer {{token_S112001}}
```

**預期（200）**
```json
{ "success": true, "message": "已標記為已讀" }
```

- [ ] HTTP 200
- [ ] 重新呼叫 T-27，該通知 `is_read` = `true`

**錯誤情境**

| 情境 | Status | message |
|------|--------|---------|
| 其他使用者的通知 | 404 | `找不到該通知或無權限` |

---

## T-29 Notification — 全部已讀

```
PATCH {{base_url}}/notifications/read-all
Authorization: Bearer {{token_S112001}}
```

**預期（200）**
```json
{ "success": true, "message": "所有通知已標記為已讀" }
```

- [ ] HTTP 200
- [ ] 重新呼叫 T-27，所有通知 `is_read` = `true`

---

## T-30 Version — 文章版本列表

> 需先執行 T-18（更新文章）才有版本記錄。

```
GET {{base_url}}/articles/{{article_id}}/versions
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{
  "success": true,
  "data": [
    {
      "version_number": 2,
      "diff_summary": "修改標題與內容",
      "editor_id": "S112009",
      "content": "..."
    }
  ]
}
```

- [ ] HTTP 200
- [ ] `data` 按 `version_number DESC` 排序
- [ ] `content` 為舊版快照

---

## T-31 Version — 文章回滾

```
POST {{base_url}}/articles/{{article_id}}/versions/1/rollback
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{ "success": true, "message": "已成功還原至版本 1" }
```

- [ ] HTTP 200
- [ ] 呼叫 `GET /articles/{{article_id}}` 確認 `content` 已恢復為版本 1
- [ ] `version_number` 再次遞增（如 3）
- [ ] 呼叫 T-30 確認新增了一筆回滾版本記錄

---

## T-32 Version — 附件版本列表

> 需先執行 T-24（更新附件）才有版本記錄。

```
GET {{base_url}}/attachments/{{attachment_id}}/versions
Authorization: Bearer {{token}}
```

**預期（200）**
```json
{
  "success": true,
  "data": [
    {
      "version_number": 2,
      "diff_summary": "更新標題",
      "editor_id": "S112009"
    }
  ]
}
```

- [ ] HTTP 200
- [ ] 按 `version_number DESC` 排序

---

## 錯誤碼速查

| HTTP Status | 情境 | 備註 |
|-------------|------|------|
| `200` | 成功 | |
| `201` | 建立成功 | POST 新增資源 |
| `400` | 缺少必填 / 格式錯誤 | |
| `401` | 未帶 token / token 無效過期 | |
| `403` | token 有效但無存取權限 | hasAccess 不符 |
| `404` | 資源不存在 | |
| `500` | 伺服器內部錯誤 | 查後端 console |
