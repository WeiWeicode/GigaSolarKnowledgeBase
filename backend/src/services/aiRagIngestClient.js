/**
 * AiRAG Ingest Client
 * 呼叫 AiRAG 觸發切分端點：POST {AIRAG_BASE_URL}/api/external/ingest/trigger
 * 見 docs/DevelopmentProcess/RAG_SYNC_PLAN.md 6 節第 1 點 / TASK-S3
 *
 * 注意：AIRAG_BASE_URL 不含 /api 後綴（見 4.3 節註解），此檔案內路徑已補上 /api 前綴。
 */
const axios = require('axios');

const TIMEOUT_MS = 8000;

const { AiConfig } = require('../models');

async function getActiveConfig() {
  try {
    const activeDbConfig = await AiConfig.findOne({ where: { is_active: true } });
    if (activeDbConfig) {
      const activeEnv = activeDbConfig.active_env || 'prod';
      // 注意：Ingest Key 與問答用的 Chat Key（prod_api_key/dev_api_key）是 AiRAG 端不同 scope 的獨立金鑰，
      // 不可互相 fallback（見 RAG_SYNC_PLAN.md 6.1 節第 8 點），否則會在 AiRAG 端驗證失敗回 401。
      const apiKey = activeEnv === 'test'
        ? (activeDbConfig.dev_ingest_api_key || process.env.AIRAG_INGEST_API_KEY)
        : (activeDbConfig.ingest_api_key || process.env.AIRAG_INGEST_API_KEY);
      const knowledgeBaseId = activeEnv === 'test'
        ? (activeDbConfig.dev_knowledge_base_id || activeDbConfig.prod_knowledge_base_id || process.env.AIRAG_KNOWLEDGE_BASE_ID)
        : (activeDbConfig.prod_knowledge_base_id || activeDbConfig.knowledge_base_id || process.env.AIRAG_KNOWLEDGE_BASE_ID);
      return { apiKey, knowledgeBaseId };
    }
  } catch (err) {
    console.warn('[aiRagIngestClient] 查詢 AiConfig 失敗，使用備用環境變數:', err.message);
  }
  return {
    apiKey: process.env.AIRAG_INGEST_API_KEY,
    knowledgeBaseId: process.env.AIRAG_KNOWLEDGE_BASE_ID,
  };
}

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
  const { apiKey, knowledgeBaseId } = await getActiveConfig();

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
