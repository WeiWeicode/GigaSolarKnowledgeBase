# 後端待修正項目（由前端審查發現）

> 本文件記錄前端修正過程中，發現需要後端配合補實的功能或 Bug。
> 由前端工程師維護，後端修正後請更新「狀態」欄位。

---

## 未修正項目總覽

| # | 優先度 | 類別 | 摘要 | 狀態 |
|---|--------|------|------|------|
| B-06 | 🗒️ 低 | Admin | 後台功能端點尚未建立：垃圾桶管理、系統日誌、AI 設定儲存、儲存空間查詢 | ⏳ 待修 |

---

## 未修正詳細說明

### B-06｜Admin 後台功能端點

**問題描述：**

`AdminView.vue` 有以下四個區塊目前顯示「功能建置中」banner，資料全為 placeholder：

| 功能 | 需要的端點 |
|------|------------|
| 垃圾桶管理 | `GET /api/v1/admin/trash` 、`DELETE /api/v1/admin/trash/:id` |
| 系統日誌 | `GET /api/v1/admin/logs` |
| AI 設定 | `GET /api/v1/admin/ai-config` 、`PATCH /api/v1/admin/ai-config` |
| 儲存空間查詢 | `GET /api/v1/admin/storage` |

這些功能優先度較低，不影響主要文章/附件操作，待主線功能穩定後再實作。

---

## 已修正項目

| # | 摘要 | 修正日期 | 影響範圍 |
|---|------|----------|----------|
| B-01 | ADMIN 角色無法產生 | 2026-05-14 | 新增 `UserRole` model、`models/index.js`、`nanaService.getUserByAccount` 查詢 KB DB user_roles 覆寫 |
| B-02 | Directory 缺少 DELETE 端點 | 2026-05-14 | `directoryController.deleteNode`、`routes/directories.js`、前端 `api.js directoryService.removeNode`、`DirectoryTree.vue` |
| B-03 | Article / Attachment 不回傳 directoryIds | 2026-05-14 | `articleController`（getAllArticles / getArticleById / updateArticle 補同步目錄節點）、`attachmentController`（同上，含 linkedArticleIds）|
| B-04 | getAllAttachments 不含 Files | 2026-05-14 | `attachmentController.getAllAttachments` 加入 Files include（limit 1） |
| B-05 | Tag 缺少 DELETE 端點 | 2026-05-14 | `tagController.deleteTag`、`routes/tags.js`、前端 `api.js tagService.remove`、`AdminView.vue deleteTag` |
