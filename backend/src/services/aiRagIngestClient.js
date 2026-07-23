/**
 * AiRAG Ingest Client
 * 呼叫 AiRAG 觸發切分端點：POST {AIRAG_BASE_URL}/api/external/ingest/trigger
 * 見 docs/DevelopmentProcess/RAG_SYNC_PLAN.md 6 節第 1 點 / TASK-S3
 *
 * 注意：AIRAG_BASE_URL 不含 /api 後綴（見 4.3 節註解），此檔案內路徑已補上 /api 前綴。
 */
const axios = require('axios');

const TIMEOUT_MS = 8000;

/**
 * @param {object} params
 * @param {'article'|'attachment_file'} params.docType
 * @param {number} params.sourceId
 * @param {string} params.title
 * @param {number} params.targetVersion
 * @param {'upsert'|'delete'} params.action
 * @param {{isPublic:boolean, accessDept:string|null, accessLevel:number|null, accessMembers:string[]}} params.permissions
 * @returns {Promise<{taskId?: string}>}
 */
async function triggerIngest({ docType, sourceId, title, targetVersion, action, permissions }) {
  const baseUrl = process.env.AIRAG_BASE_URL;
  const apiKey  = process.env.AIRAG_INGEST_API_KEY;
  const knowledgeBaseId = process.env.AIRAG_KNOWLEDGE_BASE_ID;

  if (!baseUrl || !apiKey) {
    throw new Error('AIRAG_BASE_URL / AIRAG_INGEST_API_KEY 未設定，無法呼叫 AiRAG 觸發端點');
  }

  // AIRAG_BASE_URL 若帶結尾斜線（例如 http://host:port/）會讓組出的路徑變成雙斜線 // 而 404，故先去除
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  const payload = {
    appId: 'kb',
    docType,
    sourceId,
    title,
    targetVersion,
    action,
    knowledgeBaseId,
    permissions,
  };

  const response = await axios.post(
    `${normalizedBaseUrl}/api/external/ingest/trigger`,
    payload,
    {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      timeout: TIMEOUT_MS,
    }
  );

  return response.data;
}

module.exports = {
  triggerIngest,
};
