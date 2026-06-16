const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

/**
 * AiPromptTemplate — AI 提示詞範本表（System Prompt + User Prompt Template）
 */
const AiPromptTemplate = sequelize.define('AiPromptTemplate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  mode_key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: '模式代碼（例如：summarize, writing, quick_summary, detailed_summary, step_guide）',
  },
  mode_name: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: '模式中文名稱（例如：文章解析-快速摘要）',
  },
  system_prompt: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '系統提示詞（Role Play）',
  },
  user_template: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '使用者提示詞範本（含 {content} 等佔位符）',
  },
  placeholders: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: '佔位符清單（逗號分隔，如 content,source_filename）',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: '是否啟用該模式',
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '備註說明',
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
  tableName: 'ai_prompt_templates',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = AiPromptTemplate;
