const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

/**
 * AiChatSession — AI 問答「對話」主檔
 * 見 docs/DevelopmentProcess/AI_CHAT_HISTORY_PLAN.md 4.1 節
 *
 * 為什麼對話結構要存在 KB 這邊：AiRAG 的 external_chat_logs 是「單輪問答稽核紀錄」，
 * 沒有 session_id 也不回傳 log _id，無法還原「哪幾輪屬於同一段對話」（見規劃文件 2 節）。
 */
const AiChatSession = sequelize.define('AiChatSession', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  session_uid: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: '前端產生的 UUID，讓前端在對話落地前即可持有識別碼',
  },
  account: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '擁有者員工工號（對應 NaNa DB，無 FK）',
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: '系統自動標題：建立對話時取第一則提問前 30 字',
  },
  custom_title: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: '使用者自訂標題，有值時前端優先顯示',
  },
  is_pinned: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '釘選（置頂）',
  },
  is_favorite: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '加入最愛',
  },
  is_hidden: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '刪除＝隱藏（軟刪除），不做實體刪除',
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '手動排序，數字小者在前',
  },
  message_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '訊息則數（含 user + ai）',
  },
  last_message_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '最後一則訊息時間，列表預設排序依據',
  },
  knowledge_base_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: '本對話使用的 AiRAG 知識庫 ID（快照）',
  },
  search_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '最後一次使用的檢索模式（KB_hybrid / KB_semantic_hybrid）',
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
  tableName: 'ai_chat_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['session_uid'], name: 'UQ_ai_chat_sessions_uid' },
    { fields: ['account', 'is_hidden', 'is_pinned', 'last_message_at'], name: 'IX_ai_chat_sessions_account' },
  ],
});

module.exports = AiChatSession;
