const express = require('express');
const router = express.Router();
const directoryController = require('../controllers/directoryController');
const { authMiddleware, requireRole } = require('../middlewares/auth');

// 所有目錄路由均需登入
router.use(authMiddleware);

/**
 * @route GET /api/v1/directories
 * @desc  取得目錄樹（含權限過濾）
 * @access Private
 */
router.get('/', directoryController.getTree);

/**
 * @route POST /api/v1/directories
 * @desc  新增目錄節點
 * @access Private
 */
router.post('/', directoryController.createNode);

/**
 * @route PATCH /api/v1/directories/:id/rename
 * @desc  重新命名節點
 * @access Private
 */
router.patch('/:id/rename', directoryController.renameNode);

/**
 * @route PATCH /api/v1/directories/move
 * @desc  移動節點（拖拽）
 * @access Private
 */
router.patch('/move', directoryController.moveNode);

/**
 * @route DELETE /api/v1/directories/:id
 * @desc  刪除空目錄節點（僅 MANAGER / ADMIN）
 * @access Private (MANAGER+)
 */
router.delete('/:id', requireRole('MANAGER', 'ADMIN'), directoryController.deleteNode);

module.exports = router;
