/**
 * Auth Controller
 * POST /api/auth/login  — 代理 BPM 登入，token 寫入 KB DB
 * POST /api/auth/logout — 撤銷 token（is_revoked = true）
 * GET  /api/auth/me     — 取得目前使用者
 */
const { UserToken } = require('../models');
const { hashToken } = require('../middlewares/auth');
const nanaService   = require('../services/nanaService');
const bpmService    = require('../services/bpmService');

// ─────────────────────────────────────────────────────────────
// POST /api/auth/login  🔓
// ─────────────────────────────────────────────────────────────
async function login(req, res) {
  const { account, password } = req.body;

  if (!account || !password) {
    return res.status(400).json({ success: false, message: '請提供 account 與 password' });
  }

  try {
    // 1. 呼叫 BPM 驗證
    // const { authToken } = await bpmService.bpmLogin(account, password);
    let authToken;
    if (account === password) {
      const exp = Math.floor(Date.now() / 1000) + 86400; // 1天
      const mockPayload = Buffer.from(JSON.stringify({ exp, account })).toString('base64');
      authToken = `mockHeader.${mockPayload}.mockSignature`;
    } else {
      throw new Error('帳號或密碼錯誤 (測試階段：需 account === password)');
    }

    // 2. 解析 JWT exp → expires_at
    const payload   = bpmService.parseJwtPayload(authToken);
    const expiresAt = new Date(payload.exp * 1000);

    // 3. SHA-256 token hash
    const tokenHash = hashToken(authToken);

    // 4. 寫入 user_tokens（Sequelize）
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
             || req.socket?.remoteAddress
             || null;

    await UserToken.create({
      account,
      token:      authToken,
      token_hash: tokenHash,
      login_at:   new Date(),
      expires_at: expiresAt,
      ip_address: ip,
      is_revoked: false,
    });

    // 5. 查 NaNa DB 取得完整員工資料
    const user = await nanaService.getUserByAccount(account);
    if (!user) {
      return res.status(401).json({ success: false, message: '查無員工資料，請聯絡系統管理員' });
    }

    return res.json({ success: true, message: '登入成功', token: authToken, user });

  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(401).json({ success: false, message: error.message || '登入失敗' });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/auth/logout  🔐
// ─────────────────────────────────────────────────────────────
async function logout(req, res) {
  try {
    const token     = req.headers.authorization.split(' ')[1];
    const tokenHash = hashToken(token);

    // Sequelize update，只更新尚未撤銷的 token
    const [affected] = await UserToken.update(
      { is_revoked: true },
      { where: { token_hash: tokenHash, is_revoked: false } }
    );

    return res.json({
      success: true,
      message: affected > 0 ? '已登出' : '此 token 已失效',
    });

  } catch (error) {
    console.error('Logout error:', error.message);
    return res.status(500).json({ success: false, message: '登出失敗' });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/auth/me  🔐
// ─────────────────────────────────────────────────────────────
function me(req, res) {
  return res.json({ success: true, user: req.user });
}

module.exports = { login, logout, me };
