/**
 * Colleague Controller
 * 處理同事清單查詢
 */
const nanaService = require('../services/nanaService');

/**
 * 取得所有同事清單
 * GET /api/v1/colleagues
 */
async function getAllColleagues(req, res) {
  try {
    const data = await nanaService.getAllColleagues();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('getAllColleagues error:', error.message);
    return res.status(500).json({ success: false, message: '取得同事清單失敗' });
  }
}

module.exports = {
  getAllColleagues,
};
