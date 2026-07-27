# RAG 同步：內嵌圖片描述失敗的偵測與顯示

> 建立日期：2026-07-27
> 相關文件：[RAG_SYNC_PLAN.md](RAG_SYNC_PLAN.md)、[04_DB_SCHEMA.md](../04_DB_SCHEMA.md) 19.1 節
> 對應 AiRAG 端變更：`AiRAG/docs/DevelopmentProcess/NewFeatures.md` 2026-07-27

---

## 1. 背景與問題

AiRAG 在切分 PDF / DOCX 附件時，會抽取內嵌圖片並呼叫多模態模型產生描述。少部分圖片會因地端
vLLM 逾時或生成迴圈而失敗，此時 AiRAG 會寫入一段佔位內容：

```
[圖片描述產生失敗：ERP Tiptop災難實境演練.docx_img2]
```

問題在於 **KB 端完全看不到這件事**：

| 機制 | 判斷依據 | 能否發現描述失敗 |
|---|---|---|
| 同步排程 `runScheduledCheck()` | 只撈 `status` 為 `not_synced` / `outdated` / `failed` 的本地狀態列 | ❌ 描述失敗時 AiRAG 回報 `completed`，狀態為「AI 已就緒」，永遠不會被撈到 |
| 全量校驗 `runFullAudit()` | `!meta \|\| meta.version !== 目標版本`，而 `findPointMeta()` 只取一個 point 的 `version` / `updated_date` | ❌ 描述失敗不影響版本號，永遠判定無漂移 |

亦即：文字段落都正確寫入向量庫，只有那張圖片沒有可用描述，而 KB 管理端顯示一切正常。

---

## 2. 解法概觀

兩道防線，一道管「之後的同步」，一道管「既有資料」：

1. **AiRAG 完成回報時帶上失敗數** → 新同步的問題即時可見。
2. **全量校驗實際查 Qdrant 的圖片段落** → 既有資料也能被查出來。

---

## 3. 變更內容

### 3.1 AiRAG 端（回報失敗數）

- `services/ingest_service.py`：`_process_upsert()` 回傳值加入 `caption_failed_count`。
- `services/ingest_report_service.py`：`report()` 系列新增 `caption_failed_count` 參數；
  Webhook body 新增 `captionFailedCount`；`direct_db` 模式在 `completed` 的 UPDATE 一併寫入
  `rag_sync_status.caption_failed_count`。

> KB 是以 `report_mode = "direct_db"` 註冊（`aiRagIngestClient.js` 未送 `callbackUrl`，
> KB 也沒有接收回調的路由），所以實際生效的是 direct_db 那條路徑，由 AiRAG 直連 KB 的
> SQL Server 寫入。Webhook 欄位是為其他應用（如 BPM）保留的。

### 3.2 KB 資料表

- `backend/src/models/RagSyncStatus.js`：新增 `caption_failed_count`（INT, NULL, DEFAULT 0）。
- **新增 `backend/src/scripts/addRagSyncCaptionFailedColumn.js`**：冪等 ALTER 腳本。
  `index.js` 用的是 `RagSyncStatus.sync({ force: false })`，**只在資料表不存在時建立，
  不會替既有資料表補欄位**，所以既有部署必須手動執行一次：

  ```bash
  node src/scripts/addRagSyncCaptionFailedColumn.js
  ```

- `docs/04_DB_SCHEMA.md` 19.1 節已補上欄位與此注意事項。

### 3.3 KB 全量校驗

- `backend/src/services/qdrantService.js`：新增 `countFailedCaptions(docType, sourceId)`。
  撈出該文件 `chunk_type === 'image'` 的段落後在本地判斷，同時支援兩種資料格式：
  - 新資料：payload 的 `caption_failed === true`
  - 舊資料：內文含 `[圖片描述產生失敗` 前綴（2026-07-27 之前寫入的 point 沒有該 payload 欄位）

  > 未使用 Qdrant filter 直接比對文字，是因為 `content` 的全文索引為 MULTILINGUAL tokenizer，
  > 中文片語的比對結果不可靠。

- `backend/src/services/ragSyncService.js` `runFullAudit()`：版本一致的文件會再查一次失敗段落數，
  寫回 `caption_failed_count`，> 0 時寫入一筆 `warning` 等級的 `rag_sync_logs`，
  並計入 summary 的 `captionFailed`。

#### ⚠️ 為什麼不把描述失敗算進 drift

drift 會把狀態轉為 `outdated`，而排程專門撈 `outdated` 重新觸發切分。若某張圖片本來就無法成功描述
（例如純色圖、模型持續生成迴圈），會造成**排程無限重試**，反覆消耗 vLLM 資源。

因此目前設計為：**只記錄數量與警告，不改變 `status`**，由管理員在「RAG 同步比對」頁面勾選後
點「指定執行切分」重跑。若日後確認要自動重跑，把 `runFullAudit()` 內
`captionFailedCount > 0` 的分支改為走 drift 流程即可（建議同時加上重試次數上限）。

### 3.4 KB 前端

- `frontend/src/services/api.js`：`normalizeRagSyncStatusRow()` 新增
  `captionFailedCount: r.caption_failed_count ?? 0`。
- `frontend/src/views/AdminView.vue`：「同步狀態列表」的狀態欄（寬度 130 → 180）在
  `captionFailedCount > 0` 時，於原狀態標籤旁多顯示一個橘色警示標籤
  `⚠ 圖片描述失敗 N`，tooltip 說明可勾選後用「指定執行切分」重新產生。

---

## 4. 驗證

- KB：`node --check` 通過（`ragSyncService.js` / `qdrantService.js` / 新增腳本）；
  `RagSyncStatus` model 可正常載入；`npm run build` 通過。
- AiRAG：`main.py` import 成功，三個回報函式簽章皆含 `caption_failed_count`。
- 依專案慣例未自行開啟瀏覽器驗證，實際 UI 與端到端同步行為待手動測試。

---

## 5. 部署順序（重要）

1. KB 先執行 `node src/scripts/addRagSyncCaptionFailedColumn.js` 建立欄位。
   **若先重啟 AiRAG，direct_db 回報的 UPDATE 會因為找不到欄位而失敗**，導致同步狀態卡在
   `processing`（錯誤會記在 AiRAG 的 `IngestReportService` log）。
2. 重新部署 AiRAG（backend 與 worker）。
3. 重新部署 KB 後端與前端。
4. 到「RAG 同步比對」頁按一次「全量校驗」，回填既有資料的 `caption_failed_count`。

---

## 6. 已知限制

- `countFailedCaptions()` 每份文件一次 scroll（上限 1000 個圖片段落），全量校驗的 Qdrant
  查詢次數會等於「版本一致的文件數」。目前 26 份文件無感，文件量成長到數千份時需評估改為
  批次查詢或改用 payload filter。
- `caption_failed_count` 只在「AiRAG 完成回報」與「全量校驗」兩個時機更新。
  若管理員直接在 AiRAG 的「向量資料管理」頁按「重新產生失敗描述」修好了，
  KB 端的數字要等下次全量校驗才會歸零。
- 舊資料的辨識依賴內文前綴字串，若 AiRAG 端日後修改該佔位文字格式，需同步更新
  `qdrantService.js` 的 `CAPTION_FAILED_MARKER`。
