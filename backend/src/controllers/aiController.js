const mammoth   = require('mammoth');
const pdfParse  = require('pdf-parse');
const aiService = require('../services/aiService');
const { AiConfig } = require('../models');

function setSSEHeaders(res) {
  res.setHeader('Content-Type',       'text/event-stream');
  res.setHeader('Cache-Control',      'no-cache');
  res.setHeader('Connection',         'keep-alive');
  res.setHeader('X-Accel-Buffering',  'no');   // 防止 Nginx 緩衝 SSE
  res.flushHeaders();
}

// POST /api/v1/ai/summarize
async function summarize(req, res) {
  const { content, mode } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, message: '請提供文章內容' });
  }

  setSSEHeaders(res);

  try {
    await aiService.streamArticleSummary(content, res, mode);
  } catch (err) {
    console.error('AI summarize error:', err.message);
    res.write(`data: ${JSON.stringify({ error: 'AI 服務呼叫失敗' })}\n\n`);
  } finally {
    res.end();
  }
}

// POST /api/v1/ai/writing-assist
async function writingAssist(req, res) {
  const { content } = req.body;
  const file        = req.file;

  if (!content && !file) {
    return res.status(400).json({ success: false, message: '請提供文章內容或上傳 Word 檔案' });
  }

  let textContent    = content || '';
  let sourceFilename = null;

  if (file) {
    try {
      if (file.mimetype === 'application/pdf') {
        const result = await pdfParse(file.buffer);
        textContent = result.text;
      } else {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        textContent = result.value;
      }
      sourceFilename = file.originalname;
    } catch (err) {
      console.error('檔案解析失敗:', err.message);
      return res.status(500).json({ success: false, message: '檔案解析失敗，請確認檔案格式正確' });
    }
  }

  if (!textContent.trim()) {
    return res.status(400).json({ success: false, message: '文章內容為空，無法生成' });
  }

  setSSEHeaders(res);

  try {
    await aiService.streamWritingAssist(textContent, res, sourceFilename);
  } catch (err) {
    console.error('AI writing-assist error:', err.message);
    res.write(`data: ${JSON.stringify({ error: 'AI 服務呼叫失敗' })}\n\n`);
  } finally {
    res.end();
  }
}

// GET /api/v1/ai/config
// 注意：此端點同時給「一般使用者聊天面板」與「管理員 API Key 設定頁」共用。
// 一般使用者僅能拿到目前生效的 apiKey/knowledgeBaseId（聊天需要），
// 完整的 prod/dev/ingest 金鑰明碼僅回傳給 ADMIN，避免任何登入使用者都能讀到金鑰。
async function getAiConfig(req, res) {
  try {
    const activeDbConfig = await AiConfig.findOne({
      where: { is_active: true },
    }).catch(err => {
      console.warn('[getAiConfig] 查詢 DB AiConfig 失敗，改用環境變數:', err.message);
      return null;
    });

    const activeEnv = activeDbConfig?.active_env || 'prod';

    const prodApiKey = activeDbConfig?.prod_api_key || activeDbConfig?.api_key || process.env.AIRAG_CHAT_API_KEY || '';
    const prodKnowledgeBaseId = activeDbConfig?.prod_knowledge_base_id || activeDbConfig?.knowledge_base_id || process.env.AIRAG_KNOWLEDGE_BASE_ID || '';

    const devApiKey = activeDbConfig?.dev_api_key || '';
    const devKnowledgeBaseId = activeDbConfig?.dev_knowledge_base_id || '';

    // Ingest Key 與 Chat Key 是 AiRAG 端不同 scope 的獨立金鑰，不可互相 fallback；
    // ingest 專用知識庫與問答用知識庫同樣是不同的知識庫，不可混用
    const ingestApiKey = activeDbConfig?.ingest_api_key || process.env.AIRAG_INGEST_API_KEY || '';
    const devIngestApiKey = activeDbConfig?.dev_ingest_api_key || '';
    const ingestKnowledgeBaseId = activeDbConfig?.ingest_knowledge_base_id || process.env.AIRAG_KNOWLEDGE_BASE_ID || '';
    const devIngestKnowledgeBaseId = activeDbConfig?.dev_ingest_knowledge_base_id || '';

    // 根據當前啟用的環境 (prod 或 test) 自動選擇當前要使用的 apiKey 與 knowledgeBaseId（聊天用）
    const currentApiKey = activeEnv === 'test' ? (devApiKey || prodApiKey) : prodApiKey;
    const currentKnowledgeBaseId = activeEnv === 'test' ? (devKnowledgeBaseId || prodKnowledgeBaseId) : prodKnowledgeBaseId;

    const data = {
      activeEnv,
      apiKey: currentApiKey,
      knowledgeBaseId: currentKnowledgeBaseId,
    };

    if (req.user?.role === 'ADMIN') {
      Object.assign(data, {
        prodApiKey,
        prodKnowledgeBaseId,
        devApiKey,
        devKnowledgeBaseId,
        ingestApiKey,
        devIngestApiKey,
        ingestKnowledgeBaseId,
        devIngestKnowledgeBaseId,
      });
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error('getAiConfig error:', err.message);
    return res.status(500).json({ success: false, message: '無法取得 AI 設定' });
  }
}

// POST /api/v1/ai/config
async function saveAiConfig(req, res) {
  try {
    const {
      activeEnv,
      prodApiKey,
      prodKnowledgeBaseId,
      devApiKey,
      devKnowledgeBaseId,
      ingestApiKey,
      devIngestApiKey,
      ingestKnowledgeBaseId,
      devIngestKnowledgeBaseId,
    } = req.body;

    let [configRecord] = await AiConfig.findOrCreate({
      where: { is_active: true },
      defaults: {
        config_name: 'default',
        api_url: 'http://10.10.130.45:53020/api',
        model_name: 'default',
        is_active: true,
        ai_tool: 'AiRAG',
        active_env: activeEnv || 'prod',
        prod_api_key: prodApiKey || '',
        prod_knowledge_base_id: prodKnowledgeBaseId || '',
        dev_api_key: devApiKey || '',
        dev_knowledge_base_id: devKnowledgeBaseId || '',
        ingest_api_key: ingestApiKey || '',
        dev_ingest_api_key: devIngestApiKey || '',
        ingest_knowledge_base_id: ingestKnowledgeBaseId || '',
        dev_ingest_knowledge_base_id: devIngestKnowledgeBaseId || '',
      },
    });

    if (activeEnv !== undefined) configRecord.active_env = activeEnv;
    if (prodApiKey !== undefined) configRecord.prod_api_key = prodApiKey;
    if (prodKnowledgeBaseId !== undefined) configRecord.prod_knowledge_base_id = prodKnowledgeBaseId;
    if (devApiKey !== undefined) configRecord.dev_api_key = devApiKey;
    if (devKnowledgeBaseId !== undefined) configRecord.dev_knowledge_base_id = devKnowledgeBaseId;
    if (ingestApiKey !== undefined) configRecord.ingest_api_key = ingestApiKey;
    if (devIngestApiKey !== undefined) configRecord.dev_ingest_api_key = devIngestApiKey;
    if (ingestKnowledgeBaseId !== undefined) configRecord.ingest_knowledge_base_id = ingestKnowledgeBaseId;
    if (devIngestKnowledgeBaseId !== undefined) configRecord.dev_ingest_knowledge_base_id = devIngestKnowledgeBaseId;

    // 同步相容舊版欄位
    const effectiveApiKey = configRecord.active_env === 'test' ? (configRecord.dev_api_key || configRecord.prod_api_key) : configRecord.prod_api_key;
    const effectiveKbId = configRecord.active_env === 'test' ? (configRecord.dev_knowledge_base_id || configRecord.prod_knowledge_base_id) : configRecord.prod_knowledge_base_id;
    configRecord.api_key = effectiveApiKey;
    configRecord.knowledge_base_id = effectiveKbId;

    await configRecord.save();

    return res.json({
      success: true,
      message: 'AI API Key 設定已成功儲存',
      data: {
        activeEnv: configRecord.active_env,
        apiKey: effectiveApiKey,
        knowledgeBaseId: effectiveKbId,
        prodApiKey: configRecord.prod_api_key,
        prodKnowledgeBaseId: configRecord.prod_knowledge_base_id,
        devApiKey: configRecord.dev_api_key,
        devKnowledgeBaseId: configRecord.dev_knowledge_base_id,
        ingestApiKey: configRecord.ingest_api_key,
        devIngestApiKey: configRecord.dev_ingest_api_key,
        ingestKnowledgeBaseId: configRecord.ingest_knowledge_base_id,
        devIngestKnowledgeBaseId: configRecord.dev_ingest_knowledge_base_id,
      },
    });
  } catch (err) {
    console.error('saveAiConfig error:', err.message);
    return res.status(500).json({ success: false, message: '更新 AI API Key 設定失敗' });
  }
}

module.exports = { summarize, writingAssist, getAiConfig, saveAiConfig };

