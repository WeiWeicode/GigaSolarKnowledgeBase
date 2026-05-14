const express = require('express');
const router = express.Router();
const metaController = require('../controllers/metaController');
const { authMiddleware } = require('../middlewares/auth');

// 所有 meta 路由均需登入
router.use(authMiddleware);

/**
 * @route GET /api/v1/meta/companies
 * @desc  取得公司清單
 * @access Private
 */
router.get('/companies', metaController.getCompanies);

/**
 * @route GET /api/v1/meta/departments
 * @desc  取得部門清單
 * @access Private
 */
router.get('/departments', metaController.getDepartments);

module.exports = router;
