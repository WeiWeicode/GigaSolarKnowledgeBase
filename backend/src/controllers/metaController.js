/**
 * Meta Controller
 * 處理組織、部門等中繼資料查詢
 */
const nanaService = require('../services/nanaService');

/**
 * 取得公司清單
 * GET /api/v1/meta/companies
 */
async function getCompanies(req, res) {
  try {
    const data = await nanaService.getCompanies();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('getCompanies error:', error.message);
    return res.status(500).json({ success: false, message: '取得公司清單失敗' });
  }
}

/**
 * 取得部門清單
 * GET /api/v1/meta/departments?組織OID=xxx
 */
async function getDepartments(req, res) {
  try {
    const { 組織OID } = req.query;
    
    if (!組織OID) {
      return res.status(400).json({ success: false, message: '缺少組織OID參數' });
    }

    const data = await nanaService.getDepartmentsByOrg(組織OID);
    // 只帶部門代碼S開頭的部門
    const filteredData = data.filter((item) => item.部門代碼.startsWith('S'));
    return res.json({ success: true, data: filteredData });
  } catch (error) {
    console.error('getDepartments error:', error.message);
    return res.status(500).json({ success: false, message: '取得部門清單失敗' });
  }
}

module.exports = {
  getCompanies,
  getDepartments,
};
