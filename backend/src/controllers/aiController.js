const mammoth   = require('mammoth');
const aiService = require('../services/aiService');

function setSSEHeaders(res) {
  res.setHeader('Content-Type',       'text/event-stream');
  res.setHeader('Cache-Control',      'no-cache');
  res.setHeader('Connection',         'keep-alive');
  res.setHeader('X-Accel-Buffering',  'no');   // 防止 Nginx 緩衝 SSE
  res.flushHeaders();
}

// POST /api/v1/ai/summarize
async function summarize(req, res) {
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, message: '請提供文章內容' });
  }

  setSSEHeaders(res);

  try {
    await aiService.streamArticleSummary(content, res);
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
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      textContent    = result.value;
      sourceFilename = file.originalname;
    } catch (err) {
      console.error('Word 解析失敗:', err.message);
      return res.status(500).json({ success: false, message: 'Word 檔案解析失敗' });
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

module.exports = { summarize, writingAssist };
