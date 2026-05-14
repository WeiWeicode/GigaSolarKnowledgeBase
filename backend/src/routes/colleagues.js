const express = require('express');
const router = express.Router();
const colleagueController = require('../controllers/colleagueController');
const { authMiddleware } = require('../middlewares/auth');

// 所有同事路由均需登入
router.use(authMiddleware);

/**
 * @route GET /api/v1/colleagues
 * @desc  取得所有同事清單
 * @access Private
 */
router.get('/', colleagueController.getAllColleagues);

module.exports = router;
