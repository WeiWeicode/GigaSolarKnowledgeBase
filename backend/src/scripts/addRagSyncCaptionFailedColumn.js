/**
 * Add rag_sync_status.caption_failed_count
 * 新增「內嵌圖片 AI 描述失敗段落數」欄位。
 *
 * 為什麼需要這支腳本：backend/src/index.js 使用 RagSyncStatus.sync({ force: false })，
 * 該模式只會在資料表不存在時建立，不會替既有資料表補上新欄位，因此需手動執行一次 ALTER。
 * 腳本為冪等設計，重複執行不會報錯。
 *
 * 執行方式：
 *   node src/scripts/addRagSyncCaptionFailedColumn.js
 */
require('dotenv').config();

const { sequelize } = require('../config/sequelize');

async function addColumn() {
  console.log('🔄 檢查 rag_sync_status.caption_failed_count 欄位...');

  // 不寫死 dbo schema，交由連線帳號的預設 schema 解析，與 AiRAG 直連寫入時
  // 使用的非限定表名（UPDATE rag_sync_status ...）保持一致
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt
    FROM sys.columns
    WHERE object_id = OBJECT_ID('rag_sync_status') AND name = 'caption_failed_count'
  `);

  if (Number(rows[0]?.cnt) > 0) {
    console.log('✅ 欄位已存在，無需變更。');
    return;
  }

  await sequelize.query(`
    ALTER TABLE rag_sync_status
    ADD caption_failed_count INT NULL CONSTRAINT DF_rag_sync_status_caption_failed_count DEFAULT 0
  `);
  console.log('✅ 已新增欄位 caption_failed_count INT NULL DEFAULT 0。');

  // 既有列補 0，避免前端把 NULL 與「有失敗」混淆
  await sequelize.query(`
    UPDATE rag_sync_status SET caption_failed_count = 0 WHERE caption_failed_count IS NULL
  `);
  console.log('✅ 既有資料已回填為 0。');
}

addColumn()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ 新增欄位失敗:', err);
    process.exit(1);
  });
