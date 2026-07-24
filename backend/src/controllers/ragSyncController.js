/**
 * RAG Sync Controller
 * 1) 管理端：排程設定 / 比對狀態 / Log / 手動執行 / 全量校驗
 * 2) AiRAG 對外內容端點：供 AiRAG 拉取文章 Markdown 全文 / 附件檔案二進位
 * 見 docs/DevelopmentProcess/RAG_SYNC_PLAN.md 4.4 節
 */
const fs   = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { Article, Attachment, AttachmentFile, RagSyncStatus, RagSyncLog, Tag, Directory } = require('../models');
const ragSyncService = require('../services/ragSyncService');
const { normalizeAccessMembers } = require('../helpers/accessHelper');

// ════════════════════════════════════════════════════════════
// 管理端 API（🔐👑 ADMIN）
// ════════════════════════════════════════════════════════════

function safeParseSummary(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function getConfig(req, res) {
  try {
    const config = await ragSyncService.getOrCreateConfig();
    return res.json({
      success: true,
      data: {
        cronExpression: config.cron_expression,
        isEnabled:      config.is_enabled,
        batchSize:      config.batch_size,
        lastRunAt:      config.last_run_at,
        lastRunSummary: safeParseSummary(config.last_run_summary),
      },
    });
  } catch (error) {
    console.error('ragSync getConfig error:', error.message);
    return res.status(500).json({ success: false, message: '取得排程設定失敗' });
  }
}

async function updateConfig(req, res) {
  try {
    const { cronExpression, isEnabled, batchSize } = req.body;
    const config = await ragSyncService.getOrCreateConfig();

    await config.update({
      cron_expression: cronExpression ?? config.cron_expression,
      is_enabled:      isEnabled ?? config.is_enabled,
      batch_size:      batchSize ?? config.batch_size,
      updated_by:       req.user.員工工號,
    });

    await ragSyncService.rescheduleCron();

    return res.json({
      success: true,
      data: {
        cronExpression: config.cron_expression,
        isEnabled:      config.is_enabled,
        batchSize:      config.batch_size,
      },
    });
  } catch (error) {
    console.error('ragSync updateConfig error:', error.message);
    return res.status(500).json({ success: false, message: '更新排程設定失敗' });
  }
}

async function getStatusList(req, res) {
  try {
    const page     = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const { status, sourceType, keyword } = req.query;

    const where = {};
    if (status)     where.status = status;
    if (sourceType) where.source_type = sourceType;
    if (keyword)    where.title = { [Op.like]: `%${keyword}%` };

    const { rows, count } = await RagSyncStatus.findAndCountAll({
      where,
      order: [['updated_at', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    return res.json({
      success: true,
      data: {
        items: rows,
        total: count,
        page,
        pageSize,
      },
    });
  } catch (error) {
    console.error('ragSync getStatusList error:', error.message);
    return res.status(500).json({ success: false, message: '取得比對狀態列表失敗' });
  }
}

async function executeManual(req, res) {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: '請提供要執行的項目' });
    }
    const results = await ragSyncService.executeManual(items);
    return res.json({ success: true, data: results });
  } catch (error) {
    console.error('ragSync executeManual error:', error.message);
    return res.status(500).json({ success: false, message: '手動執行失敗' });
  }
}

async function getLogs(req, res) {
  try {
    const page     = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const { stage, level, startDate, endDate } = req.query;

    const where = {};
    if (stage) where.stage = stage;
    if (level) where.level = level;
    if (startDate || endDate) {
      where.occurred_at = {};
      if (startDate) where.occurred_at[Op.gte] = new Date(startDate);
      if (endDate)   where.occurred_at[Op.lte] = new Date(endDate);
    }

    const { rows, count } = await RagSyncLog.findAndCountAll({
      where,
      order: [['occurred_at', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    return res.json({
      success: true,
      data: { items: rows, total: count, page, pageSize },
    });
  } catch (error) {
    console.error('ragSync getLogs error:', error.message);
    return res.status(500).json({ success: false, message: '取得同步日誌失敗' });
  }
}

async function runAudit(req, res) {
  // 立即回應，實際校驗在背景執行（可能耗時，視文件量而定）
  res.json({ success: true, message: '全量校驗已開始執行' });
  try {
    await ragSyncService.runFullAudit();
  } catch (error) {
    console.error('ragSync runAudit background error:', error.message);
  }
}

// ════════════════════════════════════════════════════════════
// AiRAG 對外內容端點（🔑 X-RAG-Sync-Key）
// ════════════════════════════════════════════════════════════

async function getArticleContent(req, res) {
  try {
    const { id } = req.params;
    const article = await Article.findByPk(id, {
      include: [{ model: Tag, through: { attributes: [] }, as: 'Tags' }],
    });

    if (!article || !article.is_published) {
      return res.status(404).json({ success: false, message: '找不到文章或文章尚未上架' });
    }

    // 所屬目錄（class）：文章捷徑節點的父層目錄 label
    const dirNodes = await Directory.findAll({
      where: { article_id: article.id, type: 'article' },
      attributes: ['parent_id'],
    });
    const parentDirs = dirNodes.length
      ? await Directory.findAll({ where: { id: dirNodes.map(d => d.parent_id) }, attributes: ['label'] })
      : [];

    // 關聯附件（links_to）
    const linkedAttachments = await article.getAttachments({ attributes: ['title'] });

    return res.json({
      appId:   'kb',
      docType: 'article',
      sourceId: article.id,
      title:   article.title,
      content: article.content,
      version: article.version_number,
      updatedAt: article.updated_at,
      tags:    article.Tags.map(t => t.name),
      class:   parentDirs.map(d => d.label),
      linksTo: linkedAttachments.map(a => a.title),
      permissions: {
        isPublic:      article.is_public,
        accessDept:    article.access_dept || null,
        accessLevel:   article.access_level ?? null,
        accessMembers: normalizeAccessMembers(article.access_members),
      },
    });
  } catch (error) {
    console.error('ragSync getArticleContent error:', error.message);
    return res.status(500).json({ success: false, message: '取得文章內容失敗' });
  }
}

async function getAttachmentFileContent(req, res) {
  try {
    const { id } = req.params;
    const file = await AttachmentFile.findByPk(id);
    if (!file) {
      return res.status(404).json({ success: false, message: '找不到該附件檔案' });
    }

    const attachment = await Attachment.findByPk(file.attachment_id);
    if (!attachment || !attachment.is_published) {
      return res.status(404).json({ success: false, message: '找不到附件或附件尚未上架' });
    }

    const filePath = path.isAbsolute(file.storage_path)
      ? file.storage_path
      : path.join(process.cwd(), file.storage_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '實體檔案不存在' });
    }

    const tags = await attachment.getTags({ attributes: ['name'] });

    // 所屬目錄（class）：附件捷徑節點的父層目錄 label
    const dirNodes = await Directory.findAll({
      where: { attachment_id: attachment.id, type: 'attachment' },
      attributes: ['parent_id'],
    });
    const parentDirs = dirNodes.length
      ? await Directory.findAll({ where: { id: dirNodes.map(d => d.parent_id) }, attributes: ['label'] })
      : [];

    // 關聯文章（links_to）
    const linkedArticles = await attachment.getArticles({ attributes: ['title'] });

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('X-Doc-App-Id', 'kb');
    res.setHeader('X-Doc-Version', String(attachment.version_number));
    res.setHeader('X-Doc-Updated-At', new Date(attachment.updated_at).toISOString());
    res.setHeader('X-Doc-Is-Public', String(attachment.is_public));
    res.setHeader('X-Doc-Access-Dept', attachment.access_dept || '');
    res.setHeader('X-Doc-Access-Level', attachment.access_level === null || attachment.access_level === undefined ? '' : String(attachment.access_level));
    res.setHeader('X-Doc-Access-Members', JSON.stringify(normalizeAccessMembers(attachment.access_members)));
    // 中文字元需 encodeURIComponent，避免 HTTP header 非 ASCII 字元問題，AiRAG 端需對應 unquote 解碼
    res.setHeader('X-Doc-Tags', encodeURIComponent(JSON.stringify(tags.map(t => t.name))));
    res.setHeader('X-Doc-Class', encodeURIComponent(JSON.stringify(parentDirs.map(d => d.label))));
    res.setHeader('X-Doc-Links-To', encodeURIComponent(JSON.stringify(linkedArticles.map(a => a.title))));

    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('ragSync getAttachmentFileContent error:', error.message);
    return res.status(500).json({ success: false, message: '取得附件內容失敗' });
  }
}

module.exports = {
  getConfig,
  updateConfig,
  getStatusList,
  executeManual,
  getLogs,
  runAudit,
  getArticleContent,
  getAttachmentFileContent,
};
