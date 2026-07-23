/**
 * RAG Sync Auth Middleware
 * 驗證 AiRAG 拉取內容端點的 Header X-RAG-Sync-Key，伺服器對伺服器，非使用者登入。
 * 見 docs/DevelopmentProcess/RAG_SYNC_PLAN.md 4.4 節
 */
function ragSyncAuth(req, res, next) {
  const key = req.headers['x-rag-sync-key'];
  if (!key || key !== process.env.RAG_SYNC_API_KEY) {
    return res.status(401).json({ success: false, message: '無效的 X-RAG-Sync-Key' });
  }
  next();
}

module.exports = ragSyncAuth;
