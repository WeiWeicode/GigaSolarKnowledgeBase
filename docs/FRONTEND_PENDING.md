# 前端待修正項目

---

## BUG 列表

### [BUG-001] 通知面板位置錯誤
- **狀態**：✅ 已修正（2026-05-15）
- **修改紀錄**：`TheHeader.vue` 改為 popover 點擊觸發浮層，移除導向 `/home` 行為。

---

### [BUG-002] @提及通知未顯示於首頁與 Header 未讀角標
- **狀態**：✅ 已修正（2026-05-15）
- **根本原因**：MSSQL `員工工號` 為 number，DB `target_account` 為 string，嚴格比較永遠失敗。
- **修改紀錄**：`nanaService.js` 統一轉 `String()`；`notification.js` store 與 `CommentPanel.vue` 改用 `String()` 比較。
- **驗證結果**：✅ 通過

---

### [BUG-003] 附件上傳後未出現在左側目錄
- **狀態**：✅ 已修正（2026-05-15）
- **根本原因**：Directory 捷徑節點缺 `dept_code`，`getTree` 查不到。
- **修改紀錄**：`attachmentController.js` 的 `Directory.bulkCreate` 加入 `dept_code`。
- **驗證結果**：✅ 通過

---

### [BUG-004] 附件檔案名稱顯示亂碼
- **狀態**：✅ 已修正（2026-05-15）
- **根本原因**：multer 以 latin1 讀取中文 UTF-8 檔名。
- **修改紀錄**：`attachmentController.js` `uploadFiles` 加入 `Buffer.from(..., 'latin1').toString('utf8')` 轉碼。
- **驗證結果**：✅ 通過

---

### [BUG-005] 附件下載跳轉至登入頁面
- **狀態**：✅ 已修正（2026-05-15）
- **根本原因**：後端回傳相對路徑，Vite dev server 攔截後被 SPA router 導向登入頁。
- **修改紀錄**：`api.js` `normalizeAttachment` 補全 `BACKEND_ORIGIN` 前綴。

---

### [BUG-006] 文章無法關聯附件
- **狀態**：✅ 已修正（2026-05-15）
- **根本原因**：
  1. `getArticleById` 未 query 關聯附件，`attachmentIds` 未回傳 → 前端每次載入後 `form.attachmentIds` 歸零
  2. `normalizeArticle` 缺少 `attachmentIds` 欄位對應
- **修改紀錄**：
  - `backend/src/controllers/articleController.js`：`getArticleById` 新增 `article.getAttachments()` 並以 `setDataValue('attachmentIds', ...)` 附加至回應
  - `frontend/src/services/api.js`：`normalizeArticle` 加入 `attachmentIds: a.attachmentIds || []`
- **驗證方式**：在文章編輯頁勾選附件並儲存，回到檢視頁確認附件欄顯示；重新整理後應仍存在

---

### [BUG-007] 關聯文件彈窗附件描述顯示異常 / 檔名欄空白
- **狀態**：✅ 已修正（2026-05-15）
- **根本原因**：
  1. `el-table-column` 的 `prop="files[0].name"` 不支援陣列索引 `[0]` 語法（`getPropByPath` 僅支援 dot notation），導致檔名欄無法顯示
  2. 所屬目錄欄使用 `row.directories` 但 `normalizeAttachment` 回傳的欄位名稱為 `directoryIds`
- **修改紀錄**：
  - `frontend/src/views/ArticleView.vue`：Attachment Picker 的「檔名」欄改用 template slot `row.files?.[0]?.name || row.title || '-'`；「描述」欄改用 template slot `row.description || '-'`；所屬目錄欄由 `row.directories` 改為 `row.directoryIds`
- **驗證方式**：開啟文章編輯頁「關聯文件」彈窗，確認附件列表正確顯示檔名、所屬目錄與描述

---

### [BUG-008] 附件建立後進入編輯模式檔案重複顯示
- **狀態**：✅ 已修正（2026-05-15）
- **根本原因**：`createAttachment()` 完成後沒有清空 `fileList`，導航至檢視頁後 `fileList` 仍保留舊檔案資訊。再點「編輯」時 el-upload 以殘留的 `fileList` 渲染，導致同一檔案重複顯示在上傳區。
- **修正檔案**：`frontend/src/views/AttachmentView.vue`
- **修正內容**：
  - `createAttachment()`：建立成功後即刻執行 `fileList.value = []`
  - `watch([props.id, props.mode])`：切換至檢視/編輯模式時一律執行 `fileList.value = []`，作為防線
- **驗證方式**：新建附件並上傳檔案 → 建立成功 → 點「編輯」，確認上傳區空白，不會顯示舊檔案

---

### [BUG-009] 文章/附件切換目錄時儲存 500 Internal Server Error
- **狀態**：✅ 已修正（2026-05-15）
- **根本原因**：KB 資料庫為 **MS SQL Server**，但 `Directory.bulkCreate(..., { ignoreDuplicates: true })` 是 MySQL/SQLite 專屬語法。Sequelize 對 MSSQL 將不支援的選項拋出錯誤 → 500。
  - **為何對下架才觸發**：目錄不變時，`toAdd = []`，`bulkCreate` 不執行。切換目錄（如將文章移入垃圾桶）時，`toAdd` 有資料，`bulkCreate` 執行 → MSSQL 錯誤。
- **修正檔案**：`backend/src/controllers/articleController.js`、`backend/src/controllers/attachmentController.js`
- **修正內容**：在 `updateArticle` 與 `updateAttachment` 的 `Directory.bulkCreate` 均移除 `ignoreDuplicates: true`。`toAdd` 已通過 filter 排除既存節點，重複內容不會發生。
- **驗證方式**：文章編輯頁將「文件上架」改為「下架」，點「儲存」，確認存檔成功且文章移入垃圾桶目錄

---

### [BUG-010] 建立標籤導致後端崩潰（未捕捉的 ROLLBACK 錯誤）
- **狀態**：✅ 已修正（2026-05-15）
- **根本原因**：兩個層次的問題導致後端 process crash：
  1. **觸發原因**：`el-select allow-create` 模式下輸入新標籤名稱，`form.tagIds` 儲存**字串**（如 `"建立標籤"`）而非數字 ID。`article.setTags(["建立標籤"])`嘗試用字串當 FK 對應 `tags.id` → MSSQL FK constraint 失敗
  2. **崩潰原因**：MSSSQL 在 transaction 內部錯誤後會**自動回滾** transaction。Sequelize catch block 再執行 `await t.rollback()` 就拋 error 3903 「ROLLBACK has no corresponding BEGIN」，此錯誤未被捕捉 → `triggerUncaughtException` → Node.js 崩潰
- **修正檔案**：`backend/src/controllers/articleController.js`、`backend/src/controllers/attachmentController.js`
- **修正內容**：
  - 新增 `resolveTagIds(tagIds, transaction)` helper：數字照用、字串則 `Tag.findOrCreate` 自動建立標籤並取得 ID
  - 新增 `safeRollback(t)` helper：包裹 rollback 在 try-catch 內，防止 MSSQL error 3903 導致 process crash
  - `createArticle` 、`updateArticle` 的標籤操作改用 `resolveTagIds`；所有 catch block 改用 `safeRollback`
  - `createAttachment`、`updateAttachment` 的所有 catch block 改用 `safeRollback`
- **驗證方式**：建立文章時輸入新標籤名稱，確認文章建立成功、標籤自動建立且後端不再崩潰

---

### [BUG-012] 附件建立/編輯標籤失敗 500
- **狀態**：✅ 已修正（2026-05-15）
- **根本原因**：與 BUG-010 相同，`attachmentController.js` 的 `createAttachment` 與 `updateAttachment` 沒有處理 `el-select allow-create` 字串標籤名稱，直接將字串当 FK 對應 `tags.id` → MSSQL 起不到 → 500。
- **修正檔案**：`backend/src/controllers/attachmentController.js`
- **修正內容**：新增 `resolveTagIds` helper（與 articleController 同逾輯）；`createAttachment` 與 `updateAttachment` 的標籤操作改用 `resolveTagIds`
- **驗證方式**：建立/編輯附件時輸入新標籤名稱，確認附件儲存成功且標籤自動建立

---

### [BUG-013] 附件編輯標籤顯示 ID 而非名稱
- **狀態**：✅ 已修正（2026-05-15）
- **根本原因**：`el-select allow-create` 模式下， el-option `:value="t.id"`（數字）與 `form.tagIds` 儲存的數字 ID 在某些情況下不能正確匹配， Element Plus 將其視為「自訂建立選項」，直接顯示原始數字如 `5` 而非標籤名稱。
- **修正檔案**：`frontend/src/views/AttachmentView.vue`
- **修正內容**：
  - el-option 的 `:value` 改用 `t.name`（字串）代替 `t.id`（數字）
  - `loadAttachment` 的 `tagIds` 改存標籤名稱語陣列（`res.tags.map(t => t.name)`），而非 ID 陣列
  - 後端 `resolveTagIds` 已支援字串名稱 → `findOrCreate`，樔就繼續正常運作
- **驗證方式**：編輯附件時，標籤欄應顯示標籤名稱（如「標籤測試」）而非數字 ID（如「5」）

---

### [BUG-014] 文章編輯模式標籤顯示 ID 而非名稱
- **狀態**：✅ 已修正（2026-05-18）
- **根本原因**：`startEdit()` 進入編輯模式時未重新載入 `tags.value`。`tags.value` 僅在 `onMounted` 初始化一次，若初始載入失敗（被 `try/catch` 靜默吞掉）或元件實例複用導致資料過期，`el-select` 無法比對 `form.tagIds` 中的 ID 與選項，直接顯示原始數字 ID。View 模式不受影響（直接使用 `article.tags` 物件顯示名稱）。點擊附件再切回文章後正常，是因為導航觸發元件重新掛載，`onMounted` 重新成功取得 tags。
- **修正檔案**：`frontend/src/views/ArticleView.vue`
- **修正內容**：`startEdit()` 改為 `async function`，進入編輯前先執行 `tags.value = await tagService.getAll()`，確保標籤列表為最新資料；若重載失敗則靜默保留現有 `tags.value`，不阻斷進入編輯。
- **驗證方式**：建立含標籤的文章後直接點「編輯」，確認標籤欄顯示名稱（如「版本測試」）而非數字 ID。

---

### [BUG-011] 附件下載儲存為隨機編碼檔名
- **狀態**：✅ 已修正（2026-05-15）
- **根本原因**：multer 以時戳殆隨機數存檔（如 `1778835496908-992761491.jpg`）。之前的下載直接用靜態檔案 URL，瀏覽器用 storage 檔名作為下載名稱，而非 DB `name` 欄的原始檔名。
- **修正檔案**：`backend/src/controllers/attachmentController.js`、`backend/src/routes/attachments.js`、`frontend/src/services/api.js`、`frontend/src/views/AttachmentView.vue`
- **修正內容**：
  - 新增 `GET /api/v1/attachments/files/:uuid/download` 路由（放在 `/:id` 之前避免路由衝突）
  - 新增 `downloadFile` controller：透過 UUID 尋找檔案 → 檢查權限 → 讀取 `name` 欄 → 設定 `Content-Disposition` （RFC 5987 UTF-8 編碼 + ASCII fallback） → stream 檔案
  - `api.js` `normalizeAttachment`：f.url 改用 `/api/v1/attachments/files/${f.uuid}/download`
  - `AttachmentView.vue`：下載按鈕改用 `handleDownload(f)` JS 函式，透過 `fetch` + JWT header 呼叫 download endpoint
- **驗證方式**：點擊附件下載按鈕，確認瀏覽器下載的檔名為原始檔名（如 `程式系統.pdf`），而非時戳殆隨機數編碼

---

### [BUG-016] 側邊欄無權限文章未顯示禁止眼睛 icon
- **狀態**：✅ 已修正（2026-05-18）
- **根本原因**：`checkItemAccess()` 讀取的是 Directory 節點本身的欄位（`data.access_dept`、`data.access_level`、`data.access_members`），但 `directories` 資料表根本沒有這三個欄位，導致讀到的全是 `undefined`。權限判斷所有條件均被跳過，最終一律回傳 `true`（有權限），造成 Hide icon 永遠不顯示。實際權限資料已由 `getTree` 的 `include` 嵌套於 `data.Article` / `data.Attachment` 物件中，卻未被使用。
- **修正檔案**：`frontend/src/components/directory/DirectoryTree.vue`
- **修正內容**：`checkItemAccess()` 改為從 `data.Article`（文章節點）或 `data.Attachment`（附件節點）讀取權限欄位，匹配 `ArticleView.vue` 中 `loadArticle` 的前端權限檢查邏輯（部門限制、人員限制、職級限制）。附加效果：點擊無權限文件時改為顯示警告訊息並阻止導航，而非跳入文章頁顯示「無權限查看」頁面。
- **驗證方式**：對有職級門檻或人員限制的文章，確認左側樹狀節點顯示紅色禁止眼睛 icon，且點擊後出現警告訊息而非進入文章。

---

### [BUG-017] 文章編輯「存取權限 – 指定人員」未帶入原始值
- **狀態**：✅ 已修正（2026-05-18）
- **根本原因**：`normalizeArticle` 在 `api.js` 中將 `access_members` 直接透傳，未解析 MSSQL 儲存的 JSON 字串（如 `'["S1800","S1801"]'`）。`loadArticle` 在 `ArticleView.vue` 中以 `Array.isArray(res.accessMembers)` 判斷，字串不是陣列 → 一律設為 `[]`，造成指定人員清單每次進入編輯時歸零。
- **修正檔案**：`frontend/src/services/api.js`
- **修正內容**：`normalizeArticle` 的 `accessMembers` 欄位改為 IIFE 解析：若已是陣列直接使用，若為字串則 `JSON.parse`，解析失敗回傳 `[]`。
- **驗證方式**：設定文章「存取權限 – 指定人員」後儲存，重新進入編輯確認人員清單仍顯示原始設定值，且 Request Payload 中 `accessMembers` 非空陣列。

---

### [BUG-018] 指定人員存取權限跨部門無法讀取文章
- **狀態**：✅ 已修正（2026-05-18）
- **根本原因**：三個複合問題：
  1. **Bug A（邏輯錯誤）**：`ArticleView.vue` `loadArticle` 的存取判斷採 AND（所有限制均須符合才能進入），但後端 `canAccess` 採 OR（任一通過即可）。導致「指定人員」 + 「部門限制」同時存在時，另一部門的指定人員因部門不符而在前端被攔截。
  2. **Bug B（資料污染）**：`loadArticle` 中 `form.hasAccess.部門` 預設值為 `res.accessDept || auth.user?.部門代碼 || ''`。當文章無部門限制（`accessDept` 為空）時，會自動填入當前登入者的部門代碼，下次儲存即把部門限制「悄悄寫進」資料庫。
  3. **Bug C（功能缺失）**：前端存取檢查與後端 `canAccess` 均未實作部門代碼前三碼 prefix 匹配（如 `S182` 用戶可看 `S1800` 文章）及跨部門授權（`UserExtraDepartment`）。
- **修正檔案**：
  - `frontend/src/views/ArticleView.vue`
  - `frontend/src/components/directory/DirectoryTree.vue`
  - `frontend/src/services/api.js`
- **修正內容**：
  - `ArticleView.vue`：
    - Bug B：`form.hasAccess.部門` 預設值改為 `res.accessDept || ''`，不再 fallback 至登入者部門代碼。
    - Bug A + C：`loadArticle` 存取判斷改為 OR 邏輯，加入前三碼 prefix 匹配（`uDept.substring(0,3) === rDept.substring(0,3)`）及跨部門授權比對（`myGrantedDepts.value.includes(rDept)`）；人員比對改為 type-safe `String()` 比較。
    - `onMounted` 增加 `crossDeptService.getMyGrants()` 抓取跨部門授權清單。
  - `DirectoryTree.vue`：
    - `checkItemAccess` 部門比對改為三層：精確比對 → 前三碼 prefix 比對 → 跨部門授權比對，與 `ArticleView.vue` 及後端 `canAccess` 邏輯保持一致。
    - 人員比對改為 type-safe `String()` 比較。
    - 新增 `onMounted` 抓取 `crossDeptService.getMyGrants()` 填入 `myGrantedDepts`。
  - `api.js`：新增 `crossDeptService`（`getMyGrants`、`getCreated`、`create`、`remove`）。
- **驗證方式**：跨部門帳號被加入文章「指定人員」後，切換至其他部門帳號確認可正常讀取文章；前三碼相符部門的用戶也應可存取；左側目錄樹圖示顯示正確（有權限不顯示禁止眼睛）。

---

### [BUG-019] 直接輸入 URL 可繞過存取限制查看全部文章
- **狀態**：✅ 已修正（2026-05-18）
- **根本原因**：舊邏輯中 `noRestrict = !rDept && !members.length`，導致任何未設部門、未設人員的文章，不論是否公開，直接輸入 URL 均能以職級門檻通過進入。另外舊邏輯為 AND（所有條件均須符合），與後端 OR 邏輯不一致。權限不符時展示的是長期停留在文章頁的「無權限查看」警告面板，使用體驗很差。
- **修正檔案**：
  - `frontend/src/views/ArticleView.vue`
  - `frontend/src/components/directory/DirectoryTree.vue`
- **修正內容**：從根本重寫存取判斷邏輯，新邏輯如下：
  - `is_public=true` → 全員可看，不進行進一步檢查。
  - 非公開文章：
    - `指定人員`有値 → **最高優先**，僅名單內帳號可存取。
    - `指定人員`無値 → 部門代碼前三碼符合（拆包含跨部門授權）可存取。
    - 上述各項 **AND** 職級門檻剩達（`access_level=10` 代表全員可見，跳過檢查）。
    - 否則 → `router.push('/') + ElMessage.warning('您沒有存取此文章的權限')`。
  - 移除 `accessDenied` ref 和 Banner 樣板（改為跳轉）。
  - `DirectoryTree.vue checkItemAccess` 同步更新，結果為 `primaryAccess && passLevel`。
- **驗證方式**：切換至沒權限的帳號，直接輸入文章 URL，確認自動跳回首頁並顯示警告訊息。

---

### [BUG-022] 附件沒權限時在左側目錄樹消失，應顯示禁止眼睛圖示
- **狀態**：✅ 已修正（2026-05-19）
- **根本原因**：`directoryController.js` `getTree` 對 `attachment` 節點呼叫 `canAccess` 判斷存取，失敗時直接將整筆節點過濾掉。前端收不到資料就無法顯示禁止眼睛。存取權限應只顯示在內容頁面，左側目錄應一律出現所有已發佈項目。
  附加問題：`getTree` 並未將 `extraDeptCodes` 傳入 `canAccess`，跨部門授權用戶即便有權限也會被過濾。
- **修正檔案**：`backend/src/controllers/directoryController.js`
- **修正內容**：
  - `getTree` `filteredRows` 移除對 `article` / `attachment` 的 `canAccess` 呼叫，改為僅以 `is_published`（加上 ADMIN/MANAGER 可看未發佈）判斷。
  - 存取判斷全數交由前端 `checkItemAccess` 處理（無權限顯示禁止眼睛 icon，點擊時顯示警告）。
  - 移除已無使用的 `canAccess` import。
- **驗證方式**：用除 ADMIN 外的帳號去看設了職級限制的附件，确認左側目錄樹仍出現附件且顯示禁止眼睛圖示；點擊時顯示「目前無存取該文件的權限」警告。

---

### [BUG-020] 附件存取權限未對齊文章標準
- **狀態**：✅ 已修正（2026-05-18）
- **根本原因**：三個複合問題：
  1. **Bug B（資料污染）**：`loadAttachment` 中 `hasAccess.部門` 預設值為 `res.accessDept || auth.user?.部門代碼 || ''`。附件無部門限制時，會將登入者的部門代碼填入，下次儲存即沙染 `access_dept`，導致其他部門用戶被禁止存取。
  2. **邏輯錯誤**：`loadAttachment` 存取判斷用舊 AND 邏輯，`!res.accessDept` 讓無部門限制的私有附件對全員放行，且缺少前三碼 prefix 匹配與跨部門授權支援。
  3. **`isArticleAccessible`**：附件內連結文章的可存取判斷同樣使用舊 AND 邏輯，缺前三碼、跨部門、指定人員優先邏輯。
- **修正檔案**：`frontend/src/views/AttachmentView.vue`
- **修正內容**：
  - **Bug B**：`hasAccess.部門` 預設值改為 `res.accessDept || ''`，移除 fallback `auth.user?.部門代碼`。
  - **loadAttachment 存取邏輯重寫**：對齊 BUG-019 文章新邏輯——指定人員優先→無指定人員用前三碼+跨部門→ AND 職級；不符則 `router.push('/') + ElMessage.warning`。
  - **新增 crossDeptService**：import `crossDeptService`，新增 `myGrantedDepts = ref([])`，`onMounted` 呼叫 `getMyGrants()` 填入跨部門授權清單。
  - **移除 `accessDenied`**：移除 ref 與 Banner 樣板，`v-else-if="!accessDenied"` 改為 `v-else`。
  - **`isArticleAccessible` 重寫**：同步更新為指定人員優先 → 前三碼+跨部門 → AND 職級的一致邏輯。
- **驗證方式**：切換至沒權限的帳號，直接輸入附件 URL，確認自動跳回首頁並顯示警告；跨部門授權用戶可正常繁存取附件；左側目錄樹附件圖示顯示正確。

---

### [BUG-023] 留言 @提及清單未包含同部門前三碼人員及跨部門人員
- **狀態**：✅ 已修正（2026-05-19）
- **根本原因**：
  1. `CommentPanel.vue` 中 `onInput` 取得 `@mention` 選項清單時，原本僅使用嚴格比對 `c.部門代碼 === dirStore.currentDept`。
  2. 原本依賴 `/created` API，導致非主管同仁無法取得跨部門授權清單。
- **修正檔案**：
  - `backend/src/controllers/crossDepartmentController.js`
  - `backend/src/routes/crossDepartments.js`
  - `frontend/src/services/api.js`
  - `frontend/src/components/panels/CommentPanel.vue`
- **修正內容**：
  1. 後端新增 `GET /api/v1/cross-departments/all` 路由與 `getAll` Controller 方法，讓任何同仁都能取得所有的跨部門授權資料（用於 @提及比對）。
  2. 前端 `api.js` 實作 `getAllGrants()`。
  3. `CommentPanel.vue` 中過濾條件改為 `c.部門代碼.startsWith(dirStore.currentDept.substring(0, 3))`，讓轄下單位可以互 tag。
  4. 引入 `crossDeptService.getAllGrants()`，開啟面板時取得所有授權紀錄，只要該同仁有被授權進入當下所選部門，任何使用者都可以將其加入 `@提及` 選單中。
  5. 修正邏輯錯誤：移除了錯誤的 `myGrantedDepts` 比對，確保跨部門人員（如：資訊服務的同仁）在自己的原屬部門文件下，不會誤 tag 到授權者（如：人資主管）。
- **驗證方式**：進入文章留言板，輸入 `@`，確認可搜尋並選擇部門代碼前三碼相同之轄下人員，以及被跨部門授權進入此部門之員工（不限主管帳號）；並確認在原部門時不會異常抓到授權者的帳號。
