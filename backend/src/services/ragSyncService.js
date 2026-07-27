/**
 * ragSyncService
 * KB ↔ AiRAG ↔ Qdrant 同步核心邏輯
 * 見 docs/DevelopmentProcess/RAG_SYNC_PLAN.md 2、3 節 / TASK-S4
 */
const cron = require('node-cron');
const { Op } = require('sequelize');
const {
  RagSyncStatus, RagSyncConfig, RagSyncLog,
  Article, Attachment, AttachmentFile,
} = require('../models');
const qdrantService     = require('./qdrantService');
const aiRagIngestClient = require('./aiRagIngestClient');
const { SYNCABLE_MIME_TYPES } = require('../helpers/fileTypeHelper');
const { normalizeAccessMembers } = require('../helpers/accessHelper');

let cronTask = null;

// ── Log helper ──────────────────────────────────────────────────
async function logEvent({ sourceType = null, sourceId = null, stage, level = 'error', message }) {
  try {
    await RagSyncLog.create({
      source_type: sourceType,
      source_id:   sourceId,
      stage,
      level,
      message: String(message).slice(0, 4000),
    });
  } catch (err) {
    console.error('ragSyncService.logEvent failed:', err.message);
  }
}

// ── 排程設定（固定單筆列，沒有就建立預設值）──────────────────
async function getOrCreateConfig() {
  let config = await RagSyncConfig.findOne();
  if (!config) {
    config = await RagSyncConfig.create({});
  }
  return config;
}

// ── 取得資源目前狀態（文章 / 附件檔案）───────────────────────
// 附件比對基準用父層 Attachment（version_number / is_published / 權限欄位），
// 因為權限欄位只存在 Attachment 上，見 RAG_SYNC_PLAN.md 9.1 節
async function getResourceContext(sourceType, sourceId) {
  if (sourceType === 'article') {
    const article = await Article.findByPk(sourceId);
    if (!article) return null;
    return {
      title: article.title,
      version: article.version_number,
      isPublished: article.is_published,
      parentAttachmentId: null,
      permissions: {
        isPublic:      article.is_public,
        accessDept:    article.access_dept || null,
        accessLevel:   article.access_level ?? null,
        accessMembers: normalizeAccessMembers(article.access_members),
      },
    };
  }

  if (sourceType === 'attachment_file') {
    const file = await AttachmentFile.findByPk(sourceId);
    if (!file) return null;
    const attachment = await Attachment.findByPk(file.attachment_id);
    if (!attachment) return null;
    return {
      title: file.name,
      version: attachment.version_number,
      isPublished: attachment.is_published,
      parentAttachmentId: attachment.id,
      permissions: {
        isPublic:      attachment.is_public,
        accessDept:    attachment.access_dept || null,
        accessLevel:   attachment.access_level ?? null,
        accessMembers: normalizeAccessMembers(attachment.access_members),
      },
    };
  }

  return null;
}

// ── rag_sync_status upsert（title/parentAttachmentId 未提供時保留原值）──
async function upsertStatusRow({ sourceType, sourceId, parentAttachmentId, title, version, status, triggeredBy }) {
  let row = await RagSyncStatus.findOne({ where: { source_type: sourceType, source_id: sourceId } });

  const payload = { status, target_version: version ?? null, triggered_by: triggeredBy };
  if (parentAttachmentId !== undefined) payload.parent_attachment_id = parentAttachmentId;
  if (title !== undefined && title !== null) payload.title = title;

  if (row) {
    await row.update(payload);
  } else {
    row = await RagSyncStatus.create({
      source_type: sourceType,
      source_id:   sourceId,
      parent_attachment_id: parentAttachmentId ?? null,
      title: title ?? null,
      status,
      target_version: version ?? null,
      triggered_by: triggeredBy,
    });
  }
  return row;
}

// ── 下架：狀態轉 unpublished_kept，直接刪 Qdrant point ────────
async function handleUnpublish(sourceType, sourceId, ctx, triggeredBy = 'auto_update') {
  await upsertStatusRow({
    sourceType, sourceId,
    parentAttachmentId: ctx?.parentAttachmentId ?? null,
    title: ctx?.title,
    version: null,
    status: 'unpublished_kept',
    triggeredBy,
  });
  try {
    await qdrantService.deletePointsByDoc(sourceType, sourceId);
  } catch (err) {
    await logEvent({ sourceType, sourceId, stage: 'notify', level: 'warning', message: `Qdrant 刪除失敗: ${err.message}` });
  }
}

// ── 永久刪除：狀態轉 unpublished_deleted（來源列已不存在）────
async function handleHardDelete(sourceType, sourceId) {
  await upsertStatusRow({
    sourceType, sourceId,
    parentAttachmentId: null,
    version: null,
    status: 'unpublished_deleted',
    triggeredBy: 'auto_update',
  });
  try {
    await qdrantService.deletePointsByDoc(sourceType, sourceId);
  } catch (err) {
    await logEvent({ sourceType, sourceId, stage: 'notify', level: 'warning', message: `Qdrant 刪除失敗: ${err.message}` });
  }
}

// ── 對單一文件觸發一次同步（notifyChanged / 排程 / 手動 / 全量校驗共用）──
async function syncOne(sourceType, sourceId, triggeredBy) {
  const ctx = await getResourceContext(sourceType, sourceId);
  if (!ctx) {
    await logEvent({ sourceType, sourceId, stage: 'notify', level: 'warning', message: '來源資料不存在，略過同步' });
    return { ok: false, reason: 'not_found' };
  }
  if (!ctx.isPublished) {
    await handleUnpublish(sourceType, sourceId, ctx, triggeredBy);
    return { ok: false, reason: 'unpublished' };
  }

  const existing = await RagSyncStatus.findOne({ where: { source_type: sourceType, source_id: sourceId } });
  const row = await upsertStatusRow({
    sourceType, sourceId,
    parentAttachmentId: ctx.parentAttachmentId,
    title: ctx.title,
    version: ctx.version,
    status: existing ? 'outdated' : 'not_synced',
    triggeredBy,
  });

  try {
    await aiRagIngestClient.triggerIngest({
      docType: sourceType,
      sourceId,
      title: ctx.title,
      targetVersion: ctx.version,
      action: 'upsert',
      permissions: ctx.permissions,
    });
    await row.update({ last_checked_at: new Date(), error_message: null });
    return { ok: true };
  } catch (err) {
    await row.update({ status: 'failed', error_message: err.message, last_checked_at: new Date() });
    await logEvent({ sourceType, sourceId, stage: 'notify', level: 'error', message: err.message });
    return { ok: false, reason: 'trigger_failed' };
  }
}

// ── 即時觸發流程（文章/附件異動，2.2 節）──────────────────────
async function notifyChanged(sourceType, sourceId, action = 'upsert') {
  try {
    if (action === 'delete') {
      await handleHardDelete(sourceType, sourceId);
      return;
    }
    await syncOne(sourceType, sourceId, 'auto_update');
  } catch (err) {
    console.error('ragSyncService.notifyChanged error:', err.message);
    await logEvent({ sourceType, sourceId, stage: 'notify', level: 'error', message: err.message });
  }
}

// ── 建立缺漏的 rag_sync_status 列（已上架但尚未有列）──────────
async function createMissingStatusRows() {
  const existing = await RagSyncStatus.findAll({ attributes: ['source_type', 'source_id'] });
  const existingArticleIds = new Set(existing.filter(r => r.source_type === 'article').map(r => r.source_id));
  const existingFileIds    = new Set(existing.filter(r => r.source_type === 'attachment_file').map(r => r.source_id));

  const publishedArticles = await Article.findAll({
    where: { is_published: true },
    attributes: ['id', 'title', 'version_number'],
  });
  const missingArticles = publishedArticles.filter(a => !existingArticleIds.has(a.id));
  if (missingArticles.length) {
    await RagSyncStatus.bulkCreate(missingArticles.map(a => ({
      source_type: 'article', source_id: a.id, title: a.title,
      status: 'not_synced', target_version: a.version_number,
    })));
  }

  const publishedFiles = await AttachmentFile.findAll({
    where: { mime_type: { [Op.in]: SYNCABLE_MIME_TYPES } },
    include: [{ model: Attachment, where: { is_published: true }, attributes: ['id', 'version_number'] }],
  });
  const missingFiles = publishedFiles.filter(f => !existingFileIds.has(f.id));
  if (missingFiles.length) {
    await RagSyncStatus.bulkCreate(missingFiles.map(f => ({
      source_type: 'attachment_file', source_id: f.id,
      parent_attachment_id: f.attachment_id, title: f.name,
      status: 'not_synced', target_version: f.Attachment.version_number,
    })));
  }
}

// ── 2.1 節：排程比對流程（輕量版，只查 KB DB 本地狀態）───────
async function runScheduledCheck() {
  const config = await getOrCreateConfig();
  const summary = { checked: 0, triggered: 0, failed: 0 };

  try {
    await createMissingStatusRows();

    const rows = await RagSyncStatus.findAll({
      where: { status: { [Op.in]: ['not_synced', 'outdated', 'failed'] } },
      order: [['updated_at', 'ASC']],
      limit: config.batch_size || 20,
    });

    for (const row of rows) {
      summary.checked += 1;
      const result = await syncOne(row.source_type, row.source_id, 'schedule');
      if (result.ok) summary.triggered += 1;
      else if (result.reason === 'trigger_failed') summary.failed += 1;
    }
  } catch (err) {
    console.error('runScheduledCheck error:', err.message);
    await logEvent({ stage: 'compare', level: 'error', message: err.message });
  } finally {
    await config.update({ last_run_at: new Date(), last_run_summary: JSON.stringify(summary) });
  }

  return summary;
}

// ── 2.5 節：全量校驗流程（管理員手動觸發，逐筆查 Qdrant）─────
async function runFullAudit() {
  const summary = { checked: 0, drifted: 0, captionFailed: 0 };

  try {
    const publishedArticles = await Article.findAll({
      where: { is_published: true },
      attributes: ['id', 'title', 'version_number'],
    });
    const publishedFiles = await AttachmentFile.findAll({
      where: { mime_type: { [Op.in]: SYNCABLE_MIME_TYPES } },
      include: [{ model: Attachment, where: { is_published: true }, attributes: ['id', 'version_number'] }],
    });

    const targets = [
      ...publishedArticles.map(a => ({
        sourceType: 'article', sourceId: a.id, title: a.title, version: a.version_number,
      })),
      ...publishedFiles.map(f => ({
        sourceType: 'attachment_file', sourceId: f.id, title: f.name,
        version: f.Attachment.version_number, parentAttachmentId: f.attachment_id,
      })),
    ];

    for (const t of targets) {
      summary.checked += 1;
      let meta = null;
      try {
        meta = await qdrantService.findPointMeta(t.sourceType, t.sourceId);
      } catch (err) {
        await logEvent({ sourceType: t.sourceType, sourceId: t.sourceId, stage: 'compare', level: 'error', message: err.message });
      }

      const drifted = !meta || Number(meta.version) !== Number(t.version);
      if (drifted) {
        summary.drifted += 1;
        const existing = await RagSyncStatus.findOne({ where: { source_type: t.sourceType, source_id: t.sourceId } });
        await upsertStatusRow({
          sourceType: t.sourceType, sourceId: t.sourceId,
          parentAttachmentId: t.parentAttachmentId, title: t.title, version: t.version,
          status: meta ? 'outdated' : 'not_synced',
          triggeredBy: existing?.triggered_by || 'schedule',
        });
        continue;
      }

      // 版本一致仍需檢查內嵌圖片描述是否有失敗段落。這類文件在 AiRAG 端是回報 completed 的，
      // 版本比對永遠看不出來，只能實際查 Qdrant 的圖片段落內容。
      let captionFailedCount = 0;
      try {
        captionFailedCount = await qdrantService.countFailedCaptions(t.sourceType, t.sourceId);
      } catch (err) {
        await logEvent({ sourceType: t.sourceType, sourceId: t.sourceId, stage: 'compare', level: 'warning', message: `圖片描述失敗段落查詢失敗: ${err.message}` });
      }

      if (captionFailedCount > 0) {
        summary.captionFailed += 1;
        await logEvent({
          sourceType: t.sourceType, sourceId: t.sourceId, stage: 'compare', level: 'warning',
          message: `「${t.title}」有 ${captionFailedCount} 個內嵌圖片段落的 AI 描述產生失敗，可指定執行切分重新產生`,
        });
      }

      // 不把描述失敗視為 drift：drift 會轉為 outdated 而被排程反覆重新觸發，
      // 若該圖片本來就無法描述成功會造成無限重試，故僅記錄數量與警告，由管理員決定是否重跑
      await RagSyncStatus.update(
        { last_checked_at: new Date(), caption_failed_count: captionFailedCount },
        { where: { source_type: t.sourceType, source_id: t.sourceId } }
      );
    }
  } catch (err) {
    console.error('runFullAudit error:', err.message);
    await logEvent({ stage: 'compare', level: 'error', message: err.message });
  }

  return summary;
}

// ── 手動指定項目重新執行 ──────────────────────────────────────
async function executeManual(items) {
  const results = [];
  for (const item of items || []) {
    const sourceType = item.sourceType || item.source_type;
    const sourceId   = Number(item.sourceId ?? item.source_id);
    const result = await syncOne(sourceType, sourceId, 'manual');
    results.push({ sourceType, sourceId, ...result });
  }
  return results;
}

// ── 供文章/附件列表附加 ragSyncStatus 欄位 ────────────────────
async function getStatusMap(sourceType, sourceIds) {
  if (!sourceIds || sourceIds.length === 0) return {};
  const rows = await RagSyncStatus.findAll({
    where: { source_type: sourceType, source_id: { [Op.in]: sourceIds } },
  });
  const map = {};
  rows.forEach(r => {
    map[r.source_id] = {
      status: r.status,
      targetVersion: r.target_version,
      lastSyncedVersion: r.last_synced_version,
      lastSyncedAt: r.last_synced_at,
      lastCheckedAt: r.last_checked_at,
      errorMessage: r.error_message,
    };
  });
  return map;
}

// ── 依 rag_sync_config 重新註冊 node-cron 排程 ────────────────
async function rescheduleCron() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }

  const config = await getOrCreateConfig();
  if (!config.is_enabled) {
    console.log('ragSyncService: 排程已停用（is_enabled=false）');
    return;
  }
  if (!cron.validate(config.cron_expression)) {
    console.error(`ragSyncService: cron 表達式無效 "${config.cron_expression}"，排程未啟用`);
    return;
  }

  cronTask = cron.schedule(config.cron_expression, () => {
    runScheduledCheck().catch(err => console.error('runScheduledCheck 執行失敗:', err.message));
  });
  console.log(`ragSyncService: 排程已註冊（${config.cron_expression}）`);
}

module.exports = {
  notifyChanged,
  runScheduledCheck,
  runFullAudit,
  executeManual,
  getStatusMap,
  rescheduleCron,
  getOrCreateConfig,
};
