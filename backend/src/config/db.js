/**
 * 資料庫連線設定
 * 使用 new mssql.ConnectionPool() 分別管理兩個獨立連線池
 *
 * ⚠️  mssql.connect() 是全域單一 Pool，兩個 DB 不能共用同一個 global pool。
 *     必須用 new ConnectionPool() 才能同時持有兩條不同的連線。
 */
require('dotenv').config();
const mssql = require('mssql');

// ── KB DB（知識庫主資料庫）──────────────────────────────────
const kbConfig = {
  server:   process.env.KB_DB_HOST   || 'localhost',
  port:     parseInt(process.env.KB_DB_PORT || '1433'),
  database: process.env.KB_DB_NAME   || 'KnowledgeBase',
  user:     process.env.KB_DB_USER,
  password: process.env.KB_DB_PASS,
  options: {
    encrypt:                false,
    trustServerCertificate: true,
    enableArithAbort:       true,
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

// ── NaNa DB（人事資料庫，唯讀）──────────────────────────────
const nanaConfig = {
  server:   process.env.NANA_DB_HOST || '10.10.130.190',
  port:     parseInt(process.env.NANA_DB_PORT || '1433'),
  database: process.env.NANA_DB_NAME || 'NaNa',
  user:     process.env.NANA_DB_USER,
  password: process.env.NANA_DB_PASS,
  options: {
    encrypt:                false,
    trustServerCertificate: true,
    enableArithAbort:       true,
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

let kbPool   = null;
let nanaPool = null;

// ── 初始化 KB DB ────────────────────────────────────────────
async function initKBPool() {
  try {
    console.log('🔄 正在連線 KB DB...');
    console.log(`   Server:   ${kbConfig.server}:${kbConfig.port}`);
    console.log(`   Database: ${kbConfig.database}`);

    kbPool = new mssql.ConnectionPool(kbConfig);
    await kbPool.connect();

    kbPool.on('error', err => console.error('KB DB pool error:', err));
    console.log('✅ KB DB 連線成功');
    return kbPool;
  } catch (error) {
    console.error('❌ KB DB 連線失敗:', error.message);
    throw error;
  }
}

// ── 初始化 NaNa DB ──────────────────────────────────────────
async function initNaNaPool() {
  try {
    console.log('🔄 正在連線 NaNa DB...');
    console.log(`   Server:   ${nanaConfig.server}:${nanaConfig.port}`);
    console.log(`   Database: ${nanaConfig.database}`);

    nanaPool = new mssql.ConnectionPool(nanaConfig);
    await nanaPool.connect();

    nanaPool.on('error', err => console.error('NaNa DB pool error:', err));
    console.log('✅ NaNa DB 連線成功');
    return nanaPool;
  } catch (error) {
    console.error('❌ NaNa DB 連線失敗:', error.message);
    throw error;
  }
}

// ── Getter ──────────────────────────────────────────────────
function getKBPool() {
  if (!kbPool || !kbPool.connected) {
    throw new Error('KB Pool 尚未初始化，請先呼叫 initKBPool()');
  }
  return kbPool;
}

function getNaNaPool() {
  if (!nanaPool || !nanaPool.connected) {
    throw new Error('NaNa Pool 尚未初始化，請先呼叫 initNaNaPool()');
  }
  return nanaPool;
}

// ── 關閉所有連線 ─────────────────────────────────────────────
async function closeAllPools() {
  try {
    if (kbPool)   { await kbPool.close();   console.log('KB DB 連線已關閉'); }
    if (nanaPool) { await nanaPool.close();  console.log('NaNa DB 連線已關閉'); }
  } catch (error) {
    console.error('關閉連線時發生錯誤:', error.message);
  }
}

module.exports = { initKBPool, initNaNaPool, getKBPool, getNaNaPool, closeAllPools };
