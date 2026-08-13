/**
 * AI 歷史訊息 Service
 * 見 docs/DevelopmentProcess/AI_CHAT_HISTORY_PLAN.md 4、5 節
 *
 * 真相來源是 KB DB 的 ai_chat_sessions / ai_chat_messages；
 * AiRAG 的 MongoDB external_chat_logs 只用來回填 mongo_log_id / elapsed_ms，
 * 回填失敗不影響任何功能（見 backfillMongoLog）。
 */
const { Op } = require('sequelize');
const { sequelize, AiChatSession, AiChatMessage } = require('../models');
const mongo = require('../config/mongo');

// 自動標題取前 30 字（見規劃文件 9 節第 2 項）
const AUTO_TITLE_MAX_LENGTH = 30;
// Mongo 回填的時間窗（毫秒）。AiRAG 是串流結束後才寫稽核紀錄，
// 與 KB 落地的時間點會有數秒到數十秒的落差，取 ±60 秒涵蓋
const MONGO_MATCH_WINDOW_MS = 60 * 1000;

// ── 內部工具 ──────────────────────────────────────────────────

/**
 * 由第一則提問自動產生標題：壓平換行與連續空白後取前 30 字
 */
function buildAutoTitle(question) {
  const flattened = String(question || '').replace(/\s+/g, ' ').trim();
  if (!flattened) return null;
  return flattened.length > AUTO_TITLE_MAX_LENGTH
    ? `${flattened.slice(0, AUTO_TITLE_MAX_LENGTH)}…`
    : flattened;
}

/**
 * 引用來源只留列表顯示需要的欄位，避免把整段 chunk 內容也存進 KB DB
 */
function compactSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const compact = sources.map(s => ({
    filename: s?.metadata?.filename ?? s?.filename ?? null,
    chunk_id: s?.chunk_id ?? null,
    score:    typeof s?.score === 'number' ? s.score : null,
  }));
  return JSON.stringify(compact);
}

function parseSources(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function toSessionDTO(session) {
  return {
    id:              session.id,
    sessionUid:      session.session_uid,
    title:           session.title,
    customTitle:     session.custom_title,
    displayTitle:    session.custom_title || session.title || '未命名對話',
    isPinned:        session.is_pinned,
    isFavorite:      session.is_favorite,
    isHidden:        session.is_hidden,
    sortOrder:       session.sort_order,
    messageCount:    session.message_count,
    lastMessageAt:   session.last_message_at,
    knowledgeBaseId: session.knowledge_base_id,
    searchType:      session.search_type,
    createdAt:       session.created_at,
  };
}

function toMessageDTO(message) {
  return {
    id:                message.id,
    seq:               message.seq,
    role:              message.role,
    content:           message.content,
    sources:           parseSources(message.sources_json),
    mongoLogId:        message.mongo_log_id,
    elapsedMs:         message.elapsed_ms,
    isEarlyTerminated: message.is_early_terminated,
    createdAt:         message.created_at,
  };
}

/**
 * 取得對話並驗證擁有權。查不到或不屬於該員工都回 null，
 * 由 controller 統一轉成 404（不回 403，避免洩漏「這個 id 存在」）。
 */
async function findOwnedSession(account, sessionId) {
  const id = parseInt(sessionId);
  if (!Number.isInteger(id)) return null;
  return AiChatSession.findOne({ where: { id, account } });
}

// ── 對外介面 ──────────────────────────────────────────────────

/**
 * 對話列表（分頁 + 關鍵字 + 釘選/最愛篩選）
 */
async function listSessions(account, options = {}) {
  const page     = Math.max(1, parseInt(options.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(options.pageSize) || 20));

  const where = { account };
  if (!options.includeHidden) where.is_hidden = false;
  if (options.isPinned   !== undefined) where.is_pinned   = options.isPinned;
  if (options.isFavorite !== undefined) where.is_favorite = options.isFavorite;

  const keyword = (options.keyword || '').trim();
  if (keyword) {
    const like = `%${keyword}%`;

    // 內文比對先獨立查一次拿到 session_id，再併入主查詢的 OR 條件。
    // 不用 literal 拼 SQL 是為了讓關鍵字走參數化綁定，避免 SQL injection；
    // 也不必猜 Sequelize 在 MSSQL 產生的表別名。
    const matched = await AiChatMessage.findAll({
      attributes: ['session_id'],
      where: { content: { [Op.like]: like } },
      include: [{ model: AiChatSession, attributes: [], required: true, where: { account } }],
      group: ['session_id'],
      raw: true,
    });

    where[Op.or] = [
      { title:        { [Op.like]: like } },
      { custom_title: { [Op.like]: like } },
      { id:           { [Op.in]: matched.map(m => m.session_id) } },
    ];
  }

  const { rows, count } = await AiChatSession.findAndCountAll({
    where,
    order: [
      ['is_pinned',       'DESC'],
      ['sort_order',      'ASC'],
      ['last_message_at', 'DESC'],
      ['id',              'DESC'],
    ],
    limit:  pageSize,
    offset: (page - 1) * pageSize,
  });

  return {
    items: rows.map(toSessionDTO),
    total: count,
    page,
    pageSize,
  };
}

/**
 * 建立對話。sessionUid 已存在時直接回傳既有對話（前端重送不會建出兩筆）。
 */
async function createSession(account, payload = {}) {
  const sessionUid = (payload.sessionUid || '').trim();
  if (!sessionUid) {
    const err = new Error('sessionUid 為必填');
    err.statusCode = 400;
    throw err;
  }

  const existing = await AiChatSession.findOne({ where: { session_uid: sessionUid } });
  if (existing) {
    if (existing.account !== account) {
      const err = new Error('sessionUid 已被其他使用者使用');
      err.statusCode = 409;
      throw err;
    }
    return toSessionDTO(existing);
  }

  const session = await AiChatSession.create({
    session_uid:       sessionUid,
    account,
    title:             buildAutoTitle(payload.title),
    knowledge_base_id: payload.knowledgeBaseId || null,
    search_type:       payload.searchType || null,
  });

  return toSessionDTO(session);
}

/**
 * 單一對話 + 全部訊息
 */
async function getSessionDetail(account, sessionId) {
  const session = await findOwnedSession(account, sessionId);
  if (!session) return null;

  const messages = await AiChatMessage.findAll({
    where: { session_id: session.id },
    order: [['seq', 'ASC']],
  });

  return {
    ...toSessionDTO(session),
    messages: messages.map(toMessageDTO),
  };
}

/**
 * 部分更新：自訂標題 / 釘選 / 最愛 / 排序
 */
async function updateSession(account, sessionId, payload = {}) {
  const session = await findOwnedSession(account, sessionId);
  if (!session) return null;

  const patch = {};
  if (payload.customTitle !== undefined) {
    const trimmed = String(payload.customTitle || '').trim();
    // 清空自訂標題時回落到系統自動標題，而不是留一個空字串標題
    patch.custom_title = trimmed ? trimmed.slice(0, 200) : null;
  }
  if (payload.isPinned   !== undefined) patch.is_pinned   = Boolean(payload.isPinned);
  if (payload.isFavorite !== undefined) patch.is_favorite = Boolean(payload.isFavorite);
  if (payload.sortOrder  !== undefined) patch.sort_order  = parseInt(payload.sortOrder) || 0;

  if (Object.keys(patch).length > 0) await session.update(patch);
  return toSessionDTO(session);
}

/**
 * 軟刪除：只設 is_hidden，不做實體刪除
 */
async function hideSession(account, sessionId) {
  const session = await findOwnedSession(account, sessionId);
  if (!session) return null;
  await session.update({ is_hidden: true });
  return toSessionDTO(session);
}

/**
 * 批次排序
 */
async function updateSortOrders(account, orders) {
  if (!Array.isArray(orders) || orders.length === 0) return 0;

  return sequelize.transaction(async (t) => {
    let updated = 0;
    for (const item of orders) {
      const id = parseInt(item?.id);
      if (!Number.isInteger(id)) continue;
      const [affected] = await AiChatSession.update(
        { sort_order: parseInt(item.sortOrder) || 0 },
        { where: { id, account }, transaction: t }
      );
      updated += affected;
    }
    return updated;
  });
}

/**
 * 追加一輪問答（user + ai 各一則）
 *
 * 兩筆訊息與對話統計欄位放在同一個交易內，避免中途失敗造成
 * message_count 與實際則數對不起來。
 */
async function appendMessages(account, sessionId, payload = {}) {
  const session = await findOwnedSession(account, sessionId);
  if (!session) return null;

  // 已刪除（隱藏）的對話不再接受新訊息：否則使用者在 AI 歷史刪掉一段對話後
  // 繼續問，新訊息會寫進一個列表永遠看不到的對話裡。回 null 讓前端收到
  // SESSION_NOT_FOUND，改開一段新對話重送。
  if (session.is_hidden) return null;

  const question = String(payload.question ?? '').trim();
  const answer   = String(payload.answer ?? '');
  if (!question) {
    const err = new Error('question 為必填');
    err.statusCode = 400;
    throw err;
  }

  // 用 Node 當下時間而非讀回 DB 的 created_at 來對 Mongo：
  // KB DB 存本地時間、Mongo 存 UTC，透過 tedious 讀回來的 Date 會不會被
  // 當成 UTC 解讀取決於驅動設定，靠它換算很容易差 8 小時。
  // 這裡拿到的是 Node 的絕對時間，與 Mongo 的 BSON date 可直接比較。
  const now = new Date();

  const result = await sequelize.transaction(async (t) => {
    const maxSeq = await AiChatMessage.max('seq', {
      where: { session_id: session.id },
      transaction: t,
    });
    const baseSeq = Number.isInteger(maxSeq) ? maxSeq : 0;

    const userMessage = await AiChatMessage.create({
      session_id: session.id,
      seq:        baseSeq + 1,
      role:       'user',
      content:    question,
    }, { transaction: t });

    const aiMessage = await AiChatMessage.create({
      session_id:          session.id,
      seq:                 baseSeq + 2,
      role:                'ai',
      content:             answer,
      sources_json:        compactSources(payload.sources),
      is_early_terminated: Boolean(payload.isEarlyTerminated),
    }, { transaction: t });

    await session.update({
      // 第一輪問答才補標題：之後的提問不應該蓋掉對話名稱
      title:           session.title || buildAutoTitle(question),
      message_count:   session.message_count + 2,
      last_message_at: now,
      search_type:     payload.searchType || session.search_type,
    }, { transaction: t });

    return { userMessage, aiMessage };
  });

  // 回填是加值資訊，不能拖慢回應，也不能讓它的失敗影響這次寫入。
  //
  // 用 matchQuestion 而非 question 去比對 Mongo：前端送給 AiRAG 的提問字串
  // 會額外接上「目前參考文章內容」，與畫面上顯示（也就是存進 content 的）
  // 使用者輸入不同，用後者比對會永遠找不到對應的稽核紀錄。
  const matchQuestion = String(payload.matchQuestion || question);
  setImmediate(() => {
    backfillMongoLog(session.account, matchQuestion, now, result.aiMessage.id)
      .catch(err => console.warn('[aiChatHistory] Mongo 回填未完成:', err.message));
  });

  return {
    session: toSessionDTO(session),
    messages: [toMessageDTO(result.userMessage), toMessageDTO(result.aiMessage)],
  };
}

/**
 * 以 employee_id + question + 時間窗，從 AiRAG 的 external_chat_logs
 * 找出對應的稽核紀錄，把 _id 與 elapsed_ms 回填到該輪的 ai 訊息。
 *
 * 之所以要這樣比對：external_chat_logs 沒有 session_id，_id 也不會隨 SSE
 * 回傳給呼叫端，所以沒有可直接對應的鍵（見規劃文件 2 節）。
 * 比對不到就維持 null，不重試、不報錯——這個欄位缺了不影響任何功能。
 */
async function backfillMongoLog(account, question, occurredAt, aiMessageId) {
  if (!mongo.isConfigured()) return false;

  const log = await mongo.findExternalChatLog({
    employee_id: account,
    question,
    created_at: {
      $gte: new Date(occurredAt.getTime() - MONGO_MATCH_WINDOW_MS),
      $lte: new Date(occurredAt.getTime() + MONGO_MATCH_WINDOW_MS),
    },
  }, {
    // 同一使用者短時間內重複問同一句話時，取時間最接近的那筆
    sort: { created_at: -1 },
    projection: { _id: 1, elapsed_ms: 1 },
  });

  if (!log) return false;

  await AiChatMessage.update({
    mongo_log_id:     String(log._id),
    mongo_matched_at: new Date(),
    elapsed_ms:       typeof log.elapsed_ms === 'number' ? log.elapsed_ms : null,
  }, { where: { id: aiMessageId } });

  return true;
}

module.exports = {
  listSessions,
  createSession,
  getSessionDetail,
  updateSession,
  hideSession,
  updateSortOrders,
  appendMessages,
  backfillMongoLog,
};
