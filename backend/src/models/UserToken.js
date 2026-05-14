const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/sequelize');

const UserToken = sequelize.define('UserToken', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  account: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  token: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  token_hash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
  },
  login_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true,
  },
  is_revoked: {
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
  tableName: 'user_tokens',
  timestamps: false,
});

module.exports = UserToken;
