const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

const Tag = sequelize.define('Tag', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
}, {
  tableName: 'tags',
  timestamps: false, // Table in SQL doesn't have updated_at
});

module.exports = Tag;
