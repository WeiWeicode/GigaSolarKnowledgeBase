const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

const Directory = sequelize.define('Directory', {
  id: {
    type: DataTypes.STRING(100),
    primaryKey: true,
  },
  parent_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['company', 'department', 'directory', 'article', 'attachment', 'trash']],
    },
  },
  label: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  org_oid: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  dept_code: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  article_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  attachment_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  is_public: {
    type: DataTypes.BOOLEAN,
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
  tableName: 'directories',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Directory;
