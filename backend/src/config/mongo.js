/**
 * AiRAG MongoDB 唯讀連線
 * 見 docs/DevelopmentProcess/AI_CHAT_HISTORY_PLAN.md 4.3 節
 *
 * 用途只有一個：讀 AiRAG 的 external_chat_logs 稽核紀錄，把 _id 回填到
 * ai_chat_messages.mongo_log_id。除此之外不碰任何 collection、不做任何寫入。
 *
 * 設計重點（三者缺一不可，見規劃文件 4.3 的三點注意事項）：
 * 1. 帳號 kb_reader 只有 airag.external_chat_logs 的 find 權限，
 *    因此不可呼叫 listCollections / db.stats()，健康檢查一律用 admin ping。
 * 2. 任何失敗都要降級為「查不到」而非拋出：AI 歷史列表的真相來源是 KB DB，
 *    Mongo 只是加值，不能因為 AiRAG 環境異常就讓整個歷史頁面掛掉。
 * 3. 失敗態除了連不上，還包含認證失敗（code 18）與授權不足（code 13）——
 *    這兩種拋的是 MongoServerError 而非連線類例外，只攔連線錯誤會漏掉。
 */
const { MongoClient } = require('mongodb');

const COLLECTION_NAME = 'external_chat_logs';

let client         = null;
let connectPromise = null;
let hasWarned      = false;

function isConfigured() {
  return Boolean(process.env.AIRAG_MONGODB_URL && process.env.AIRAG_MONGODB_DATABASE);
}

/**
 * 只記一次警告，避免每次查詢都刷同一行 log 洗版
 */
function warnOnce(scope, message) {
  if (hasWarned) return;
  hasWarned = true;
  console.warn(`[mongo] ${scope} 失敗，本次起停用 Mongo 回填（歷史紀錄不受影響）：${message}`);
}

/**
 * 取得已連線的 MongoClient；失敗回 null（不拋出）
 */
async function getClient() {
  if (!isConfigured()) return null;
  if (client) return client;

  if (!connectPromise) {
    const instance = new MongoClient(process.env.AIRAG_MONGODB_URL);
    connectPromise = instance.connect()
      .then((connected) => {
        client = connected;
        return client;
      })
      .catch((err) => {
        // 連線失敗後把 promise 清掉，讓下次呼叫可以重試
        // （AiRAG 重啟後不需要連帶重啟 KB 後端）
        connectPromise = null;
        warnOnce('連線', err.message);
        return null;
      });
  }

  return connectPromise;
}

/**
 * 查詢 external_chat_logs，回傳單筆文件或 null。
 * 任何錯誤（連線／認證／授權／查詢）一律降級為 null，不拋出。
 *
 * @param {object} filter Mongo 查詢條件
 * @param {object} [options] findOne 選項（sort / projection 等）
 */
async function findExternalChatLog(filter, options = {}) {
  try {
    const conn = await getClient();
    if (!conn) return null;

    return await conn
      .db(process.env.AIRAG_MONGODB_DATABASE)
      .collection(COLLECTION_NAME)
      .findOne(filter, options);
  } catch (err) {
    // MongoServerError code 13（未授權）/ 18（認證失敗）也走這條路
    warnOnce('查詢', `${err.name} ${err.message}`);
    return null;
  }
}

/**
 * 健康檢查：不用 db.stats()（需額外權限），改用 admin ping
 * @returns {Promise<boolean>}
 */
async function ping() {
  try {
    const conn = await getClient();
    if (!conn) return false;
    await conn.db(process.env.AIRAG_MONGODB_DATABASE).admin().command({ ping: 1 });
    return true;
  } catch (err) {
    warnOnce('ping', err.message);
    return false;
  }
}

async function close() {
  if (client) {
    await client.close().catch(() => {});
    client = null;
  }
  connectPromise = null;
}

module.exports = { isConfigured, findExternalChatLog, ping, close };
