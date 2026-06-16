# 新增需求名稱
## 範本
狀態:
新增需求日期:
預期功能:
預期調整項目:
規劃調整內容:
實際測試:
實際調整項目:
完成日期:

---

# 優化標籤功能
狀態: ✅ 完成
新增需求日期: 2026-05-18
預期功能:
1. 新增部門：標籤需綁定多個部門，供跨部門使用（使用陣列，建立時順便寫入）。
2. 自訂排序：於部門文件狀態下，支援主管自訂標籤排序。
3. 熱度排序：於公開文件狀態下，根據點擊次數進行排序（點擊次數越多排越前）。
4. 公開標籤：支援設定標籤是否於公開文件中顯示並可被點擊。
5. 前端設定：於前端「設定」頁面新增標籤管理 Tab，提供主管建立標籤、設定相關部門、自訂排序及是否公開等功能。
預期調整項目:
- 資料庫 `tags` Table 新增欄位：
  - `departments` (JSON): 紀錄綁定的部門陣列。
  - `custom_order` (INT): 紀錄自訂排序。
  - `click_count` (INT): 紀錄公開文件中的點擊次數。
  - `is_public` (BIT): 標示是否為公開標籤。
- 後端 API：
  - 更新標籤相關 CRUD API，支援寫入及更新上述新增欄位。
  - 新增 API 處理公開標籤點擊次數累加功能。
- 前端調整：
  - `SettingsView.vue` 新增「標籤管理」Tab（僅 MANAGER 可見）。
  - 實作標籤的建立、編輯介面（含部門選擇、自訂排序輸入、是否公開切換）。
  - 標籤顯示邏輯調整：部門文件依 `custom_order` 排序，公開文件依 `click_count` 排序。
規劃調整內容:
1. **DB Schema**:
   修改 `tags` Table，擴充 `departments` (NVARCHAR(MAX))、`custom_order` (INT, default 0)、`click_count` (INT, default 0)、`is_public` (BIT, default 0) 等欄位。
2. **Backend**:
   - 更新 Model `Tag.js`。
   - 更新 Controller `tagController.js` 支援新增欄位的 CRUD，並加入 `incrementClickCount` 功能。
   - 更新 Route `tags.js` 的路由驗證。
3. **Frontend**:
   - `api.js` 擴充標籤 API 的串接。
   - 更新 `SettingsView.vue` 以支援「標籤管理」Tab 介面。
   - 更新既有顯示標籤的元件，依照部門狀態或公開狀態呈現不同的排序方式。
實際測試:
實際調整項目:
完成日期: 2026-05-20

---

# 跨部門管理權限
狀態: ✅ 完成
新增需求日期: 2026-05-18
預期功能:
因為主管或同仁有跨部門管理需求，需要手動新增管理部門。原本前端前三碼篩選機制也要保留，並增加資料庫 Table 專門手動建立。預計在「個人設定」裡面手動加入，並且只有主管角色（MANAGER）能建立。
預期調整項目:
- 資料庫新增 Table `user_extra_departments` 紀錄跨部門權限。
- 後端新增 `/api/v1/cross-departments` 相關 API (取得、新增、刪除)。
- 前端 `SettingsView.vue` 新增「跨部門管理」設定分頁 (僅主管可見)。
- 前端 `TheHeader.vue` 下拉選單在既有的「前三碼篩選」基礎上，聯集顯示自訂新增的部門。
規劃調整內容:
1. **DB Schema**:
   新增 `user_extra_departments` (id, account, org_oid, dept_code, dept_name, created_by, created_at)。
   由 Sequelize `sync` 自動建立（`alter: false`，首次同步建表）。
2. **Backend**:
   - Model `UserExtraDepartment.js`。
   - Controller `crossDepartmentController.js` 提供查、增、刪功能。
   - Route `crossDepartments.js`，所有路由需 `authMiddleware + requireRole('MANAGER')`。
   - 刪除只允許 `created_by = req.user.員工工號`，防止跨人刪除。
   - 掛載至 `backend/src/index.js`，路徑 `/api/v1/cross-departments`。
3. **Frontend**:
   - `api.js` 新增 `crossDeptService`（getByAccount、getAll、create、remove）。
   - `SettingsView.vue` 新增「跨部門管理」Tab（僅 MANAGER 可見）：
     - 下拉選擇公司全部同仁（`account`），選擇目標公司與部門，新增授權。
     - 表格列出自己建立的授權紀錄，可刪除。
   - `TheHeader.vue` 在 `onMounted` 時額外呼叫 `crossDeptService.getAll()`，
     取得當前使用者（`account = 自己`）的跨部門清單，與前三碼篩選結果聯集後顯示。
規格確認（2026-05-18）:
- API 路徑統一用 `/api/v1/cross-departments`。
- MANAGER 授權對象為公司全部同仁，全部角色的同仁都可以被授權。
- ADMIN 暫不開放此功能（無對應 Table 欄位），僅 MANAGER 可操作。
- 刪除只能刪自己建立的紀錄（`created_by = 自己工號`）。
- 建表方式：Sequelize sync（自動建立）。
實際調整項目:
**後端**
- `backend/src/models/UserExtraDepartment.js`（新增）：Table `user_extra_departments`，無 FK 約束，`timestamps: false`。
- `backend/src/models/index.js`：註冊 `UserExtraDepartment`，export 給 controller 使用。
- `backend/src/index.js`：加入 `UserExtraDepartment.sync({ force: false })` 自動建表；掛載 `/api/v1/cross-departments` 路由。
- `backend/src/controllers/crossDepartmentController.js`（新增）：`getMyGrants`（全角色）、`getCreated`（MANAGER）、`create`（含重複檢查）、`remove`（僅 created_by 可刪）。
- `backend/src/routes/crossDepartments.js`（新增）：`GET /my-grants` 僅 authMiddleware；其他端點加 `requireRole('MANAGER')`。
- `backend/src/helpers/accessHelper.js`：`canAccess` 新增第三參數 `extraDeptCodes`，部門判斷加入「前三碼 prefix」與「跨部門授權」兩層；人員比對改為 type-safe `String()` 比較。
- `backend/src/controllers/articleController.js`：新增 `getUserExtraDeptCodes` helper；`getAllArticles`、`getArticleById`、`searchArticles` 均傳入 `extraDeptCodes` 給 `canAccess`。
- `backend/src/controllers/attachmentController.js`：同上，`getAllAttachments`、`getAttachmentById` 加入 `extraDeptCodes`。

**前端**
- `frontend/src/services/api.js`：新增 `crossDeptService`（`getMyGrants`、`getCreated`、`create`、`remove`）。
- `frontend/src/views/SettingsView.vue`：
  - 新增「跨部門管理」Tab（v-if `role === MANAGER`）。
  - 目標部門下拉選項顯示「部門名稱（部門代碼）」，支援中文名稱與代碼雙向搜尋。
  - 已建立授權紀錄表格「被授權同仁」欄顯示姓名＋工號。
  - Tab 首次切換時 lazy-load 資料。
- `frontend/src/components/layout/TheHeader.vue`：`onMounted` 及 `onCompanyChange` 時呼叫 `crossDeptService.getMyGrants()`，聯集前三碼篩選部門與跨部門授權部門，去除重複後顯示。
- `frontend/src/views/ArticleView.vue`：
  - `onMounted` 取得 `myGrantedDepts`（跨部門授權清單）。
  - 完整重寫存取判斷邏輯：`is_public=true` 全員通過；非公開時「指定人員」優先，無指定人員則依前三碼＋跨部門授權；以上 AND 職級門檻；不符合則 `router.push('/') + ElMessage.warning`。
  - 修正 Bug B：`form.hasAccess.部門` 預設值不再 fallback 至登入者部門代碼，避免儲存時汙染 `access_dept`。
  - 移除 `accessDenied` ref 與 Banner 樣板，改為直接跳首頁。
- `frontend/src/components/directory/DirectoryTree.vue`：
  - `onMounted` 取得 `myGrantedDepts`。
  - `checkItemAccess` 重寫為與 `ArticleView.vue` 一致的邏輯：指定人員優先 → 前三碼＋跨部門 → AND 職級，結果為 `primaryAccess && passLevel`。
實際測試:
完成日期: 2026-05-18

---

# 後端 AI 功能開發
狀態: 待規劃
新增需求日期: 2026-05-20
預期功能:
1. **aiService.js**：以 SSE 串流方式將 AI 摘要輸出到 Express Response，串接本地 Ollama 服務。
   - 使用 `/api/chat` + `think: false`，避免 qwen 進入思考模式。
   - 參數：`transcript`（完整逐字稿文字）、`res`（已設定 SSE headers 的 Express Response）。
   - 回傳：`Promise<string>` 完整摘要文字。
   - 使用 `node-fetch`，在 Docker Node.js 環境中串流更穩定。
2. **環境變數新增**：
   - `OLLAMA_MODEL`：Ollama 模型名稱（由開發者填入 .env）。
   - `OLLAMA_URL`：Ollama 服務位址。
   - 程式內使用：`model = config.OLLAMA_MODEL`、`url = \`${config.OLLAMA_URL}/api/chat\``。
3. **AI Prompt 設計**：分兩個角色，各自有獨立的 systemPrompt 與 userPrompt 輸出格式。
   - **角色一：文章解析助手**（放於首頁）
     - systemPrompt：文章解析助手角色定義。
     - userPrompt 輸出格式：
       ```
       ## 核心摘要：一句話總結。
       ## 關鍵重點：使用 bullet points 列表。
       ## 深入分析：根據文章屬性區分（例如：技術拆解、邏輯辯證）。
       ## 結論與洞察：AI 總結出的價值點。
       ```
   - **角色二：寫作助手**（放於編輯 / 新建文章頁）
     - systemPrompt：寫作助手角色定義，支援 Word 解析或文章生成。
     - userPrompt 輸出格式：
       ```
       # 核心摘要
       (一句話總結本文核心)

       ## 關鍵觀點 / 技術重點
       - 觀點 1...
       - 觀點 2...

       ## 詳細內容
       (正文內容，請使用標準 Markdown 排版)

       ## 參考資料 / 來源
       - Word 來源檔案：(若從 Word 轉換)
       ```
實際調整項目:
**後端**
- `backend/src/services/aiService.js`（新增）：SSE 串流核心，`streamArticleSummary`（文章解析助手）與 `streamWritingAssist`（寫作助手），使用 `node-fetch@2` 呼叫 Ollama `/api/chat`，`think: false` 停用思考模式。
- `backend/src/controllers/aiController.js`（新增）：`summarize`（POST）與 `writingAssist`（POST）；Word 上傳使用 `mammoth` 解析文字後傳入 service。
- `backend/src/routes/ai.js`（新增）：掛載兩個端點，`/writing-assist` 使用 multer memoryStorage，限制 `.doc/.docx`、5 MB；multer 錯誤統一由 `handleUploadError` middleware 回應友善訊息。
- `backend/src/index.js`：掛載 `/api/v1/ai` 路由。
- `backend/.env`：新增 `OLLAMA_URL`、`OLLAMA_MODEL`（值由開發者填入）。
- 新安裝套件：`node-fetch@2`、`mammoth`。
預期調整項目:
- `backend/src/services/aiService.js`：實作 SSE 串流邏輯、兩組 prompt（解析助手、寫作助手）、Ollama API 呼叫。
- `backend/.env` / `backend/src/config/`：新增 `OLLAMA_MODEL`、`OLLAMA_URL` 設定。
- 後端 Route / Controller：新增對應 AI 功能的 API 端點，供前端首頁與文章編輯頁呼叫。
- 前端：串接 SSE 端點（首頁 AI 問答、編輯頁寫作助手），顯示串流回應。
  - 首頁：AI 回應以標籤 / 關鍵字呈現，可點擊跳轉至對應文章或搜尋結果。
  - 編輯頁：Word 上傳限制 `.doc` / `.docx`，檔案大小上限 5 MB，前端需驗證並顯示友善錯誤訊息。
  - AI 產生文章後提供「一鍵貼入」按鈕，將 Markdown 內容貼入新建或編輯中的 Vditor 編輯器，貼入前需 user 確認以防覆蓋既有內容。
規劃調整內容:
1. **Backend - aiService.js**:
   - 實作 `streamArticleSummary(transcript, res)` 函式（文章解析助手）。
   - 實作 `streamWritingAssist(content, res)` 函式（寫作助手）。
   - 兩個函式共用 Ollama `/api/chat` 呼叫邏輯，差異在 systemPrompt / userPrompt。
   - 使用 `node-fetch` 發送請求，逐 chunk 轉發至 SSE response。
2. **Backend - config**:
   - `config.js` 讀取 `process.env.OLLAMA_MODEL`、`process.env.OLLAMA_URL`。
3. **Backend - Route / Controller**:
   - `POST /api/v1/ai/summarize`：呼叫文章解析助手，回應 SSE。
   - `POST /api/v1/ai/writing-assist`：呼叫寫作助手，回應 SSE。
4. **Frontend**:
   - 首頁 AI 問答：串接 `/api/v1/ai/summarize`，以 `EventSource` 顯示解析結果。
     - 輸出以標籤、關鍵字方式引導 user 前往指定文章（可點擊標籤 / 關鍵字跳轉搜尋或文章頁）。
   - 文章編輯頁：串接 `/api/v1/ai/writing-assist`。
     - 上傳限制：僅接受 Word 檔案（`.doc`、`.docx`），MIME type 驗證。
     - 檔案大小上限：5 MB，超過需提示錯誤並阻擋上傳。
     - AI 產生文章後，顯示預覽區塊，提供「一鍵貼入」按鈕：
       - 若在編輯文章頁：將 AI 產生的 Markdown 內容直接貼入 Vditor 編輯器。
       - 若在新建文章頁：同上，貼入空白的 Vditor 編輯器。
       - 貼入前需提示 user 確認（避免覆蓋既有內容），user 確認後才執行。
實際調整項目:
**後端**
- `backend/src/services/aiService.js`（新增）：SSE 串流核心，`streamArticleSummary`、`streamWritingAssist`，`node-fetch@2` + `think: false`。
- `backend/src/controllers/aiController.js`（新增）：兩個 handler，Word 用 `mammoth` 解析。
- `backend/src/routes/ai.js`（新增）：multer memoryStorage，限 `.doc/.docx`、5 MB，錯誤由 `handleUploadError` 統一回應。
- `backend/src/index.js`：掛載 `/api/v1/ai`。
- `backend/.env`：新增 `OLLAMA_URL`、`OLLAMA_MODEL`。
- 新安裝套件：`node-fetch@2`、`mammoth`。

**前端**
- `frontend/src/services/api.js`：新增 `readSSEStream` helper（fetch ReadableStream 解析）與 `aiService`（`streamSummarize`、`streamWritingAssist`），支援 FormData 與 JSON 兩種 payload，傳入 `AbortSignal` 支援取消。
- `frontend/src/components/panels/AiChatPanel.vue`：全面改寫：
  - `chat` 模式：呼叫 `aiService.streamSummarize`，回應結束後擷取 `**粗體**` 關鍵字為可點擊 chip，點擊導向首頁搜尋（`/?q=keyword`）。
  - `generate` 模式：提供 Word 上傳按鈕（前端驗證 `.doc/.docx`、5 MB），呼叫 `aiService.streamWritingAssist`；AI 生成完畢後顯示「一鍵貼入編輯器」按鈕，點擊跳出 `ElMessageBox.confirm` 確認後 `emit('apply', content)`。
  - `correct` 模式：以 `contextContent` prop 呼叫 `aiService.streamWritingAssist`，生成完畢同樣顯示「一鍵貼入」按鈕。
  - 所有模式使用 `AbortController` 於面板關閉時中止串流；節流渲染（每 100ms 更新一次 HTML）。
- `frontend/src/views/HomeView.vue`：引入 `useRoute`，`onMounted` 與 `watch(route.query.q)` 自動帶入 AI 關鍵字 chip 的搜尋詞並觸發搜尋。
實際測試:
完成日期:

---

# 優化 AI 面板「新對話」按鈕位置與輸入框高度對齊
狀態: ✅ 完成
新增需求日期: 2026-05-20
預期功能:
1. 將原本置於 AI 面板頂部（Header）的新對話按鈕移至底部輸入框下方的提示訊息旁，解決因頂部空間不足而導致按鈕被遮擋或不易被看見的問題。
2. 讓 AI 面板底部的「送出」按鈕與左側「輸入框」在各種字數/字型下都能保持高度一致與對齊。
預期調整項目:
- 前端調整：
  - `AiChatPanel.vue`：
    - 將「新對話」按鈕從 header 移到 footer，並與 `input-hint` 橫向並排，新增自訂 flex 佈局美化。
    - 調整輸入列的 flex 佈局為 `align-items: stretch`，使送出按鈕的高度與左側輸入框完全拉平一致。
規劃調整內容:
1. **Frontend**:
   - 修改 `AiChatPanel.vue` 的 `<template>`，移除 header 內的新對話按鈕。
   - 在 footer 部分的提示文字旁新增新對話按鈕，包裝於 `.input-footer-row`。
   - 修改 CSS，將 `.input-row` 的 `align-items` 從 `flex-end` 改為 `stretch`，並將 `.send-btn` 的寫死高度 `64px` 改為 `auto` 以及 `align-self: stretch`。
實際調整項目:
- `frontend/src/components/panels/AiChatPanel.vue`：搬移新對話按鈕，設定 `.input-footer-row` 為 flex排版，限制按鈕大小；同時調整輸入框列排版，讓送出按鈕與輸入框高度自適應對齊。
實際測試: 打開 AI 面板，新對話按鈕成功顯示於底部提示字右側，且送出按鈕與左側輸入框高度完美一致且完全對齊。
完成日期: 2026-05-20

---

# 撰寫系統操作使用手冊
狀態: ✅ 完成
新增需求日期: 2026-05-22
預期功能:
1. 作為講師詳細說明知識庫應用的各個頁面與運作方式。
2. 將操作手冊寫入 `docs/UserManual.html`。
3. 對 Vue 3 前端應用的每個按鈕與欄位功能進行完整詳細的描述。
4. 將系統中 Ollama 與 AI 智慧輔助功能明確標示為「尚未啟用 / 建置中」。
預期調整項目:
- 新增 `docs/UserManual.html`。
規劃調整內容:
1. 設計美觀、互動性高、帶有側邊目錄導航（Table of Contents）與典雅深綠色/青色（象徵太陽能與綠色能源）主題的前端手冊。
2. 分析包含登入、首頁檢索、頂部導覽列、側邊選單、目錄樹（含權限管理與拖曳排序）、文章管理（瀏覽/編輯/歷史版本/留言）、附件管理（瀏覽/下載/上傳檔案）、個人與主管偏好設定（標籤管理/跨部門指派）、以及管理員後台設定的每個功能按鈕。
3. 建立專門章節詳細說明 Ollama 與 AI 問答/輔助產生文章等 AI 智慧功能目前均為「尚未啟用 / 建置中」狀態。
實際調整項目:
- `docs/UserManual.html`（新增）：完成具有卓越視覺設計的 HTML 使用手冊。詳細列出並說明了前台與後台的所有按鈕功能，深入講解了級職查看門檻與主管跨部門權限管理機制的背景邏輯，並對 AI 智慧輔助功能進行「尚未啟用」的重點標示與警告橫幅公告。
完成日期: 2026-05-22

---

# AI 提示詞與配置資料庫化
狀態: ✅ 完成
新增需求日期: 2026-06-16
預期功能:
1. 將原本寫死在 `aiService.js` 中的 AI 提示詞（System Prompts 與 User Prompt Templates）與 AI 模型配置（如 `llama_url`、`llama_model`，以及 `temperature`、`timeout` 等參數）移至資料庫中管理，方便靈活調整。
2. 規劃對齊專案命名規範的資料表 Schema，提供獨立分離式與整合型兩種設計方案。
3. 規劃改寫後端 `aiService.js` 的邏輯，整合快取機制以避免每次呼叫都查詢資料庫。
預期調整項目:
- 新增規劃文件 `docs/AI_PROMPT_DB_PLAN.md`。
- 修改後端代碼實現資料庫存取 AI 提示詞與配置。
規劃調整內容:
- 在 `docs/AI_PROMPT_DB_PLAN.md` 產出詳細規劃，並在後端實作 Model、Seed、和 aiService.js 的改寫。
實際調整項目:
- `docs/AI_PROMPT_DB_PLAN.md`（新增）：完成規劃文件的撰寫，內含方案 A（獨立分離式）與方案 B（整合型）之詳細規格與實作大綱。
- `backend/src/models/AiConfig.js`（新增）：定義 `ai_configs` 表的模型欄位。
- `backend/src/models/AiPromptTemplate.js`（新增）：定義 `ai_prompt_templates` 表的模型欄位。
- `backend/src/models/index.js`（修改）：註冊並匯出 `AiConfig` 與 `AiPromptTemplate` 模型。
- `backend/src/index.js`（修改）：伺服器啟動時自動同步建表，並於目錄樹初始化後調用 `seedAiPrompts()` 初始化資料。
- `backend/src/scripts/seedAiPrompts.js`（新增）：提供 AI 提示詞與配置初始化的 seed 腳本。
- `backend/src/services/aiService.js`（修改）：重構為動態從資料庫載入 Prompt 與配置，整合 local memory 快取（TTL 5 分鐘）與 fallback 備份邏輯。
完成日期: 2026-06-16



