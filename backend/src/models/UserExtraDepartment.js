const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

const UserExtraDepartment = sequelize.define('UserExtraDepartment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  // 被授權的同仁工號
  account: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  // 目標公司 OID
  org_oid: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  // 目標部門代碼
  dept_code: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  // 目標部門名稱（冗餘欄位，方便前端顯示，不查 BPM）
  dept_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  // 建立者工號（MANAGER）
  created_by: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'user_extra_departments',
  timestamps: false,
});

module.exports = UserExtraDepartment;
