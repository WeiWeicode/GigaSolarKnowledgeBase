/**
 * Seed Directories
 * 從 NaNa DB 讀取公司與部門，初始化 directories 資料表的根節點。
 *
 * 執行時機：
 *   - 手動：node src/scripts/seedDirectories.js
 *   - 自動：後端啟動時若 directories 表為空則自動執行（由 index.js 呼叫）
 *
 * 建立的節點結構：
 *   company（公司）
 *     └─ department（部門）
 *           └─ trash（垃圾桶，每部門固定一個，sort_order=9999）
 */
require('dotenv').config();

const { initKBPool, initNaNaPool } = require('../config/db');
const nanaService = require('../services/nanaService');
const { Directory, sequelize } = require('../models');

async function seedDirectories() {
  console.log('🌱 開始初始化目錄樹種子資料...');

  const companies = await nanaService.getCompanies();
  if (companies.length === 0) {
    console.log('⚠️  NaNa DB 查無公司資料，跳過。');
    return;
  }

  const t = await sequelize.transaction();
  try {
    for (const company of companies) {
      const companyId = `company-${company.組織OID}`;

      // 公司節點
      await Directory.findOrCreate({
        where: { id: companyId },
        defaults: {
          id:         companyId,
          parent_id:  null,
          type:       'company',
          label:      company.組織名稱,
          org_oid:    company.組織OID,
          sort_order: 1,
        },
        transaction: t,
      });
      console.log(`  ✅ 公司：${company.組織名稱}`);

      // 部門清單（只處理 S 開頭，與 metaController 一致）
      const departments = await nanaService.getDepartmentsByOrg(company.組織OID);
      const filtered    = departments.filter(d => d.部門代碼.startsWith('S'));

      for (let i = 0; i < filtered.length; i++) {
        const dept    = filtered[i];
        const deptId  = `dept-${dept.部門代碼}`;
        const trashId = `trash-${dept.部門代碼}`;

        // 部門節點
        await Directory.findOrCreate({
          where: { id: deptId },
          defaults: {
            id:         deptId,
            parent_id:  companyId,
            type:       'department',
            label:      dept.部門名稱,
            dept_code:  dept.部門代碼,
            org_oid:    company.組織OID,
            sort_order: i + 1,
          },
          transaction: t,
        });

        // 垃圾桶節點（每部門固定一個）
        await Directory.findOrCreate({
          where: { id: trashId },
          defaults: {
            id:         trashId,
            parent_id:  deptId,
            type:       'trash',
            label:      '垃圾桶',
            dept_code:  dept.部門代碼,
            sort_order: 9999,
          },
          transaction: t,
        });

        console.log(`    ✅ 部門：${dept.部門名稱}（${dept.部門代碼}）`);
      }
    }

    await t.commit();
    console.log('🎉 目錄樹種子資料初始化完成！');
  } catch (error) {
    await t.rollback();
    console.error('❌ 種子資料初始化失敗：', error.message);
    throw error;
  }
}

/**
 * 只在 directories 表為空時執行（供 index.js 啟動時呼叫）
 */
async function seedIfEmpty() {
  const count = await Directory.count();
  if (count === 0) {
    console.log('📂 directories 表為空，自動執行種子資料初始化...');
    await seedDirectories();
  } else {
    console.log(`📂 directories 表已有 ${count} 筆資料，跳過。`);
  }
}

// 直接執行：node src/scripts/seedDirectories.js
if (require.main === module) {
  (async () => {
    try {
      await initKBPool();
      await initNaNaPool();
      await seedDirectories();
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
}

module.exports = { seedDirectories, seedIfEmpty };
