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
      // 同理，ingest 專用知識庫與問答用知識庫（prod/dev_knowledge_base_id）是不同的知識庫，不可混用
      // （見 RAG_SYNC_PLAN.md 4.3、6 節），混用會讓切分結果寫進問答知識庫或觸發 AiRAG 回 400。
      const knowledgeBaseId = activeEnv === 'test'
        ? (activeDbConfig.dev_ingest_knowledge_base_id || process.env.AIRAG_KNOWLEDGE_BASE_ID)
        : (activeDbConfig.ingest_knowledge_base_id || process.env.AIRAG_KNOWLEDGE_BASE_ID);
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
  if (!knowledgeBaseId) {
    throw new Error('Ingest 專用知識庫 ID 未設定（請於「API Key 設定」填入，或設定 AIRAG_KNOWLEDGE_BASE_ID）');
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

  try {
    const response = await axios.post(
      `${normalizedBaseUrl}/api/external/ingest/trigger`,
      payload,
      {
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        timeout: TIMEOUT_MS,
      }
    );

    return response.data;
  } catch (err) {
    // AiRAG 以 FastAPI HTTPException 回應時，失敗原因放在 response body 的 detail；
    // axios 的 err.message 只有「Request failed with status code 4xx」，會讓同步日誌看不出原因，故補上 detail
    const detail = err.response?.data?.detail;
    if (detail) {
      const detailText = typeof detail === 'string' ? detail : JSON.stringify(detail);
      throw new Error(`AiRAG 觸發失敗 (HTTP ${err.response.status}): ${detailText}`);
    }
    throw err;
  }
}

/**
 * 僅重試「AI 描述產生失敗」的內嵌圖片段落（不做全量重新切分）。
 * AiRAG 端為非同步：回 202 代表已排入佇列，實際結果之後由 AiRAG 直接回寫
 * rag_sync_status.caption_failed_count（見 docs/DevelopmentProcess/RAG_IMAGE_CAPTION_REPAIR.md）。
 *
 * @param {object} params
 * @param {'article'|'attachment_file'} params.docType
 * @param {number} params.sourceId
 * @param {string} [params.title] 僅供 AiRAG log 顯示，不參與段落定位
 * @returns {Promise<{success: boolean, message: string, taskId: string}>}
 */
async function repairImageCaptions({ docType, sourceId, title }) {
  const baseUrl = process.env.AIRAG_BASE_URL;
  const { apiKey, knowledgeBaseId } = await getActiveConfig();

  if (!baseUrl || !apiKey) {
    throw new Error('AIRAG_BASE_URL / AIRAG_INGEST_API_KEY 未設定，無法呼叫 AiRAG 圖片描述修復端點');
  }
  if (!knowledgeBaseId) {
    throw new Error('Ingest 專用知識庫 ID 未設定（請於「API Key 設定」填入，或設定 AIRAG_KNOWLEDGE_BASE_ID）');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  const payload = {
    appId: 'kb',
    docType,
    // AiRAG 以 Qdrant payload 中的整數 source_id 比對，字串不會匹配（其 schema 會直接回 422）
    sourceId: Number(sourceId),
    knowledgeBaseId,
    filename: title,
  };

  try {
    const response = await axios.post(
      `${normalizedBaseUrl}/api/external/ingest/repair-captions`,
      payload,
      {
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        timeout: TIMEOUT_MS,
      }
    );

    return response.data;
  } catch (err) {
    const detail = err.response?.data?.detail;
    if (detail) {
      const detailText = typeof detail === 'string' ? detail : JSON.stringify(detail);
      const error = new Error(`AiRAG 圖片描述修復觸發失敗 (HTTP ${err.response.status}): ${detailText}`);
      // 帶出狀態碼供上層分流：409（同一份文件已在處理中）是良性情況，不該當成錯誤寫進 rag_sync_logs
      error.status = err.response.status;
      throw error;
    }
    throw err;
  }
}

module.exports = {
  triggerIngest,
  repairImageCaptions,
};
