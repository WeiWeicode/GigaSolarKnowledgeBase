const express = require('express');
const router = express.Router({ mergeParams: true }); // 需 mergeParams 以取得 articleId
const commentController = require('../controllers/commentController');
const { authMiddleware } = require('../middlewares/auth');

// 所有留言路由均需登入
router.use(authMiddleware);

/**
 * @route GET /api/v1/articles/:articleId/comments
 * @desc  取得文章留言列表
 */
router.get('/', commentController.getCommentsByArticle);

/**
 * @route POST /api/v1/articles/:articleId/comments
 * @desc  新增留言
 */
router.post('/', commentController.createComment);

/**
 * @route PATCH /api/v1/comments/:id/read
 * @desc  標記單一留言為已讀 (獨立路由)
 */
// 注意：此路由通常不掛在 article 下，因為它操作的是特定的 comment ID
// 但為了符合 TASK-11 的「掛在 articles 下」，我們暫時這樣設計
// 或者提供一個全域路徑供 PATCH 使用

module.exports = router;
