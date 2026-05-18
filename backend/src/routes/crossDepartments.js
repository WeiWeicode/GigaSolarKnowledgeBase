const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/crossDepartmentController');
const { authMiddleware, requireRole } = require('../middlewares/auth');

// GET /api/v1/cross-departments/my-grants
// 任何已登入的同仁都可取得自己被授權的部門（不限角色）
router.get('/my-grants', authMiddleware, ctrl.getMyGrants);

// 以下路由僅 MANAGER 可操作
router.use(authMiddleware, requireRole('MANAGER'));

// GET /api/v1/cross-departments/created
router.get('/created', ctrl.getCreated);

// POST /api/v1/cross-departments
router.post('/', ctrl.create);

// DELETE /api/v1/cross-departments/:id
router.delete('/:id', ctrl.remove);

module.exports = router;
