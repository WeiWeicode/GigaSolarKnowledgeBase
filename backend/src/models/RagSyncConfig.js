const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

/**
 * RagSyncConfig — RAG 同步排程設定表（固定單筆設定列）
 * 見 docs/DevelopmentProcess/RAG_SYNC_PLAN.md 3.2 節
 */
const RagSyncConfig = sequelize.define('RagSyncConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  cron_expression: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: '0 * * * *',
    comment: 'node-cron 表達式，預設每小時執行一次',
  },
  is_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  batch_size: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 20,
    comment: '單次排程最多處理幾筆落差項目',
  },
  last_run_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_run_summary: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON 字串，例如 {"checked":50,"triggered":3,"failed":0}',
  },
  updated_by: {
    type: DataTypes.STRING(50),
    allowNull: true,
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
  tableName: 'rag_sync_config',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = RagSyncConfig;
