const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:4b'

// ── System Prompts ────────────────────────────────────────────
const SYSTEM_PROMPTS = {
  summarize:
    '你是一位專業的文章解析助手，擅長快速理解文章重點並以結構化方式呈現。' +
    '請根據提供的文章內容，以繁體中文輸出分析結果。',

  writing:
    '你是一位專業的寫作助手，擅長根據素材或主題生成結構完整、排版清晰的 Markdown 文章。' +
    '支援兩種模式：(1) 根據上傳的 Word 文件內容進行整理與重寫；' +
    '(2) 根據使用者描述的主題自行生成完整文章。' +
    '輸出請使用標準 Markdown 格式，以繁體中文撰寫。',

  quickSummary:
    '你是一位專業的文章摘要助手，擅長以最精簡的方式呈現文章核心要點。' +
    '回應要簡短有力，避免冗長說明，以繁體中文輸出。',

  detailedSummary:
    '你是一位深度文章分析師，能夠從多個角度全面解析文章內容、論點與價值。' +
    '回應要完整詳盡，涵蓋背景、論點、細節與建議，以繁體中文輸出。',

  stepGuide:
    '你是一位專業的技術文件整理師，擅長將文章的操作流程或說明整理為清晰可執行的步驟說明。' +
    '步驟要具體可操作，標示注意事項與常見問題，以繁體中文輸出。',
}

// ── User Prompt Templates ─────────────────────────────────────
function buildSummarizePrompt(content) {
  return (
    `/no_think\n` +
    `請分析以下文章內容，並以下列格式輸出：\n\n${content}\n\n` +
    `---\n\n` +
    `## 核心摘要\n（一句話總結）\n\n` +
    `## 關鍵重點\n- 重點 1\n- 重點 2\n\n` +
    `## 深入分析\n（根據文章屬性區分：技術拆解 / 邏輯辯證）\n\n` +
    `## 結論與洞察\n（AI 總結出的價值點）`
  )
}

function buildWritingPrompt(content, sourceFilename) {
  const sourceNote = sourceFilename ? `來源檔案：${sourceFilename}\n\n` : ''
  return (
    `/no_think\n` +
    `${sourceNote}請根據以下內容生成一篇結構完整的文章：\n\n${content}\n\n` +
    `---\n\n` +
    `# 核心摘要\n（一句話總結本文核心）\n\n` +
    `## 關鍵觀點 / 技術重點\n- 觀點 1\n- 觀點 2\n\n` +
    `## 詳細內容\n（正文內容，請使用標準 Markdown 排版）\n\n` +
    `## 參考資料 / 來源\n- ${sourceFilename ? `Word 來源檔案：${sourceFilename}` : '（無）'}`
  )
}

// ── 核心 SSE 串流函式 ─────────────────────────────────────────
/**
 * 呼叫 Ollama /api/chat，以 SSE 串流方式將回應逐 chunk 轉發至 Express Response。
 * 使用 for await...of 讀取 NDJSON 串流，在 Docker Node.js 環境中最穩定。
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} res - Express Response（已設定 SSE headers）
 * @returns {Promise<string>} 完整回應文字
 */
async function streamToSSE(systemPrompt, userPrompt, res) {
  const { default: fetch } = await import('node-fetch')

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      stream:  true,
      think:   false,
      options: { temperature: 0.3 },
    }),
    timeout: 300000,
  })

  if (!response.ok) {
    throw new Error(`Ollama API 錯誤：${response.status} ${response.statusText}`)
  }

  let fullText = ''
  let buffer   = ''

  try {
    for await (const chunk of response.body) {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() // 保留最後不完整的行

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const json  = JSON.parse(line)
          const token = json.message?.content || ''
          if (token) {
            fullText += token
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({ delta: token })}\n\n`)
            }
          }
          if (json.done) {
            if (!res.writableEnded) {
              res.write(`data: [DONE]\n\n`)
            }
            return fullText
          }
        } catch {
          // 略過非 JSON 行
        }
      }
    }
  } catch (streamErr) {
    console.error('[aiService] 串流讀取錯誤:', streamErr.message)
  }

  if (!res.writableEnded) {
    res.write(`data: [DONE]\n\n`)
  }
  return fullText
}

// ── 快速指令提示詞 ────────────────────────────────────────────
function buildQuickSummaryPrompt(content) {
  return (
    `/no_think\n` +
    `請對以下文章提供簡易摘要：\n\n${content}\n\n` +
    `---\n\n` +
    `## 一句話摘要\n（用一句話說清楚文章核心）\n\n` +
    `## 三大重點\n- 重點一\n- 重點二\n- 重點三\n\n` +
    `## 適合閱讀對象\n（哪些人最需要讀這篇）`
  )
}

function buildDetailedSummaryPrompt(content) {
  return (
    `/no_think\n` +
    `請對以下文章進行深入分析：\n\n${content}\n\n` +
    `---\n\n` +
    `## 文章概述\n（背景、目的與範疇）\n\n` +
    `## 核心論點\n（主要觀點與論據）\n\n` +
    `## 關鍵細節\n（重要技術細節或事實數據）\n\n` +
    `## 優缺點與適用場景\n\n` +
    `## 結論與建議`
  )
}

function buildStepGuidePrompt(content) {
  return (
    `/no_think\n` +
    `請將以下文章的操作方式或流程整理為詳細步驟說明：\n\n${content}\n\n` +
    `---\n\n` +
    `## 前置準備\n（必要工具、環境與先備知識）\n\n` +
    `## 完整步驟\n1. 步驟一\n2. 步驟二\n（依此類推，每步說明清楚）\n\n` +
    `## 注意事項\n（容易出錯或需要特別注意的地方）\n\n` +
    `## 常見問題 Q&A`
  )
}

// ── 公開介面 ──────────────────────────────────────────────────
/**
 * 文章解析助手（首頁）
 * @param {string} content
 * @param {object} res
 * @param {string} [mode] - 'default' | 'quick_summary' | 'detailed_summary' | 'step_guide'
 */
async function streamArticleSummary(content, res, mode) {
  const modeMap = {
    quick_summary:    { system: SYSTEM_PROMPTS.quickSummary,    build: buildQuickSummaryPrompt },
    detailed_summary: { system: SYSTEM_PROMPTS.detailedSummary, build: buildDetailedSummaryPrompt },
    step_guide:       { system: SYSTEM_PROMPTS.stepGuide,       build: buildStepGuidePrompt },
  }
  const selected = modeMap[mode]
  if (selected) {
    return streamToSSE(selected.system, selected.build(content), res)
  }
  return streamToSSE(
    SYSTEM_PROMPTS.summarize,
    buildSummarizePrompt(content),
    res,
  )
}

/**
 * 寫作助手（文章編輯 / 新建頁）
 */
async function streamWritingAssist(content, res, sourceFilename) {
  return streamToSSE(
    SYSTEM_PROMPTS.writing,
    buildWritingPrompt(content, sourceFilename),
    res,
  )
}

module.exports = { streamArticleSummary, streamWritingAssist }
