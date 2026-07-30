const { AiConfig, AiPromptTemplate } = require('../models');

// ── In-Memory Local Cache ─────────────────────────────────────
let cache = {
  config: null,
  templates: {},
  configExpiry: 0,
  templatesExpiry: 0,
};
const CACHE_TTL = 300000; // 5 minutes cache

/**
 * Get active AI Configuration from database/cache
 */
async function getActiveConfig() {
  const now = Date.now();
  if (cache.config && now < cache.configExpiry) {
    return cache.config;
  }
  try {
    const activeConfig = await AiConfig.findOne({ where: { is_active: true } });
    if (activeConfig) {
      cache.config = {
        apiUrl:      activeConfig.api_url,
        modelName:   activeConfig.model_name,
        temperature: Number(activeConfig.temperature),
        timeoutMs:   Number(activeConfig.timeout_ms),
        aiTool:      activeConfig.ai_tool,
      };
    } else {
      cache.config = {
        apiUrl:      process.env.llama_URL || 'http://localhost:8080/v1',
        modelName:   process.env.llama_MODEL || 'default',
        temperature: 0.3,
        timeoutMs:   300000,
        aiTool:      'llama.cpp',
      };
    }
    cache.configExpiry = now + CACHE_TTL;
  } catch (err) {
    console.error('[aiService] Failed to load AI config from database:', err.message);
    if (!cache.config) {
      return {
        apiUrl:      process.env.llama_URL || 'http://localhost:8080/v1',
        modelName:   process.env.llama_MODEL || 'default',
        temperature: 0.3,
        timeoutMs:   300000,
        aiTool:      'llama.cpp',
      };
    }
  }
  return cache.config;
}

/**
 * Get prompt template by key from database/cache
 */
async function getPromptTemplate(modeKey) {
  const now = Date.now();
  if (cache.templates[modeKey] && now < cache.templatesExpiry) {
    return cache.templates[modeKey];
  }
  try {
    const templates = await AiPromptTemplate.findAll({ where: { is_active: true } });
    const tempMap = {};
    for (const t of templates) {
      tempMap[t.mode_key] = {
        system: t.system_prompt,
        user:   t.user_template,
      };
    }
    cache.templates       = tempMap;
    cache.templatesExpiry = now + CACHE_TTL;
  } catch (err) {
    console.error('[aiService] Failed to load Prompt Templates from database:', err.message);
  }
  return cache.templates[modeKey] || null;
}

/**
 * Replace placeholders in template with dynamic values.
 */
function resolveTemplate(template, variables) {
  let result = template || '';
  for (const [key, value] of Object.entries(variables)) {
    result = result.split(`{${key}}`).join(value !== undefined && value !== null ? String(value) : '');
  }
  return result;
}

// ── System Prompts Fallbacks ──────────────────────────────────
const FALLBACK_SYSTEM_PROMPTS = {
  summarize:
    '你是一位專業的文章解析助手，擅長快速理解文章重點並以結構化方式呈現。' +
    '請根據提供的文章內容，以繁體中文輸出分析結果。',

  writing:
    '你是一位專業的寫作助手，擅長根據素材或主題生成結構完整、排版清晰的 Markdown 文章。' +
    '支援兩種模式：(1) 根據上傳的 Word 文件內容進行整理與重寫；' +
    '(2) 根據使用者描述的主題自行生成完整文章。' +
    '輸出請使用標準 Markdown 格式，以繁體中文撰寫。',

  quick_summary:
    '你是一位專業的文章摘要助手，擅長以最精簡的方式呈現文章核心要點。' +
    '回應要簡短有力，避免冗長說明，以繁體中文輸出。',

  detailed_summary:
    '你是一位深度文章分析師，能夠從多個角度全面解析文章內容、論點與價值。' +
    '回應要完整詳盡，涵蓋背景、論點、細節與建議，以繁體中文輸出。',

  step_guide:
    '你是一位專業的技術文件整理師，擅長將文章的操作流程或說明整理為清晰可執行的步驟說明。' +
    '步驟要具體可操作，標示注意事項與常見問題，以繁體中文輸出。',

  // 使用者有明確提問時使用：只針對問題作答，不套用固定的摘要結構
  qa:
    '你是一位專業的知識庫問答助手。請根據使用者提供的參考資料，直接回答使用者的問題。' +
    '規則：' +
    '(1) 只回答使用者問的問題，不要額外輸出「核心摘要」「關鍵重點」「深入分析」「結論與洞察」等未被要求的段落；' +
    '(2) 答案必須基於參考資料，不要憑空推測；' +
    '(3) 若參考資料中找不到答案，直接說明資料中未提及，不要編造；' +
    '(4) 問題涉及設定或操作時，依資料中的實際內容條列具體步驟、路徑與參數值；' +
    '(5) 以繁體中文回答，善用 Markdown（條列、表格、程式碼區塊）提升可讀性。',
};

// ── User Prompt Templates Fallbacks ───────────────────────────
const FALLBACK_USER_TEMPLATES = {
  summarize:
    `/no_think\n` +
    `請分析以下文章內容，並以下列格式輸出：\n\n{content}\n\n` +
    `---\n\n` +
    `## 核心摘要\n（一句話總結）\n\n` +
    `## 關鍵重點\n- 重點 1\n- 重點 2\n\n` +
    `## 深入分析\n（根據文章屬性區分：技術拆解 / 邏輯辯證）\n\n` +
    `## 結論與洞察\n（AI 總結出的價值點）`,

  writing:
    `/no_think\n` +
    `{source_note}請根據以下內容生成一篇結構完整的文章：\n\n{content}\n\n` +
    `---\n\n` +
    `# 核心摘要\n（一句話總結本文核心）\n\n` +
    `## 關鍵觀點 / 技術重點\n- 觀點 1\n- 觀點 2\n\n` +
    `## 詳細內容\n（正文內容，請使用標準 Markdown 排版）\n\n` +
    `## 參考資料 / 來源\n- {source_filename}`,

  quick_summary:
    `/no_think\n` +
    `請對以下文章提供簡易摘要：\n\n{content}\n\n` +
    `---\n\n` +
    `## 一句話摘要\n（用一句話說清楚文章核心）\n\n` +
    `## 三大重點\n- 重點一\n- 重點二\n- 重點三\n\n` +
    `## 適合閱讀對象\n（哪些人最需要讀這篇）`,

  detailed_summary:
    `/no_think\n` +
    `請對以下文章進行深入分析：\n\n{content}\n\n` +
    `---\n\n` +
    `## 文章概述\n（背景、目的與範疇）\n\n` +
    `## 核心論點\n（主要觀點與論據）\n\n` +
    `## 關鍵細節\n（重要技術細節或事實數據）\n\n` +
    `## 優缺點與適用場景\n\n` +
    `## 結論與建議`,

  step_guide:
    `/no_think\n` +
    `請將以下文章的操作方式或流程整理為詳細步驟說明：\n\n{content}\n\n` +
    `---\n\n` +
    `## 前置準備\n（必要工具、環境與先備知識）\n\n` +
    `## 完整步驟\n1. 步驟一\n2. 步驟二\n（依此類推，每步說明清楚）\n\n` +
    `## 注意事項\n（容易出錯或需要特別注意的地方）\n\n` +
    `## 常見問題 Q&A`,

  // 參考資料放前面、問題放最後：讓模型把「問題」當成要執行的任務，
  // 而不是當成待分析的素材（先前把問題混進 {content} 就是導致答非所問的原因）
  qa:
    `/no_think\n` +
    `以下是參考資料：\n\n{content}\n\n` +
    `---\n\n` +
    `請根據上述參考資料回答我的問題：\n\n**{question}**\n\n` +
    `請直接針對這個問題作答，不需要輸出文章摘要、關鍵重點或分析架構。` +
    `若參考資料中沒有相關資訊，請直接說明。`,
};

// ── 核心 SSE 串流函式 ─────────────────────────────────────────
/**
 * 呼叫 llama.cpp /v1/chat/completions（OpenAI 相容 API），
 * 以 SSE 串流方式將回應逐 chunk 轉發至 Express Response。
 */
async function streamToSSE(systemPrompt, userPrompt, res, config) {
  const { default: fetch } = await import('node-fetch');

  const response = await fetch(`${config.apiUrl}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:       config.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      stream:      true,
      temperature: config.temperature,
    }),
    timeout: config.timeoutMs,
  });

  if (!response.ok) {
    throw new Error(`llama.cpp API 錯誤：${response.status} ${response.statusText}`);
  }

  const aiTool = config.aiTool || 'llama.cpp';
  const openTag = aiTool === 'vllm' ? '<thought>' : '<think>';
  const closeTag = aiTool === 'vllm' ? '</thought>' : '</think>';

  let fullText     = '';
  let buffer       = '';
  let _debugLogged = false;
  let segBuf       = '';
  let inThink      = false;

  function processToken(raw) {
    segBuf += raw;

    while (segBuf.length > 0) {
      if (inThink) {
        const closeIdx = segBuf.indexOf(closeTag);
        if (closeIdx !== -1) {
          const thinkChunk = segBuf.slice(0, closeIdx);
          if (thinkChunk && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ thinking: thinkChunk })}\n\n`);
          }
          segBuf  = segBuf.slice(closeIdx + closeTag.length);
          inThink = false;
        } else {
          const maxPrefix = closeTag.length - 1;
          let safeLen     = segBuf.length;
          for (let pLen = maxPrefix; pLen >= 1; pLen--) {
            if (segBuf.endsWith(closeTag.slice(0, pLen))) {
              safeLen = segBuf.length - pLen;
              break;
            }
          }
          const thinkChunk = segBuf.slice(0, safeLen);
          if (thinkChunk && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ thinking: thinkChunk })}\n\n`);
          }
          segBuf = segBuf.slice(safeLen);
          break;
        }
      } else {
        const openIdx = segBuf.indexOf(openTag);
        if (openIdx === -1) {
          const maxPrefix = openTag.length - 1;
          let safeLen     = segBuf.length;
          for (let pLen = maxPrefix; pLen >= 1; pLen--) {
            if (segBuf.endsWith(openTag.slice(0, pLen))) {
              safeLen = segBuf.length - pLen;
              break;
            }
          }
          const normalChunk = segBuf.slice(0, safeLen);
          if (normalChunk) {
            fullText += normalChunk;
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({ delta: normalChunk })}\n\n`);
            }
          }
          segBuf = segBuf.slice(safeLen);
          break;
        } else {
          const normalChunk = segBuf.slice(0, openIdx);
          if (normalChunk) {
            fullText += normalChunk;
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({ delta: normalChunk })}\n\n`);
            }
          }
          segBuf  = segBuf.slice(openIdx + openTag.length);
          inThink = true;
        }
      }
    }
  }

  try {
    for await (const chunk of response.body) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') {
          if (!res.writableEnded) {
            res.write(`data: [DONE]\n\n`);
          }
          return fullText;
        }

        try {
          const json  = JSON.parse(dataStr);
          const delta = json.choices?.[0]?.delta || {};

          const reasoning = delta.reasoning_content || delta.thought || delta.reasoning;

          if (!fullText && !_debugLogged && (delta.content || reasoning)) {
            console.log('[aiService] first delta keys:', Object.keys(delta));
            _debugLogged = true;
          }

          if (reasoning) {
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({ thinking: reasoning })}\n\n`);
            }
          }

          if (delta.content) processToken(delta.content);
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } catch (streamErr) {
    console.error('[aiService] Stream read error:', streamErr.message);
  }

  if (!res.writableEnded) {
    res.write(`data: [DONE]\n\n`);
  }
  return fullText;
}

// ── 公開介面 ──────────────────────────────────────────────────
/**
 * 文章解析助手（首頁）
 * @param {string} content 參考資料內容
 * @param {object} res Express Response（已設好 SSE headers）
 * @param {string} [mode] 模板 mode_key，例如 summarize / quick_summary / qa
 * @param {string} [question] 使用者的問題；qa 模式必填，用於填入 {question} 佔位符
 */
async function streamArticleSummary(content, res, mode, question) {
  const modeKey = mode || 'summarize';
  const config  = await getActiveConfig();
  const prompt  = await getPromptTemplate(modeKey);

  const systemPrompt = prompt ? prompt.system : (FALLBACK_SYSTEM_PROMPTS[modeKey] || FALLBACK_SYSTEM_PROMPTS.summarize);
  const userTemplate = prompt ? prompt.user   : (FALLBACK_USER_TEMPLATES[modeKey]   || FALLBACK_USER_TEMPLATES.summarize);

  const userPrompt = resolveTemplate(userTemplate, { content, question });

  return streamToSSE(systemPrompt, userPrompt, res, config);
}

/**
 * 寫作助手（文章編輯 / 新建頁）
 */
async function streamWritingAssist(content, res, sourceFilename) {
  const modeKey = 'writing';
  const config  = await getActiveConfig();
  const prompt  = await getPromptTemplate(modeKey);

  const systemPrompt = prompt ? prompt.system : FALLBACK_SYSTEM_PROMPTS.writing;
  const userTemplate = prompt ? prompt.user   : FALLBACK_USER_TEMPLATES.writing;

  const sourceNote = sourceFilename ? `來源檔案：${sourceFilename}\n\n` : '';
  const userPrompt = resolveTemplate(userTemplate, {
    content,
    source_filename: sourceFilename || '（無）',
    source_note:     sourceNote,
  });

  return streamToSSE(systemPrompt, userPrompt, res, config);
}

module.exports = { streamArticleSummary, streamWritingAssist };
