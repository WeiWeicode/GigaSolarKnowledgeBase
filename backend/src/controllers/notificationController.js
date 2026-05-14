/**
 * Notification Controller
 * 處理個人標註通知的讀取與標記
 */
const { Notification } = require('../models');

/**
 * 取得當前使用者的通知列表
 * GET /api/v1/notifications
 */
async function getMyNotifications(req, res) {
  try {
    const account = req.user.員工工號;
    
    const notifications = await Notification.findAll({
      where: { target_account: account },
      order: [['created_at', 'DESC']],
      limit: 50 // 僅回傳最近 50 則
    });

    return res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('getMyNotifications error:', error.message);
    return res.status(500).json({ success: false, message: '取得通知失敗' });
  }
}

/**
 * 標記單一通知為已讀
 * PATCH /api/v1/notifications/:id/read
 */
async function markAsRead(req, res) {
  try {
    const { id } = req.params;
    const account = req.user.員工工號;

    const [updatedCount] = await Notification.update(
      { is_read: true },
      { where: { id, target_account: account } }
    );

    if (updatedCount === 0) {
      return res.status(404).json({ success: false, message: '找不到該通知或無權限' });
    }

    return res.json({ success: true, message: '已標記為已讀' });
  } catch (error) {
    console.error('markAsRead error:', error.message);
    return res.status(500).json({ success: false, message: '更新通知失敗' });
  }
}

/**
 * 標記所有通知為已讀
 * PATCH /api/v1/notifications/read-all
 */
async function markAllAsRead(req, res) {
  try {
    const account = req.user.員工工號;

    await Notification.update(
      { is_read: true },
      { where: { target_account: account, is_read: false } }
    );

    return res.json({ success: true, message: '所有通知已標記為已讀' });
  } catch (error) {
    console.error('markAllAsRead error:', error.message);
    return res.status(500).json({ success: false, message: '更新通知失敗' });
  }
}

module.exports = {
  getMyNotifications,
  markAsRead,
  markAllAsRead
};
