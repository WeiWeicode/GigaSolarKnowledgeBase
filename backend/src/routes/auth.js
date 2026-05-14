/**
 * Auth 路由
 */
const express = require('express');
const router  = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const authController     = require('../controllers/authController');

// 🔓 POST /api/auth/login
router.post('/login', authController.login);

// 🔐 POST /api/auth/logout
router.post('/logout', authMiddleware, authController.logout);

// 🔐 GET /api/auth/me
router.get('/me', authMiddleware, authController.me);

module.exports = router;
