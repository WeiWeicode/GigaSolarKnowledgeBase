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
  // 綁定的部門代碼陣列，以 JSON 字串儲存
  // 為空（null）表示此標籤不顯示於部門模式
  departments: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null,
  },
  // 主管在部門模式下自訂的顯示順序（越小越前）
  custom_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  // 公開模式下的點擊次數（越多越前）
  click_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  // 是否在公開文件模式中顯示
  is_public: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
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
