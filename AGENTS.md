# GigaSolar Knowledge Base

# AiRAG 開發手冊 (AGENT.md)

> 本文件是 AI 程式助手（如 Claude、Gemini）在本專案中的行為準則。  
> 所有 AI 協作開發必須遵守以下規範。

---

## 1. 先思考再動手

### 規則
- **動手之前，先說明你的理解與假設**。用 1-3 句話摘要你打算做什麼、為什麼這樣做。
- **有任何疑問，先問，不要猜**。錯誤的假設比多問一個問題代價高得多。
- 如果需求模糊或有多種解讀方式，列出你看到的選項，讓人類選擇。

### 範例
```
❌ 錯誤：直接開始寫程式碼
✅ 正確：「我理解你想在 FeedbackPanel 加一個下拉選單，
    讓使用者選擇錯誤類型。我假設選項是從 API 動態取得，
    而不是前端寫死。這樣對嗎？」
```

---

## 2. 簡單優先

### 規則
- **用最少的程式碼解決當前問題**，不要加用不到的功能。
- 不要「順便」引入新的套件、設計模式或抽象層，除非任務明確要求。
- 不要寫「未來可能用到」的程式碼。等需要的時候再加。
- 如果一個問題能用 10 行解決，不要寫 50 行。

### 範例
```
❌ 錯誤：為了一個簡單的 config 讀取，建立 Factory Pattern + Strategy Pattern
✅ 正確：直接讀取 .env，用一個 dict 就好
```

---

## 3. 外科手術式修改

### 規則
- **只改必須改的地方**。不要順手「整理」、「重構」或「優化」不相關的程式碼。
- 不要改動現有的程式碼格式（縮排、空行、引號風格），除非那就是你的任務。
- 不要重新命名你沒被要求改的變數或函式。
- 每次修改都應該能用一句話解釋為什麼改。

### 範例
```
❌ 錯誤：修 bug 的同時，把整個檔案的 var 改成 let，並重新排列 import
✅ 正確：只修改造成 bug 的那 3 行，其他一字不動
```

---

## 4. 目標導向執行

### 規則
- **先定義成功標準**：在開始之前，明確說出「做到什麼程度算完成」。
- 自己迭代直到達成目標，不要每做一步就停下來問。
- 如果遇到阻塞（缺少資訊、權限不足），才停下來回報。
- 完成時，簡要說明做了什麼、驗證了什麼。

### 範例
```
❌ 錯誤：「我已經寫好了 API route，你要不要看一下再繼續？」
✅ 正確：「我完成了 feedback API 的 CRUD 四個端點，
    已經確認 schema 符合 03_API_CONTRACT.md 的定義，
    並加上了錯誤處理。」
```

---

## 5. 尊重既有風格

### 規則
- **遵循現有程式碼的命名規範、寫法與慣例**，不要悄悄引入自己的風格。
- 新增程式碼前，先看同目錄下的現有檔案，學習它的風格。
- 保持一致性比「更好的寫法」更重要。

### 本專案慣例
| 項目 | 規範 |
|:---|:---|
| 前端框架 | Vue 3 Composition API (`<script setup>`) |
| 前端樣式 | Tailwind CSS |
| 後端框架 | Python FastAPI |
| 後端命名 | 函式/變數 `snake_case`，類別 `PascalCase` |
| API 路徑 | `/api/{module}/{action}`，全小寫，用連字號分隔 |
| MongoDB ODM | beanie (Document Models) |
| 註解語言 | 繁體中文或英文皆可，同一檔案內統一 |

### 範例
```
❌ 錯誤：現有程式碼用 snake_case，你卻寫 camelCase
❌ 錯誤：現有程式碼用 async def，你卻寫 sync 版本
✅ 正確：看到 get_chat_history() 就寫 get_feedback_list()，保持風格一致
```

---

## 6. 失敗要明確說

### 規則
- **失敗就說失敗**，不能把「靜默跳過」包裝成「任務完成」。
- 如果某個步驟做不到、某個 API 回傳錯誤、某段程式碼無法通過測試，必須明確告知。
- 不要用 `try/except: pass` 吞掉錯誤。
- 不要刪掉失敗的測試案例來讓測試「通過」。

### 範例
```
❌ 錯誤：「已完成部署」（實際上有 2 個服務啟動失敗但沒提）
❌ 錯誤：靜默 catch 所有 exception，回傳空結果假裝成功
✅ 正確：「部署完成，但 embedding service 啟動失敗，
    錯誤訊息是 'Connection refused on port 8080'，
    可能是 llama.cpp 服務尚未啟動。」
```


使用 Vue 3 + JavaScript 開發的知識庫平台前端。
使用 Node.js + Express 開發的知識庫平台後端。
資料庫以 MySQL + Sequelize 為架構目標；目前後端套件同時包含 `mssql` / `tedious`，修改資料存取前需先確認實際部署資料庫與連線設定。

## 回應規範

- 一律使用繁體中文回應。
- 程式碼中的變數名稱、函式名稱與註解使用英文。
- 說明變更時優先列出實際修改檔案、驗證方式與尚未完成事項。

## 專案結構

```text
.
├── AGENTS.md
├── CLAUDE.md
├── docs/
├── frontend/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── directory/
│   │   │   ├── layout/
│   │   │   └── panels/
│   │   ├── router/
│   │   ├── services/
│   │   ├── store/
│   │   ├── utils/
│   │   └── views/
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── helpers/
│   │   ├── middlewares/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── scripts/
│   │   └── services/
│   └── package.json
└── 資料庫/
```

## 重要文件

- [專案需求文件](./docs/01_PRD.md)
- [系統架構文件](./docs/02_ARCHITECTURE.md)
- [API 合約文件](./docs/03_API_CONTRACT.md)
- [資料庫 Schema](./docs/04_DB_SCHEMA.md)
- [驗收規格](./docs/05_ACCEPTANCE.md)
- [AI 後端任務](./docs/DevelopmentProcess/AI_BACKEND_TASK.md)
- [前端待修正項目](./docs/DevelopmentProcess/FRONTEND_PENDING.md)
- [後端待修正項目](./docs/DevelopmentProcess/BACKEND_PENDING.md)
- [前端開發指南](./frontend/FRONTEND_GUIDE.md)
- [新功能開發文件放到，並產生MD檔](./docs/DevelopmentProcess/)

## 技術棧

### 前端

- **核心框架**：Vue 3 Composition API + Vite
- **語言**：JavaScript；目前專案含 `tsconfig.json`，但既有程式以 `.js` / `.vue` 為主
- **UI 元件庫**：Element Plus、`@element-plus/icons-vue`
- **狀態管理**：Pinia
- **路由管理**：Vue Router，頁面放在 `frontend/src/views`
- **Markdown 編輯**：Vditor，需支援即時預覽與圖片拖曳上傳 Hook
- **網路請求**：Axios，集中於 `frontend/src/services/api.js`
- **即時資料**：
  - 原生 `EventSource` 處理 Server-Sent Events AI 回應
  - 原生 `WebSocket` 處理多人編輯感知
- **認證儲存**：Token 儲存於 `sessionStorage`，Tab 關閉或另開分頁即需重新登入

### 後端

- **核心框架**：Node.js + Express
- **設計模式**：Controller-Service-Repository 概念；目前目錄以 `routes`、`controllers`、`services`、`models` 分層
- **ORM**：Sequelize
- **即時通訊**：`ws` 套件，管理文件編輯 Room 機制
- **快取層**：Redis 規劃負責：
  - BPM 同仁列表快取，TTL 為 1 小時，供 @提及下拉選單與權限指派使用
  - Session / JWT 黑名單管理
  - WebSocket Pub/Sub，支援跨容器廣播編輯感知事件
- **檔案服務**：透過 Express `express.static` 提供靜態檔案讀取，並配置 JWT middleware 驗證讀取權限
- **檔案上傳**：使用 Multer，既有上傳目錄為 `backend/uploads`

## 常用指令

### 前端

```powershell
cd frontend
npm install
npm run dev
npm run build
npm run preview
```

### 後端

```powershell
cd backend
npm install
npm run dev
npm start
```

### 後端資料與檢查

```powershell
cd backend
node src/test_sequelize.js
node src/scripts/seedDirectories.js
```

## 開發規範

### 命名規範

- 變數與函式：camelCase，例如 `getUserName`
- 元件名稱：PascalCase，例如 `UserProfile`
- 常數：UPPER_SNAKE_CASE，例如 `API_BASE_URL`
- Vue 元件檔案名稱：PascalCase，例如 `UserProfile.vue`
- 非元件檔案名稱：camelCase，例如 `userService.js`
- Pinia store 檔案使用業務名詞，例如 `auth.js`、`directory.js`
- 布林值使用 `is`、`has`、`should`、`can` 前綴，例如 `isActive`

### Vue 元件開發

- 統一使用 `<script setup>` 語法。
- 優先使用 Composition API。
- 超過 200 行的元件應評估拆分為子元件、composable 或 service。
- Layout 元件放在 `frontend/src/components/layout`。
- 頁面級元件放在 `frontend/src/views`。
- 可重用業務元件放在 `frontend/src/components` 下依功能分目錄。
- API 呼叫不要散落在 Vue 元件中，優先封裝於 `frontend/src/services/api.js` 或同目錄 service。
- 全域狀態優先放在 `frontend/src/store`，避免跨頁面用 props 層層傳遞。
- UI 優先使用 Element Plus 與 `@element-plus/icons-vue`，維持既有視覺風格。

### 前端狀態與認證

- 登入 token 使用 `sessionStorage`，不要改為 `localStorage`，除非需求文件明確變更。
- Axios request interceptor 應統一附加 token。
- Axios response interceptor 應集中處理 401、403 與通用錯誤訊息。
- 新增需要登入的頁面時，需同步檢查 `frontend/src/router/index.js` 的路由守衛。

### 後端開發

- Route 只負責路由定義、middleware 串接與 controller 綁定。
- Controller 負責 request / response、狀態碼與參數取得，不放複雜商業邏輯。
- Service 負責商業邏輯、外部系統整合與交易流程。
- Model 負責 Sequelize schema 與關聯定義。
- Helper 只放純函式或跨模組輔助邏輯，避免依賴 Express request / response。
- 新增 API 時需同步確認 `backend/src/index.js` 是否已掛載 route。
- 權限檢查優先使用既有 `backend/src/middlewares/auth.js` 與 `backend/src/helpers/accessHelper.js`。
- 不要將密碼、token、資料庫連線字串寫死在程式碼中；使用 `.env`。

### 錯誤處理

- API 呼叫使用 try-catch 包裹。
- 前端錯誤訊息需對使用者友善，避免直接顯示未整理的 stack trace。
- 後端錯誤 response 使用一致格式，至少包含 `message`；需要除錯資訊時只在非正式環境輸出。
- 預期錯誤使用明確 HTTP status code，例如 400、401、403、404、409。
- 非預期錯誤統一回 500，並在 server log 記錄詳細資訊。

### API 設計

- API 路徑、request、response 優先依照 `docs/03_API_CONTRACT.md`。
- 命名使用 RESTful 語意，資源名稱使用複數，例如 `/articles`、`/directories`。
- 分頁參數使用一致命名，例如 `page`、`pageSize`。
- 搜尋與篩選參數放 query string。
- 建立與更新資料前需做必要欄位驗證與權限檢查。
- 前端API統一在`frontend/src/services/api.js`接入。

### 資料庫與模型

- Sequelize model 與資料庫 schema 需對齊 `docs/04_DB_SCHEMA.md`。
- 修改資料表結構時，需同步更新文件或 migration / seed 腳本。
- 牽涉文章、附件、留言、通知、權限的資料異動需留意關聯完整性。
- 刪除資料前優先確認是否需要軟刪除或保留版本歷史。

### 檔案與附件

- 上傳檔案預設存放於 `backend/uploads`。
- 靜態檔案讀取必須經過 JWT 與權限檢查。
- 新增檔案 API 時需檢查檔案大小、MIME type 與路徑穿越風險。
- 不要將使用者上傳檔案提交到 git。

## 常見任務

### 建立新頁面

1. 在 `frontend/src/views` 新增 PascalCase `.vue` 頁面。
2. 在 `frontend/src/router/index.js` 新增 route，必要時設定登入權限 meta。
3. 若頁面需要共用狀態，在 `frontend/src/store` 新增或擴充 Pinia store。
4. API 呼叫封裝在 `frontend/src/services`，不要直接散落於頁面元件。
5. 使用 Element Plus 組件與既有 layout，確認桌面與常見筆電解析度可用。
6. 執行 `npm run build` 驗證前端可編譯。

### 建立新 API 串接

1. 先查閱 `docs/03_API_CONTRACT.md`，確認路徑、方法與資料格式。
2. 後端在 `backend/src/routes` 新增或擴充 route。
3. 在 `backend/src/controllers` 新增 controller 方法。
4. 需要商業邏輯時放到 `backend/src/services`。
5. 需要資料表存取時新增或擴充 `backend/src/models`。
6. 在 `backend/src/index.js` 掛載 route。
7. 前端在 `frontend/src/services/api.js` 增加對應方法。
8. 需要全域狀態時更新 `frontend/src/store`。
9. 手動驗證成功、失敗、未登入與無權限情境。

### 建立文章相關功能

- 優先檢查既有檔案：
  - `frontend/src/views/ArticleView.vue`
  - `frontend/src/services/api.js`
  - `backend/src/routes/articles.js`
  - `backend/src/controllers/articleController.js`
  - `backend/src/models/Article.js`
- 文章內容需考慮版本歷史、附件、標籤、留言與通知的關聯。
- 編輯器功能需留意 Vditor 初始化、內容同步與圖片拖曳上傳流程，非必要勿修改，避免跑版。

### 建立目錄相關功能

- 優先檢查既有檔案：
  - `frontend/src/components/directory/DirectoryTree.vue`
  - `frontend/src/store/directory.js`
  - `backend/src/routes/directories.js`
  - `backend/src/controllers/directoryController.js`
  - `backend/src/helpers/treeHelper.js`
- 目錄異動需確認樹狀結構、排序、權限繼承與文章歸屬。

### 建立附件相關功能

- 優先檢查既有檔案：
  - `frontend/src/views/AttachmentView.vue`
  - `backend/src/routes/attachments.js`
  - `backend/src/controllers/attachmentController.js`
  - `backend/src/models/Attachment.js`
  - `backend/src/models/AttachmentFile.js`
  - `backend/src/models/AttachmentVersionHistory.js`
- 附件需考慮版本、權限、檔案大小與檔案讀取驗證。

## 測試與驗證

- 開發者測試完後會請AI修改，AI應先檢查問題後將檢查結果更新到`FRONTEND_PENDING.md` / `BACKEND_PENDING.md`。

## Git 與提交

- 不要提交 `node_modules`、`dist`、`.env`、`backend/uploads` 或使用者上傳檔案。
- 開發者自行管理

## 安全注意事項

- 不要在回應或 commit 中揭露 `.env`、token、密碼或內部連線字串。
- 所有需要登入的 API 都必須套用 JWT middleware。
- 權限判斷需在後端執行，前端隱藏按鈕不能視為安全控制。
- 使用者輸入需做驗證與必要的清理，尤其是 Markdown、檔名、搜尋字串與 URL。
- 檔案路徑需避免 path traversal。
- 對外部系統 BPM / NANA / AI 服務呼叫時，需處理 timeout、錯誤與重試上限10次。
