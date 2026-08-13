const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

/**
 * AiChatMessage — AI 問答對話的單則訊息
 * 見 docs/DevelopmentProcess/AI_CHAT_HISTORY_PLAN.md 4.2 節
 */
const AiChatMessage = sequelize.define('AiChatMessage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  session_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '所屬 AiChatSession.id',
  },
  seq: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '對話內序號，從 1 遞增；順序不依賴時間戳',
  },
  role: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: "'user' | 'ai'",
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Markdown 原文；HTML 由前端即時渲染，不落地',
  },
  sources_json: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '引用來源精簡 JSON（filename / chunk_id / score），僅 role=ai',
  },
  mongo_log_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '關聯 MongoDB external_chat_logs._id；回填失敗留 null',
  },
  mongo_matched_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '回填成功時間，null = 尚未比對到',
  },
  elapsed_ms: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '由 Mongo 回填的本輪耗時',
  },
  is_early_terminated: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '對應 SSE event: message 的權限不足／低於門檻情境',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'ai_chat_messages',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['session_id', 'seq'], name: 'IX_ai_chat_messages_session' },
    { fields: ['mongo_log_id'], name: 'IX_ai_chat_messages_mongo' },
  ],
});

module.exports = AiChatMessage;
