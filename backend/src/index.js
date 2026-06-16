/**
 * GigaSolar Knowledge Base - Backend API 入口
 */
require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');

const { initKBPool, initNaNaPool, closeAllPools } = require('./config/db');
const { sequelize, UserExtraDepartment, Tag, AiConfig, AiPromptTemplate } = require('./models');
const { seedIfEmpty } = require('./scripts/seedDirectories');
const { seedAiPrompts } = require('./scripts/seedAiPrompts');


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
app.use(`${API}/ai`,                 require('./routes/ai'));

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
    await AiConfig.sync({ force: false });
    await AiPromptTemplate.sync({ force: false });
    console.log('✅ user_extra_departments, ai_configs, ai_prompt_templates 資料表已就緒');

    // 2.2 Tags 表擴欄（新增 departments / custom_order / click_count / is_public）
    //     使用原生 SQL 逐欄判斷，避免 Sequelize alter:true 在 MSSQL UNIQUE 語法問題
    const addTagColIfMissing = async (col, ddl) => {
      await sequelize.query(`
        IF NOT EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'tags' AND COLUMN_NAME = '${col}'
        )
        BEGIN
          ALTER TABLE tags ADD ${ddl}
        END
      `);
    };
    await addTagColIfMissing('departments',  'departments  NVARCHAR(MAX) NULL');
    await addTagColIfMissing('custom_order', 'custom_order INT NOT NULL DEFAULT 0');
    await addTagColIfMissing('click_count',  'click_count  INT NOT NULL DEFAULT 0');
    await addTagColIfMissing('is_public',    'is_public    BIT NOT NULL DEFAULT 0');
    console.log('✅ tags 資料表已就緒（含新增欄位）');

    // 3. 目錄樹與 AI 提示詞種子資料（當表為空時自動初始化）
    console.log('');
    await seedIfEmpty();
    await seedAiPrompts();

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
