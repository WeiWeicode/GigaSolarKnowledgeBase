const { Router } = require('express');
const ragSyncAuth = require('../middlewares/ragSyncAuth');
const ragSyncController = require('../controllers/ragSyncController');

const router = Router();

// 供 AiRAG 拉取內容用，伺服器對伺服器，非使用者登入
router.use(ragSyncAuth);

/**
 * @route GET /api/v1/rag-sync-content/article/:id
 * @desc  取得文章 Markdown 全文與比對用 metadata（未上架回 404）
 */
router.get('/article/:id', ragSyncController.getArticleContent);

/**
 * @route GET /api/v1/rag-sync-content/attachment-file/:id
 * @desc  取得附件檔案二進位與比對用 metadata（未上架回 404）
 */
router.get('/attachment-file/:id', ragSyncController.getAttachmentFileContent);

module.exports = router;
