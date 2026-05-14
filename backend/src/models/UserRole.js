const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

/**
 * UserRole — KB DB 角色覆寫表
 * 用來將特定員工工號覆寫為 ADMIN / MANAGER / MEMBER
 * 優先級高於 NaNa DB 依職級推導的 role
 */
const UserRole = sequelize.define('UserRole', {
  account: {
    type:       DataTypes.STRING(50),
    primaryKey: true,
    comment:    '員工工號',
  },
  role: {
    type:      DataTypes.STRING(20),
    allowNull: false,
    validate:  { isIn: [['ADMIN', 'MANAGER', 'MEMBER']] },
    comment:   'ADMIN | MANAGER | MEMBER',
  },
  updated_at: {
    type:         DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName:  'user_roles',
  timestamps: false,
});

module.exports = UserRole;
