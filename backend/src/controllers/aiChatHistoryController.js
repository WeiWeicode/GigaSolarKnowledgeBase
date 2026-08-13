/**
 * AI 歷史訊息 Controller
 * 見 docs/DevelopmentProcess/AI_CHAT_HISTORY_PLAN.md 5 節
 *
 * 擁有權一律在 service 層以 account 條件查詢，查不到就回 404；
 * 前端隱藏按鈕不算權限控制（規劃文件 10 節第 6 項）。
 */
const aiChatHistoryService = require('../services/aiChatHistoryService');

/**
 * 對話不存在／非本人／已刪除，一律回這一組。
 *
 * 額外帶 code 是因為前端 axios 的 response interceptor 只 reject
 * response body（見 frontend/src/services/api.js），HTTP status 會遺失；
 * useAiChat 的落地邏輯需要靠這個 code 判斷「該改開一段新對話重送」。
 */
const SESSION_NOT_FOUND = {
  success: false,
  code:    'SESSION_NOT_FOUND',
  message: '找不到指定的對話',
};

/**
 * 'true' / 'false' 查詢字串轉布林；未帶則回 undefined 代表不篩選
 */
function parseBoolQuery(value) {
  if (value === undefined || value === '') return undefined;
  return value === 'true' || value === '1';
}

/**
 * service 主動拋出的預期錯誤帶 statusCode，其餘一律 500
 */
function handleError(res, scope, error, fallbackMessage) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error(`aiChatHistory ${scope} error:`, error.message);
  return res.status(500).json({ success: false, message: fallbackMessage });
}

async function listSessions(req, res) {
  try {
    const data = await aiChatHistoryService.listSessions(req.user.員工工號, {
      keyword:       req.query.keyword,
      isPinned:      parseBoolQuery(req.query.isPinned),
      isFavorite:    parseBoolQuery(req.query.isFavorite),
      includeHidden: parseBoolQuery(req.query.includeHidden) === true,
      page:          req.query.page,
      pageSize:      req.query.pageSize,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, 'listSessions', error, '取得 AI 歷史對話列表失敗');
  }
}

async function createSession(req, res) {
  try {
    const data = await aiChatHistoryService.createSession(req.user.員工工號, req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, 'createSession', error, '建立 AI 對話失敗');
  }
}

async function getSessionDetail(req, res) {
  try {
    const data = await aiChatHistoryService.getSessionDetail(req.user.員工工號, req.params.id);
    if (!data) return res.status(404).json(SESSION_NOT_FOUND);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, 'getSessionDetail', error, '取得 AI 對話內容失敗');
  }
}

async function updateSession(req, res) {
  try {
    const data = await aiChatHistoryService.updateSession(req.user.員工工號, req.params.id, req.body);
    if (!data) return res.status(404).json(SESSION_NOT_FOUND);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, 'updateSession', error, '更新 AI 對話失敗');
  }
}

async function hideSession(req, res) {
  try {
    const data = await aiChatHistoryService.hideSession(req.user.員工工號, req.params.id);
    if (!data) return res.status(404).json(SESSION_NOT_FOUND);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, 'hideSession', error, '刪除 AI 對話失敗');
  }
}

async function appendMessages(req, res) {
  try {
    const data = await aiChatHistoryService.appendMessages(req.user.員工工號, req.params.id, req.body);
    if (!data) return res.status(404).json(SESSION_NOT_FOUND);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, 'appendMessages', error, '寫入 AI 對話訊息失敗');
  }
}

async function updateSortOrders(req, res) {
  try {
    const updated = await aiChatHistoryService.updateSortOrders(req.user.員工工號, req.body.orders);
    return res.json({ success: true, data: { updated } });
  } catch (error) {
    return handleError(res, 'updateSortOrders', error, '更新排序失敗');
  }
}

module.exports = {
  listSessions,
  createSession,
  getSessionDetail,
  updateSession,
  hideSession,
  appendMessages,
  updateSortOrders,
};
