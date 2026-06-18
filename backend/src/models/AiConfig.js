const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

/**
 * AiConfig — AI 服務連線與超參數配置表
 */
const AiConfig = sequelize.define('AiConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  config_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '配置組名稱（例如：llama_local）',
  },
  api_url: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'API Endpoint 網址',
  },
  model_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '模型名稱（例如：default）',
  },
  temperature: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: false,
    defaultValue: 0.3,
    comment: '溫度參數',
  },
  timeout_ms: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 300000,
    comment: '請求超時時間（毫秒）',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否啟用（同一時間僅能有一筆為啟用）',
  },
  ai_tool: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'llama.cpp',
    comment: 'AI 工具/提供者名稱（例如：llama.cpp, vllm, ollama）',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'ai_configs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = AiConfig;
