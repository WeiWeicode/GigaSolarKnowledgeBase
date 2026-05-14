const express = require('express');
const router = express.Router({ mergeParams: true });
const versionController = require('../controllers/versionController');
const { authMiddleware } = require('../middlewares/auth');

router.use(authMiddleware);

// 此 Router 會根據掛載路徑自動處理 articleId 或 attachmentId

/**
 * @route GET /api/v1/articles/:articleId/versions
 * @route GET /api/v1/attachments/:attachmentId/versions
 */
router.get('/', (req, res) => {
  if (req.params.articleId) return versionController.getArticleVersions(req, res);
  if (req.params.attachmentId) return versionController.getAttachmentVersions(req, res);
});

/**
 * @route POST /api/v1/articles/:articleId/versions/:versionNum/rollback
 * @route POST /api/v1/attachments/:attachmentId/versions/:versionNum/rollback
 */
router.post('/:versionNum/rollback', (req, res) => {
  if (req.params.articleId) return versionController.rollbackArticle(req, res);
  if (req.params.attachmentId) return versionController.rollbackAttachment(req, res);
});

module.exports = router;
