const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.KB_DB_NAME || 'KnowledgeBase',
  process.env.KB_DB_USER,
  process.env.KB_DB_PASS,
  {
    host:    process.env.KB_DB_HOST || 'localhost',
    port:    parseInt(process.env.KB_DB_PORT || '1433'),
    dialect: 'mssql',
    dialectOptions: {
      options: {
        encrypt:                false,
        trustServerCertificate: true,
        enableArithAbort:       true,
      },
    },
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    // ⚠️  不在這裡設全域 timestamps，各 Model 自行控制
    logging: process.env.NODE_ENV === 'development' ? false : false,
  }
);

module.exports = { sequelize };
