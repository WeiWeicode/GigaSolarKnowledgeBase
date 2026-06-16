# AI 提示詞與配置資料庫化規劃文件 (AI Prompt & Config DB Plan)

## 1. 背景與目的
目前系統中的 AI 提示詞（System Prompts、User Prompt Templates）與 AI 模型配置（如 `llama_url`、`llama_model`，以及 `temperature`、`timeout`）大多以常數或環境變數形式寫死在後端 `backend/src/services/aiService.js` 中。

為提升系統的靈活性、可維護性，並為未來可能的前台/後台 AI 設定管理介面打下基礎，本規劃案旨在將提示詞與配置參數移至資料庫（KB DB）中存取。

---

## 2. 資料庫設計方案

根據專案資料庫的命名慣例（資料表與欄位名稱均採用 `snake_case`），我們提供以下兩種設計方案供評估。

### 方案 A：獨立分離式設計（照原構想分三張表）
將模型參數、系統提示詞、使用者範本完全解耦至不同資料表，適合未來有「多個 System Prompt 交叉搭配多個 User Template」的複雜彈性需求。

#### 2.1.1 ai_configs (AI 配置表)
用於儲存與管理 AI 服務的連線與超參數配置。
* **Table 名稱**: `ai_configs`

| 欄位名稱 | 資料型別 | 限制 | 說明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | PK, IDENTITY | 自動遞增主鍵 |
| `config_key` | `NVARCHAR(100)` | UNIQUE, NOT NULL | 配置鍵（例如：`llama_url`, `llama_model`, `temperature`, `timeout`） |
| `config_value` | `NVARCHAR(MAX)` | NOT NULL | 配置值 |
| `description` | `NVARCHAR(500)` | NULL | 配置描述與備註 |
| `created_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | 建立時間 |
| `updated_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | 更新時間 |

#### 2.1.2 ai_system_prompts (系統提示詞表)
用於管理 AI 在各個模式下的 Role Play 設定。
* **Table 名稱**: `ai_system_prompts`

| 欄位名稱 | 資料型別 | 限制 | 說明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | PK, IDENTITY | 自動遞增主鍵 |
| `prompt_key` | `NVARCHAR(100)` | UNIQUE, NOT NULL | 提示詞鍵值（例如：`summarize`, `writing`, `quick_summary`, `detailed_summary`, `step_guide`） |
| `prompt_name` | `NVARCHAR(200)` | NOT NULL | 提示詞中文名稱（例如：`預設文章解析助手`） |
| `content` | `NVARCHAR(MAX)` | NOT NULL | 系統提示詞內容 |
| `description` | `NVARCHAR(500)` | NULL | 備註說明 |
| `created_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | 建立時間 |
| `updated_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | 更新時間 |

#### 2.1.3 ai_user_prompt_templates (使用者提示詞模板表)
用於管理傳給 AI 的任務上下文格式範本，包含變數佔位符。
* **Table 名稱**: `ai_user_prompt_templates`

| 欄位名稱 | 資料型別 | 限制 | 說明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | PK, IDENTITY | 自動遞增主鍵 |
| `template_key` | `NVARCHAR(100)` | UNIQUE, NOT NULL | 範本鍵值（例如：`summarize`, `writing`, `quick_summary`, `detailed_summary`, `step_guide`） |
| `template_name` | `NVARCHAR(200)` | NOT NULL | 範本中文名稱 |
| `content` | `NVARCHAR(MAX)` | NOT NULL | 範本內文（支援 `{content}`, `{source_filename}`, `{source_note}` 等佔位符） |
| `placeholders` | `NVARCHAR(200)` | NULL | 佔位符清單（逗號分隔，如 `content,source_filename`，供校驗與動態組裝） |
| `description` | `NVARCHAR(500)` | NULL | 備註說明 |
| `created_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | 建立時間 |
| `updated_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | 更新時間 |

---

### 方案 B：整合型設計（推薦方案：合併為兩張表）
在現有的知識庫應用中，一個 AI 運作模式（例如：快速摘要 `quick_summary`）一定是 **「一個 System Prompt 搭配一個特定格式的 User Prompt Template」**。
因此，將它們合併為 `ai_prompt_templates` 可以避免跨多表 Join 的開銷，且在新增、修改一個 AI 功能模式時，只需在單一表修改一筆資料，能大幅簡化維護。

#### 2.2.1 ai_configs (AI 配置表)
與方案 A 相同。但可優化為**模型配置列形式**，使切換不同模型更直覺：
* **Table 名稱**: `ai_configs`

| 欄位名稱 | 資料型別 | 限制 | 說明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | PK, IDENTITY | 自動遞增主鍵 |
| `config_name` | `NVARCHAR(100)` | NOT NULL | 配置組名稱（例如：`llama_local`, `openai_fallback`） |
| `api_url` | `NVARCHAR(500)` | NOT NULL | API Endpoint 網址 |
| `model_name` | `NVARCHAR(100)` | NOT NULL | 模型名稱（如 `qwen2.5:14b`, `default`） |
| `temperature` | `DECIMAL(3,2)` | NOT NULL, DEFAULT 0.3 | 溫度參數 |
| `timeout_ms` | `INT` | NOT NULL, DEFAULT 300000 | 請求超時時間（毫秒） |
| `is_active` | `BIT` | NOT NULL, DEFAULT 0 | 是否啟用（同一時間僅能有一筆為 `1`） |
| `created_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | 建立時間 |
| `updated_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | 更新時間 |

#### 2.2.2 ai_prompt_templates (AI 提示詞範本表)
* **Table 名稱**: `ai_prompt_templates`

| 欄位名稱 | 資料型別 | 限制 | 說明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | PK, IDENTITY | 自動遞增主鍵 |
| `mode_key` | `NVARCHAR(100)` | UNIQUE, NOT NULL | 模式代碼（例如：`summarize`, `writing`, `quick_summary`, `detailed_summary`, `step_guide`） |
| `mode_name` | `NVARCHAR(200)` | NOT NULL | 模式中文名稱（例如：`文章解析-快速摘要`） |
| `system_prompt` | `NVARCHAR(MAX)` | NOT NULL | 系統提示詞（Role Play） |
| `user_template` | `NVARCHAR(MAX)` | NOT NULL | 使用者提示詞範本（包含 `{content}` 等佔位符） |
| `placeholders` | `NVARCHAR(200)` | NULL | 佔位符清單（逗號分隔，如 `content`） |
| `is_active` | `BIT` | NOT NULL, DEFAULT 1 | 是否啟用該功能模式 |
| `description` | `NVARCHAR(500)` | NULL | 備註說明 |
| `created_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | 建立時間 |
| `updated_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | 更新時間 |

> [!TIP]
> **推薦選擇方案 B**：因為目前系統的 AI 功能（文章解析、寫作助手、快速摘要、詳細摘要、步驟指引）都有明確對應的 System 與 User Prompt 關係。將其整合為一表，在維護時更方便（例如只要查閱該功能的 `mode_key` 就能一次取回 system prompt 與 user template）。

---

## 3. Sequelize Model 設計

以下採用**方案 B** 示範 Sequelize 模型的宣告方式。

### 3.1 AiConfig.js
```javascript
// backend/src/models/AiConfig.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AiConfig = sequelize.define('AiConfig', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    configName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'config_name'
    },
    apiUrl: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'api_url'
    },
    modelName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'model_name'
    },
    temperature: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 0.3,
      field: 'temperature'
    },
    timeoutMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 300000,
      field: 'timeout_ms'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_active'
    }
  }, {
    tableName: 'ai_configs',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return AiConfig;
};
```

### 3.2 AiPromptTemplate.js
```javascript
// backend/src/models/AiPromptTemplate.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AiPromptTemplate = sequelize.define('AiPromptTemplate', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    modeKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      field: 'mode_key'
    },
    modeName: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'mode_name'
    },
    systemPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'system_prompt'
    },
    userTemplate: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'user_template'
    },
    placeholders: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'placeholders'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'description'
    }
  }, {
    tableName: 'ai_prompt_templates',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return AiPromptTemplate;
};
```

---

## 4. 快取與效能優化策略 (Caching Strategy)

由於 AI 提示詞與模型配置在一般運行時**極少變更**，但每一次 AI 呼叫都需要讀取。為避免每次串流 API 呼叫都對資料庫進行查詢：
1. **Redis 快取**：
   - 系統啟動或首次讀取時，將啟用的 `AiConfig` 與所有啟用的 `AiPromptTemplate` 快取至 Redis。
   - 快取 Key 規劃：
     - `ai:active_config` (TTL: 24 小時)
     - `ai:prompt_templates` (TTL: 24 小時)
2. **快取失效機制 (Cache Eviction)**：
   - 後續若提供修改 AI 提示詞與配置的 API，在更新資料表的同時，**必須主動刪除/更新對應的 Redis Key**，使下次請求能即時取得最新資料。

---

## 5. 後端 `aiService.js` 改寫規劃

### 5.1 動態變數替換輔助函式 (Helper)
新增一個通用的模板解析函式，將範本中的佔位符替換為實際值：
```javascript
/**
 * Replace placeholders in template with dynamic values.
 * @param {string} template - The prompt template content (e.g. "Hello {name}")
 * @param {object} variables - Key-value pairs of variables (e.g. { name: "World" })
 * @returns {string} Fully resolved prompt
 */
function resolveTemplate(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    // Replace all occurrences of {key}
    result = result.split(`{${key}}`).join(value || '');
  }
  return result;
}
```

### 5.2 核心串流讀取設定調整
改寫 `streamToSSE` 函式，使其從配置參數中動態取得 `apiUrl`, `modelName`, `temperature`, `timeoutMs`，不再依賴固定常數。

### 5.3 載入 Prompt 與 Config
實作一個載入配置的底層函式，優先讀取快取，快取不存在則查詢資料庫並寫入快取。

---

## 6. 專案待實作清單 & 驗證方式

### 6.1 待實作清單
1. **Model 宣告與註冊**：
   - 建立 `backend/src/models/AiConfig.js` 與 `backend/src/models/AiPromptTemplate.js`。
   - 於 `backend/src/models/index.js` 註冊並關聯。
2. **自動建表與 Seed 腳本**：
   - 修改 `backend/src/index.js` 的 `sync` 區塊，確保自動建表。
   - 撰寫 `backend/src/scripts/seedAiPrompts.js` 腳本，將目前程式碼中寫死的提示詞與環境變數導入資料庫中作為初始值。
3. **改寫 `aiService.js`**：
   - 移除寫死的提示詞常數。
   - 實作資料庫載入與 Redis 快取整合。
   - 更新 `streamArticleSummary` 與 `streamWritingAssist` 的串接。
4. **撰寫 API 管理端點（可選，供未來擴充）**：
   - 新增 AI 提示詞與配置的讀取/更新 API（僅限 `ADMIN` 角色）。

### 6.2 驗證方式
1. **資料庫初始化驗證**：
   - 執行 `node src/scripts/seedAiPrompts.js`，檢查 SQL Server 中的 `ai_configs` 與 `ai_prompt_templates` 資料表是否成功建立且寫入初始資料。
2. **AI 功能流暢度測試**：
   - 在首頁點擊 AI 解析文章，確認能流暢串流輸出核心摘要、關鍵重點與深入分析。
   - 測試各種解析模式（快速摘要、詳細摘要、步驟說明），檢查是否正確套用資料庫中的提示詞格式。
   - 在編輯頁上傳 Word 文件或產生文章，確認寫作助手功能正常。
3. **動態變更測試**：
   - 手動修改資料庫中 `ai_prompt_templates` 某個模式的範本（例如在摘要前加上特定字樣「[資料庫測試]」），並清除 Redis 快取後再次執行，驗證 AI 輸出的內容是否即時套用最新範本，以此證明提示詞確實由資料庫管理。
