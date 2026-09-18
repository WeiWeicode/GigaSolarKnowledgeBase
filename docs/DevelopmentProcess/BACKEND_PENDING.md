# 後端待修正項目（由前端審查發現）

> 本文件記錄前端修正過程中，發現需要後端配合補實的功能或 Bug。
> 由前端工程師維護，後端修正後請更新「狀態」欄位。

---

## 未修正項目總覽

| # | 優先度 | 類別 | 摘要 | 狀態 |
|---|--------|------|------|------|
| B-06 | 🗒️ 低 | Admin | 後台功能端點尚未建立：垃圾桶管理、系統日誌、AI 設定儲存、儲存空間查詢 | ⏳ 待修 |
| B-07 | 🔴 高 | AI | Ollama `think: false` 放在 `options` 內無效；`X-Accel-Buffering: no` 未設定導致 Nginx 緩衝 SSE | ✅ 已修正 |
| B-08 | 🟡 中 | Article/Tag | 新增 `PATCH /api/v1/articles/:id/tags` 輕量 endpoint（AI 建議標籤一鍵加入） | ✅ 已修正 |
| B-12 | 🟡 中 | AI | AI 提示詞與模型配置改為資料庫存取，改寫 aiService.js 從 DB 讀取並整合 Local 快取 | ✅ 已修正 |
| B-13 | 🔴 高 | AI | vLLM 思考標籤與 API 欄位自適應（增加 ai_tool 欄位及標籤切換） | ✅ 已修正 |
| B-14 | 🔴 高 | Search | 部門模式搜尋硬性排除 `is_public = true`，導致掛在部門目錄下的公開文章／附件「樹上看得到、搜尋找不到」 | ✅ 已修正 |
| B-15 | 🔴 高 | DevOps/Perf | devopsReporter 攔截回應時未解構 Sequelize Model，觸發循環參照與深層遞迴卡死 Event Loop 約 3 秒 | ✅ 已修正 |

---

## 待修項目詳細說明

*（目前暫無進行中的高/中優先度待修項目）*

---

## 已修正項目

### B-15｜devopsReporter 攔截回應未脫殼，導致循環參照指數級遞迴卡死 Event Loop 約 3 秒

- **狀態**：✅ 已修正（2026-09-18）

**問題描述：**
引入 `backend/src/lib/devopsReporter.js`（DevOpsDiagram 觀測 SDK）後，前端頁面載入時偶發出現所有並行 API 請求延遲高達 2.5 ~ 3 秒。後端 Docker log 頻繁輸出：
```text
[devops-reporter] 組裝紀錄失敗: Converting circular structure to JSON
   --> starting at object with constructor 'Object'
   |     property 'parent' -> object with constructor 'Object'
   --- property 'through' closes the circle
```

**根本原因：**
1. 控制器回傳 Sequelize Model 實例（例如 `Article.findByPk(id, { include: [Tag] })`）。Sequelize 多對多關聯包含 `through`（`ArticleTag`）與指回文章的 `parent` 循環參照。
2. `devopsReporter.js` 覆寫 `res.json` 時，直接儲存原始未解構的 Model 實例到 `responseBody`。
3. `res.on('finish')` 呼叫 `maskDeep(responseBody)`，將其當成一般字典物件進行 `Object.entries()`，因缺少 `.toJSON()` 處理與 `WeakSet` 循環參照偵測，陷入 12 層指數級展開，造成單次運算建立數十萬個物件，100% 阻塞 Node.js 事件循環（Event Loop）達 1~3 秒。
4. 最終在 `depth > 12` 帶入原循環參照至一般 Object，導致 `prepareBody` 的 `JSON.stringify` 崩潰拋出 `Converting circular structure to JSON`。

**影響檔案：**
- `backend/src/lib/devopsReporter.js`（`maskDeep`, `prepareBody`, `res.json`）

**修正內容（2026-09-18）：**
在 `backend/src/lib/devopsReporter.js` 的 `maskDeep` 實作三道防護機制：
1. **優先脫殼（`.toJSON()`）**：判斷物件若具備 `toJSON` 方法（如 Sequelize Model 實例、Date 等），優先轉換為純物件或基本型別，避免直接列舉內部屬性（`dataValues`、`_previousDataValues`）與關聯循環結構。
2. **循環參照偵測（`WeakSet`）**：在走訪 context 中維護 `seen = new WeakSet()`，偵測到重複物件立即標記為 `'[circular]'` 並中止遞迴。
3. **節點走訪預算上限（`MAX_NODES = 5000`）**：設置單次處理最大節點數量限制，防止極深或極寬結構無上限消耗 CPU，超過上限直接回傳 `'[truncated: too large]'`。
4. **安全序列化**：確保 `prepareBody` 與 `safeStringify` 不會拋出未捕捉例外造成程序阻塞或紀錄失敗。

---

### B-14｜部門模式搜尋找不到公開文章（樹狀圖看得到但搜尋 0 筆）

- **狀態**：✅ 已修正（2026-08-13）

**問題描述：**

在「部門文件」模式下，左側目錄樹可看到 `碩禾電子材料 / 資訊服務部 / 通用 / 知識庫操作說明`，但首頁搜尋「知識庫」回傳「找到 0 筆結果」。

**根本原因：**

搜尋的範圍條件與目錄樹的範圍條件不一致。

- 目錄樹（`directoryController.getTree`，部門模式）以 `directories.dept_code = 部門代碼` 取節點，**不看** `is_public`，因此公開文章只要掛在該部門目錄下就會顯示。
- 搜尋（`articleController.searchArticles` / `attachmentController.searchAttachments`）在 `scope === 'dept'` 時直接 `where.is_public = false`，把所有公開內容從 SQL 層排除。

實際資料驗證（唯讀查詢 KB DB）：

| id | title | is_published | is_public | access_dept | access_level |
|----|-------|--------------|-----------|-------------|--------------|
| 32 | 知識庫操作說明 | true | **true** | S1800 | 10 |

- `WHERE is_published = 1 AND is_public = 0 AND title LIKE '%知識庫%'` → **0 筆**（等同 dept 模式搜尋）
- `WHERE is_published = 1 AND is_public = 1 AND title LIKE '%知識庫%'` → **1 筆**（等同 public 模式搜尋）

亦即：這篇文章只有切到「公開文件」模式才搜得到，但它同時出現在部門目錄樹上，使用者自然預期在部門模式搜得到。目前全庫共有 4 篇 `is_public = true` 的文章，只要掛在部門目錄下都有相同症狀；附件搜尋邏輯完全相同，症狀一致。

**修正內容（2026-08-13）：**

讓 `scope = 'dept'` 的搜尋範圍與部門目錄樹一致 —— 搜尋「掛在該部門目錄下的內容」，而非「非公開內容」：

1. 移除 `scope === 'dept'` 時的 `where.is_public = false` 與 `access_dept` 的 `Op.or` 條件。
2. 改以 `directories` 表界定範圍：查出 `dept_code = deptCode AND type = 'article'`（附件為 `type = 'attachment'`）的 `article_id` / `attachment_id`，以 `id IN (...)` 加入 `andConditions`。
3. `deptCode` 未帶入時取得空集合 → 回傳 0 筆，與 `getTree` 部門模式（`dept_code = undefined` 取不到節點）行為一致。
4. 保留既有的 `canAccess()` 後置過濾，權限管控不變。

- `backend/src/controllers/articleController.js`：`searchArticles` 的 `scope === 'dept'` 分支。
- `backend/src/controllers/attachmentController.js`：`searchAttachments` 的 `scope === 'dept'` 分支。

**驗證方式（直接以假 req/res 呼叫 controller，對正式 KB DB 唯讀查詢）：**

| 案例 | 結果 |
|------|------|
| `dept` / S1800 / `q=知識庫` | 1 筆（知識庫操作說明）← 修正前為 0 |
| `public` / `q=知識庫` | 1 筆（未受影響） |
| `dept` / S1700 / `q=知識庫` | 0 筆（跨部門未外洩） |
| `dept` / S1800 / 無關鍵字 | 10 筆，與部門目錄樹的文章節點一致（回歸：私有文章仍搜得到） |
| `dept` / 無 `deptCode` | 0 筆 |
| `dept` / S1800 附件、`public` 附件 | 12 筆 / 6 筆，與目錄樹一致 |

**尚未處理的附帶發現（次要，優先度低）：**

- `is_published: true` 為固定條件，但目錄樹允許 ADMIN / MANAGER 看到未發佈項目 → 管理者在樹上看得到草稿，搜尋卻找不到。
- 關鍵字未跳脫 LIKE 萬用字元，搜尋 `%` 或 `_` 會命中全部資料（`backend/src/controllers/articleController.js`、`attachmentController.js`）。
- 前端 `HomeView.vue` 的 `onSearch` 以 `keyword.value.trim()` 判斷是否搜尋，但送出的是未 trim 的 `keyword.value`，前後空白會導致搜不到。
- `scope = 'dept'` 目前以 `access_dept` 判斷部門，`access_dept` 為 NULL / `''` 的私有內容會跨部門進入搜尋結果（再由 `canAccess()` 攔截）。目前資料庫無此類資料，屬潛在風險。

**相關檔案：**
- `backend/src/controllers/articleController.js`（`searchArticles`）
- `backend/src/controllers/attachmentController.js`（`searchAttachments`）
- `backend/src/controllers/directoryController.js`（`getTree`，範圍基準）
- `frontend/src/views/HomeView.vue`（`onSearch`）

---

### [B-08] AI 建議標籤：新增 `PATCH /api/v1/articles/:id/tags` endpoint
- **狀態**：✅ 已修正（2026-05-20）
- **根本原因**：
  1. 原先前端呼叫 `POST /api/v1/tags` 新增標籤，但此路由需要 `MANAGER`/`ADMIN` 角色，一般使用者無法呼叫 → catch 靜默失敗，網路面板無任何請求。
  2. 後端沒有文章標籤的專屬輕量 endpoint，只有需要完整 payload 的 `PUT /articles/:id`，無法簡單加入單一標籤。
- **修正檔案**：
  - `backend/src/controllers/articleController.js`：新增 `addTagsToArticle`（`Tag.findOrCreate` + `article.addTags`，不覆蓋現有標籤，無需 MANAGER 角色）
  - `backend/src/routes/articles.js`：新增 `PATCH /:id/tags`
  - `frontend/src/services/api.js`：新增 `articleService.addTags(id, tagNames[])`
  - `frontend/src/views/ArticleView.vue`：`onAiAddKeyword` 改為單一 `articleService.addTags` 呼叫，回傳的 `data` 同步更新 `article.tags` 和 `form.tagIds`

---

### [B-09] 附件版本歷史紀錄 version_number 語意錯誤
- **狀態**：✅ 已修正（2026-05-20）
- **根本原因**：`updateAttachment` 建立 `AttachmentVersionHistory` 記錄時，`version_number` 存入的是 `currentVersion`（修改前的舊版次，例如 1），但使用者預期看到的是本次儲存建立的新版次（`nextVersion`，例如 2）。由於附件歷史不像文章歷史儲存內容快照，其語意為「誰在何時建立了哪個版次」，因此應記錄 `nextVersion`。
- **修正檔案**：`backend/src/controllers/attachmentController.js`
- **修正內容**：`updateAttachment` 的 `AttachmentVersionHistory.create` 將 `version_number: currentVersion` 改為 `version_number: nextVersion`。
- **驗證方式**：編輯附件後儲存，開啟「修改紀錄」面板，確認面板內出現與 action bar 版次相符的版本條目（例如 action bar 顯示 v2，面板也顯示 v2）；再儲存一次，確認面板出現 v3、v2 兩筆紀錄。

---

### [B-07] AI SSE 串流空白：`think` 參數位置錯誤 & Nginx 緩衝
- **狀態**：✅ 已修正（2026-05-20）
- **根本原因**：
  1. qwen3 的 `think: false` 需放在 Ollama API 請求的**頂層**（與 `model`、`stream` 同層），而非 `options` 內；放在 `options` 裡會被忽略，導致模型進入思考模式後輸出格式異常，前端收不到 delta。
  2. 後端未設定 `X-Accel-Buffering: no`，若部署於 Nginx 反向代理前，SSE 回應會被緩衝，前端要等到連線關閉才一次收到所有資料，造成視覺上串流無效果。
- **修正檔案**：
  - `backend/src/services/aiService.js`：`think: false` 移至請求頂層；`.on('data')` 改為 `for await...of` 讀取 NDJSON 串流（Docker 環境更穩定）；`node-fetch` 改為動態 import；userPrompt 加入 `/no_think\n` 前綴雙重保險；新增 `res.writableEnded` 檢查防止寫入已關閉的 Response；timeout 設為 300000ms。
  - `backend/src/controllers/aiController.js`：`setSSEHeaders` 新增 `X-Accel-Buffering: no`

| # | 摘要 | 修正日期 | 影響範圍 |
|---|------|----------|----------|
| B-01 | ADMIN 角色無法產生 | 2026-05-14 | 新增 `UserRole` model、`models/index.js`、`nanaService.getUserByAccount` 查詢 KB DB user_roles 覆寫 |
| B-02 | Directory 缺少 DELETE 端點 | 2026-05-14 | `directoryController.deleteNode`、`routes/directories.js`、前端 `api.js directoryService.removeNode`、`DirectoryTree.vue` |
| B-03 | Article / Attachment 不回傳 directoryIds | 2026-05-14 | `articleController`（getAllArticles / getArticleById / updateArticle 補同步目錄節點）、`attachmentController`（同上，含 linkedArticleIds）|
| B-04 | getAllAttachments 不含 Files | 2026-05-14 | `attachmentController.getAllAttachments` 加入 Files include（limit 1） |
| B-05 | Tag 缺少 DELETE 端點 | 2026-05-14 | `tagController.deleteTag`、`routes/tags.js`、前端 `api.js tagService.remove`、`AdminView.vue deleteTag` |
| B-07 | 版本號重複：第一次編輯儲存後 version 仍為 v1 | 2026-05-18 | `backend/src/controllers/articleController.js` |
| B-09 | 附件版本歷史紀錄 version_number 語意錯誤 | 2026-05-20 | `backend/src/controllers/attachmentController.js` |
| B-08 | BUG-018：跨部門指定人員無法存取文章；新增前三碼匹配及跨部門授權補強 | 2026-05-18 | `accessHelper.js`、`articleController.js`、`attachmentController.js`、`UserExtraDepartment` model、`crossDepartments` route |
| B-09 | BUG-021：跨部門上傳附件後，目錄捷徑出現在操作者本部門而非目標部門 | 2026-05-18 | `attachmentController.js` `createAttachment`、`updateAttachment` |
| B-10 | BUG-024：搜尋知識庫範圍過濾（scope/deptCode）與支援附件搜尋 | 2026-05-19 | `articleController.js`、`attachmentController.js`、`routes/attachments.js` |
| B-11 | BUG-026：`getArticleById` 補回 `deptCode`，供前端跨部門導航自動切換目錄樹 | 2026-05-19 | `articleController.js` |

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

---

### B-10｜BUG-024 搜尋知識庫範圍過濾與支援附件搜尋

**問題描述：**

1. 知識庫搜尋目前無法過濾特定的「部門」及「公開」範圍，無論使用者切換到哪一個部門，搜尋都會帶出所有部門的文章。
2. 搜尋功能只支援文章，不支援附件檔案。呼叫 `GET /api/v1/attachments/search` 回傳 500 錯誤。

**根本原因（實際發現）：**

1. **`attachmentController.js` 缺少 `Op` 引入**：`searchAttachments` 函式內使用 `Op.or`、`Op.like`、`Op.in`，但檔案頂部未 `require('sequelize')` 取得 `Op`，導致執行時拋 `ReferenceError: Op is not defined` → 500。
2. **`articleController.js` 解構遺漏**：`searchArticles` 解構 `req.query` 時只取 `{ q, tags }`，未取 `scope` 與 `deptCode`，導致兩個變數永遠為 `undefined`，範圍過濾邏輯完全被跳過，文章搜尋無論如何都回傳全部已發佈文章。

**修正內容（第一輪 2026-05-19）：**

- `backend/src/controllers/attachmentController.js`：頂部新增 `const { Op } = require('sequelize');`，修正 ReferenceError → 500。
- `backend/src/controllers/articleController.js`：`searchArticles` 解構改為 `const { q, tags, scope, deptCode } = req.query;`，使範圍過濾邏輯正確生效。

**修正內容（第二輪 2026-05-19）：**

發現附件搜尋仍無法回傳 `access_dept = NULL` 的私有附件（例如僅設「一般人員可見」職級門檻而未設部門限制的附件），且關鍵字搜尋（`q`）與部門過濾（`scope=dept`）同時存在時，`where[Op.or]` 會互相覆蓋導致條件失效。

- `backend/src/controllers/attachmentController.js`、`backend/src/controllers/articleController.js`：
  - 改用 `andConditions` 陣列以 `Op.and` 累積條件，避免 `Op.or` 覆蓋問題。
  - `scope=dept` 時部門條件改為 `access_dept = deptCode OR access_dept IS NULL`，使職級/人員限制類型的私有內容也能被搜尋到。
  - 最終存取管控仍由 `canAccess()` 確保，防止跨部門資料外洩。

**修正內容（第三輪 2026-05-19）：**

跨部門用戶（如 S1800 用戶跨部門至 S1700）在部門搜尋時仍回傳空陣列。根本原因：`canAccess` 的職級判斷區塊要求 `user.級職 <= levelLimit`，但 BPM 用戶的 `user.級職` 可能為 null，導致 null 判斷失敗直接 return false。這與前端 ArticleView「access_level=10 代表全員可見，跳過檢查」的邏輯不一致。

- `backend/src/helpers/accessHelper.js`：`canAccess` 第 5 步職級判斷中，新增 `if (Number(levelLimit) >= 10) return true;`，讓「一般人員（全員可見）」內容對所有用戶直接放行，不再依賴 `user.級職` 的值。

**修正內容（第四輪 2026-05-19）：**

跨部門用戶在部門搜尋仍回傳空陣列。根本原因：前端 `ArticleView.vue` 的 `hasAccess` 表單初始值 `部門: ''`，而 `buildPayload()` 直接使用 `accessDept: form.hasAccess.部門`，導致所有文章與附件的 `access_dept` 欄位在 MSSQL 中儲存為空字串 `''`，而非 `NULL`。MSSQL 中 `'' IS NULL` 為 false，因此原本的 `OR access_dept IS NULL` 無法匹配這些紀錄，造成部門搜尋時幾乎所有私有內容都被 SQL 層過濾掉。

- `backend/src/controllers/attachmentController.js`、`backend/src/controllers/articleController.js`：
  - `scope=dept` 部門條件的 `Op.or` 中新增 `{ access_dept: '' }`，使「前端未設部門而存入空字串」的資料也能被搜到。
  - 最終存取管控仍由 `canAccess()` 確保。

```js
andConditions.push({
  [Op.or]: [
    { access_dept: deptCode },
    { access_dept: null },
    { access_dept: '' },   // MSSQL: 空字串 '' ≠ NULL，前端表單未設部門時存入 ''，需明確匹配
  ],
});
```

**驗證方式：**
- `GET /api/v1/attachments/search?q=標籤&scope=dept&deptCode=S1800` 應回傳 200 而非 500。
- 點擊標籤搜尋，確認結果同時出現文章與附件（含僅設職級門檻、access_dept 為 NULL 的附件）。
- 跨部門用戶（S1800 跨部門至 S1700）點擊標籤搜尋，確認 S1700 的「一般人員可見」文章與附件出現在結果中。
- `GET /api/v1/attachments/search?tags=10&scope=dept&deptCode=S1700` 應回傳非空陣列而非 `[]`。
- 傳入不同的 `scope` 與 `deptCode`，確認跨部門資料不會互相外洩。

---

### B-11｜BUG-026 getArticleById 補回 deptCode

**問題描述：**

跨部門用戶點進其他部門的文章時，文章詳情頁的「所屬目錄」欄位顯示 raw ID（如 `dir-1779084072918-swe21`）而非目錄名稱，且 Header 部門下拉選單未切換至文章所屬部門。

**根本原因：**

後端 `getTree` API 只回傳指定部門的目錄節點，`dirStore.tree` 不含其他部門的節點。`getDirLabel(id)` 在 `dirStore.tree` 中找不到跨部門文章的 `directoryId` → 回傳 raw ID。

前端缺乏知道「文章屬於哪個部門」的機制，無法在導航時事先切換目錄樹。

**修正內容（2026-05-19）：**

`backend/src/controllers/articleController.js` - `getArticleById`：

在取得 `directoryIds` 後，額外查詢第一個父目錄的 `dept_code`，以 `setDataValue('deptCode', deptCode)` 附加至回應。`normalizeArticle` 的 `...a` spread 會自動透傳此欄位。

```js
// 補上文章所屬部門代碼，供前端點進跨部門文章時自動切換目錄樹
let deptCode = null;
if (dirNodes.length > 0) {
  const parentDir = await Directory.findOne({
    where: { id: dirNodes[0].parent_id },
    attributes: ['dept_code'],
  });
  deptCode = parentDir?.dept_code || null;
}
article.setDataValue('deptCode', deptCode);
```

**驗證方式：**
- `GET /api/v1/articles/:id` 回傳中應包含 `deptCode` 欄位。
- 搭配前端 BUG-026 修正：跨部門點進文章後，Header 應切換至文章所屬部門，「所屬目錄」應顯示目錄名稱而非 raw ID。

---

### B-12｜AI 提示詞與模型配置資料庫化
- **狀態**：✅ 已修正（2026-06-16）
- **需求說明**：原本在 `aiService.js` 中硬編碼的 System Prompts 和 User Prompt Templates，以及配置參數，需要抽離到 SQL Server 資料庫中，以利彈性管理與動態修改。
- **修正檔案**：
  - `backend/src/models/AiConfig.js`（新增）：定義 `ai_configs` 表，儲存模型連線與溫度、超時配置。
  - `backend/src/models/AiPromptTemplate.js`（新增）：定義 `ai_prompt_templates` 表，將 System Prompts 與 User Prompt Templates 依模式合併儲存（方案 B 兩張表方案）。
  - `backend/src/models/index.js`（修改）：註冊並導出新 Model。
  - `backend/src/index.js`（修改）：啟動時自動同步 `AiConfig` 與 `AiPromptTemplate` 建表，並在目錄樹初始化後自動執行 `seedAiPrompts()` 寫入種子資料。
  - `backend/src/scripts/seedAiPrompts.js`（新增）：AI 提示詞與配置的種子資料初始化腳本，可獨立執行，也可在伺服器啟動時自動運行。
  - `backend/src/services/aiService.js`（修改）：重構原硬編碼的常數，改為自 DB 讀取。同時實作了 in-memory 記憶體快取（TTL 5分鐘）以防止頻繁查詢資料庫，並提供當 DB 無法存取時的 fallback 備用機制。
- **驗證方式**：
  1. 啟動伺服器，伺服器日誌應顯示 `✅ user_extra_departments, ai_configs, ai_prompt_templates 資料表已就緒`。
  2. 檢查 SQL Server 資料庫中是否有 `ai_configs` 與 `ai_prompt_templates` 表，且已寫入初始資料。
  3. 進入前台點擊 AI 文章摘要與寫作助手，確認串流輸出流暢且無報錯。

---

### B-13｜vLLM 思考標籤與 API 欄位自適應
- **狀態**：✅ 已修正（2026-06-18）
- **根本原因**：切換為 vLLM 引擎後，模型輸出的思考標籤可能是 `<thought>` 或是直接回傳結構化的 `thought` / `reasoning` / `reasoning_content` 欄位。舊代碼硬編碼了 `<think>` 與 `delta.reasoning_content`，導致 vLLM 的思考過程無法被解析與提取，而漏入正文中，且摺疊思考區也無法正常顯示。
- **修正檔案**：
  - `backend/src/models/AiConfig.js`：為 `AiConfig` 模型新增 `ai_tool` 欄位以儲存引擎名稱。
  - `backend/src/index.js`：啟動時新增原生 SQL 語法自動向 `ai_configs` 表追加 `ai_tool` 欄位，完成平滑升級。
  - `backend/src/scripts/seedAiPrompts.js`：在 Seeder 腳本中加入 `ai_tool: 'llama.cpp'` 預設值。
  - `backend/src/services/aiService.js`：在快取讀取中加入 `aiTool` 支援；並在 `streamToSSE` 裡動態根據當前工具（如 `vllm` 則改用 `<thought>` 標籤，或預設使用 `<think>` 標籤）；同時聯集處理 choices delta 的 `reasoning_content`、`thought` 與 `reasoning` 屬性，防禦性提取結構化思考文字並回傳前端。
- **驗證方式**：
  1. 重啟後端伺服器，確認資料庫自動新增了 `ai_tool` 欄位。
  2. 檢查 `aiService.js` 單元流程，確保啟用 `vllm` 設定時，後端會過濾 `<thought>` 標籤並正常觸發 `{ thinking: ... }`。



