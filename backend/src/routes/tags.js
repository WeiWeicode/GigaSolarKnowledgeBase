const express = require('express');
const router = express.Router();
const tagController = require('../controllers/tagController');
const { authMiddleware, requireRole } = require('../middlewares/auth');

// 所有標籤路由均需登入
router.use(authMiddleware);

/**
 * @route GET /api/v1/tags
 * @desc  取得所有標籤
 * @access Private
 */
router.get('/', tagController.getAllTags);

/**
 * @route POST /api/v1/tags
 * @desc  新增標籤
 * @access Private
 */
router.post('/', tagController.createTag);

/**
 * @route DELETE /api/v1/tags/:id
 * @desc  刪除標籤（僅 MANAGER / ADMIN）
 * @access Private (MANAGER+)
 */
router.delete('/:id', requireRole('MANAGER', 'ADMIN'), tagController.deleteTag);

module.exports = router;
