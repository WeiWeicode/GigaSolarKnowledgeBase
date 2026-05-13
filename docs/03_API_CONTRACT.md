# 03 API Contract

> 依據 `frontend/src/services/api.js` 與 `mockData.js` 整理。
> 所有 API 呼叫透過 `axios` 實例發送至 `/api`。
> **需要驗證的端點**一律在 Header 帶入 `Authorization: Bearer <token>`，缺少或無效 token 回傳 `HTTP 401`。

---

## 目錄

1. [認證機制](#1-認證機制)
2. [資料模型定義](#2-資料模型定義)
3. [Table 關聯圖](#3-table-關聯圖)
4. [API 端點列表](#4-api-端點列表)
   - [Auth](#41-auth)
   - [Meta（公司 / 部門）](#42-meta公司--部門)
   - [Directory（目錄樹）](#43-directory目錄樹)
   - [Article（知識文章）](#44-article知識文章)
   - [Attachment（附件包）](#45-attachment附件包)
   - [Tag（標籤）](#46-tag標籤)
   - [Colleague（同仁）](#47-colleague同仁)
   - [Comment（留言）](#48-comment留言)
   - [Notification（通知）](#49-notification通知)
   - [Version — Article（文章版本）](#410-version--article文章版本)
   - [Version — Attachment（附件版本）](#411-version--attachment附件版本)
5. [權限模型](#5-權限模型)
6. [HTTP 錯誤碼一覽](#6-http-錯誤碼一覽)

---

## 1. 認證機制

### 1.1 登入流程

```
前端                      我們的後端 (Node.js)              BPM 系統
 │                               │                              │
 │  POST /api/auth/login         │                              │
 │  { account, password,         │                              │
 │    adserver }                 │                              │
 │──────────────────────────────►│                              │
 │                               │  POST /v1/api/auth/login/ad  │
 │                               │  { account, password,        │
 │                               │    adserver }                │
 │                               │─────────────────────────────►│
 │                               │  { success, authToken, user }│
 │                               │◄─────────────────────────────│
 │                               │                              │
 │                               │  寫入 user_tokens 表          │
 │                               │  { account, token,           │
 │                               │    login_at, expires_at }    │
 │                               │                              │
 │  { token, user }              │                              │
 │◄──────────────────────────────│                              │
 │                               │                              │
 │  後續請求帶入：                │                              │
 │  Authorization: Bearer <token>│                              │
```

### 1.2 BPM 登入端點（外部系統）

| 項目 | 說明 |
|------|------|
| URL | `http://10.10.130.122:5123/v1/api/auth/login/ad` |
| Method | `POST` |
| Content-Type | `application/json` |

**Request**
```json
{
  "account": "S112009",
  "password": "xxxxxx",
  "adserver": "碩禾_新"
}
```

**Response（成功）**
```json
{
  "success": true,
  "message": "登入成功",
  "authToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "account": "S112009"
  }
}
```

> `authToken` 為 BPM 核發的 JWT，後端驗證後原樣存入 DB，並直接回傳給前端使用。後端**不另發**第二組 JWT，所有請求皆以此 token 作為身分依據。

### 1.3 Token 儲存位置

| 端 | 儲存位置 | 說明 |
|----|----------|------|
| 前端 | `sessionStorage`（key: `kb_token`） | Tab 關閉即清除，符合企業資安政策 |
| 後端 DB | `user_tokens` 資料表 | 紀錄登入時間、工號、token，供驗證與稽核使用 |

### 1.4 驗證流程（Middleware）

每次受保護的 API 請求到達後端時，middleware 執行以下檢查：

```
1. 取出 Header: Authorization: Bearer <token>
2. 若無 token → 回傳 401 Unauthorized
3. 查詢 user_tokens 表：token = ? AND expires_at > NOW() AND is_revoked = 0
4. 若查無紀錄（token 不存在 / 已過期 / 已撤銷）→ 回傳 401 Unauthorized
5. 將 user 資訊（account、員工工號等）附加至 req.user，繼續往下執行
```

### 1.5 端點保護等級

| 符號 | 說明 |
|------|------|
| 🔓 | 公開端點，**不需要** token |
| 🔐 | 需要有效 token（登入者皆可存取） |
| 🔐👑 | 需要有效 token + `MANAGER` 或 `ADMIN` 角色 |

---

## 2. 資料模型定義

### 2.1 CurrentUser（登入使用者）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `組織名稱` | `string` | 公司名稱 |
| `組織OID` | `string` | 公司唯一識別碼（UUID hex） |
| `員工工號` | `string` | 唯一識別員工，格式如 `GV112001` |
| `員工姓名` | `string` | |
| `員工Mail` | `string` | |
| `職稱` | `string` | |
| `級職` | `number` | 職等數值，數字越小職級越高 |
| `主要部門` | `number` | 部門序號（內部用） |
| `部門代碼` | `string` | 如 `S1800` |
| `部門名稱` | `string` | |
| `主管工號` | `string` | |
| `主管姓名` | `string` | |
| `主管電子郵件` | `string` | |
| `role` | `'GUEST' \| 'MEMBER' \| 'MANAGER' \| 'ADMIN'` | 系統角色 |

---

### 2.2 Company（公司 / 組織）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `組織OID` | `string` | 主鍵，UUID hex |
| `組織名稱` | `string` | |

---

### 2.3 Department（部門）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `部門代碼` | `string` | 主鍵，如 `S1800` |
| `部門名稱` | `string` | |

> 關聯：隸屬於某一 `Company`（透過 API 參數 `組織OID` 篩選）

---

### 2.4 DirectoryNode（目錄樹節點）

目錄樹為巢狀結構，節點共有六種 `type`：

| `type` | 說明 | 特有欄位 |
|--------|------|----------|
| `company` | 公司根節點 | `組織OID: string` |
| `department` | 部門節點 | `部門代碼: string` |
| `directory` | 一般資料夾 | `sortOrder: number`（同層排序，1 起始；拖曳後重算） |
| `article` | 文章捷徑 | `articleId: number`、`isPublic: boolean` |
| `attachment` | 附件捷徑 | `attachmentId: number`、`isPublic: boolean` |
| `trash` | 垃圾桶（每部門固定一個，永遠在最後） | — |

**共用欄位**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | `string` | 節點唯一識別（`dir-xxx`、`art-xxx`、`att-xxx`） |
| `type` | `NodeType`（見上表） | |
| `label` | `string` | 顯示名稱 |
| `children?` | `DirectoryNode[]` | 子節點（葉節點無此欄位） |

---

### 2.5 Tag（標籤）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | `number` | 主鍵 |
| `name` | `string` | 標籤名稱 |

---

### 2.6 Colleague（同仁）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `員工工號` | `string` | 主鍵 |
| `員工姓名` | `string` | |
| `部門名稱` | `string` | |
| `部門代碼` | `string` | |
| `員工Mail` | `string` | |

---

### 2.7 HasAccess（存取控制物件）

用於 `Article` 與 `Attachment`，控制誰可以查看該內容。

| 欄位 | 型別 | 說明 |
|------|------|------|
| `部門` | `string` | 部門代碼；該部門所有人皆可存取 |
| `人員` | `string[]` | 員工工號陣列；額外指定可存取的個人 |
| `職級` | `number` | 最低可存取職等（`級職 <= 此值` 才可存取） |

---

### 2.8 Article（知識文章）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | `number` | 主鍵 |
| `title` | `string` | 文章標題 |
| `content` | `string` | Markdown 內文 |
| `isPublished` | `boolean` | 是否已發布（`false` 表示草稿或已下架） |
| `isPublic` | `boolean` | 是否跨部門公開 |
| `createdAt` | `string` | ISO 8601 |
| `updatedAt` | `string` | ISO 8601 |
| `createdBy` | `{ 員工工號, 員工姓名 }` | |
| `updatedBy` | `{ 員工工號, 員工姓名 }` | |
| `tags` | `Tag[]` | 已套用的標籤清單 |
| `directories` | `string[]` | 所在目錄節點 `id` 陣列（可多目錄） |
| `attachmentIds` | `number[]` | 關聯附件 `id` 陣列 |
| `editorIds` | `string[]` | 有編輯權的員工工號陣列 |
| `hasAccess` | `HasAccess` | 存取控制 |
| `versionNumber` | `number` | 目前版本號 |

**Create / Update 輸入欄位（`ArticleInput`）**

| 欄位 | 必填 | 說明 |
|------|------|------|
| `title` | ✅ | |
| `content` | ✅ | Markdown |
| `isPublished` | ✅ | |
| `isPublic` | ✅ | |
| `tags` | ✅ | `Tag[]` |
| `directories` | ✅ | `string[]`（目錄節點 id） |
| `attachmentIds` | ✅ | `number[]` |
| `editorIds` | ✅ | `string[]` |
| `hasAccess` | ✅ | `HasAccess` |
| `changeNote` | ⬜ | 修改說明（Update 時建議填寫，存入版本歷史） |

---

### 2.9 FileInfo（附件中的單一檔案）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `uuid` | `string` | 檔案唯一識別 |
| `name` | `string` | 原始檔名 |
| `size` | `number` | 位元組 |
| `mimeType` | `string` | MIME 類型 |
| `url` | `string` | 下載路徑 |
| `versionNumber` | `number` | 所屬附件版本（新上傳時由後端寫入） |

---

### 2.10 Attachment（附件包）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | `number` | 主鍵 |
| `title` | `string` | 附件包標題（可與首個檔名相同） |
| `description` | `string` | 說明文字 |
| `files` | `FileInfo[]` | 所含檔案清單 |
| `isPublished` | `boolean` | 是否發布 |
| `isPublic` | `boolean` | 是否跨部門公開 |
| `createdAt` | `string` | ISO 8601 |
| `updatedAt` | `string` | ISO 8601 |
| `createdBy` | `{ 員工工號, 員工姓名 }` | |
| `tags` | `Tag[]` | |
| `directories` | `string[]` | 所在目錄節點 `id` 陣列 |
| `linkedArticleIds` | `number[]` | 關聯文章 `id` 陣列 |
| `editorIds` | `string[]` | |
| `hasAccess` | `HasAccess` | |
| `versionNumber` | `number` | |

**Create / Update 輸入欄位（`AttachmentInput`）**

| 欄位 | 必填 | 說明 |
|------|------|------|
| `title` | ✅ | |
| `description` | ⬜ | |
| `files` | ✅ | `FileInfo[]`（先呼叫 `uploadFiles` 取得） |
| `isPublished` | ✅ | |
| `isPublic` | ✅ | |
| `tags` | ✅ | |
| `directories` | ✅ | |
| `linkedArticleIds` | ✅ | |
| `editorIds` | ✅ | |
| `hasAccess` | ✅ | |
| `changeNote` | ⬜ | 修改說明（Update 時建議填寫） |

---

### 2.11 Comment（留言）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | `number` | 主鍵 |
| `articleId` | `number` | 所屬文章 |
| `author` | `{ 員工工號, 員工姓名 }` | 留言者 |
| `content` | `string` | 留言內容（支援 `@工號` Mention） |
| `mentions` | `string[]` | 被 @ 的員工工號陣列 |
| `createdAt` | `string` | ISO 8601 |
| `isRead` | `{ [員工工號]: boolean }` | 各人是否已讀（key 為員工工號） |

---

### 2.12 Notification（通知）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | `number` | 主鍵 |
| `targetUserId` | `string` | 通知對象員工工號 |
| `articleId` | `number` | 來源文章 |
| `articleTitle` | `string` | 文章標題快照 |
| `mentionedBy` | `{ 員工工號, 員工姓名 }` | 發出 Mention 的人 |
| `commentPreview` | `string` | 留言預覽文字 |
| `commentId` | `number` | 來源留言 id |
| `isRead` | `boolean` | 是否已讀 |
| `createdAt` | `string` | ISO 8601 |

---

### 2.13 ArticleVersionHistory（文章版本歷史）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `versionNumber` | `number` | 版本號（遞增） |
| `editorId` | `string` | 員工工號 |
| `editorName` | `string` | |
| `savedAt` | `string` | ISO 8601 |
| `diffSummary` | `string` | 修改說明 |
| `content?` | `string` | Markdown 快照（可用於版本比對 / 回滾） |

---

### 2.14 AttachmentVersionHistory（附件版本歷史）

與文章版本歷史相同，但**不存 `content` 快照**（因附件為二進位檔案）。

| 欄位 | 型別 | 說明 |
|------|------|------|
| `versionNumber` | `number` | |
| `editorId` | `string` | |
| `editorName` | `string` | |
| `savedAt` | `string` | |
| `diffSummary` | `string` | |

---

## 3. Table 關聯圖

```
user_tokens (token, account FK)
  │
  └─ N:1 ─► Colleague (員工工號)

Company (組織OID)
  │
  └─1:N─ Department (部門代碼)
              │
              └─1:N─ DirectoryNode [type=department]
                          │
                          └─1:N─ DirectoryNode [type=directory | trash]
                                      │
                          ┌───────────┴───────────┐
                          │                       │
                   [type=article]          [type=attachment]
                    articleId ──FK──►        attachmentId ──FK──►
                          │                       │
                          ▼                       ▼
                       Article               Attachment
                          │                       │
              ┌───────────┼───────────┐           │
              │           │           │           │
           N:M Tag      1:N       N:M Attachment  │
                       Comment    (linkedArticleIds / attachmentIds)
                          │
                        N:M Colleague (mentions)
                          │
                          └─► Notification (commentId FK)

Article ──── N:M ──── Tag
Article ──── N:M ──── Colleague (editorIds)
Article ──── 1:N ──── ArticleVersionHistory
Article ──── hasAccess ──► Department / Colleague

Attachment ──── N:M ──── Tag
Attachment ──── N:M ──── Colleague (editorIds)
Attachment ──── 1:N ──── AttachmentVersionHistory
Attachment ──── hasAccess ──► Department / Colleague

Notification ──── N:1 ──── Article
Notification ──── N:1 ──── Comment
Notification ──── N:1 ──── Colleague (targetUserId / mentionedBy)
```

### 關聯說明

| 關係 | 說明 |
|------|------|
| `user_tokens` → `Colleague` | 每筆 token 紀錄對應一位員工（`account` = `員工工號`），供稽核查詢 |
| `Company` → `Department` | 一家公司有多個部門；API 以 `組織OID` 篩選 |
| `Department` → `DirectoryNode` | 每個部門有自己的目錄樹根節點（`type=department`） |
| `DirectoryNode` → `Article/Attachment` | 目錄節點中存放文章或附件的「捷徑」（`articleId` / `attachmentId`），同一筆 Article/Attachment 可出現在多個目錄中 |
| `Article` ↔ `Attachment` | 雙向多對多：`Article.attachmentIds` ↔ `Attachment.linkedArticleIds`；更新任一端時兩側同步維護 |
| `Article` → `Comment` | 一篇文章有多則留言（`Comment.articleId` FK） |
| `Comment` → `Notification` | 留言中有 `@Mention` 時產生通知（`Notification.commentId` FK） |
| `Article/Attachment` → `ArticleVersionHistory/AttachmentVersionHistory` | 每次 update 自動新增一筆版本記錄 |
| `HasAccess` | 以 `部門代碼` 控制部門層級存取，`人員[]` 控制個人例外，`職級` 控制職等門檻 |

---

## 4. API 端點列表

> 格式：`METHOD /api/path`
> Request / Response 皆為 JSON。
> 🔐 端點需在 Header 帶入 `Authorization: Bearer <token>`，否則回傳 `401 Unauthorized`。

---

### 4.1 Auth

#### 🔓 POST `/api/auth/login`

前端登入入口。後端代理呼叫 BPM API，驗證成功後將 token 寫入 `user_tokens` 資料表。
adserver是固定傳入的，目前為"碩禾_新"

**Request Body**
```json
{
  "account": "S112009",
  "password": "xxxxxx",
  "adserver": "碩禾_新"
}
```

**Response（成功）**
```json
{
  "success": true,
  "message": "登入成功",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "account": "S112009",
    "員工工號": "S112009",
    "員工姓名": "...",
    "部門代碼": "...",
    "role": "MEMBER"
  }
}
```

**Response（失敗）**
```json
{ "success": false, "message": "帳號或密碼錯誤" }
```

> **後端寫入 `user_tokens` 的欄位：** `account`、`token`、`login_at`（當下時間）、`expires_at`（依 BPM JWT 的 `exp` 欄位）、`ip_address`（選填，來自 `req.ip`）

---

#### 🔐 POST `/api/auth/logout`

登出，將 DB 中對應的 token 標記為 `is_revoked = 1`，前端同步清除 `sessionStorage`。

**Request Header**
```
Authorization: Bearer <token>
```

**Response**
```json
{ "success": true, "message": "已登出" }
```

---

#### 🔐 GET `/api/auth/me`

取得目前登入使用者的完整資訊（從 BPM token payload 解析 + DB 查詢）。

**Response** `CurrentUser`

---

### 4.2 Meta（公司 / 部門）

#### 🔐 GET `/api/meta/companies`

**Response** `Company[]`

---

#### 🔐 GET `/api/meta/departments?組織OID={組織OID}`

**Response** `Department[]`

---

### 4.3 Directory（目錄樹）

#### 🔐 GET `/api/directories?組織OID={組織OID}&部門代碼={部門代碼}`

取得目錄樹（含所有子節點）。後端依 `hasAccess` 過濾使用者無權限的 article / attachment 捷徑節點。

**Response** `DirectoryNode[]`（巢狀結構）

---

#### 🔐👑 POST `/api/directories`

新增目錄節點（`type=directory`）。僅 `MANAGER` / `ADMIN` 可操作。

**Request Body**
```json
{ "parentId": "dir-1", "label": "新資料夾名稱" }
```

**Response** `DirectoryNode`

> 規則：插入於父節點的垃圾桶之前，sortOrder 重新計算。

---

#### 🔐👑 PATCH `/api/directories/{id}/rename`

**Request Body** `{ "label": "新名稱" }`

**Response** `{ "id": "string", "label": "string" }`

---

#### 🔐👑 PATCH `/api/directories/move`

拖曳移動節點。

**Request Body**
```json
{
  "draggingId": "dir-1-1",
  "dropId": "dir-2",
  "dropType": "before" | "after" | "inner"
}
```

**Response** `{ "success": true }`

| `dropType` | 說明 |
|------------|------|
| `before` | 成為 `dropId` 的上方兄弟 |
| `after` | 成為 `dropId` 的下方兄弟 |
| `inner` | 成為 `dropId` 的子節點（垃圾桶前） |

---

### 4.4 Article（知識文章）

> **所有文章端點均需 token（🔐）**。取得時後端額外執行 `hasAccess` 檢查，無權限回傳 `403 Forbidden`。

---

#### 🔐 GET `/api/articles`

取得使用者有權限查看的所有文章清單（後端依 `hasAccess` 過濾）。

**Request Header**
```
Authorization: Bearer <token>
```

**Response** `Article[]`

---

#### 🔐 GET `/api/articles/search?keyword={keyword}&tags={tagId,tagId}`

全文搜尋（只回傳已發布且有權限的文章）。

| Query | 說明 |
|-------|------|
| `keyword` | 比對 `title` + `content` |
| `tags` | 逗號分隔的 `Tag.id`，any match |

**Request Header**
```
Authorization: Bearer <token>
```

**Response** `Article[]`

---

#### 🔐 GET `/api/articles/{id}?version={versionNumber}`

取得單篇文章，可選指定版本。後端驗證 `hasAccess`，無權限回傳 `403`。

**Request Header**
```
Authorization: Bearer <token>
```

**Response** `Article`（含 `versionNumber`）

---

#### 🔐 POST `/api/articles`

新增文章。

**Request Header**
```
Authorization: Bearer <token>
```

**Request Body** `ArticleInput`

**Response** `Article`

---

#### 🔐 PUT `/api/articles/{id}`

更新文章（自動新增版本歷史）。後端確認 `req.user.員工工號` 在 `editorIds` 中或角色為 `MANAGER` / `ADMIN`。

**Request Header**
```
Authorization: Bearer <token>
```

**Request Body** `ArticleInput`（含 `changeNote`）

**Response** `Article`（含新 `versionNumber`）

---

#### 🔐 POST `/api/articles/upload-image`

上傳文章內嵌圖片。

**Request Header**
```
Authorization: Bearer <token>
```

**Request** `multipart/form-data`，欄位名 `file`

**Response** `{ "url": "/uploads/..." }`

---

### 4.5 Attachment（附件包）

> **所有附件端點均需 token（🔐）**。取得時後端額外執行 `hasAccess` 檢查，無權限回傳 `403 Forbidden`。

---

#### 🔐 GET `/api/attachments`

取得使用者有權限查看的所有附件包。

**Request Header**
```
Authorization: Bearer <token>
```

**Response** `Attachment[]`

---

#### 🔐 GET `/api/attachments/{id}`

取得單一附件包。後端驗證 `hasAccess`，無權限回傳 `403`。

**Request Header**
```
Authorization: Bearer <token>
```

**Response** `Attachment`

---

#### 🔐 POST `/api/attachments`

新增附件包（先呼叫 `POST /api/attachments/upload` 取得 `FileInfo[]`）。

**Request Header**
```
Authorization: Bearer <token>
```

**Request Body** `AttachmentInput`

**Response** `Attachment`

---

#### 🔐 PUT `/api/attachments/{id}`

更新附件包，新上傳的檔案打上新版本號。

**Request Header**
```
Authorization: Bearer <token>
```

**Request Body** `AttachmentInput`（含 `changeNote`）

**Response** `Attachment`（含新 `versionNumber`）

---

#### 🔐 POST `/api/attachments/upload`

上傳實體檔案，回傳 `FileInfo[]`。

**Request Header**
```
Authorization: Bearer <token>
```

**Request** `multipart/form-data`，欄位名 `files`

**Response**
```json
[
  {
    "uuid": "uuid-xxx",
    "name": "filename.xlsx",
    "size": 45678,
    "url": "/uploads/demo/filename.xlsx"
  }
]
```

---

### 4.6 Tag（標籤）

#### 🔐 GET `/api/tags`
**Response** `Tag[]`

#### 🔐 POST `/api/tags`
**Request Body** `{ "name": "string" }`
**Response** `Tag`

---

### 4.7 Colleague（同仁）

#### 🔐 GET `/api/colleagues`

取得所有同仁（用於 `@Mention` 選單、編輯權限設定）。

**Response** `Colleague[]`

---

### 4.8 Comment（留言）

#### 🔐 GET `/api/articles/{articleId}/comments`
**Response** `Comment[]`

#### 🔐 POST `/api/articles/{articleId}/comments`

**Request Body** `{ "content": "string（支援 @工號）" }`

**Response** `Comment`

> 若內容含 `@工號`，後端自動產生對應 `Notification` 紀錄。

#### 🔐 PATCH `/api/articles/{articleId}/comments/{commentId}/read`
**Response** `{ "success": true }`

---

### 4.9 Notification（通知）

#### 🔐 GET `/api/notifications`

取得當前登入者的所有通知。

**Response** `Notification[]`

#### 🔐 PATCH `/api/notifications/{id}/read`

標記通知及對應留言已讀。

**Response** `{ "success": true }`

---

### 4.10 Version — Article（文章版本）

#### 🔐 GET `/api/articles/{articleId}/versions`
**Response** `ArticleVersionHistory[]`

#### 🔐👑 POST `/api/articles/{articleId}/versions/{versionNumber}/rollback`
**Response** `{ "success": true, "newVersionNumber": 8 }`

---

### 4.11 Version — Attachment（附件版本）

#### 🔐 GET `/api/attachments/{attachmentId}/versions`
**Response** `AttachmentVersionHistory[]`

---

## 5. 權限模型

### 5.1 使用者角色

| role | 推導條件 | 可操作範圍 |
|------|----------|----------|
| `GUEST` | 未帶 token 或 token 無效 | 無（所有端點回傳 401） |
| `MEMBER` | token 有效，`級職 >= 6` | 查看有權限的文章/附件；編輯自己在 `editorIds` 內的內容 |
| `MANAGER` | token 有效，`級職 < 6` 或為他人主管 | 同 MEMBER + 目錄管理（新增/移動/重命名）+ 所有文章/附件編輯 |
| `ADMIN` | DB 手動指定 `role = ADMIN` | 全部權限，不受部門限制 |

### 5.2 HasAccess 判斷邏輯

後端在回傳 Article / Attachment 之前執行下列檢查：

```
PASS 條件（任一滿足即通過）：
  1. req.user.部門代碼 === hasAccess.部門
  2. req.user.員工工號 in hasAccess.人員[]
  3. req.user.級職 <= hasAccess.職級

均不滿足 → 403 Forbidden
```

### 5.3 isPublic 旗標

| 值 | 說明 |
|----|------|
| `true` | 所有登入使用者（`MEMBER` 以上）均可查看，但需持有效 token |
| `false` | 僅限通過 `hasAccess` 驗證的使用者 |

> `isPublic = true` 仍需帶 token，僅放寬 `hasAccess` 的部門/人員/職級限制。

---

## 6. HTTP 錯誤碼一覽

| 狀態碼 | 情境 |
|--------|------|
| `200 OK` | 成功 |
| `201 Created` | 資源建立成功 |
| `400 Bad Request` | 缺少必填欄位 / 格式錯誤 |
| `401 Unauthorized` | 未帶 token、token 已過期或已撤銷 |
| `403 Forbidden` | token 有效但無存取權限（hasAccess 不符） |
| `404 Not Found` | 資源不存在 |
| `409 Conflict` | 資料衝突（如重複建立） |
| `500 Internal Server Error` | 後端異常 |
