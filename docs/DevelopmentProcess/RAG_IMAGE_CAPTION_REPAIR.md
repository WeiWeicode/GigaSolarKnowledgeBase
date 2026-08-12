# RAG 同步：僅重試失敗的內嵌圖片 AI 描述（免全量重新切分）

> 建立日期：2026-08-12
> 相關文件：[RAG_CAPTION_FAILED_TRACKING.md](RAG_CAPTION_FAILED_TRACKING.md)、[RAG_SYNC_PLAN.md](RAG_SYNC_PLAN.md)
> 對應 AiRAG 端變更：`AiRAG/docs/DevelopmentProcess/NewFeatures.md` 2026-08-12、
> `AiRAG/docs/08_EXTERNAL_INGEST_API_GUIDE.md` §4A
> 狀態：**AiRAG 端與 KB 端皆已實作完成，待手動測試**（§3 為施作內容，已全部完成）

---

## 1. 背景

[RAG_CAPTION_FAILED_TRACKING.md](RAG_CAPTION_FAILED_TRACKING.md) 讓 KB 管理端「**看得到**」內嵌圖片描述
失敗（`rag_sync_status.caption_failed_count` + `⚠ 圖片描述失敗 N` 標籤），但當時唯一的處理手段是
勾選後按「指定執行切分」，也就是 `action: "upsert"` 的**全量重新切分**：

| 全量重切的代價 | 說明 |
|---|---|
| 資源浪費 | 整份文件的文字段落、已成功的圖片段落都會被重新解析、重新切分、重算 Embedding |
| 耗時 | 大檔案要重跑整條管線 |
| 再次逾時風險 | 所有圖片重新呼叫多模態模型，比只重試少數幾張更容易再撞逾時 |

AiRAG 內部原本就有 `ImageCaptionRepairService`：用磁碟上留存的原圖重新描述，成功後以**相同的
point id** 覆蓋該圖片段落，文字段落完全不動。2026-08-12 已將此能力包成外部 API 開放給 KB 使用。

---

## 2. AiRAG 端已完成的內容（KB 直接呼叫即可）

### 2.1 API 契約

* **`POST {AIRAG_BASE_URL}/api/external/ingest/repair-captions`**
* **Header**：`X-API-Key: <Ingest 金鑰>`（與 `/ingest/trigger` 同一把，見 `aiRagIngestClient.getActiveConfig()`）

| 欄位 | 型態 | 必填 | 說明 |
|---|---|---|---|
| `appId` | String | 是 | 固定 `"kb"` |
| `docType` | String | 是 | `"article"` 或 `"attachment_file"`（即 KB 的 `sourceType`） |
| `sourceId` | **Integer** | 是 | **必須是數字**，傳字串會回 422 |
| `knowledgeBaseId` | String | 是 | Ingest 專用知識庫 ID（`getActiveConfig()` 已提供） |
| `filename` | String | 否 | 僅供 AiRAG log 顯示，不參與定位，可帶 `title` |
| `callbackUrl` | String | 否 | KB 是 `direct_db` 模式，**不需要** |

目標段落由 AiRAG 以 `(appId, docType, sourceId)` 定位（與刪除向量用的是同一組鍵），
不靠檔名比對，因此**改過標題或跨應用同名檔案都不會出錯**。

### 2.2 回應

| 狀態碼 | 意義 | KB 端該怎麼處理 |
|---|---|---|
| `202` | 已排入 AiRAG 背景佇列，回 `{ success, message, taskId }` | 視為成功送出 |
| `400` | appId 未登錄／停用、knowledgeBaseId 無效或不存在 | 設定問題，需管理員處理，訊息在 `detail` |
| `409` | 同一份文件 5 分鐘內重複觸發，已在處理中 | 提示使用者稍候，不是錯誤 |
| `422` | 欄位型別錯誤（最常見：`sourceId` 傳成字串） | 程式 bug，需修正呼叫端 |

### 2.3 結果如何回到 KB（**KB 不需新增任何回調路由**）

AiRAG 端是**非同步**的：單張圖片描述最壞要 180 秒，因此立即回 202，實際修復在背景執行。
完成後 AiRAG 會直連 KB 的 SQL Server 回寫「該文件目前**仍然**描述失敗的圖片數」：

```sql
UPDATE rag_sync_status SET caption_failed_count = ? WHERE source_type = ? AND source_id = ?
```

* **只更新這一個欄位**：`status`、`progress`、`last_synced_version`、`last_synced_at` 都不動
  ——這不是一次同步，文件版本沒有改變。
* 全部修好時寫入 `0`，KB 重新載入列表後 `⚠ 圖片描述失敗 N` 標籤即消失。
* 這條路徑就是 [RAG_CAPTION_FAILED_TRACKING.md](RAG_CAPTION_FAILED_TRACKING.md) §3.1 所述的
  `direct_db` 模式（KB 未送 `callbackUrl`、也沒有接收回調的路由，走的一直是 AiRAG 直寫 SQL）。

> 補充：即使回寫失敗（例如 DB 連線問題），KB 既有的「全量校驗」`runFullAudit()` 會用
> `qdrantService.countFailedCaptions()` 實查 Qdrant 並更新同一個欄位，最終仍會收斂到正確值。

---

## 3. KB 端施作內容（2026-08-12 已完成）

| 檔案 | 變更 |
|---|---|
| `backend/src/services/aiRagIngestClient.js` | 新增 `repairImageCaptions()`（§3.1） |
| `backend/src/services/ragSyncService.js` | 新增 `repairCaptionsManual()` 並加入 `module.exports`（§3.2） |
| `backend/src/controllers/ragSyncController.js` | 新增 `repairCaptions()` 並加入 `module.exports`（§3.3） |
| `backend/src/routes/ragSync.js` | 新增 `POST /status/repair-captions`（§3.3） |
| `frontend/src/services/api.js` | `ragSyncService` 新增 `repairCaptions()`（§3.4） |
| `frontend/src/views/AdminView.vue` | 新增「重試圖片描述」按鈕與 `executeRepairCaptionsManual()`，並改寫失敗標籤的 tooltip（§3.5） |
| `docs/03_API_CONTRACT.md` | 新增 `POST /api/v1/rag-sync/status/repair-captions` 契約 |

**驗證**：`node --check` 四個後端檔案語法正確；`require()` 確認 `repairCaptionsManual` /
`repairCaptions` / `repairImageCaptions` 三個 export 皆可解析；`npm run build` 前端建置成功。
實際行為待依 §5 驗收清單手動測試。

### 各項施作細節

### 3.1 後端 Client：`backend/src/services/aiRagIngestClient.js`

新增 `repairImageCaptions()`，沿用既有的 `getActiveConfig()`、base URL 正規化與 `detail` 錯誤處理：

```javascript
/**
 * 僅重試「AI 描述產生失敗」的內嵌圖片段落（不做全量重新切分）。
 * AiRAG 端為非同步：回 202 代表已排入佇列，實際結果之後由 AiRAG 直接回寫
 * rag_sync_status.caption_failed_count。
 *
 * @param {object} params
 * @param {'article'|'attachment_file'} params.docType
 * @param {number} params.sourceId
 * @param {string} [params.title]
 * @returns {Promise<{success:boolean, message:string, taskId:string}>}
 */
async function repairImageCaptions({ docType, sourceId, title }) {
  const baseUrl = process.env.AIRAG_BASE_URL;
  const { apiKey, knowledgeBaseId } = await getActiveConfig();

  if (!baseUrl || !apiKey) {
    throw new Error('AIRAG_BASE_URL / AIRAG_INGEST_API_KEY 未設定，無法呼叫 AiRAG 圖片描述修復端點');
  }
  if (!knowledgeBaseId) {
    throw new Error('Ingest 專用知識庫 ID 未設定（請於「API Key 設定」填入，或設定 AIRAG_KNOWLEDGE_BASE_ID）');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const payload = {
    appId: 'kb',
    docType,
    // AiRAG 以 Qdrant payload 的整數 source_id 比對，字串不會匹配（且 schema 會回 422）
    sourceId: Number(sourceId),
    knowledgeBaseId,
    filename: title,
  };

  try {
    const response = await axios.post(
      `${normalizedBaseUrl}/api/external/ingest/repair-captions`,
      payload,
      { headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' }, timeout: TIMEOUT_MS }
    );
    return response.data;
  } catch (err) {
    const detail = err.response?.data?.detail;
    if (detail) {
      const detailText = typeof detail === 'string' ? detail : JSON.stringify(detail);
      const error = new Error(`AiRAG 圖片描述修復觸發失敗 (HTTP ${err.response.status}): ${detailText}`);
      // 帶出狀態碼供上層分流：409（重複觸發）是良性情況，不該當成錯誤寫進 rag_sync_logs
      error.status = err.response.status;
      throw error;
    }
    throw err;
  }
}

module.exports = { triggerIngest, repairImageCaptions };
```

> 與 `triggerIngest()` 的差異只有多帶 `error.status`。`triggerIngest()` 沒有這個需求
> （它沒有良性的 4xx），維持原樣即可，不需要一併修改。

### 3.2 後端 Service：`backend/src/services/ragSyncService.js`

新增 `repairCaptionsManual(items)`，逐筆呼叫、**單筆失敗不中斷其餘項目**：

```javascript
// ── 手動指定項目：僅重試失敗的圖片描述（不觸發全量重新切分）──
async function repairCaptionsManual(items) {
  const results = [];
  for (const item of items || []) {
    const sourceType = item.sourceType || item.source_type;
    const sourceId   = Number(item.sourceId ?? item.source_id);
    try {
      // 前置防禦：下架時 handleUnpublish() 已把 Qdrant point 全部刪除，
      // 對已刪除／已下架的文件呼叫修復必定掃到 0 個圖片段落，是純空轉，
      // 而且會讓 AiRAG 把 caption_failed_count 覆寫成 0。比照 syncOne() 的前置檢查先擋掉。
      const ctx = await getResourceContext(sourceType, sourceId);
      if (!ctx) {
        results.push({ sourceType, sourceId, ok: false, message: '來源資料不存在' });
        continue;
      }
      if (!ctx.isPublished) {
        results.push({ sourceType, sourceId, ok: false, message: '文件已下架，向量已移除，無需修復圖片描述' });
        continue;
      }

      const data = await aiRagIngestClient.repairImageCaptions({
        docType: sourceType, sourceId, title: ctx.title,
      });
      results.push({ sourceType, sourceId, ok: true, taskId: data.taskId });
    } catch (err) {
      // 409 = AiRAG 端 5 分鐘內已有同一份文件的修復任務在跑（多半是連點兩下），
      // 屬良性情況：標記為 skipped 讓前端用「提示」而非「錯誤」呈現，也不寫 error log
      const isDuplicate = err.status === 409;
      if (!isDuplicate) {
        await logEvent({
          sourceType, sourceId, stage: 'notify', level: 'error',
          message: `圖片描述修復觸發失敗: ${err.message}`,
        });
      }
      results.push({
        sourceType, sourceId, ok: false, skipped: isDuplicate,
        message: isDuplicate
          ? '此文件正由 AiRAG 背景處理中，請稍後再查看結果'
          : err.message,
      });
    }
  }
  return results;
}
```

記得加進檔尾的 `module.exports`。

> ⚠️ **不要複用 `syncOne()`，也不要呼叫 `upsertStatusRow()`。**
> `syncOne()` 會把 `status` 改成 `outdated` 並送出 `action: "upsert"`，那正是本功能要避免的
> 全量重新切分；而把狀態打成 `outdated` 還會讓同步排程 `runScheduledCheck()` 之後又撈回去重跑一次。
> 修復流程**不應改變任何同步狀態欄位**，`caption_failed_count` 由 AiRAG 回寫。

### 3.3 後端 Controller / Route

* `backend/src/controllers/ragSyncController.js`：新增 `repairCaptions(req, res)`，
  比照既有 `executeManual`（含相同的 `items` 陣列檢查與 500 錯誤處理）：

  ```javascript
  const VALID_SOURCE_TYPES = ['article', 'attachment_file'];

  async function repairCaptions(req, res) {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: '請提供要執行的項目' });
      }
      // sourceId 非數字時 findByPk() 會帶著 NaN 打進 SQL Server 而拋錯，
      // 在此先擋下來換成清楚的 400
      const invalid = items.find(i => {
        const type = i.sourceType || i.source_type;
        const id   = Number(i.sourceId ?? i.source_id);
        return !VALID_SOURCE_TYPES.includes(type) || !Number.isInteger(id);
      });
      if (invalid) {
        return res.status(400).json({ success: false, message: '項目格式錯誤：sourceType 或 sourceId 不正確' });
      }

      const results = await ragSyncService.repairCaptionsManual(items);
      return res.json({ success: true, data: results });
    } catch (error) {
      console.error('ragSync repairCaptions error:', error.message);
      return res.status(500).json({ success: false, message: '圖片描述修復觸發失敗' });
    }
  }
  ```

  記得加進檔尾的 `module.exports`。
* `backend/src/routes/ragSync.js`：新增

  ```javascript
  /**
   * @route POST /api/v1/rag-sync/status/repair-captions
   * @desc  手動指定項目：僅重試失敗的內嵌圖片 AI 描述
   */
  router.post('/status/repair-captions', ragSyncController.repairCaptions);
  ```

  該檔案開頭已有 `router.use(authMiddleware, requireRole('ADMIN'))`，權限自動沿用。

### 3.4 前端 API：`frontend/src/services/api.js`

在 `ragSyncService` 物件中新增：

```javascript
  /** 僅重試失敗的圖片 AI 描述：items = [{ sourceType, sourceId }] */
  async repairCaptions(items) {
    const res = await http.post('/rag-sync/status/repair-captions', { items })
    return res.data
  },
```

### 3.5 前端介面：`frontend/src/views/AdminView.vue`

1. **按鈕**（放在「指定執行切分」右側）：

   ```html
   <el-button
     type="warning"
     plain
     :disabled="!ragStatusSelection.length"
     :loading="repairCaptionsLoading"
     @click="executeRepairCaptionsManual"
   >
     重試圖片描述
   </el-button>
   ```

2. **處理邏輯**：

   ```javascript
   const repairCaptionsLoading = ref(false)

   async function executeRepairCaptionsManual() {
     if (!ragStatusSelection.value.length) return ElMessage.warning('請先勾選項目')
     repairCaptionsLoading.value = true
     try {
       const res = await ragSyncService.repairCaptions(
         ragStatusSelection.value.map(r => ({ sourceType: r.sourceType, sourceId: r.sourceId }))
       )
       const results = res.data || []
       const succeeded = results.filter(r => r.ok)
       // skipped = AiRAG 回 409（同一份文件已在處理中），是提示不是錯誤，分開呈現避免管理者誤判為故障
       const skipped  = results.filter(r => !r.ok && r.skipped)
       const failed   = results.filter(r => !r.ok && !r.skipped)

       if (succeeded.length) {
         ElMessage.success(
           `已送出 ${succeeded.length} 筆圖片描述重試，AiRAG 於背景處理，完成後重新查詢即可看到結果`
         )
       }
       if (skipped.length) {
         ElMessage.warning(`${skipped.length} 筆略過：${skipped.map(s => s.message).join('；')}`)
       }
       if (failed.length) {
         ElMessage.error(`${failed.length} 筆觸發失敗：${failed.map(f => f.message).join('；')}`)
       }
       await loadRagStatusList()
     } catch (e) {
       ElMessage.error('重試圖片描述失敗：' + (e.response?.data?.message || e.message || ''))
     } finally {
       repairCaptionsLoading.value = false
     }
   }
   ```

   * **不要顯示「已修復 N 筆」**：AiRAG 回的是 202（已排入佇列），修復筆數在當下並不存在。
   * 錯誤訊息取 `e.response?.data?.message`，`e.message` 只會是
     `Request failed with status code 500`。

3. **既有提示文字要改**：`⚠ 圖片描述失敗 N` 標籤的 tooltip 目前寫的是
   「勾選後點『指定執行切分』可重新產生」（`AdminView.vue` 約 334 行），
   應改為指向新按鈕，例如「勾選後點『重試圖片描述』可只重跑失敗的圖片，不需全量重新切分」。

4. **（可選）列層級快速觸發**：點該標籤時彈確認框，確認後只對該列呼叫一次。

---

## 4. 使用流程（預期時序）

1. 管理員在「RAG 同步比對」看到 `⚠ 圖片描述失敗 2`。
2. 勾選 → 點「重試圖片描述」 → KB 後端逐筆呼叫 AiRAG → 各自拿到 202。
3. AiRAG 背景任務逐張以原圖重新描述，成功者以相同 point id 覆蓋（**文字段落與已成功的圖片完全不動**）。
4. AiRAG 回寫 `rag_sync_status.caption_failed_count`（全部成功則為 `0`）。
5. 管理員重新查詢列表 → 標籤消失（或數字下降）。

---

## 5. 驗收清單

- [ ] 勾選有 `⚠ 圖片描述失敗` 的附件，點「重試圖片描述」→ 回 202，**AiRAG log 沒有出現全量切分**
      （不應看到 `process_ingest_task`／`_process_upsert`，只該有 `[CaptionRepair]`）。
- [ ] 修復完成後，`rag_sync_status` 該列的 `caption_failed_count` 下降或歸零，
      而 `status` / `last_synced_version` / `last_synced_at` **維持不變**。
- [ ] 前端重新查詢後標籤消失。
- [ ] 該文件的文字段落在 Qdrant 中的 point id 與內容未變（可用 `qdrantService` 前後比對）。
- [ ] 5 分鐘內對同一筆再點一次 → 前端顯示**警告（略過）**而非錯誤，且 `rag_sync_logs`
      **不會**多出一筆 error 紀錄，AiRAG 也不會重複打多模態模型。
- [ ] 勾選多筆、其中一筆刻意造成失敗 → 其餘各筆仍正常送出，錯誤訊息顯示 AiRAG 的 `detail`。
- [ ] 文章型（`article`）文件不含內嵌圖片時觸發 → 不報錯，`caption_failed_count` 寫回 0。
- [ ] 勾選一筆**已下架**的文件 → 前端顯示「已下架，向量已移除」，**完全不呼叫 AiRAG**，
      且該列的 `caption_failed_count` 不被改動。
- [ ] 用 API 直接送 `sourceId: "abc"` 或未知的 `sourceType` → 回 400 且訊息明確（不會是 500）。

---

## 6. 注意事項與已知限制

1. **AiRAG worker 必須重啟**：新任務 `process_caption_repair_task` 註冊在 AiRAG 的 `worker.py`，
   舊 worker 不認得這個任務名。若沒重啟，端點照樣回 202 但任務永遠不執行——症狀是
   「按了沒反應也沒錯誤，`caption_failed_count` 一直不變」。
2. **原圖已不在 AiRAG 磁碟上時無法修復**（極舊的資料）：該圖會持續計入 `caption_failed_count`，
   這種情況才需要改用「指定執行切分」全量重跑。
3. **多模態模型不可用時**修復同樣會失敗，`caption_failed_count` 維持原值，稍後可再觸發一次。
4. **修復不改變文件版本**，因此同步排程與全量校驗的版本比對邏輯完全不受影響。
5. 修復是 AiRAG 端的背景作業，KB 沒有進度可查；需要確認結果時重新查詢列表，
   或執行一次「全量校驗」讓 `countFailedCaptions()` 實查 Qdrant。
