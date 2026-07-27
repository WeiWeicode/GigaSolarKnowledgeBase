/**
 * Qdrant Service
 * 封裝直連 Qdrant 的比對／刪除操作。
 * 見 docs/DevelopmentProcess/RAG_SYNC_PLAN.md 4.1 節 / TASK-S2
 */
const { QdrantClient } = require('@qdrant/js-client-rest');

let client = null;

function getClient() {
  if (!process.env.QDRANT_URL) {
    throw new Error('QDRANT_URL 未設定，無法連線 Qdrant');
  }
  if (!client) {
    client = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY || undefined,
    });
  }
  return client;
}

function getCollection() {
  if (!process.env.QDRANT_COLLECTION) {
    throw new Error('QDRANT_COLLECTION 未設定，無法操作 Qdrant');
  }
  return process.env.QDRANT_COLLECTION;
}

function buildDocFilter(docType, sourceId) {
  return {
    must: [
      { key: 'doc_type',  match: { value: docType } },
      { key: 'source_id', match: { value: sourceId } },
    ],
  };
}

/**
 * 查詢該文件目前在 Qdrant 上的 point payload（version / updated_date）
 * @returns {Promise<{version: number, updated_date: string} | null>}
 */
async function findPointMeta(docType, sourceId) {
  const result = await getClient().scroll(getCollection(), {
    filter: buildDocFilter(docType, sourceId),
    limit: 1,
    with_payload: true,
    with_vector: false,
  });

  const point = result?.points?.[0];
  if (!point) return null;

  return {
    version: point.payload?.version ?? null,
    updated_date: point.payload?.updated_date ?? null,
  };
}

// AiRAG 端圖片描述失敗時寫入的佔位文字前綴（見 AiRAG ingest_service.py）。
// 2026-07-27 之前寫入的舊 point 沒有 caption_failed payload 欄位，只能靠這段文字辨識。
const CAPTION_FAILED_MARKER = '[圖片描述產生失敗';

/**
 * 統計該文件在 Qdrant 中「圖片描述產生失敗」的段落數。
 *
 * 不用 Qdrant filter 直接比對，是因為舊 point 沒有 caption_failed 欄位，
 * 而 content 的全文索引為 MULTILINGUAL tokenizer，中文片語比對結果不可靠；
 * 因此改為撈出該文件的圖片段落後在本地判斷，兩種資料格式都能正確辨識。
 * @returns {Promise<number>}
 */
async function countFailedCaptions(docType, sourceId) {
  const filter = buildDocFilter(docType, sourceId);
  const result = await getClient().scroll(getCollection(), {
    filter: {
      must: [...filter.must, { key: 'chunk_type', match: { value: 'image' } }],
    },
    limit: 1000,
    with_payload: true,
    with_vector: false,
  });

  const points = result?.points || [];
  return points.filter((p) => {
    if (p.payload?.caption_failed === true) return true;
    return String(p.payload?.content || '').includes(CAPTION_FAILED_MARKER);
  }).length;
}

/**
 * 刪除該文件在 Qdrant 中所有既有 point（依 doc_type + source_id）
 */
async function deletePointsByDoc(docType, sourceId) {
  await getClient().delete(getCollection(), {
    filter: buildDocFilter(docType, sourceId),
  });
}

module.exports = {
  findPointMeta,
  countFailedCaptions,
  deletePointsByDoc,
};
