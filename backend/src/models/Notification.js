const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  target_account: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  article_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  article_title: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  mentioned_by_account: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  mentioned_by_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  comment_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  comment_preview: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'notifications',
  timestamps: false,
});

module.exports = Notification;
