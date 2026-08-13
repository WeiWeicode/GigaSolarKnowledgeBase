# AI 歷史訊息規劃（KB 前端顯示 AI 對話紀錄 + 最愛/釘選/自訂標題）

## 0. 文件資訊

- **狀態**：**第一期程式碼施作完成（2026-08-13），待使用者實機驗證**（驗證清單見 7 節 TASK-V1）。原文如下：規劃完成。第 3 節方案已於 2026-08-12 決策為**方案 A**；第 9 節加值功能第一期只納入**自動命名標題**。**第 8 節第 7 項（Mongo 連線）已於 2026-08-13 由 AiRAG 端完成，不再是阻塞點**，唯一剩餘的外部相依是「KB 主機到 AiRAG MongoDB 的網路可達性」實測（見 4.3）。
- **建立日期**：2026-08-12
- **修訂記錄**：
  - v1.4（2026-08-13）**修正「新對話仍寫入舊歷史串」缺陷**（使用者實測回報）。原因是 `clearMessages()`（「新對話」按鈕）只清訊息、沒清 session 識別碼，下一輪問答因此被 append 進上一段對話；若上一段已在 AI 歷史被刪除（`is_hidden`），新訊息更會寫進列表永遠看不到的對話裡。四處修正：
    1. `useAiChat.clearMessages()` 一併清空 `currentSessionUid` / `currentSessionId`。
    2. `store/aiChat.js` 新增 `startNewConversation()`（只清對話，保留思考模式／嚴謹度等偏好），`reset()` 改為呼叫它以免重複。
    3. **後端 `appendMessages` 拒絕寫入 `is_hidden` 的對話**，回 `404` 並帶 `code: 'SESSION_NOT_FOUND'`；前端 `persistChatTurn` 收到後自動改開新對話重送一次。帶 `code` 是因為 axios interceptor 只 reject response body、HTTP status 會遺失。這一層是結構性防線，跨分頁刪除也涵蓋。
    4. `AiHistoryView` 刪除的若正好是 `/ai-chat` 進行中的那段對話，同步呼叫 `startNewConversation()`。
  - v1.3（2026-08-13）**第一期程式碼施作完成**，TASK-B1～B6、F1～F3 全數產出。與規劃的三處差異：
    1. **建表改走 `sync({ force: false })`**：規劃 TASK-B2 原訂寫 SQL 腳本，但 repo 既有慣例（`rag_sync_*` 等所有近期新表）是在 `backend/src/index.js` 呼叫 `Model.sync({ force: false })`。改為以 sync 為實際執行路徑，`資料庫/01_create_ai_chat_tables.sql` 保留為 DBA 預先建表與欄位對照用，兩者皆為冪等、先跑哪個都不衝突。
    2. **`POST /ai-chats/:id/messages` 新增 `matchQuestion` 欄位**：前端送給 AiRAG 的提問字串會額外接上「目前參考文章內容」，與畫面顯示（也就是存進 `content`）的使用者輸入不同。5.1 節原訂用 `question` 比對 Mongo，實作時發現這樣在有帶文章脈絡時永遠比對不到，故新增此欄位專供比對、不落地。
    3. **`AiChatPanel.vue`（文章頁彈窗）也會落地歷史**：`useAiChat.js` 的 session 兩個 ref 以預設值形式解構，彈窗不需修改即可運作，每次開啟為獨立一段對話。若只想記錄 `/ai-chat` 主頁的對話，需另行在 panel 端關閉。
  - v1.2（2026-08-13）**AiRAG 端已完成 MongoDB 認證與 `kb_reader` 唯讀帳號**（見 4.3、8 節第 7 項）。連線方式與權限範圍已確定，第 8 節第 7 項解除阻塞；同時得知 `external_chat_logs` 現有 82 筆既有資料，供第 8 節第 6 項決策參考。
  - v1.1（2026-08-12）使用者決策：採方案 A（KB 落地為主 + Mongo 回填）；加值功能第一期只做「自動命名標題」，「繼續此對話」「回收桶還原」「對話存成 KB 文章」移至第二期。文件第 5、6、7、9 節已依此收斂範圍。
  - v1.0（2026-08-12）初版規劃。
- **需求來源**：使用者口述需求（2026-08-12）
  1. KB 前端顯示 AI 歷史訊息，可加入最愛、釘選、自訂標題。
  2. AiRAG 的 MongoDB `external_chat_logs` 可取得歷史對話紀錄。
  3. **AiRAG 專案不修改程式碼**。
  4. KB 後端（SQL Server `10.10.130.220`）關聯到 MongoDB；於 KB DB 建立新表存放最愛、釘選、自訂標題、排序、是否隱藏。
  5. 前端左方選單新增「AI 歷史訊息」，可查詢、釘選、自訂標題、刪除（隱藏即可）。
- **範圍聲明**：
  - 涵蓋 **KB 前端（`frontend/`）** 與 **KB 後端（`backend/`）**。
  - **AiRAG 專案不修改**（符合需求 3）。第 3 節方案 C 為「需要改 AiRAG」的選項，僅列出供比較，預設不採用。
  - 標註「⚠️ 待確認」處為依現有程式碼推論的設計，非使用者逐字確認過的規格。
- **相關文件**：
  - [docs/03_API_CONTRACT.md](../03_API_CONTRACT.md)、[docs/04_DB_SCHEMA.md](../04_DB_SCHEMA.md)
  - [docs/DevelopmentProcess/EXTERNAL_API_INTEGRATION_GUIDE.md](EXTERNAL_API_INTEGRATION_GUIDE.md)（AiRAG 問答端點契約）
  - [docs/DevelopmentProcess/AI_CHAT_MAIN_PAGE_PLAN.md](AI_CHAT_MAIN_PAGE_PLAN.md)（AI 問答主頁既有設計）
  - [docs/DevelopmentProcess/RAG_SYNC_PLAN.md](RAG_SYNC_PLAN.md)（KB ↔ AiRAG 既有整合模式，本文件的分層與命名沿用其慣例）

---

## 1. 現況調查（已完成，以下皆為讀原始碼確認）

### 1.1 KB 的 AI 問答目前怎麼跑

| 項目 | 現況 |
|:---|:---|
| 呼叫路徑 | **前端瀏覽器直接呼叫 AiRAG**：[frontend/src/services/AiRAGApi.js:147](../../frontend/src/services/AiRAGApi.js:147) 以 `fetch` 打 `POST http://<AiRAG>:53020/api/external/chat`，帶 `X-API-Key` |
| KB 後端角色 | **完全不在問答鏈路上**。只透過 `GET /api/v1/ai/config`（[backend/src/routes/ai.js:33](../../backend/src/routes/ai.js:33)）把 apiKey / knowledgeBaseId 發給前端 |
| 對話狀態 | 只存在 Pinia 記憶體：[frontend/src/store/aiChat.js](../../frontend/src/store/aiChat.js) 的 `messages`，登出即 `reset()`，**重新整理頁面就消失** |
| 訊息結構 | `{ id, role: 'user'\|'ai', content, htmlContent, streaming, sources[], keywords[] }`（見 [frontend/src/composables/useAiChat.js:397](../../frontend/src/composables/useAiChat.js:397)、`:504`） |
| 左方選單 | [frontend/src/components/layout/TheSidebar.vue:62](../../frontend/src/components/layout/TheSidebar.vue:62) 的 `navItems`，目前 4 項（首頁 / AI問答 / 建立文章 / 上傳文件） |

### 1.2 KB 後端資料層現況

- 資料庫實際為 **SQL Server**（`dialect: 'mssql'`，見 [backend/src/config/sequelize.js:11](../../backend/src/config/sequelize.js:11)），連線資訊由 `KB_DB_HOST` 等環境變數提供 → 即需求中的 `10.10.130.220`。
- Model 全部走 Sequelize，集中註冊於 [backend/src/models/index.js](../../backend/src/models/index.js)。
- Route 前綴為 `/api/v1`（見 [backend/src/index.js:37](../../backend/src/index.js:37) 的 `${API}`）。
- ⚠️ **`backend/package.json` 目前沒有任何 MongoDB driver**（只有 `mssql`/`tedious`/`sequelize`）。要讀 `external_chat_logs` 必須新增 `mongodb` 套件。

### 1.3 AiRAG `external_chat_logs` 實際欄位

來源：[AiRAG/backend/models/external_chat_log.py](../../../AiRAG/backend/models/external_chat_log.py)（本 repo 外，路徑相對於 `D:\檔案分享\程式碼\`）

| 欄位 | 型別 | 說明 |
|:---|:---|:---|
| `_id` | ObjectId | Mongo 主鍵 |
| `api_key_id` | ObjectId \| null | 呼叫端金鑰 ID（**可用來過濾「只看 KB 打進去的」**） |
| `employee_id` / `employee_name` | str | 呼叫端宣稱的員工身分 |
| `department_code` / `department_name` / `job_title_name` / `job_title_level` | str / int | 身分快照 |
| `knowledge_base_id` | str \| null | 本次檢索的知識庫 |
| `search_type` | str \| null | 檢索模式 |
| `question` | str | 使用者提問 |
| `answer` | str | 完整回答（串流累積結果） |
| `sources_summary` | array | `{ filename, chunk_id, chunk_index, score, semantic_score }` |
| `custom_system_prompt` | str \| null | |
| `elapsed_ms` | int \| null | 耗時 |
| `created_at` | datetime | **UTC**（`datetime.utcnow`） |

索引：`-created_at`、`employee_id`、`api_key_id`。

---

## 2. ⚠️ 關鍵阻塞點（設計必須先解決這件事）

**`external_chat_logs` 是「單輪問答稽核紀錄」，不是「對話（session）紀錄」。** 具體三個缺口：

1. **沒有 session_id / conversation_id 欄位。** 一次 `POST /api/external/chat` = 一筆 log。同一段多輪對話會散成 N 筆彼此無關聯的文件，**無法從 Mongo 還原「哪幾輪屬於同一段對話」**。
2. **`_id` 不會回傳給呼叫端。** 寫入動作在 `_external_chat_with_logging()` 的 `finally` 區塊（[AiRAG/backend/routers/external.py:85](../../../AiRAG/backend/routers/external.py:85)），SSE 串流中沒有任何事件帶出這筆 log 的 id。KB 前端跑完一輪，手上沒有可用來對應的鍵。
3. **best-effort 寫入。** 同檔案 `:101` 的 `except` 只記 warning，寫入失敗不會讓使用者察覺 → **Mongo 不是可靠的唯一真相來源**。

另外，`chat_history` 是由 KB 前端自己維護後送出的（[AiRAG/backend/routers/external.py](../../../AiRAG/backend/routers/external.py) 只是原樣轉發），代表 **「一段對話」這個概念本來就只存在於 KB 前端**，AiRAG 端從未持有。

> 結論：**在不改 AiRAG 的前提下，「對話分組」這件事只能由 KB 自己做。** MongoDB 能提供的是「稽核內容 + 補全歷史」，不能提供「對話結構」。

---

## 3. 方案比較（**需使用者決策**）

### 方案 A：KB 自行落地對話（KB DB 為主）＋ Mongo 關聯回填 ✅ **已採用（2026-08-12 決策）**

- KB DB 建兩張表：`ai_chat_sessions`（對話）＋ `ai_chat_messages`（訊息）。
- KB 前端每輪問答結束（`onDone`）時，多打一支 KB 後端 API 把 `question` / `answer` / `sources` 落地。
- KB 後端**額外**連 MongoDB，用 `employee_id` + `question` + `created_at` 時間窗（±30 秒）比對，把 `external_chat_logs._id` 回填到 `ai_chat_messages.mongo_log_id`，滿足「KB DB 關聯到 MongoDB」的需求，並可回頭撈 `elapsed_ms`、`search_type` 等稽核欄位。

| 優點 | 缺點 |
|:---|:---|
| 對話結構完整可靠、多輪順序正確 | 前端需多一次寫入呼叫（可非同步、失敗不影響對話體驗） |
| 不改 AiRAG | 內容在 KB DB 與 Mongo 各存一份（重複儲存） |
| 釘選/最愛/自訂標題/排序/隱藏全部自然落在 session 表 | 回填靠時間窗比對，理論上有極低機率誤配（同人同秒同問題） |
| Mongo 掛掉或 best-effort 寫入失敗時歷史仍完整 | |

### 方案 B：純讀 Mongo（KB DB 只存 metadata）

- KB DB 只建一張 `ai_chat_log_meta`：`mongo_log_id` + 最愛/釘選/自訂標題/排序/隱藏。
- 列表直接查 Mongo（`employee_id = 目前登入者` + `api_key_id = KB 的金鑰`），再 left join KB DB metadata。

| 優點 | 缺點 |
|:---|:---|
| KB DB 極輕量，不重複存內容 | **無法還原多輪對話**：只能呈現「一問一答」的散列清單，不是「對話串」 |
| 不改 AiRAG，前端不需額外落地呼叫 | 若硬要分組只能用時間窗啟發式，切錯段無法修正 |
| 歷史紀錄自動涵蓋「本功能上線前」的舊資料 | Mongo best-effort 寫入失敗 = 該筆永久遺失 |
| | KB 後端必須能連到 Mongo，否則整個頁面掛掉（單點依賴） |

### 方案 C：請 AiRAG 加 `session_id` 並於 SSE 回傳 log id

- 最乾淨的資料模型，但**違反需求 3（AiRAG 不改程式碼）**，僅列出備查。

### 方案 A+B 混合（未採用）

先做方案 A；另提供一個「AiRAG 稽核檢視」的唯讀清單（方案 B 的查詢），讓使用者也能看到功能上線**之前**的舊紀錄（標示為「歷史匯入（無對話結構）」）。**本次未納入**，如日後需要看上線前的舊紀錄可作為第二期。

> **決策結果：採方案 A。** 後續章節（4～7）即為方案 A 的定案設計。

---

## 4. 資料模型（方案 A，SQL Server / Sequelize）

命名沿用既有 snake_case 資料表慣例（見 `rag_sync_status`）。

### 4.1 `ai_chat_sessions` — 對話主檔

| 欄位 | 型別 | Null | 說明 |
|:---|:---|:---:|:---|
| `id` | INT IDENTITY | ✗ | PK |
| `session_uid` | NVARCHAR(64) | ✗ | 前端產生的 UUID，供前端在建立第一則訊息前即可持有的識別碼；唯一索引 |
| `account` | NVARCHAR(50) | ✗ | 擁有者員工工號（對齊既有 `article_editors.editor_account` 慣例） |
| `title` | NVARCHAR(200) | ✓ | 系統自動標題（預設取第一則提問前 30 字） |
| `custom_title` | NVARCHAR(200) | ✓ | **使用者自訂標題**；有值時前端優先顯示 |
| `is_pinned` | BIT | ✗ | 預設 0，**釘選** |
| `is_favorite` | BIT | ✗ | 預設 0，**最愛** |
| `is_hidden` | BIT | ✗ | 預設 0，**刪除＝隱藏**（軟刪除，不做實體刪除） |
| `sort_order` | INT | ✗ | 預設 0，**排序**（手動拖曳排序用，數字小者在前） |
| `message_count` | INT | ✗ | 預設 0，訊息則數（含 user + ai） |
| `last_message_at` | DATETIME2 | ✓ | 最後一則訊息時間，列表預設排序依據 |
| `knowledge_base_id` | NVARCHAR(255) | ✓ | 本對話使用的 AiRAG 知識庫 ID（快照） |
| `search_type` | NVARCHAR(50) | ✓ | 最後一次使用的檢索模式（`KB_hybrid` / `KB_semantic_hybrid`） |
| `created_at` / `updated_at` | DATETIME2 | ✗ | |

索引：`IX_ai_chat_sessions_account`（`account`, `is_hidden`, `is_pinned`, `last_message_at DESC`）、`UQ_ai_chat_sessions_uid`（`session_uid` unique）。

### 4.2 `ai_chat_messages` — 對話訊息

| 欄位 | 型別 | Null | 說明 |
|:---|:---|:---:|:---|
| `id` | INT IDENTITY | ✗ | PK |
| `session_id` | INT | ✗ | FK → `ai_chat_sessions.id` |
| `seq` | INT | ✗ | 對話內序號，從 1 遞增，保證順序不依賴時間戳 |
| `role` | NVARCHAR(10) | ✗ | `user` / `ai` |
| `content` | NVARCHAR(MAX) | ✗ | 訊息內容（Markdown 原文；HTML 由前端即時渲染，不落地） |
| `sources_json` | NVARCHAR(MAX) | ✓ | 引用來源精簡 JSON（`filename` / `chunk_id` / `score`），僅 `role='ai'` |
| `mongo_log_id` | NVARCHAR(50) | ✓ | **關聯 MongoDB `external_chat_logs._id`**，回填失敗留 null |
| `mongo_matched_at` | DATETIME2 | ✓ | 回填成功時間，null = 尚未比對到 |
| `elapsed_ms` | INT | ✓ | 由 Mongo 回填 |
| `is_early_terminated` | BIT | ✗ | 預設 0，對應 SSE `event: message` 的權限不足／低於門檻情境 |
| `created_at` | DATETIME2 | ✗ | |

索引：`IX_ai_chat_messages_session`（`session_id`, `seq`）、`IX_ai_chat_messages_mongo`（`mongo_log_id`）。

> **內容全文查詢**：需求「可以查詢」若要查到訊息內文，SQL Server 對 `NVARCHAR(MAX)` 的 `LIKE '%kw%'` 在資料量大時會全表掃描。第一期先以 `LIKE` 實作（預期資料量小），資料量成長後再評估 Full-Text Index。⚠️ 待確認：是否只需查標題即可。

### 4.3 MongoDB 連線（唯讀）✅ AiRAG 端已就緒（2026-08-13）

- 新增依賴：`mongodb`（官方 driver，不引入 mongoose，符合「簡單優先」）。
- 新增 [backend/src/config/mongo.js](../../backend/src/config/mongo.js)：單例 `MongoClient`，連線字串走 `.env` 的 `AIRAG_MONGODB_URL` / `AIRAG_MONGODB_DATABASE`。
- **只讀不寫**，只碰 `external_chat_logs` 這一個 collection。
- 連線失敗必須降級：歷史列表照常從 KB DB 回傳，只是 `mongo_log_id` 為 null，**不可整支 API 500**。

#### AiRAG 端已完成的配置

AiRAG 的 MongoDB 原本**完全未啟用認證**，已於 2026-08-13 啟用 `--auth` 並建立本專案專用的唯讀帳號（詳見 `AiRAG/docs/DevelopmentProcess/NewFeaturesPlan_MongoDBAuthPlan.md`）。KB 端 `.env` 設定：

```
AIRAG_MONGODB_URL=mongodb://kb_reader:<向 AiRAG 維運索取>@<AiRAG 主機 IP>:27017/?authSource=airag
AIRAG_MONGODB_DATABASE=airag
```

| 項目 | 內容 |
|:---|:---|
| 帳號 | `kb_reader`，建立於 `airag` database |
| 角色 | 自訂角色 `readExternalChatLogs`（非內建 `read`） |
| 權限 | **僅 `airag.external_chat_logs` 的 `find`** |
| 已驗證 | 2026-08-13 實測三項：可讀 `external_chat_logs`（82 筆）、**寫入被拒**（`insertOne` → `not authorized`）、**讀其他 collection 被拒**（`external_api_keys` → `not authorized`）。權限收斂為實測結果，非文件宣稱 |

實作時必須注意的三點：

1. **`authSource=airag` 不可省略、也不可寫成 `admin`**。`kb_reader` 建立於 `airag` database，認證來源必須指向該 db，否則一律 `Authentication failed`。這是最常見的接手錯誤。
2. **沒有 `listCollections` 權限**。`db.listCollections()` / `db.collections()` 會失敗，driver 必須直接指名 `db.collection('external_chat_logs')` 查詢。健康檢查也不要用 `db.stats()`（需額外權限），用 `admin().command({ ping: 1 })`。
3. **權限錯誤要與連線失敗走同一條降級路徑**。認證或授權失敗時 driver 拋的是 `MongoServerError`（`code 18` / `code 13`）而非連線逾時，`config/mongo.js` 的降級判斷若只攔連線類例外會漏掉這類錯誤，導致整支 API 500——正好違反上面那條「不可整支 API 500」。

> ⚠️ **尚未驗證**：KB 主機（`10.10.130.220`）到 AiRAG MongoDB 27017 的網路可達性尚未實測（AiRAG 端 27017 有 publish 到宿主機，但跨主機是否被防火牆擋下未知）。TASK-B3 開工前先做一次連通測試，不可達則需與 AiRAG 維運另議路徑。

---

## 5. API 契約（新增，前綴 `/api/v1`）

全部套 `authMiddleware`；**每支都必須驗證 `session.account === req.user.員工工號`**，前端隱藏不算權限控制。

| Method | Path | 說明 |
|:---|:---|:---|
| `GET` | `/ai-chats` | 對話列表。Query：`keyword`（標題+內文）、`isPinned`、`isFavorite`、`includeHidden`（預設 false）、`page`、`pageSize`。排序：`is_pinned DESC, sort_order ASC, last_message_at DESC` |
| `POST` | `/ai-chats` | 建立對話，Body `{ sessionUid, title?, knowledgeBaseId?, searchType? }`，回 `{ id, sessionUid }` |
| `GET` | `/ai-chats/:id` | 單一對話 + 全部訊息（供「繼續對話」載回前端） |
| `PATCH` | `/ai-chats/:id` | 更新 `customTitle` / `isPinned` / `isFavorite` / `sortOrder`（部分更新） |
| `DELETE` | `/ai-chats/:id` | **軟刪除**：`is_hidden = 1`（不實體刪除） |
| `POST` | `/ai-chats/:id/messages` | 追加一輪訊息，Body `{ question, answer, sources?, isEarlyTerminated?, searchType? }`；後端一次寫入 user + ai 兩筆、更新 `message_count` / `last_message_at`，並**非同步**觸發 Mongo 回填 |
| `PUT` | `/ai-chats/sort` | 批次排序，Body `{ orders: [{ id, sortOrder }] }` |

> **第一期不做**（2026-08-12 決策）：`POST /ai-chats/:id/restore`（取消隱藏／回收桶還原）。`is_hidden` 欄位仍照常寫入，日後要補這支端點不需改資料表。
>
> `PUT /ai-chats/sort` 保留，因「排序」是原始需求欄位之一；但前端拖曳排序 UI 屬第二期，第一期先不提供操作入口（見 9 節第 4 項）。

回應格式沿用既有慣例 `{ success, data, message }`（見 `backend/src/routes/ai.js` 錯誤回應）。

### 5.1 Mongo 回填邏輯（`aiChatHistoryService.backfillMongoLog()`）

```
條件：employee_id = 該 session.account
  AND question = 該則 user 訊息的 content
  AND created_at BETWEEN (訊息時間 - 60s) AND (訊息時間 + 60s)   ← 注意 Mongo 存 UTC
取 created_at 最接近者一筆 → 寫回 mongo_log_id / elapsed_ms
```

- 由 `POST /ai-chats/:id/messages` 完成主寫入後以 `setImmediate` 觸發，**不阻塞回應**。
- 失敗只記 log，不重試（可另做排程補漏，見 8. 待確認 第 4 項）。
- ⚠️ **時區**：Mongo 存 UTC，KB DB 存本地時間，比對前必須轉換，這是最容易寫錯的一點。

---

## 6. 前端規劃

### 6.1 左方選單

[frontend/src/components/layout/TheSidebar.vue:62](../../frontend/src/components/layout/TheSidebar.vue:62) 的 `navItems` 新增一項：

```js
{ to: '/ai-history', label: 'AI歷史', icon: 'Clock' },
```

放在「AI問答」之後、divider 之前。`computedNavItems` 的公開文件白名單（`:71`）需一併加入 `/ai-history`，否則切到「公開文件」範圍時會被濾掉。

### 6.2 新頁面 `AiHistoryView.vue`

放 `frontend/src/views/`，路由 `/ai-history`（`meta.requiresAuth`，同既有 `/ai-chat`）。版面：

- **左側清單**：對話卡片（顯示標題、最後訊息時間、則數）。頂部搜尋框 + 篩選 Tab（全部 / 釘選 / 最愛）。
- **卡片操作**：📌 釘選、⭐ 最愛、✏️ 自訂標題（`ElInput` 就地編輯或 `ElMessageBox.prompt`）、🗑️ 刪除（`ElMessageBox.confirm` 後軟刪除）。
- **標題顯示規則**（第一期加值功能，見 9 節第 2 項）：`custom_title` 有值時優先顯示；否則顯示 `title`（建立對話時由第一則提問自動截取前 30 字，超過補「…」）；兩者皆空時顯示「未命名對話」。
- **右側詳情**：唯讀渲染該對話全部訊息（Markdown 渲染沿用 `useAiChat.js` 既有的 `updateHtml()` 邏輯，抽為共用函式，避免複製一份）。
- 元件超過 200 行時依 `CLAUDE.md` 拆為 `components/aiHistory/AiHistoryList.vue` + `AiHistoryDetail.vue`。

> **第一期不做**：「繼續此對話」按鈕、「已隱藏（回收桶）」篩選 Tab 與還原操作（2026-08-12 決策，移至第二期）。

### 6.3 既有檔案的改動（外科手術式，範圍明確）

| 檔案 | 改動 |
|:---|:---|
| [frontend/src/services/api.js](../../frontend/src/services/api.js) | 新增 `aiChatHistoryService`，對應第 5 節 8 支端點 |
| [frontend/src/store/aiChat.js](../../frontend/src/store/aiChat.js) | 新增 `currentSessionUid` / `currentSessionId` 兩個 ref，`reset()` 一併清空 |
| [frontend/src/composables/useAiChat.js](../../frontend/src/composables/useAiChat.js) | 僅在 `sendMessage()` 的 `onDone`（`:522`）補上落地呼叫：無 session 先 `POST /ai-chats`，再 `POST /ai-chats/:id/messages`。**以 `try/catch` 包住並只 `console.warn`**——落地失敗不可影響已顯示給使用者的回答（比照 AiRAG 稽核寫入的 best-effort 原則） |
| [frontend/src/router/index.js](../../frontend/src/router/index.js) | 新增 `/ai-history` route |
| [frontend/src/components/layout/TheSidebar.vue](../../frontend/src/components/layout/TheSidebar.vue) | 見 6.1 |

> `sendCommand()`（`:391`，摘要/寫作等指令模式）是否也要落地為對話？⚠️ 待確認（見第 8 節第 2 項）。

---

## 7. 施作步驟（方案 A 定案後執行）

| 編號 | 內容 | 產出 |
|:---|:---|:---|
| TASK-B1 | 建立 `AiChatSession` / `AiChatMessage` 兩個 Model 並註冊到 `models/index.js`（含關聯） | `backend/src/models/AiChatSession.js`、`AiChatMessage.js` |
| TASK-B2 | 建表 SQL 腳本（比照 `資料庫/` 既有慣例）＋ 更新 `docs/04_DB_SCHEMA.md` | SQL + 文件 |
| TASK-B3 | **前置**：先實測 KB 主機到 AiRAG MongoDB 27017 的可達性（見 4.3）。之後 `npm i mongodb`；新增 `config/mongo.js`（唯讀單例 + 連線失敗降級，降級須涵蓋認證/授權錯誤） | `backend/src/config/mongo.js` |
| TASK-B4 | `services/aiChatHistoryService.js`：列表查詢、建立、追加訊息、軟刪除、排序、Mongo 回填 | service |
| TASK-B5 | `controllers/aiChatHistoryController.js` + `routes/aiChatHistory.js`，於 `index.js` 掛載 `${API}/ai-chats` | controller/route |
| TASK-B6 | 更新 `docs/03_API_CONTRACT.md` | 文件 |
| TASK-F1 | `api.js` 新增 `aiChatHistoryService` | 前端 service |
| TASK-F2 | `AiHistoryView.vue` + 路由 + 側邊欄選單 | 前端頁面 |
| TASK-F3 | `useAiChat.js` 落地呼叫、`store/aiChat.js` session 欄位 | 前端串接 |
| TASK-V1 | 驗證：新對話落地 → 列表出現 → 釘選/最愛/改標題/隱藏 → 重新登入仍在 → Mongo `mongo_log_id` 已回填 → **Mongo 關閉時列表仍可用** | 手動驗證清單 |

> 原 TASK-F4（繼續此對話）依 2026-08-12 決策移出第一期。

**完成標準**：使用者在 `/ai-chat` 問完一輪，切到 `/ai-history` 能看到該對話（標題自動取第一則提問前 30 字）；可搜尋、釘選（置頂）、改自訂標題、刪除（列表消失但 DB 仍在）；重新整理與重新登入後資料都在；`ai_chat_messages.mongo_log_id` 有值；**關閉 Mongo 連線後列表仍能正常顯示**。

---

## 8. ⚠️ 待確認事項（需使用者決策）

| # | 項目 | 選項 | 建議 |
|:--:|:---|:---|:---|
| 1 | ~~**採用哪個方案**~~ | ✅ **已決策（2026-08-12）：方案 A** | — |
| 2 | 指令模式（摘要／寫作／`sendCommand`）是否納入歷史 | 納入／只記一般問答 | 只記一般問答（第一期），指令模式多為一次性操作 |
| 3 | 管理員能否檢視他人的 AI 歷史 | 可以（稽核用）／不行 | 第一期**不行**，只看自己。若要開放需另加 `requireRole('ADMIN')` 端點與稽核揭露說明 |
| 4 | Mongo 回填失敗是否要排程補漏 | 要／不要 | 第一期不要，`mongo_log_id` 為 null 不影響任何功能 |
| 5 | 搜尋範圍 | 只搜標題／標題+內文 | 標題+內文（`LIKE`），資料量大再改 Full-Text |
| 6 | 是否要「本功能上線前的舊紀錄」 | 要（需做方案 B 的唯讀檢視）／不要 | 現有 **82 筆**（2026-08-13 實測）。量不大，第一期不做仍屬合理；若要納入則需另做方案 B 的唯讀檢視 |
| 7 | ~~**KB 後端能否連到 AiRAG 的 MongoDB**~~ | ✅ **已完成（2026-08-13）** | AiRAG 端已啟用認證並建立唯讀帳號 `kb_reader`（權限僅 `airag.external_chat_logs` 的 `find`），連線字串與注意事項見 4.3。**未採用 `sa` 式的高權限帳號，未重蹈 RAG_SYNC_PLAN 9 節第 6 項的技術債。** 剩餘的網路可達性實測列為 TASK-B3 的前置 |
| 8 | 釘選數量是否設上限 | 無上限／上限 N 則 | 無上限，靠排序解決 |

---

## 9. 額外功能（2026-08-12 決策結果）

**第一期只納入第 2 項「自動命名標題」**（✅ 標記），其餘全部列為第二期候選。

| # | 功能 | 第一期 | 說明 | 成本 |
|:--:|:---|:--:|:---|:---|
| 1 | 繼續此對話 | ✗ | 從歷史載回 `messages` 到 store 並跳 `/ai-chat` 接續問 | 低 |
| 2 | **自動命名標題** | ✅ | 沒填自訂標題時，取第一則提問前 30 字。純字串處理，不呼叫 LLM。實作位置：建立 session 時由後端 `aiChatHistoryService` 寫入 `title`（前端不負責截字，避免兩邊規則不一致） | 極低 |
| 3 | 已隱藏（回收桶）檢視 + 還原 | ✗ | 軟刪除後的還原入口 | 低 |
| 4 | 手動拖曳排序 | ✗ | `sort_order` 欄位與 `PUT /ai-chats/sort` 已保留，只差前端 UI（需 `vuedraggable` 依賴） | 中 |
| 5 | 匯出對話為 Markdown | ✗ | 一鍵下載 `.md`，前端純字串組裝 | 低 |
| 6 | 對話存成 KB 文章 | ✗ | 把 AI 回答轉成文章草稿（帶入 `ArticleView` 新建頁）。與 KB 本業最契合 | 中 |
| 7 | 依知識庫 / 檢索模式篩選 | ✗ | `knowledge_base_id`、`search_type` 已在 4.1 落地，加兩個下拉即可 | 低 |
| 8 | 依日期區間篩選 | ✗ | `ElDatePicker` + query 參數 | 低 |
| 9 | 對話標籤分類 | ✗ | 複用既有 `tags` 表做 N:M | 中 |
| 10 | 分享對話給同仁 | ✗ | 唯讀連結或推播通知（可複用 `notifications`），涉及權限設計 | 高 |
| 11 | 回饋（👍/👎） | ✗ | AiRAG 有 `feedback` collection，但外部端點未開放寫入 → **需改 AiRAG** | 高 |
| 12 | 使用統計儀表板 | ✗ | 提問次數 / 熱門問題 / 平均耗時（`elapsed_ms`），屬管理員功能，建議另案 | 中 |
| 13 | 批次操作 | ✗ | 多選後批次隱藏 / 批次釘選 | 低 |

> 第 4～13 項所需的資料欄位（`sort_order`、`knowledge_base_id`、`search_type`、`elapsed_ms`）在第 4 節資料表中皆已保留，第二期補做時**不需要改資料表結構**。

---

## 10. 風險與注意事項

1. **時區**：Mongo `created_at` 為 UTC（`datetime.utcnow`），KB DB 為本地時間。回填比對與前端顯示都必須明確轉換，否則會差 8 小時且回填永遠比對不到。
2. **內容重複儲存**：方案 A 下同一段問答同時存在 KB DB 與 Mongo。這是刻意取捨（換取對話結構可靠性），不是設計缺陷，但需在 `04_DB_SCHEMA.md` 註明。
3. **落地失敗不可影響對話**：`useAiChat.js` 的落地呼叫必須 try/catch 吞掉並只 `console.warn`。使用者已經看到回答了，此時跳錯誤訊息只會造成困惑。
4. **不要為了歷史功能去改 `useAiChat.js` 的串流邏輯**。該檔的 SSE 解析與 Vditor 渲染很脆弱（見 `CLAUDE.md`「非必要勿修改，避免跑版」），本次只在 `onDone` 尾端追加呼叫。
5. **Mongo 單點依賴**：`config/mongo.js` 必須做到「連不上就降級」，否則 AiRAG 環境異常時會連帶讓 KB 的歷史頁面全掛。**AiRAG 的 Mongo 自 2026-08-13 起已啟用認證**，失效態因此多了一種：帳密或權限問題會拋 `MongoServerError`（非連線逾時），降級判斷必須一併涵蓋，見 4.3 第 3 點。
6. **權限**：所有端點都要在後端比對 `account`，不能只靠前端只查自己的清單。
7. **`kb_reader` 的密碼不要寫進 repo**。放 KB 後端 `.env`（已在 `.gitignore` 內），不要出現在文件、註解或前端設定；此帳號雖為唯讀，但可讀到全公司使用者的提問與 AI 回答全文。
