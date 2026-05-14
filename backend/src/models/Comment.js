const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

const Comment = sequelize.define('Comment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  article_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  author_account: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  author_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  mentions: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('mentions');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('mentions', JSON.stringify(value));
    },
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'comments',
  timestamps: false,
});

module.exports = Comment;
