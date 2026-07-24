/**
 * Fix Article and Attachment access_dept
 * 補齊歷史文章與附件中 access_dept 為 NULL 或空字串的紀錄。
 * 依據 created_by 工號向 NaNa DB 查詢員工部門代碼，若無則由 Directory 捷徑節點父目錄補齊。
 *
 * 執行方式：
 *   node src/scripts/fixArticleAccessDept.js
 */
require('dotenv').config();

const { Op } = require('sequelize');
const { Article, Attachment, Directory } = require('../models');
const nanaService = require('../services/nanaService');

async function fixAccessDept() {
  console.log('🔄 開始檢查並修補文章與附件 access_dept 欄位...');
  try { await initNaNaPool(); } catch (err) { console.warn('⚠️ NaNa Pool 初始化失敗:', err.message); }

  let articleUpdatedCount = 0;
  let attachmentUpdatedCount = 0;

  // 1. 修補 Articles
  const emptyArticles = await Article.findAll({
    where: {
      [Op.or]: [
        { access_dept: null },
        { access_dept: '' },
      ],
    },
  });

  console.log(`📋 找到 ${emptyArticles.length} 筆 access_dept 為空的文章`);

  for (const article of emptyArticles) {
    let deptCode = null;

    // 優先以 created_by 工號向 NaNa DB 查詢
    if (article.created_by) {
      try {
        const user = await nanaService.getUserByAccount(article.created_by);
        deptCode = user?.部門代碼 || null;
      } catch (err) {
        console.warn(`⚠️ 查詢帳號 ${article.created_by} 失敗:`, err.message);
      }
    }

    // 次要備援：若 NaNa DB 無法取得，向 Directory 查其所屬目錄 parent_id 的 dept_code
    if (!deptCode) {
      const dirNode = await Directory.findOne({
        where: { article_id: article.id, type: 'article' },
        attributes: ['parent_id', 'dept_code'],
      });
      if (dirNode?.parent_id) {
        const parentDir = await Directory.findOne({
          where: { id: dirNode.parent_id },
          attributes: ['dept_code'],
        });
        deptCode = parentDir?.dept_code || dirNode.dept_code || null;
      }
    }

    if (deptCode) {
      await article.update({ access_dept: deptCode });
      articleUpdatedCount++;
      console.log(`  ✅ 文章 #${article.id} "${article.title}" 補寫 access_dept = ${deptCode} (建立者: ${article.created_by_name || article.created_by})`);
    } else {
      console.warn(`  ⚠️ 文章 #${article.id} "${article.title}" 無法匹配部門代碼`);
    }
  }

  // 2. 修補 Attachments
  const emptyAttachments = await Attachment.findAll({
    where: {
      [Op.or]: [
        { access_dept: null },
        { access_dept: '' },
      ],
    },
  });

  console.log(`📋 找到 ${emptyAttachments.length} 筆 access_dept 為空的附件`);

  for (const att of emptyAttachments) {
    let deptCode = null;

    if (att.created_by) {
      try {
        const user = await nanaService.getUserByAccount(att.created_by);
        deptCode = user?.部門代碼 || null;
      } catch (err) {
        console.warn(`⚠️ 查詢帳號 ${att.created_by} 失敗:`, err.message);
      }
    }

    if (!deptCode) {
      const dirNode = await Directory.findOne({
        where: { attachment_id: att.id, type: 'attachment' },
        attributes: ['parent_id', 'dept_code'],
      });
      if (dirNode?.parent_id) {
        const parentDir = await Directory.findOne({
          where: { id: dirNode.parent_id },
          attributes: ['dept_code'],
        });
        deptCode = parentDir?.dept_code || dirNode.dept_code || null;
      }
    }

    if (deptCode) {
      await att.update({ access_dept: deptCode });
      attachmentUpdatedCount++;
      console.log(`  ✅ 附件 #${att.id} "${att.title}" 補寫 access_dept = ${deptCode} (建立者: ${att.created_by_name || att.created_by})`);
    } else {
      console.warn(`  ⚠️ 附件 #${att.id} "${att.title}" 無法匹配部門代碼`);
    }
  }

  console.log(`\n🎉 修補完成！`);
  console.log(`   - 文章成功補寫: ${articleUpdatedCount} 筆`);
  console.log(`   - 附件成功補寫: ${attachmentUpdatedCount} 筆`);
}

fixAccessDept()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ 修補程序發生錯誤:', err);
    process.exit(1);
  });
