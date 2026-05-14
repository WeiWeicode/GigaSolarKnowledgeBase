const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

const AttachmentVersionHistory = sequelize.define('AttachmentVersionHistory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  attachment_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  version_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  diff_summary: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  editor_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  editor_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  saved_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'attachment_version_history',
  timestamps: false,
});

module.exports = AttachmentVersionHistory;
