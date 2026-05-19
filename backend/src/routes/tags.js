const express = require('express');
const router = express.Router();
const tagController = require('../controllers/tagController');
const { authMiddleware, requireRole } = require('../middlewares/auth');

// 所有標籤路由均需登入
router.use(authMiddleware);

/**
 * @route GET /api/v1/tags
 * @desc  取得標籤列表（支援 ?scope=public|dept&deptCode=xxx）
 * @access Private
 */
router.get('/', tagController.getAllTags);

/**
 * @route POST /api/v1/tags
 * @desc  新增標籤（支援 departments, customOrder, isPublic）
 * @access Private (MANAGER+)
 */
router.post('/', requireRole('MANAGER', 'ADMIN'), tagController.createTag);

/**
 * @route PATCH /api/v1/tags/:id
 * @desc  更新標籤（名稱、部門、排序、是否公開）
 * @access Private (MANAGER+)
 */
router.patch('/:id', requireRole('MANAGER', 'ADMIN'), tagController.updateTag);

/**
 * @route DELETE /api/v1/tags/:id
 * @desc  刪除標籤
 * @access Private (MANAGER+)
 */
router.delete('/:id', requireRole('MANAGER', 'ADMIN'), tagController.deleteTag);

/**
 * @route POST /api/v1/tags/:id/click
 * @desc  累加標籤點擊次數（公開模式下 tag chip 被點選時呼叫）
 * @access Private（所有登入使用者）
 */
router.post('/:id/click', tagController.incrementClickCount);

module.exports = router;
