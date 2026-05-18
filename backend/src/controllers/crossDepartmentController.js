const { UserExtraDepartment } = require('../models');

/**
 * GET /api/v1/cross-departments/my-grants
 * 取得當前登入使用者被授權的跨部門清單（用於 Header 部門下拉合併）
 * 不限角色，任何已登入的同仁都可取得自己的授權
 */
async function getMyGrants(req, res) {
  try {
    const account = String(req.user.員工工號);
    const records = await UserExtraDepartment.findAll({
      where: { account },
      order: [['created_at', 'ASC']],
    });
    return res.json({ success: true, data: records });
  } catch (error) {
    console.error('crossDepartmentController.getMyGrants error:', error.message);
    return res.status(500).json({ success: false, message: '伺服器內部錯誤' });
  }
}

/**
 * GET /api/v1/cross-departments/created
 * 取得當前 MANAGER 自己建立的授權紀錄（用於 SettingsView 列表顯示）
 */
async function getCreated(req, res) {
  try {
    const createdBy = String(req.user.員工工號);
    const records = await UserExtraDepartment.findAll({
      where: { created_by: createdBy },
      order: [['created_at', 'DESC']],
    });
    return res.json({ success: true, data: records });
  } catch (error) {
    console.error('crossDepartmentController.getCreated error:', error.message);
    return res.status(500).json({ success: false, message: '伺服器內部錯誤' });
  }
}

/**
 * POST /api/v1/cross-departments
 * 新增跨部門授權
 * body: { account, org_oid, dept_code, dept_name }
 */
async function create(req, res) {
  try {
    const { account, org_oid, dept_code, dept_name } = req.body;

    if (!account || !org_oid || !dept_code) {
      return res.status(400).json({ success: false, message: '缺少必要欄位：account、org_oid、dept_code' });
    }

    const createdBy = String(req.user.員工工號);

    // 防止重複授權（同一人、同一部門）
    const existing = await UserExtraDepartment.findOne({
      where: { account: String(account), dept_code },
    });
    if (existing) {
      return res.status(409).json({ success: false, message: '該同仁已有此部門的跨部門授權' });
    }

    const record = await UserExtraDepartment.create({
      account:    String(account),
      org_oid,
      dept_code,
      dept_name:  dept_name || null,
      created_by: createdBy,
    });

    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    console.error('crossDepartmentController.create error:', error.message);
    return res.status(500).json({ success: false, message: '伺服器內部錯誤' });
  }
}

/**
 * DELETE /api/v1/cross-departments/:id
 * 刪除跨部門授權（只能刪自己建立的）
 */
async function remove(req, res) {
  try {
    const { id } = req.params;
    const createdBy = String(req.user.員工工號);

    const record = await UserExtraDepartment.findOne({
      where: { id, created_by: createdBy },
    });

    if (!record) {
      return res.status(404).json({ success: false, message: '授權紀錄不存在或無權刪除' });
    }

    await record.destroy();
    return res.json({ success: true, message: '已刪除授權紀錄' });
  } catch (error) {
    console.error('crossDepartmentController.remove error:', error.message);
    return res.status(500).json({ success: false, message: '伺服器內部錯誤' });
  }
}

module.exports = { getMyGrants, getCreated, create, remove };
