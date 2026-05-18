/**
 * GigaSolar Knowledge Base - Backend API 入口
 */
require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');

const { initKBPool, initNaNaPool, closeAllPools } = require('./config/db');
const { sequelize, UserExtraDepartment } = require('./models');
const { seedIfEmpty } = require('./scripts/seedDirectories');

const app  = express();
const PORT = process.env.PORT || 5155;
const API  = '/api/v1';

// ── 中間件 ────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── 靜態檔案（上傳圖片 / 附件）──────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads')));

// ── 健康檢查 ──────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server is running', timestamp: new Date().toISOString() });
});

// ── 路由 ─────────────────────────────────────────────────────
app.use(`${API}/auth`,          require('./routes/auth'));
app.use(`${API}/meta`,          require('./routes/meta'));
app.use(`${API}/colleagues`,    require('./routes/colleagues'));
app.use(`${API}/tags`,          require('./routes/tags'));
app.use(`${API}/directories`,   require('./routes/directories'));
app.use(`${API}/articles`,      require('./routes/articles'));
app.use(`${API}/attachments`,   require('./routes/attachments'));
app.use(`${API}/comments`,      require('./routes/comments_standalone'));
app.use(`${API}/notifications`,      require('./routes/notifications'));
app.use(`${API}/cross-departments`,  require('./routes/crossDepartments'));

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'API 端點不存在' });
});

// ── 全域錯誤處理 ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '伺服器內部錯誤',
  });
});

// ── 啟動 ─────────────────────────────────────────────────────
async function startServer() {
  try {
    console.log('='.repeat(50));
    console.log('🚀 GigaSolar Knowledge Base - Backend');
    console.log('='.repeat(50));

    // 1. DB 連線
    console.log('\n📦 初始化資料庫連線...\n');
    await initKBPool();
    await initNaNaPool();

    // 2. Sequelize 驗證
    console.log('\n🔄 Sequelize 驗證連線...');
    await sequelize.authenticate();
    console.log('✅ Sequelize 連線驗證成功');

    // 2.1 自動建立新增的 Table（不影響既有資料表）
    await UserExtraDepartment.sync({ force: false });
    console.log('✅ user_extra_departments 資料表已就緒');

    // 3. 目錄樹種子資料（directories 表為空時自動初始化）
    console.log('');
    await seedIfEmpty();

    // 4. 啟動 HTTP
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(50));
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📍 http://localhost:${PORT}/health`);
      console.log('='.repeat(50) + '\n');
    });

  } catch (error) {
    console.error('\n❌ 啟動失敗:', error.message);
    process.exit(1);
  }
}

process.on('SIGINT',  async () => { await closeAllPools(); process.exit(0); });
process.on('SIGTERM', async () => { await closeAllPools(); process.exit(0); });

startServer();
