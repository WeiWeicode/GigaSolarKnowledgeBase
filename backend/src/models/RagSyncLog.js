const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

/**
 * RagSyncLog — RAG 同步錯誤/事件 Log
 * 見 docs/DevelopmentProcess/RAG_SYNC_PLAN.md 3.3 節
 */
const RagSyncLog = sequelize.define('RagSyncLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  source_type: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  source_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  stage: {
    type: DataTypes.STRING(30),
    allowNull: false,
    comment: 'compare | notify | fetch_content | chunking | embedding | qdrant_upsert',
  },
  level: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'error',
    comment: 'info | warning | error',
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  occurred_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'rag_sync_logs',
  timestamps: false,
});

module.exports = RagSyncLog;
