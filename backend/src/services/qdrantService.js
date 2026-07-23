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
  deletePointsByDoc,
};
