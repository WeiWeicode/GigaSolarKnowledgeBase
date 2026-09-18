# DevOps 觀測回報（devops-reporter）循環參照與請求延遲問題調查報告

- **建立日期**：2026-09-18
- **對應編號**：B-15
- **狀態**：⏳ 待修（尚未修改程式碼）
- **關聯模組**：`backend/src/lib/devopsReporter.js`

---

## 1. 問題概述

引入 `backend/src/lib/devopsReporter.js`（DevOpsDiagram 監控 SDK）後，系統在前端載入頁面時**偶發性出現 API 請求延遲長達約 2.5 ~ 3 秒**。同時，後端 Docker 容器（`gigaks-backend`）持續輸出以下錯誤日誌：

```text
[devops-reporter] 組裝紀錄失敗: Converting circular structure to JSON
   --> starting at object with constructor 'Object'
   |     property 'parent' -> object with constructor 'Object'
   --- property 'through' closes the circle
```

---

## 2. 症狀分析

### 前端表現
- 當開啟或切換頁面時，瀏覽器會同時並行發送 10~15 隻 API 請求（例如 `/api/v1/cross-departments/my-grants`、`/api/v1/articles/32`、`/api/v1/tags`、`/api/v1/attachments`、`/api/v1/notifications` 等）。
- Network 面板瀑布圖顯示部分請求等待時間（Waiting for server response / TTFB）長達 2500ms ~ 3000ms。

### 後端表現
- 當請求涉及 Sequelize 多對多關聯（例如包含 `Tags`、`Attachments` 的文章詳情 `/articles/:id`）時，Docker log 立即觸發 `[devops-reporter] 組裝紀錄失敗: Converting circular structure to JSON`。

---

## 3. 根本原因深入剖析

此延遲**不是網路連線逾時**，而是 **Node.js 事件循環（Event Loop）被密集、深層的同步 JavaScript 物件遞迴卡死**。

### 3.1 Sequelize 關聯的循環參照結構
在知識庫專案中（見 `backend/src/models/index.js`），許多模型使用多對多關聯（`belongsToMany`）：
- `Article` ↔ `Tag` 透過 `ArticleTag`（`through` 表）關聯。
- 當查詢文章時（如 `Article.findByPk(id, { include: [Tag] })`），Sequelize 生成的 Model 物件階層如下：
  - `article.Tags[0]` 是 `Tag` 實例。
  - `Tag` 帶有 `through`（即 `ArticleTag` 實例）。
  - `ArticleTag` 內部帶有 `parent` 屬性，指回 `article` 本身。
  - 同時包含 Sequelize 整個 ORM 引擎連線資訊（`instance.sequelize`）與大量內部屬性。

### 3.2 Express 內建 `res.json` 為何正常？
- 控制器執行 `return res.json({ success: true, data: article });`。
- Express 的 `res.json()` 會呼叫原生 `JSON.stringify(body)`。
- 原生 `JSON.stringify` 支援物件自定義的 `.toJSON()` 方法。Sequelize 的 `.toJSON()` 會自動剝離所有內部屬性（`parent`、`through`、`_options` 等），僅輸出純屬性 `dataValues`，因此 Express 自身的序列化非常迅速且不會噴錯。

### 3.3 `devopsReporter.js` 攔截引發的災難
在 `backend/src/lib/devopsReporter.js` 中：

1. **攔截了原始未解構的 Sequelize 實例**：
   ```javascript
   let responseBody = null;
   const originalJson = res.json.bind(res);
   res.json = (body) => {
     responseBody = body; // 儲存了未經 toJSON 處理的原始 Model 實例
     return originalJson(body);
   };
   ```

2. **在 `res.on('finish')` 進行深層遮蔽 `maskDeep`**：
   ```javascript
   function maskDeep(value, extra, depth = 0) {
     if (depth > 12 || value === null || value === undefined) return value;
     if (Array.isArray(value)) return value.map((v) => maskDeep(v, extra, depth + 1));
     if (typeof value === 'object') {
       const out = {};
       for (const [k, v] of Object.entries(value)) {
         out[k] = isSensitiveKey(k, extra) ? '***' : maskDeep(v, extra, depth + 1);
       }
       return out;
     }
     return value;
   }
   ```
   **此處存在三個致命問題：**
   - **未檢查 `.toJSON()`**：將 Sequelize 實例當成普通字典物件，直接透過 `Object.entries(value)` 歷遍所有內部關聯。
   - **缺少循環參照偵測機制（Cycle Detection）**：`article` → `Tags[0]` → `ArticleTag` → `parent` (article) → `Tags[0]` ... 陷入雙向循環。
   - **指數級展開與 CPU 100% 凍結**：
     在 `depth <= 12` 的限制下，若一篇文章帶有多個標籤與關聯，遞迴展開會以指數級擴散，單次呼叫即可建立數萬至數十萬個中間物件。Node.js 為單執行緒，這段密集運算會**霸佔 CPU 達 0.5 ~ 1 秒以上**。當多個並行請求同時完成時，事件循環連續受阻，後續請求排隊等待時間累積至 2.5 ~ 3 秒。

3. **在 `prepareBody` 中序列化崩潰**：
   - 當遞迴至 `depth > 12` 時，`maskDeep` 直接執行 `return value;`，將最深層的原循環參照夾帶於一般物件中。
   - 隨後 `prepareBody` 執行 `sizeOf(body)` → `JSON.stringify(body)`。
   - 由於外層已被轉為一般 Plain Object（失去了 Sequelize `.toJSON()` 方法的保護），V8 引擎的原生 `JSON.stringify` 遇到內層循環引用即丟出 `TypeError: Converting circular structure to JSON`。
   - 錯誤被 line 330 的 `catch` 捕獲，輸出日誌警告。

---

## 4. 影響檔案與程式碼行號

| 檔案路徑 | 行號 | 說明 |
|---|---|---|
| `backend/src/lib/devopsReporter.js` | L44-L55 | `maskDeep` 缺乏 `.toJSON()` 處理與循環防護（WeakSet） |
| `backend/src/lib/devopsReporter.js` | L82, L68 | `prepareBody` 與 `sizeOf` 對未脫殼物件執行 `JSON.stringify` 導致崩潰 |
| `backend/src/lib/devopsReporter.js` | L275-L281 | `res.json` 攔截直接持有原始 `body` 實例 |
| `backend/src/controllers/articleController.js` | L156 | `getArticleById` 等 Controller 直接將 Sequelize Model 實例傳入 `res.json` |

---

## 5. 建議解決方案

修復只需在 `backend/src/lib/devopsReporter.js` 增加防護，不需改動任何業務邏輯或 Controller：

### 方案 A：在進入 `maskDeep` 或攔截前優先脫殼（最根本且效能最佳）
在處理前判斷是否具備 `.toJSON()` 方法，將其還原為乾淨的純資料物件：
```javascript
// 若為 Sequelize Model 或具備 toJSON 特性的物件，先轉換為 Plain Object
if (value && typeof value.toJSON === 'function') {
  value = value.toJSON();
}
```

### 方案 B：在 `maskDeep` 加入 `WeakSet` 循環引用防護
避免未知物件結構造成遞迴爆炸：
```javascript
function maskDeep(value, extra, depth = 0, seen = new WeakSet()) {
  if (depth > 12 || value === null || value === undefined) return value;
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    // ...
  }
  // ...
}
```

### 方案 C：攔截回應時記錄已序列化的文字或輕量結構
避免在記憶體中持有大型未序列化 ORM 物件。
