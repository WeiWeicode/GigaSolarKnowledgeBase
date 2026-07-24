// src/services/AiRAGApi.js
/**
 * AiRAG 外部 API 服務封裝
 * 對應文檔：docs/EXTERNAL_API_INTEGRATION_GUIDE.md
 * 端點：POST /api/external/chat
 */

import { aiService } from './api.js'

// ── 預設設定 ──────────────────────────────────────────────────
// 自動偵測主機：本地開發 (localhost) 或生產環境，埠號固定為 53020
const _aiRagHost = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : '10.10.130.45'
export const AIRAG_BASE_URL = `http://${_aiRagHost}:53020/api`

// 降級備用 API Key 與 知識庫 ID
export const DEFAULT_API_KEY = 'ZNFM27RGnDKXI66-K6dxq5eGHI5V8WMHcwS8tWQN5-4'
export const KNOWLEDGE_BASE_ID = '6a6020afca0400ef553cc075'

let cachedConfig = null

/**
 * 清除 AI 配置快取（供管理員變更設定時呼叫，即時套用新 Key / 環境）
 */
export function clearAiConfigCache() {
  cachedConfig = null
}

/**
 * 向 KB 後端取得 AI 配置（包含快取機制）
 */
export async function getAiConfigFromBackend() {
  if (cachedConfig) return cachedConfig
  try {
    const res = await aiService.getConfig()
    if (res) {
      cachedConfig = {
        knowledgeBaseId: res.knowledgeBaseId || KNOWLEDGE_BASE_ID,
        apiKey: res.apiKey || DEFAULT_API_KEY,
      }
      return cachedConfig
    }
  } catch (err) {
    console.warn('[AiRAGApi] 取得 AI 配置失敗，使用備用預設值:', err)
  }
  return {
    knowledgeBaseId: KNOWLEDGE_BASE_ID,
    apiKey: DEFAULT_API_KEY,
  }
}

/**
 * 向 KB 後端取得知識庫 ID
 */
export async function getKnowledgeBaseId() {
  const config = await getAiConfigFromBackend()
  return config.knowledgeBaseId
}

/**
 * 向 KB 後端取得 API Key
 */
export async function getAiApiKey() {
  const config = await getAiConfigFromBackend()
  return config.apiKey
}

/**
 * 發送外部問答串流請求 (POST /api/external/chat)
 *
 * @param {Object} payload 請求資料
 * @param {string} payload.question - 提問內容 (必填)
 * @param {string|null} [payload.knowledgeBaseId] - 知識庫 ID (選填)
 * @param {Array} [payload.chatHistory] - 對話歷史 [{ role: 'user'|'assistant', content: string }] (選填)
 * @param {string|null} [payload.selectedDbProfileId] - 僅 semantic_db_query 使用 (選填)
 * @param {Object} payload.externalUser - 呼叫端使用者身分資訊 (外部呼叫必填)
 * @param {string} payload.externalUser.employee_id - 工號
 * @param {string} payload.externalUser.name - 姓名
 * @param {string} payload.externalUser.department_code - 部門代號
 * @param {string} payload.externalUser.department_name - 部門名稱
 * @param {string} payload.externalUser.job_title_name - 級職名稱
 * @param {number} payload.externalUser.job_title_level - 級職等級 (數字越小權限越高)
 * @param {Object} [payload.params] - 其他檢索與 LLM 參數 (search_type, top_k, score_threshold, custom_system_prompt 等)
 *
 * @param {Object} [options] 控制選項與 Callback
 * @param {string} [options.apiKey] - 自訂 API Key（若未傳入則動態向後端取得）
 * @param {string} [options.baseUrl] - 自訂 Base URL（若未傳入則使用 AIRAG_BASE_URL）
 * @param {AbortSignal} [options.signal] - 用於中途取消請求的 AbortSignal
 * @param {Function} [options.onStep] - 收到進度事件時的回呼 (data: { step, status, content, candidates? })
 * @param {Function} [options.onChunk] - 收到 LLM 逐字輸出時的回呼 (data: { type: 'content'|'reasoning'|'done', content?: string })
 * @param {Function} [options.onMessage] - 收到提前結束的固定提示訊息 (data: { delta: string })
 * @param {Function} [options.onSources] - 收到引用來源與統計資料 (data: { sources, context_summary, attachments })
 * @param {Function} [options.onError] - 發生錯誤時的回呼
 * @param {Function} [options.onDone] - 串流完全結束時的回呼
 *
 * @returns {Promise<{ answer: string, sources: Array, attachments: Array, isEarlyTerminated: boolean }>} 完成後的完整結果
 */
export async function sendExternalChat(payload, options = {}) {
  const apiKey = options.apiKey || (await getAiApiKey())
  const baseUrl = options.baseUrl || AIRAG_BASE_URL

  let {
    question,
    knowledgeBaseId,
    chatHistory = [],
    selectedDbProfileId = null,
    externalUser,
    params = {},
  } = payload || {}

  if (!knowledgeBaseId) {
    knowledgeBaseId = await getKnowledgeBaseId()
  }


  if (!question) {
    throw new Error('提問內容 (question) 為必填欄位')
  }

  if (!externalUser) {
    throw new Error('外部應用呼叫必須提供外部使用者身分資訊 (externalUser)')
  }

  // 組合後端蛇形命名格式的 Request Body
  const requestBody = {
    question,
    knowledge_base_id: knowledgeBaseId,
    chat_history: chatHistory,
    selected_db_profile_id: selectedDbProfileId,
    params: {
      search_type: params.search_type || 'semantic_hybrid',
      // 知識庫檢索情境下模型思考過程（reasoning）可能耗費大量 token，
      // 預設值 1024 常在正式回答（content）尚未產生前就被截斷，故提高預設上限
      max_tokens: params.max_tokens || 60000,
      ...params,
      external_user: {
        employee_id: externalUser.employee_id || externalUser.employeeId || '',
        name: externalUser.name || '',
        department_code: externalUser.department_code || externalUser.departmentCode || '',
        department_name: externalUser.department_name || externalUser.departmentName || '',
        job_title_name: externalUser.job_title_name || externalUser.jobTitleName || '',
        job_title_level: Number(externalUser.job_title_level ?? externalUser.jobTitleLevel ?? 99),
      },
    },
  }

  let response
  try {
    response = await fetch(`${baseUrl}/external/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(requestBody),
      signal: options.signal,
    })
  } catch (err) {
    if (options.onError) options.onError(err)
    throw err
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const errorMsg = errorData.detail || `請求失敗 (HTTP ${response.status})`
    const err = new Error(errorMsg)
    err.status = response.status
    err.detail = errorData.detail
    if (options.onError) options.onError(err)
    throw err
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')

  let buffer = ''
  let fullAnswer = ''
  let sourcesResult = []
  let attachmentsResult = []
  let isEarlyTerminated = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE 事件區塊以 \n\n 分隔
      let sepIndex
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + 2)

        if (!rawEvent.trim()) continue

        let eventName = null
        let data = null

        const lines = rawEvent.split('\n')
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            try {
              data = JSON.parse(line.slice(5).trim())
            } catch (e) {
              console.warn('[AiRAGApi] SSE JSON 解析失敗:', line, e)
            }
          }
        }

        if (!eventName || !data) continue

        // 依事件類型發送 Callback
        switch (eventName) {
          case 'step':
            if (options.onStep) options.onStep(data)
            break

          case 'chunk':
            if (data.type === 'content' && data.content) {
              fullAnswer += data.content
            }
            if (options.onChunk) options.onChunk(data)
            break

          case 'message':
            // 權限不足或低於門檻之提前結束情境
            isEarlyTerminated = true
            if (data.delta) {
              fullAnswer = data.delta
            }
            if (options.onMessage) options.onMessage(data)
            break

          case 'sources':
            if (data.sources) sourcesResult = data.sources
            if (data.attachments) attachmentsResult = data.attachments
            if (options.onSources) options.onSources(data)
            break

          default:
            break
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError' && options.onError) {
      options.onError(err)
    }
    throw err
  } finally {
    if (options.onDone) options.onDone()
  }

  return {
    answer: fullAnswer,
    sources: sourcesResult,
    attachments: attachmentsResult,
    isEarlyTerminated,
  }
}

export default {
  AIRAG_BASE_URL,
  DEFAULT_API_KEY,
  KNOWLEDGE_BASE_ID,
  getKnowledgeBaseId,
  sendExternalChat,
}

