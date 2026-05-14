# API 端點問題紀錄 (API Issue Log)

此文件用於記錄在執行 `API_TEST_MANUAL.md` 過程中發現的任何問題、錯誤或不一致之處。

| 測試編號 | 端點 | 問題描述 | 狀態 | 修正日期 |
| :--- | :--- | :--- | :--- | :--- |
| T-10 | GET /api/v1/directories | 資料庫初始為空時回傳 `data: []`，缺乏公司/部門根節點。 | ✅ 已修正 | 2026-05-14 |
| T-24 | PUT /api/v1/attachments/:id | 更新時傳入已存在的 UUID 導致唯一約束衝突。 | ✅ 已修正 | 2026-05-14 |
| T-31 | POST /.../rollback | 建立文章未存版本 1；更新時版本號對應邏輯錯誤。 | ✅ 已修正 | 2026-05-14 |

---

## 修正說明

### T-10 目錄樹初始資料

**根本原因：** `directories` 表為空，前端拿不到公司/部門根節點。

**修正方式：**
- 新增 `src/scripts/seedDirectories.js`
  - 從 NaNa DB 查詢公司與部門（部門代碼以 S 開頭）
  - 建立 `company`、`department`、`trash` 節點
  - 使用 `findOrCreate` 避免重複執行時衝突
- `src/index.js` 啟動時呼叫 `seedIfEmpty()`：`directories` 表為空才執行，有資料直接跳過
- 也可手動執行：`node src/scripts/seedDirectories.js`

---

### T-24 附件更新 UUID 衝突

**根本原因：** `updateAttachment` 用 `!f.id` 判斷新檔案，但前端傳回的既有檔案沒有 DB `id`，所以既有檔案也進入 `bulkCreate`，觸發 `uuid UNIQUE` 約束衝突。

**修正方式：**
- 先查詢 DB 中此附件包已有的所有 `uuid`
- 只對「uuid 不在 DB 中」的檔案執行 `bulkCreate`

```js
// attachmentController.js updateAttachment
const existingFiles = await AttachmentFile.findAll({
  where: { attachment_id: id },
  attributes: ['uuid'],
  transaction: t,
});
const existingUUIDs = new Set(existingFiles.map(f => f.uuid));
const newFiles = files.filter(f => f.uuid && !existingUUIDs.has(f.uuid));
if (newFiles.length > 0) {
  await AttachmentFile.bulkCreate(newFiles.map(f => ({ ...f, attachment_id: id, version_number: nextVersion })), { transaction: t });
}
```

---

### T-31 文章版本邏輯

**根本原因有二：**

1. **建立文章未存版本 1 快照**：`createArticle` 沒有 INSERT `article_version_history`，導致無法還原到初始版本。

2. **更新時版本號邏輯錯誤**：原本用 `nextVersion` 存舊內容，導致版本號與內容對不上。

   | 操作 | 原本（錯誤） | 修正後（正確） |
   |------|------------|--------------|
   | 建立文章 v1 | 不存快照 | 存 `version=1, content=初始內容` |
   | 更新文章 v1→v2 | 存 `version=2, content=舊內容` | 存 `version=1, content=舊內容` |
   | 文章主表 | version=2 | version=2（不變） |

**修正方式：**

```js
// articleController.js createArticle — 建立後立即存版本 1
await ArticleVersionHistory.create({
  article_id: article.id,
  version_number: 1,
  content: content,
  diff_summary: '初始版本',
  ...
});

// articleController.js updateArticle — 存「目前版本號」的舊內容
const currentVersion = article.version_number;
const nextVersion    = currentVersion + 1;
await ArticleVersionHistory.create({
  version_number: currentVersion,   // ← 舊版本號
  content: article.content,         // ← 更新前的內容
  ...
});
await article.update({ version_number: nextVersion, content: newContent, ... });
```

**結果驗證：**

| 操作 | article.version_number | article_version_history |
|------|----------------------|-------------------------|
| 建立文章 | 1 | `{version:1, content:"初始"}` |
| 第一次更新 | 2 | `{version:1, content:"初始"}` |
| 第二次更新 | 3 | `{version:2, content:"第一次更新"}` |
| Rollback to v1 | 4 | `{version:3, content:"第二次更新"}` |
