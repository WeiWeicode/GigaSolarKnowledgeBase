const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authMiddleware } = require('../middlewares/auth');

// 所有通知路由均需登入
router.use(authMiddleware);

/**
 * @route GET /api/v1/notifications
 * @desc  取得個人通知列表
 */
router.get('/', notificationController.getMyNotifications);

/**
 * @route PATCH /api/v1/notifications/read-all
 * @desc  標記所有通知為已讀
 */
router.patch('/read-all', notificationController.markAllAsRead);

/**
 * @route PATCH /api/v1/notifications/:id/read
 * @desc  標記單一通知為已讀
 */
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
