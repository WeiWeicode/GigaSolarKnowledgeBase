const { Router } = require('express');
const { authMiddleware, requireRole } = require('../middlewares/auth');
const ragSyncController = require('../controllers/ragSyncController');

const router = Router();

router.use(authMiddleware, requireRole('ADMIN'));

/**
 * @route GET /api/v1/rag-sync/config
 * @desc  取得目前排程設定
 */
router.get('/config', ragSyncController.getConfig);

/**
 * @route PUT /api/v1/rag-sync/config
 * @desc  更新排程設定，儲存後立即套用新的 cron 表達式
 */
router.put('/config', ragSyncController.updateConfig);

/**
 * @route GET /api/v1/rag-sync/status
 * @desc  比對狀態列表（分頁 + 篩選）
 */
router.get('/status', ragSyncController.getStatusList);

/**
 * @route POST /api/v1/rag-sync/status/execute
 * @desc  手動指定項目重新執行切分
 */
router.post('/status/execute', ragSyncController.executeManual);

/**
 * @route GET /api/v1/rag-sync/logs
 * @desc  錯誤/事件 Log 列表（分頁 + 篩選）
 */
router.get('/logs', ragSyncController.getLogs);

/**
 * @route POST /api/v1/rag-sync/audit
 * @desc  觸發全量校驗（逐筆比對 KB DB 與 Qdrant 實際資料）
 */
router.post('/audit', ragSyncController.runAudit);

module.exports = router;
