const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const { authMiddleware } = require('../middlewares/auth');

// 所有留言路由均需登入
router.use(authMiddleware);

/**
 * @route PATCH /api/v1/comments/:id/read
 * @desc  標記單一留言為已讀
 */
router.patch('/:id/read', commentController.markCommentAsRead);

module.exports = router;
