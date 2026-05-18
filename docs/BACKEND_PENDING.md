# 後端待修正項目（由前端審查發現）

> 本文件記錄前端修正過程中，發現需要後端配合補實的功能或 Bug。
> 由前端工程師維護，後端修正後請更新「狀態」欄位。

---

## 未修正項目總覽

| # | 優先度 | 類別 | 摘要 | 狀態 |
|---|--------|------|------|------|
| B-06 | 🗒️ 低 | Admin | 後台功能端點尚未建立：垃圾桶管理、系統日誌、AI 設定儲存、儲存空間查詢 | ⏳ 待修 |

---

## 已修正項目

| # | 摘要 | 修正日期 | 影響範圍 |
|---|------|----------|----------|
| B-01 | ADMIN 角色無法產生 | 2026-05-14 | 新增 `UserRole` model、`models/index.js`、`nanaService.getUserByAccount` 查詢 KB DB user_roles 覆寫 |
| B-02 | Directory 缺少 DELETE 端點 | 2026-05-14 | `directoryController.deleteNode`、`routes/directories.js`、前端 `api.js directoryService.removeNode`、`DirectoryTree.vue` |
| B-03 | Article / Attachment 不回傳 directoryIds | 2026-05-14 | `articleController`（getAllArticles / getArticleById / updateArticle 補同步目錄節點）、`attachmentController`（同上，含 linkedArticleIds）|
| B-04 | getAllAttachments 不含 Files | 2026-05-14 | `attachmentController.getAllAttachments` 加入 Files include（limit 1） |
| B-05 | Tag 缺少 DELETE 端點 | 2026-05-14 | `tagController.deleteTag`、`routes/tags.js`、前端 `api.js tagService.remove`、`AdminView.vue deleteTag` |
| B-07 | 版本號重複：第一次編輯儲存後 version 仍為 v1 | 2026-05-18 | `backend/src/controllers/articleController.js` |
| B-08 | BUG-018：跨部門指定人員無法存取文章；新增前三碼匹配及跨部門授權補強 | 2026-05-18 | `accessHelper.js`、`articleController.js`、`attachmentController.js`、`UserExtraDepartment` model、`crossDepartments` route |
| B-09 | BUG-021：跨部門上傳附件後，目錄捷徑出現在操作者本部門而非目標部門 | 2026-05-18 | `attachmentController.js` `createAttachment`、`updateAttachment` |

---

### B-07｜文章版本號重複

**問題描述：**

新建文章後第一次編輯儲存，歷史紀錄中出現兩筆 `version_number: 1`（一筆來自 `createArticle` 的初始快照，另一筆來自 `updateArticle` 誤用 `currentVersion`），導致版本號序列為 v1、v1、v2... 而非預期的 v1、v2、v3...

`ArticleVersionHistory` API 回傳範例（問題狀態）：
```
id:42  version_number:1  diff:"初始版本"   ← createArticle 寫入，正確
id:43  version_number:1  diff:"更新內容"   ← updateArticle 重複寫入，錯誤
id:44  version_number:2  diff:"更新內容"   ← 第二次編輯才跳到 v2
```

**根本原因：**

`updateArticle` 版本快照使用 `article.version_number`（當前版本）作為寫入的版本號：

```js
// 修改前（有問題）
const currentVersion = article.version_number;  // 1
const nextVersion    = currentVersion + 1;        // 2

await ArticleVersionHistory.create({
  version_number: currentVersion,   // ← 寫 1，但 createArticle 已寫過 1
  content:        article.content,  // ← 舊內容
});
await article.update({ version_number: nextVersion });
```

**修正內容：**

`updateArticle` 改為先查詢 `ArticleVersionHistory` 中該文章的 `MAX(version_number)`，以 MAX+1 作為新版本號，並儲存本次更新後的新內容：

```js
// 修改後（正確）
const maxHistoryVersion = await ArticleVersionHistory.max('version_number', {
  where: { article_id: article.id },
  transaction: t,
}) || 0;
const nextVersion = maxHistoryVersion + 1;

await ArticleVersionHistory.create({
  version_number: nextVersion,  // ← 不再重複
  content:        content,      // ← 儲存新內容
});
await article.update({ version_number: nextVersion });
```

**版本語意（修正後）：**

| 動作 | history 寫入 | article.version_number |
|------|-------------|----------------------|
| 建立文章 | `{v:1, content:初始內容}` | 1 |
| 第 1 次編輯 | `{v:2, content:編輯後內容}` | 2 |
| 第 2 次編輯 | `{v:3, content:編輯後內容}` | 3 |

**驗證方式：** 新建文章後連續編輯兩次，確認歷史紀錄面板顯示 v1、v2、v3 各一筆，無重複版本號。

---

### B-09｜BUG-021 跨部門上傳附件後目錄捷徑出現在錯誤部門

**問題描述：**

資訊服務部員工使用跨部門功能，在「其他部門」的目錄下建立附件包後，左側目錄樹該附件卻出現在**資訊服務部**的目錄樹，而非目標部門。

**根本原因：**

`createAttachment` 與 `updateAttachment` 在建立目錄捷徑節點（`Directory` 的 `type='attachment'` 列）時，使用：

```js
dept_code: accessDept || req.user.部門代碼,
```

- `accessDept` = 存取限制欄位（控制誰能「查看」），不是目標目錄所屬部門。
- `req.user.部門代碼` = 操作者本人的部門（資訊服務部），跨部門時完全錯誤。

`articleController.js` 同樣邏輯早已正確：從 `Directory.findAll` 查詢父目錄的 `dept_code`，再寫入捷徑節點。

**修正內容：**

`backend/src/controllers/attachmentController.js`

- **`createAttachment` 步驟 6**：在 `Directory.bulkCreate` 前，先以 `Directory.findAll({ where: { id: directoryIds } })` 查出各父目錄的 `dept_code`，建立 `deptCodeMap`，再用 `deptCodeMap[dirId] || null` 填入捷徑節點的 `dept_code`。
- **`updateAttachment` 步驟 7（toAdd）**：相同邏輯，改為查詢 `toAdd` 陣列對應的父目錄 `dept_code`。

```js
// 修改後（兩處相同模式）
const parentDirs = await Directory.findAll({
  where: { id: directoryIds },   // updateAttachment 中為 toAdd
  attributes: ['id', 'dept_code'],
  transaction: t,
});
const deptCodeMap = {};
parentDirs.forEach(d => { deptCodeMap[d.id] = d.dept_code; });
// ...
dept_code: deptCodeMap[dirId] || null,   // 正確：目標目錄的部門
```

**驗證方式：** 跨部門上傳附件後，左側目錄樹應在目標部門顯示該附件捷徑，而非操作者本部門。

---

### B-08｜BUG-018 跨部門指定人員無法存取文章

**問題描述：**

已對文章設定「存取權限 – 指定人員」的跨部門帳號無法讀取該文章。存取權限無法根據部門代碼前三碼進行匹配，也無法利用 `UserExtraDepartment` 跨部門授權控制存取。

**根本原因：**

1. `canAccess(user, resource)` 對部門檢查僅做精確比對，缺少前三碼 prefix 匹配及跨部門授權擴展。
2. 人員比對使用 `includes()` 未做 type coercion，導致 number vs string 工號對比失敗。
3. `getAllArticles`、`getArticleById`、`searchArticles`、`getAllAttachments`、`getAttachmentById` 均未查詢用戶的 `UserExtraDepartment` 授權清單。

**修正內容：**

- `backend/src/helpers/accessHelper.js`：`canAccess(user, resource, extraDeptCodes = [])` 新增第三參數。部門檢查改為三層：精確比對 → `substring(0,3)` prefix 比對 → `extraDeptCodes.includes(rDept)` 跨部門比對。人員比對改為 `members.map(String).includes(String(...))`。
- `backend/src/models/UserExtraDepartment.js`：新增，資料表 `user_extra_departments (id, account, org_oid, dept_code, dept_name, created_by, created_at)`。
- `backend/src/models/index.js`：註冊 `UserExtraDepartment`。
- `backend/src/index.js`：新增 `UserExtraDepartment.sync({ force: false })` 及 `cross-departments` 路由挂載。
- `backend/src/controllers/articleController.js`、`attachmentController.js`：新增 `getUserExtraDeptCodes(account)` helper；所有列表與展詳查詢均在權限檢查前抓取授權清單，傳入 `canAccess` 第三參數。
- `backend/src/controllers/crossDepartmentController.js`：新增，`getMyGrants`、`getCreated`、`create`（含重複檢查）、`remove`（僅創建者可刪）。
- `backend/src/routes/crossDepartments.js`：新增，`GET /my-grants` 要求 `authMiddleware`（全角色），其餘端點要求 `requireRole('MANAGER')`。

**驗證方式：** 跨部門帳號被加入文章指定人員後，`GET /api/v1/articles/:id` 回傳 200；前三碼部門匹配的帳號也應可讀取；`GET /api/v1/cross-departments/my-grants` 回傳用戶的跨部門授權清單。
