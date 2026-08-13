const { Router } = require('express');
const { authMiddleware } = require('../middlewares/auth');
const aiChatHistoryController = require('../controllers/aiChatHistoryController');

const router = Router();

router.use(authMiddleware);

/**
 * @route GET /api/v1/ai-chats
 * @desc  對話列表（keyword / isPinned / isFavorite / includeHidden / page / pageSize）
 */
router.get('/', aiChatHistoryController.listSessions);

/**
 * @route POST /api/v1/ai-chats
 * @desc  建立對話（sessionUid 重複時回既有對話，前端重送不會建出兩筆）
 */
router.post('/', aiChatHistoryController.createSession);

/**
 * @route PUT /api/v1/ai-chats/sort
 * @desc  批次排序。放在 /:id 之前宣告，避免 'sort' 被當成 id 參數
 */
router.put('/sort', aiChatHistoryController.updateSortOrders);

/**
 * @route GET /api/v1/ai-chats/:id
 * @desc  單一對話 + 全部訊息
 */
router.get('/:id', aiChatHistoryController.getSessionDetail);

/**
 * @route PATCH /api/v1/ai-chats/:id
 * @desc  部分更新：customTitle / isPinned / isFavorite / sortOrder
 */
router.patch('/:id', aiChatHistoryController.updateSession);

/**
 * @route DELETE /api/v1/ai-chats/:id
 * @desc  軟刪除（is_hidden = 1），不做實體刪除
 */
router.delete('/:id', aiChatHistoryController.hideSession);

/**
 * @route POST /api/v1/ai-chats/:id/messages
 * @desc  追加一輪問答（user + ai 各一則），並非同步觸發 Mongo 回填
 */
router.post('/:id/messages', aiChatHistoryController.appendMessages);

module.exports = router;
