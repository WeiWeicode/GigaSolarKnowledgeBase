const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

const AttachmentFile = sequelize.define('AttachmentFile', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  attachment_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  uuid: {
    type: DataTypes.STRING(36),
    allowNull: false,
    unique: true,
  },
  name: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  size: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  mime_type: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  storage_path: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  version_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'attachment_files',
  timestamps: false,
});

module.exports = AttachmentFile;
