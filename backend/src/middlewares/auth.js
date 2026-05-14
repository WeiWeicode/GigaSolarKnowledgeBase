/**
 * Auth Middleware
 * 1. 從 Authorization: Bearer <token> 取出 token
 * 2. SHA-256(token) → 查 UserToken model
 * 3. 查 NaNa DB 取得完整員工資料，附加至 req.user
 */
const crypto      = require('crypto');
const { Op }      = require('sequelize');
const { UserToken } = require('../models');
const nanaService   = require('../services/nanaService');

/**
 * SHA-256 hash（hex，64 字元）
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 主要 Auth Middleware
 */
async function authMiddleware(req, res, next) {
  try {
    // 1. 取出 header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: '缺少 Authorization header' });
    }

    // 2. 確認格式 "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ success: false, message: 'Authorization 格式錯誤，應為 Bearer <token>' });
    }

    const token     = parts[1];
    const tokenHash = hashToken(token);

    // 3. 查 UserToken（Sequelize）
    const record = await UserToken.findOne({
      where: {
        token_hash: tokenHash,
        is_revoked: false,
        expires_at: { [Op.gt]: new Date() },
      },
    });

    if (!record) {
      return res.status(401).json({ success: false, message: 'Token 無效或已過期' });
    }

    // 4. 查 NaNa DB 取得完整員工資料
    const user = await nanaService.getUserByAccount(record.account);
    if (!user) {
      return res.status(401).json({ success: false, message: '員工資料不存在' });
    }

    // 5. 附加至 req.user
    req.user = user;
    next();

  } catch (error) {
    console.error('AuthMiddleware error:', error.message);
    return res.status(500).json({ success: false, message: '伺服器內部錯誤' });
  }
}

/**
 * 角色檢查 Middleware
 * 用法：router.post('/xxx', authMiddleware, requireRole('MANAGER', 'ADMIN'), handler)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: '未通過身份驗證' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `權限不足，需要 ${allowedRoles.join(' 或 ')} 角色`,
      });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole, hashToken };
