/**
 * BPM 外部登入服務
 * 代理呼叫 BPM AD 登入端點
 * URL: http://10.10.130.122:5123/v1/api/auth/login/ad
 */
const axios = require('axios');

const BPM_LOGIN_URL = process.env.BPM_LOGIN_URL || 'http://10.10.130.122:5123/v1/api/auth/login/ad';
const BPM_ADSERVER  = process.env.BPM_ADSERVER  || '碩禾_新';

/**
 * 呼叫 BPM 登入端點
 * @param {string} account  - 員工工號
 * @param {string} password - 密碼
 * @returns {Promise<{ authToken: string }>}
 * @throws 登入失敗時拋出 Error
 */
async function bpmLogin(account, password) {
  let response;

  try {
    response = await axios.post(
      BPM_LOGIN_URL,
      { account, password, adserver: BPM_ADSERVER },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );
  } catch (err) {
    // 網路錯誤或 BPM 不可用
    const status = err.response?.status;
    const msg    = err.response?.data?.message || err.message;
    console.error(`BPM 登入請求失敗 [${status || 'NETWORK_ERROR'}]:`, msg);
    throw new Error('BPM 系統無回應，請稍後再試');
  }

  const data = response.data;

  // BPM 回傳 success: false（帳號密碼錯誤等）
  if (!data.success) {
    throw new Error(data.message || '帳號或密碼錯誤');
  }

  if (!data.authToken) {
    throw new Error('BPM 未回傳 authToken');
  }

  return { authToken: data.authToken };
}

/**
 * 解析 JWT Payload（不驗簽，僅 Base64 decode）
 * @param {string} token - JWT 字串
 * @returns {{ account: string, exp: number, iat: number }}
 */
function parseJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('非標準 JWT 格式');

    // Base64URL → Base64 → decode
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json    = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (err) {
    console.error('JWT payload 解析失敗:', err.message);
    throw new Error('Token 格式無效');
  }
}

module.exports = { bpmLogin, parseJwtPayload };
