const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

/**
 * RagSyncStatus — KB 文件（文章/附件檔案）與 AiRAG/Qdrant 的同步比對狀態表
 * 見 docs/DevelopmentProcess/RAG_SYNC_PLAN.md 3.1 節
 */
const RagSyncStatus = sequelize.define('RagSyncStatus', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  source_type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: "'article' | 'attachment_file'",
  },
  source_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Article.id 或 AttachmentFile.id',
  },
  parent_attachment_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '僅 attachment_file 類型使用，指向所屬 Attachment.id',
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '文章標題或附件檔名',
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'not_synced',
    comment: 'not_synced | outdated | processing | completed | failed | unpublished_kept | unpublished_deleted',
  },
  target_version: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'KB 後端標記需要同步時寫入的目標版本號，AiRAG 完成/失敗回報須以此欄位做條件式 UPDATE',
  },
  progress: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '0-100，由 AiRAG 直連寫入',
  },
  last_synced_version: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  last_synced_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '由 AiRAG 直連寫入',
  },
  last_checked_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'KB 後端排程最後一次比對時間',
  },
  triggered_by: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: "'schedule' | 'manual' | 'auto_update'",
  },
  error_message: {
    type: DataTypes.TEXT,
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
  tableName: 'rag_sync_status',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['source_type', 'source_id'], name: 'IX_rag_sync_status_source' },
  ],
});

module.exports = RagSyncStatus;
