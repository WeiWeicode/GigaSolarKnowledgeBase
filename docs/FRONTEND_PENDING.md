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

---

### [BUG-024] 搜尋知識庫範圍異常與無法搜尋附件
- **狀態**：✅ 已修正（2026-05-19）
- **根本原因**：
  1. `HomeView.vue` 中的搜尋並未傳遞當前視圖 `scope` 與 `deptCode` 參數，導致部門狀態下搜尋會帶入所有已發佈的公開/其他部門文章。
  2. 後端沒有附件搜尋的 API，且前端也沒有去呼叫，導致搜尋不到附件。
- **修正檔案**：
  - `backend/src/controllers/articleController.js`
  - `backend/src/controllers/attachmentController.js`
  - `backend/src/routes/attachments.js`
  - `frontend/src/services/api.js`
  - `frontend/src/views/HomeView.vue`
- **修正內容**：
  1. **後端**：在 `articleController.js` 增加 `scope` 與 `deptCode` 過濾（public 時 `is_public=true`；dept 時過濾 `access_dept` 與 `is_public=false`）。
  2. **後端**：在 `attachmentController.js` 新增 `searchAttachments` 函式，並在路由 `/search` 提供 API。
  3. **前端**：更新 `api.js`，讓 `articleService.search` 和 `attachmentService.search` 都接受 `scope` 與 `deptCode` 並傳送至後端；並加入對應的 Mock 邏輯。
  4. **前端**：`HomeView.vue` 中 `onSearch` 時，同步呼叫文章與附件的 search，將結果合併後依 `updatedAt` 排序，並透過 `itemType` 屬性讓介面呈現標籤以區別文章與附件，且點擊後能導向正確路由。
- **驗證方式**：在「公開文件」搜尋，確認出現公開的文章與附件；切換至「部門文件」搜尋，確認僅出現該部門的文章與附件。且結果列表顯示對應標籤（文章/附件），點擊後跳轉正確頁面。

---

### [BUG-026] 點擊搜尋卡片或通知，所屬目錄顯示 raw ID 且未切換部門
- **狀態**：✅ 已修正（2026-05-19）
- **根本原因**：
  1. 後端 `getTree` API 只回傳 `dept_code = 當前部門` 的節點（及 `type='company'` 節點），不含其他部門的目錄。當跨部門用戶（S1800）點進 S1700 的文章時，`dirStore.tree` 沒有 S1700 的目錄節點，`getDirLabel(directoryId)` 找不到對應節點 → 回傳 raw ID（如 `dir-1779084072918-swe21`）。
  2. 點擊搜尋結果卡片（`goToResult`）、首頁通知卡片（`goArticle`）、Header 通知彈窗（`router.push`）均直接導航，未事先切換到文章所屬部門，導致 Header 部門下拉選單與側邊欄保持在原部門，體驗不一致。
- **修正檔案**：
  - `backend/src/controllers/articleController.js`
  - `frontend/src/components/layout/TheHeader.vue`
  - `frontend/src/views/HomeView.vue`
  - `frontend/src/views/ArticleView.vue`
- **修正內容**：
  1. **後端** `articleController.getArticleById`：在 `directoryIds` 查詢後，額外查詢 `Directory.findOne({ where: { id: dirNodes[0].parent_id } })` 取得 `dept_code`，以 `setDataValue('deptCode', deptCode)` 附加到回應，供前端知道文章所在部門。
  2. **`TheHeader.vue`**：新增 `watch` 監聽 `dirStore.currentDept` 與 `dirStore.currentCompany`，當 ArticleView 程式切換部門後，同步更新 Header 公司/部門下拉選單的顯示值。
  3. **`HomeView.vue` `onSearch`**：在合併搜尋結果時，將 `searchDeptCode`（搜尋時使用的 deptCode）標記到每筆結果。`goToResult` 改為 `async function`，若結果的 `searchDeptCode` 與 `dirStore.currentDept` 不同，先 `await dirStore.fetchTree(...)` 切換部門後再 `router.push`。
  4. **`ArticleView.vue` `loadArticle`**：通過存取檢查後、`Object.assign(form, ...)` 前，若 `res.deptCode` 存在且與 `dirStore.currentDept` 不同，`await dirStore.fetchTree(dirStore.currentCompany, res.deptCode)` 切換部門。此邏輯涵蓋所有進入路徑（通知點擊、直連 URL、Header 通知彈窗），可確保 `getDirLabel` 解析到正確的目錄名稱。
- **驗證方式**：
  - 跨部門用戶（S1800 → S1700）點擊搜尋結果中的 S1700 文章，確認 Header 部門切換為 S1700，「所屬目錄」顯示目錄名稱而非 raw ID。
  - 點擊 S1700 文章的通知，確認自動切換部門並正確顯示目錄名稱。
  - 直接輸入 S1700 文章 URL，確認自動切換部門。

---

### [BUG-026] AI 面板串流無效 & Markdown 未渲染
- **狀態**：✅ 已修正（2026-05-20）
- **根本原因**：
  1. **Vue 3 Reactivity bug**：`const aiMsg = {...}; messages.value.push(aiMsg)` 後，`aiMsg` 指向原始物件（非 reactive proxy），後續 `aiMsg.content += delta` 不觸發 Vue re-render，導致串流文字不出現。修正：push 後以 `messages.value[messages.value.length - 1]` 取得 reactive proxy。
  2. **Markdown 未渲染（第一次修正）**：串流中改用 `{{ msg.content }}` 純文字逐字顯示；串流結束後呼叫 `Vditor.md2html` 轉換為 HTML。
  3. **Markdown 未渲染（最終修正）**：`Vditor.md2html` 在 Vditor 3.11.2 環境中拋出例外，catch block 直接將 raw markdown 傳入 `v-html`，造成 `**`、`##` 符號明文可見。改用 `marked.js`（`marked.parse`）取代，並補強 `.markdown-body` CSS 樣式（標題、段落、清單、blockquote、code block、表格）。
- **修正檔案**：`frontend/src/components/panels/AiChatPanel.vue`
- **相依變更**：`cd frontend && npm install marked`（已執行，v15.x）

---

### [FEAT-001] AI 面板 Tab 依情境顯示 & 新對話 & # 指定文章
- **狀態**：✅ 已完成（2026-05-20）
- **修改檔案**：
  - `frontend/src/components/panels/AiChatPanel.vue`
  - `frontend/src/views/HomeView.vue`
  - `frontend/src/views/ArticleView.vue`
- **修改內容**：
  1. **AiChatPanel** 新增 `allowedModes` prop，依傳入陣列控制顯示的 Tab；只有一個 Tab 時自動隱藏 Tab bar 並切換到該 mode。
  2. **HomeView** 傳入 `:allowed-modes="['chat']"`，首頁只顯示「AI 問答」Tab。
  3. **ArticleView** 新增 `aiAllowedModes` computed（create→`['generate']`、isEditing→`['correct']`、view→`['chat']`），動態傳入 AiChatPanel。
  4. **新對話按鈕**：改為帶文字的明顯小按鈕（`size="small" plain`），顯示 Refresh 圖示 +「新對話」文字，點擊清空 messages、referencedArticles、inputText、selectedFile。
  5. **# 文章指定**：chat 模式輸入 `#` 後觸發文章搜尋（300ms debounce），依當前 scope（dept/public）查詢文章，選擇後顯示為「指定文章」chip；送出時自動 `articleService.getById` 取得文章內文，附加在 prompt 中一同送給 AI。
  6. **AI 建議關鍵字**（更新）：移除原先「點擊跳轉搜尋」行為；改為顯示兩區：「文章現有標籤」（唯讀，info 色）與「AI 建議關鍵字」（點擊發出 `addKeyword` 事件 → ArticleView 新增至 `form.tagIds`；已新增的顯示綠色勾選 ✓）。
- **驗證方式**：
  - 首頁 AI 面板只見「AI 問答」Tab。
  - 建立文章頁 AI 面板只見「產生文章」Tab。
  - 編輯文章頁 AI 面板只見「校正文章」Tab。
  - Header 右側可看到「新對話」按鈕（非純圖示），點擊後對話清空。
  - AI 回答後底部顯示「文章現有標籤」（若有）和「AI 建議關鍵字」，點擊建議關鍵字會顯示 ✓ 並觸發 `addKeyword` 事件，ArticleView 自動加入標籤。

---

### [BUG-025] 搜尋知識庫缺少清空按鈕
- **狀態**：✅ 已修正（2026-05-19）
- **根本原因**：`HomeView.vue` 中原先未實作清空搜尋條件的功能與 UI 按鈕。
- **修正檔案**：`frontend/src/views/HomeView.vue`
- **修正內容**：在搜尋輸入框旁新增「清空」按鈕，並實作 `clearSearch` 函式，點擊後會清除關鍵字、選擇的標籤，並將搜尋結果與搜尋狀態恢復至預設。
- **驗證方式**：在搜尋欄輸入關鍵字或選擇標籤後，點擊「清空」按鈕，確認輸入框、標籤與搜尋結果均被清除並恢復為預設狀態。

---

### [BUG-027] 公開文件模式只顯示當前部門的公開文章
- **狀態**：✅ 已修正（2026-05-20）
- **根本原因**：
  1. 後端 `getTree` 查詢條件為 `WHERE type='company' OR dept_code=部門代碼`，永遠只取當前部門節點。
  2. 前端 store `fetchTree` 每次都傳入 `currentDept`，使 `tree.value` 只含當前部門資料。
  3. `filterPublic` 只能在已抓到的部門資料中篩選，其他部門的公開文章永遠不會出現。
- **修正檔案**：
  - `backend/src/controllers/directoryController.js`：`getTree` 支援 `scope=public` 參數；`scope=public` 時不限部門全量抓取，僅保留 `is_published && is_public` 的文章 / 附件，排除 `trash` 節點。
  - `frontend/src/services/api.js`：`directoryService` 新增 `getPublicTree(組織OID)`，呼叫 `GET /directories?scope=public`。
  - `frontend/src/store/directory.js`：新增 `publicTree` ref 與 `fetchPublicTree(組織OID)` action；`filteredTree` computed 在 `viewScope==='public'` 時改用 `publicTree`（後端已過濾，前端 `filterPublic` 再修剪空容器）。
  - `frontend/src/components/layout/TheSidebar.vue`：`onScopeChange` 切換至 `public` 時呼叫 `dirStore.fetchPublicTree(oid)`，確保立即抓取跨部門公開樹。
- **驗證方式**：
  - 切換到「公開文件」，確認目錄樹顯示所有部門的公開文章（而非僅當前部門）。
  - 確認垃圾桶節點與未發佈文章不會出現在公開目錄樹中。
  - 切回「部門文件」，確認目錄樹仍只顯示當前部門內容。

---

### [FEAT-003] 跨部門管理目標部門限制前三碼
- **狀態**：✅ 已完成（2026-05-20）
- **修改檔案**：`frontend/src/views/SettingsView.vue`
- **修改內容**：`filteredGrantDepts` computed 新增以主管自身 `部門代碼` 前三碼（`user.value?.部門代碼.slice(0,3)`）過濾部門清單的邏輯。主管只能選取部門代碼前三碼相同的部門（例如 S1800 主管只能選 S1800、S1810、S1820）。過濾在已有的搜尋文字篩選之前執行，互不影響。
- **驗證方式**：以 MANAGER 帳號登入，至「設定 → 跨部門管理」，選擇目標公司後，確認目標部門下拉只顯示與自身部門代碼前三碼相同的部門，其餘部門不出現。

---

### [FEAT-004] AI 面板「產生文章」支援上傳 PDF 檔案
- **狀態**：✅ 已完成（2026-05-21）
- **修改檔案**：
  - `frontend/src/components/panels/AiChatPanel.vue`
  - `backend/src/routes/ai.js`
  - `backend/src/controllers/aiController.js`
  - `backend/package.json`（新增 `pdf-parse@1.1.1` 依賴；v2.x API 不相容，需固定 v1.x）
- **修改內容**：
  1. 前端 file input `accept` 屬性加入 `.pdf`。
  2. `onFileSelected` MIME 驗證加入 `application/pdf` 與 `.pdf` 副檔名。
  3. 上傳按鈕文字改為「上傳 Word / PDF」；歡迎文字與錯誤提示同步更新。
  4. 後端 multer fileFilter 加入 `application/pdf` MIME 類型。
  5. 後端 `aiController.writingAssist` 依 `file.mimetype` 分流：PDF 使用 `pdf-parse` 提取文字，Word 仍使用 `mammoth`。
- **驗證方式**：在「產生文章」模式點擊「上傳 Word / PDF」，選擇 `.pdf` 檔案，確認檔名顯示於按鈕旁；點送出後 AI 以 PDF 內容產生 Markdown 文章。嘗試上傳其他格式（如 .txt）確認顯示格式錯誤提示。

---

### [FEAT-002] 優化 AI 面板「新對話」按鈕位置與輸入框高度對齊
- **狀態**：✅ 已完成（2026-05-20）
- **根本原因**：
  1. 原本的「新對話」按鈕位於 AI 面板的 Header，因空間有限容易被擠壓或遮擋導致使用者不易看到。
  2. 原本的「送出」按鈕高度為寫死的 `64px`，而左側的 Element Plus textarea 輸入框高度會隨字數或字型撐開，導致左右兩者高度無法對齊，視覺上有落差。
- **修改檔案**：`frontend/src/components/panels/AiChatPanel.vue`
- **修改內容**：
  1. 將「新對話」按鈕自頂部的 `panel-header-right` 中移除。
  2. 於底部 `panel-footer` 區域，在輸入提示（`input-hint`）的右側，新增一個 `input-footer-row` 將輸入提示與「新對話」按鈕並排。
  3. 設定 `.input-footer-row` 樣式為 `display: flex; align-items: center; justify-content: space-between;`，並適度美化。
  4. 修改 `.input-row` 的屬性，將 `align-items: flex-end` 調整為 `align-items: stretch`。
  5. 修改 `.send-btn` 的屬性，將寫死的 `height: 64px` 調整為 `height: auto` 並加上 `align-self: stretch`，使送出按鈕的高度能與左側輸入框完美拉伸一致。
- **驗證方式**：打開 AI 助手面板：
  - 確認頂部沒有「新對話」按鈕，而是移到了底部輸入框下方提示訊息的右側。
  - 確認右側「送出」飛機按鈕的高度與左側輸入對話框高度完全一致，且能隨對話框正常拉伸與對齊。

---

### [BUG-028] vLLM 思考標籤不匹配，導致思考過程直接在正文顯示
- **狀態**：✅ 已修正（2026-06-18）
- **根本原因**：使用 vLLM 時模型輸出的思考標籤可能是 `<thought>` 或是其他的，這與後端預設的 `<think>` 標籤不吻合。如果這些標籤直接漏入前端的 streaming 回應中，前端若沒有自動過濾與容錯處理，會導致這些思考文字連帶標籤直接在正文（Markdown 區）渲染出來，版面雜亂。
- **修改檔案**：`frontend/src/components/panels/AiChatPanel.vue`
- **修改內容**：
  - 更新 `updateHtml(msg)` 函式，利用正則表達式自動辨識並過濾正文中的 `<think>...</think>` 及 `<thought>...</thought>`，並將其提取合併至 expandable 的 `thinkContent` 欄位中。
  - 同時加入對未閉合的 `<think>` 與 `<thought>` 標籤（即還在串流或中斷）的容錯處理，將其自 `content` 移除並導入 `thinkContent`，確保渲染出的正文絕對乾淨。
- **驗證方式**：在對話中刻意模擬含有 `<thought>` 或 `<think>` 的 Markdown，串流完畢後確認主回答區域沒有殘留任何 `<think>` 或 `<thought>` 標籤及其內容，而是整齊被收集在「已完成思考」摺疊區中。

---

### [BUG-029] AI 問答（未指定文章的外部 RAG 問答）回答內容完全空白，只出現在「已完成思考」摺疊區
- **狀態**：✅ 已修正（2026-07-21），已 `npm run build` 驗證可編譯；**尚未完成登入後的瀏覽器 UI 實測**（見下方「未驗證事項」）
- **涉及檔案**：`frontend/src/components/panels/AiChatPanel.vue`、`frontend/src/services/AiRAGApi.js`
- **重現方式**：AI 面板切到「AI 問答」，**不使用 `#` 指定文章**，直接輸入「說明PDF圖片測試」送出（對應知識庫中已上傳的 `PDF圖片測試.pdf`）。此路徑會走 `AiChatPanel.vue` 的 `sendMessage()` → 無 `referencedArticles` 分支 → 呼叫 `sendExternalChat()`（`AiRAGApi.js`），對接外部 AiRAG 服務 `POST /api/external/chat`。
- **測試方法**：為排除是「前端解析邏輯寫錯」還是「後端回傳資料本身有問題」，直接用 `curl` 對外部 AiRAG API 送出與前端相同的 request body（`search_type: semantic_hybrid`，未帶 `max_tokens`），繞過瀏覽器直接檢視原始 SSE 事件序列。
- **根本原因**（定位在 AiRAG 服務端／模型層，非前端解析錯誤）：
  1. 此問題與「帶有知識庫檢索內容（RAG context）」的問題有關。模型收到檢索到的段落後，會先送出一大段 `event: chunk` `type: "reasoning"`（思考過程），內容包含反覆檢視引用段落、草擬答案、二次修正草稿——這段思考本身就會消耗大量 token。
  2. `params.max_tokens` 若未帶入，依 [EXTERNAL_API_INTEGRATION_GUIDE.md](EXTERNAL_API_INTEGRATION_GUIDE.md) 第 3.2.2 節說明，後端預設值為 `1024`。實測「說明PDF圖片測試」情境下，整段回應在**精準滿 1024 筆** `type: "reasoning"` chunk 時被截斷（`grep -c` 驗證結果剛好等於 1024），接著直接送出 `event: sources` 與 `chunk: {"type":"done"}` 結束連線，**全程沒有出現任何一筆 `type: "content"`**（正式回答）chunk。換句話說：模型的思考過程本身就把 `max_tokens` 額度耗盡，根本還沒開始輸出「正式回答」文字。
  3. 另外用同帳號測試一個「不帶知識庫、簡短打招呼」的問題作為對照組：思考過程較短（295 筆 reasoning），沒有把額度用完，之後確實正常送出 7 筆 `type: "content"`。證實**不是所有問答都會壞**，而是「檢索到的上下文越多、模型思考鏈越長」的情境才會踩到這個上限。
  4. `AiChatPanel.vue` 的 `onChunk` 回呼（約第 785-794 行）依文件規格正確地把 `type: "reasoning"` 導向 `aiMsg.thinkContent`（摺疊區）、`type: "content"` 才導向 `aiMsg.content`（正文）。由於本次串流自始至終沒有任何 `content` chunk，`aiMsg.content` 全程是空字串，`onDone()` 呼叫 `updateHtml(aiMsg)` 對空字串執行 `marked.parse('')`，畫面上「正文」自然完全空白——使用者只會看到已展開的「已完成思考」內容，其餘（正文、AI 建議關鍵字區）全部不會出現。**此為前端依照文件規格正確運作下的結果，前端解析程式碼本身沒有邏輯錯誤。**
  5. **修正驗證**：把同一個「說明PDF圖片測試」request 加上 `params.max_tokens: 4096` 重送，模型思考完後確實接續產生 **358 筆** `type: "content"` chunk，正式回答完整送出（開頭為「《PDF圖片測試.pdf》是一份標註...」）。證實只要提高 `max_tokens`，此情境即可恢復正常。
- **次要發現（相關但獨立的問題）**：`AiRAGApi.js` 的 `onSources` 回呼有把 `event: sources`（引用來源 `sources` 陣列，見文件 4.5 節）存進 `aiMsg.sources`，但 `AiChatPanel.vue` 的 `<template>` 中**完全沒有任何地方讀取或顯示 `msg.sources`**，等同引用來源資訊目前對使用者永遠不可見，直接被捨棄。
- **安全性備註（既有程式碼，非本次新增問題）**：`AiRAGApi.js` 的 `DEFAULT_API_KEY` 與 `KNOWLEDGE_BASE_ID` 直接寫死在前端原始碼中，會被打包進瀏覽器可讀取的 JS bundle，任何人打開瀏覽器開發者工具即可取得這把 API Key。檔案內註解本身也寫「未來將支援依部門由資料庫動態帶入」，建議之後改由後端代理呼叫（`backend` 端持有金鑰），前端不直接持有金鑰。
- **影響範圍**：僅影響 **chat 模式且未使用 `#` 指定文章**（即直接呼叫 `sendExternalChat` 的外部 RAG 問答）情境；有 `#` 指定文章時走 `articleService.getById` + `aiService.streamSummarize`（內部 `/api/ai/*`），「產生文章」「校正文章」走 `aiService.streamWritingAssist`，這兩條路徑本次未測試，是否有相同 `max_tokens` 限制待確認。
- **確認採用的修改方向（開發者已核准，2026-07-21）**：
  1. `max_tokens` 提高為 `60000`。
  2. 加入防禦性 fallback。
  3. 加入引用來源區塊，且與「思考過程」分離為獨立區塊（不再巢狀於摺疊區內）；UI 設計參考 `AiRAG/frontend/src/components/chat/SourceChunks.vue`、`MessageBubble.vue` 的呈現方式（獨立區塊、逐筆列出檔名/段落/相似度分數/已採納標記），並依本專案既有 Element Plus + CSS variables 風格改寫（非 Tailwind）。
  4. API Key 改由後端代理呼叫——**本次不實作**，留待未來開發排程。
- **修正內容**：
  1. **`AiRAGApi.js`**：`sendExternalChat` 組 request body 時，`params.max_tokens` 未帶入時預設改為 `60000`（原本完全未帶、後端預設吃 `1024`）。呼叫端仍可在 `params.max_tokens` 自行覆蓋。
  2. **`AiChatPanel.vue`** 新增 `applyEmptyContentFallback(msg)` 共用函式：串流結束時若 `msg.content` 為空但 `msg.thinkContent` 有內容，改寫 `msg.content` 為明確的截斷提示文字（`> ⚠️ AI 回答被截斷，僅產生思考過程，尚未輸出正式回答，請重新提問或縮小問題範圍再試一次。`）並自動展開思考區塊。`sendMessage()` 與 `sendCommand()` 的 `onDone` 皆已呼叫此函式。
  3. **`AiChatPanel.vue`** `onSources` 回呼改為對每筆 source 補上 `_expanded: false`，供逐筆展開/收合使用。
  4. **`AiChatPanel.vue`** `<template>` 新增獨立的 `.sources-block`（與 `.think-block` 為同層級的兄弟區塊，非巢狀關係），顯示於正文 Markdown 之後、AI 建議關鍵字區之前：逐筆列出來源檔名（依 `metadata.chunk_type` 顯示 📄 文字／🖼️ 圖片圖示）、段落編號、`已採納`／`未採納`（對應 `metadata.included_in_ai_context`）與相似度分數（`semantic_score` 或 `score`）的 el-tag 標籤；點擊該筆可展開/收合顯示完整片段內容（`source.content`）。新增對應 `.sources-block` / `.source-item` / `.source-row` / `.source-content` 等 scoped CSS，沿用既有 `--color-*` 變數風格。
  5. `DEFAULT_API_KEY` 改後端代理：本次未變更，維持現狀（前端仍持有金鑰），待後續排程處理。
- **已完成的驗證**：
  - `npm run build`：編譯成功，無語法錯誤。
  - 直接以 `curl` 對外部 AiRAG API 重送「說明PDF圖片測試」並帶 `params.max_tokens: 4096`（模擬修正後行為），確認模型會在思考完後接續產生 `type: "content"` chunk（358 筆），正式回答完整送出，證實提高 `max_tokens` 確實能解決本次的空白回答問題。
- **未驗證事項（待開發者或後續測試補做）**：
  - **尚未在登入後的瀏覽器環境實測 UI**：本次修改未執行瀏覽器登入操作（登入頁為 BPM 帳號密碼驗證，AI 助手不會自動輸入密碼進行登入），因此「引用來源區塊」的實際排版、樣式與互動（展開/收合）、以及「防禦性 fallback」文字的實際顯示效果，都尚未經過真人瀏覽器畫面確認，僅完成程式碼邏輯與編譯驗證。
  - 麻煩開發者實際登入後，在 AI 問答面板輸入「說明PDF圖片測試」（不加 `#` 指定文章），確認：
    1. 正文區出現完整 Markdown 格式回答（而非只有「已完成思考」摺疊區）。
    2. 「思考過程」與「參考來源」為兩個各自獨立的區塊（參考來源不會出現在思考摺疊區內）。
    3. 參考來源區塊逐筆顯示檔名、段落編號、已採納/未採納標記、相似度分數，點擊可展開看到完整片段內容。
    4. `max_tokens: 60000` 沒有造成串流逾時或後端資源異常（需與 AiRAG 維運人員確認此上限是否合理）。
    5. 若刻意模擬空白回答情境（例如中途中斷），確認 fallback 提示文字會出現，而非完全空白。
