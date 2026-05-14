const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

const Attachment = sequelize.define('Attachment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_published: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  is_public: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  access_dept: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  access_members: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('access_members');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('access_members', JSON.stringify(value));
    },
  },
  access_level: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  version_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  created_by: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  created_by_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  updated_by: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  updated_by_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
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
  tableName: 'attachments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Attachment;
