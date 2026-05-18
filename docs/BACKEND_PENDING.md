# 後端待修正項目（由前端審查發現）

> 本文件記錄前端修正過程中，發現需要後端配合補實的功能或 Bug。
> 由前端工程師維護，後端修正後請更新「狀態」欄位。

---

## 未修正項目總覽

| # | 優先度 | 類別 | 摘要 | 狀態 |
|---|--------|------|------|------|
| B-06 | 🗒️ 低 | Admin | 後台功能端點尚未建立：垃圾桶管理、系統日誌、AI 設定儲存、儲存空間查詢 | ⏳ 待修 |

---

## 已修正項目

| # | 摘要 | 修正日期 | 影響範圍 |
|---|------|----------|----------|
| B-01 | ADMIN 角色無法產生 | 2026-05-14 | 新增 `UserRole` model、`models/index.js`、`nanaService.getUserByAccount` 查詢 KB DB user_roles 覆寫 |
| B-02 | Directory 缺少 DELETE 端點 | 2026-05-14 | `directoryController.deleteNode`、`routes/directories.js`、前端 `api.js directoryService.removeNode`、`DirectoryTree.vue` |
| B-03 | Article / Attachment 不回傳 directoryIds | 2026-05-14 | `articleController`（getAllArticles / getArticleById / updateArticle 補同步目錄節點）、`attachmentController`（同上，含 linkedArticleIds）|
| B-04 | getAllAttachments 不含 Files | 2026-05-14 | `attachmentController.getAllAttachments` 加入 Files include（limit 1） |
| B-05 | Tag 缺少 DELETE 端點 | 2026-05-14 | `tagController.deleteTag`、`routes/tags.js`、前端 `api.js tagService.remove`、`AdminView.vue deleteTag` |
| B-07 | 版本號重複：第一次編輯儲存後 version 仍為 v1 | 2026-05-18 | `backend/src/controllers/articleController.js` |

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
