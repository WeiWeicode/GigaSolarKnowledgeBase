require('dotenv').config();
const { AiConfig, AiPromptTemplate } = require('../models');

/**
 * Seed AI configuration and prompt templates into the database if empty.
 */
async function seedAiPrompts() {
  try {
    console.log('🌱 Start seeding AI Config & Prompt Templates...');

    // 1. Seed AI Configs
    const configCount = await AiConfig.count();
    if (configCount === 0) {
      console.log('-> Seeding default AI Config...');
      await AiConfig.create({
        config_name: 'llama_local',
        api_url: process.env.llama_URL || 'http://localhost:8080/v1',
        model_name: process.env.llama_MODEL || 'default',
        temperature: 0.3,
        timeout_ms: 300000,
        is_active: true,
      });
      console.log('✅ Default AI Config seeded.');
    } else {
      console.log('-> AI Config already exists, skip.');
    }

    // 2. Seed Prompt Templates
    const templateCount = await AiPromptTemplate.count();
    if (templateCount === 0) {
      console.log('-> Seeding default Prompt Templates...');
      const defaultTemplates = [
        {
          mode_key: 'summarize',
          mode_name: '文章解析-預設',
          system_prompt: '你是一位專業的文章解析助手，擅長快速理解文章重點並以結構化方式呈現。請根據提供的文章內容，以繁體中文輸出 analysis 結果。',
          user_template: `/no_think\n請分析以下文章內容，並以下列格式輸出：\n\n{content}\n\n---\n\n## 核心摘要\n（一句話總結）\n\n## 關鍵重點\n- 重點 1\n- 重點 2\n\n## 深入分析\n（根據文章屬性區分：技術拆解 / 邏輯辨證）\n\n## 結論與洞察\n（AI 總結出的價值點）`,
          placeholders: 'content',
          is_active: true,
          description: '預設的文章解析模板',
        },
        {
          mode_key: 'writing',
          mode_name: '寫作助手',
          system_prompt: '你是一位專業的寫作助手，擅長根據素材或主題生成結構完整、排版清晰的 Markdown 文章。支援兩種模式：(1) 根據上傳的 Word 文件內容進行整理與重寫；(2) 根據使用者描述的主題自行生成完整文章。輸出請使用標準 Markdown 格式，以繁體中文撰寫。',
          user_template: `/no_think\n{source_note}請根據以下內容生成一篇結構完整的文章：\n\n{content}\n\n---\n\n# 核心摘要\n（一句話總結本文核心）\n\n## 關鍵觀點 / 技術重點\n- 觀點 1\n- 觀點 2\n\n## 詳細內容\n（正文內容，請使用標準 Markdown 排版）\n\n## 參考資料 / 來源\n- {source_filename}`,
          placeholders: 'content,source_filename,source_note',
          is_active: true,
          description: '文章生成與 Word 整理重寫模板',
        },
        {
          mode_key: 'quick_summary',
          mode_name: '文章解析-快速摘要',
          system_prompt: '你是一位專業的文章摘要助手，擅長以最精簡的方式呈現文章核心要點。回應要簡短有力，避免冗長說明，以繁體中文輸出。',
          user_template: `/no_think\n請對以下文章提供簡易摘要：\n\n{content}\n\n---\n\n## 一句話摘要\n（用一句話說清楚文章核心）\n\n## 三大重點\n- 重點一\n- 重點二\n- 重點三\n\n## 適合閱讀對象\n（哪些人最需要讀這篇）`,
          placeholders: 'content',
          is_active: true,
          description: '快速摘要模板',
        },
        {
          mode_key: 'detailed_summary',
          mode_name: '文章解析-詳細摘要',
          system_prompt: '你是一位深度文章分析師，能夠從多個角度全面解析文章內容、論點與價值。回應要完整詳盡，涵蓋背景、論點、細節與建議，以繁體中文輸出。',
          user_template: `/no_think\n請對以下文章進行深入分析：\n\n{content}\n\n---\n\n## 文章概述\n（背景、目的與範疇）\n\n## 核心論點\n（主要觀點與論據）\n\n## 關鍵細節\n（重要技術細節或事實數據）\n\n## 優缺點與適用場景\n\n## 結論與建議`,
          placeholders: 'content',
          is_active: true,
          description: '深度詳細摘要模板',
        },
        {
          mode_key: 'step_guide',
          mode_name: '文章解析-步驟指引',
          system_prompt: '你是一位專業的技術文件整理師，擅長將文章的操作流程或說明整理為清晰可執行的步驟說明。步驟要具體可操作，標示注意事項與常見問題，以繁體中文輸出。',
          user_template: `/no_think\n請將以下文章的操作方式或流程整理為詳細步驟說明：\n\n{content}\n\n---\n\n## 前置準備\n（必要工具、環境與先備知識）\n\n## 完整步驟\n1. 步驟一\n2. 步驟二\n（依此類推，每步說明清楚）\n\n## 注意事項\n（容易出錯或需要特別注意的地方）\n\n## 常見問題 Q&A`,
          placeholders: 'content',
          is_active: true,
          description: '技術步驟與操作指引模板',
        },
      ];

      for (const t of defaultTemplates) {
        await AiPromptTemplate.create(t);
      }
      console.log('✅ Default AI Prompt Templates seeded.');
    } else {
      console.log('-> AI Prompt Templates already exist, skip.');
    }

    console.log('🌱 AI Seeding completed successfully!\n');
  } catch (error) {
    console.error('❌ AI Seeding failed:', error);
  }
}

// Allow running this script directly
if (require.main === module) {
  const { initKBPool, closeAllPools } = require('../config/db');
  const { sequelize } = require('../models');

  (async () => {
    try {
      await initKBPool();
      await sequelize.authenticate();
      // Ensure table sync before seeding if run independently
      await AiConfig.sync({ force: false });
      await AiPromptTemplate.sync({ force: false });
      await seedAiPrompts();
    } catch (err) {
      console.error(err);
    } finally {
      await closeAllPools();
    }
  })();
}

module.exports = { seedAiPrompts };
