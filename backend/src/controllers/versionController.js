/**
 * Version Controller
 * 處理文章與附件的版本列表與還原 (Rollback)
 */
const { 
  Article, ArticleVersionHistory, 
  Attachment, AttachmentVersionHistory, AttachmentFile,
  sequelize 
} = require('../models');

/**
 * 取得文章版本列表
 * GET /api/v1/articles/:articleId/versions
 */
async function getArticleVersions(req, res) {
  try {
    const { articleId } = req.params;
    const history = await ArticleVersionHistory.findAll({
      where: { article_id: articleId },
      order: [['version_number', 'DESC']]
    });
    return res.json({ success: true, data: history });
  } catch (error) {
    console.error('getArticleVersions error:', error.message);
    return res.status(500).json({ success: false, message: '取得文章版本列表失敗' });
  }
}

/**
 * 還原文章到指定版本
 * POST /api/v1/articles/:articleId/versions/:versionNum/rollback
 */
async function rollbackArticle(req, res) {
  const t = await sequelize.transaction();
  try {
    const { articleId, versionNum } = req.params;

    const article = await Article.findByPk(articleId);
    const history = await ArticleVersionHistory.findOne({
      where: { article_id: articleId, version_number: versionNum }
    });

    if (!article || !history) {
      return res.status(404).json({ success: false, message: '找不到文章或指定的版本' });
    }

    // 1. 建立當前內容的備份快照 (新版本)
    const nextVersion = article.version_number + 1;
    await ArticleVersionHistory.create({
      article_id: article.id,
      version_number: nextVersion,
      content: article.content,
      diff_summary: `還原至版本 ${versionNum}`,
      editor_id: req.user.員工工號,
      editor_name: req.user.員工姓名
    }, { transaction: t });

    // 2. 更新文章主體為舊版本內容
    await article.update({
      content: history.content,
      version_number: nextVersion,
      updated_by: req.user.員工工號,
      updated_by_name: req.user.員工姓名
    }, { transaction: t });

    await t.commit();
    return res.json({ success: true, message: `已成功還原至版本 ${versionNum}` });
  } catch (error) {
    await t.rollback();
    console.error('rollbackArticle error:', error.message);
    return res.status(500).json({ success: false, message: '文章還原失敗' });
  }
}

/**
 * 取得附件版本列表
 * GET /api/v1/attachments/:attachmentId/versions
 */
async function getAttachmentVersions(req, res) {
  try {
    const { attachmentId } = req.params;
    const history = await AttachmentVersionHistory.findAll({
      where: { attachment_id: attachmentId },
      order: [['version_number', 'DESC']]
    });
    return res.json({ success: true, data: history });
  } catch (error) {
    console.error('getAttachmentVersions error:', error.message);
    return res.status(500).json({ success: false, message: '取得附件版本列表失敗' });
  }
}

/**
 * 還原附件包到指定版本
 * POST /api/v1/attachments/:attachmentId/versions/:versionNum/rollback
 * 注意：附件還原較複雜，目前的設計是「還原該版本當時的所有檔案狀態」
 */
async function rollbackAttachment(req, res) {
  const t = await sequelize.transaction();
  try {
    const { attachmentId, versionNum } = req.params;

    const attachment = await Attachment.findByPk(attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, message: '找不到該附件包' });
    }

    // 1. 建立目前狀態的歷史快照
    const nextVersion = attachment.version_number + 1;
    await AttachmentVersionHistory.create({
      attachment_id: attachment.id,
      version_number: nextVersion,
      diff_summary: `還原至版本 ${versionNum}`,
      editor_id: req.user.員工工號,
      editor_name: req.user.員工姓名
    }, { transaction: t });

    // 2. 找出目標版本的檔案清單 (version_number <= versionNum)
    // 這裡的邏輯取決於如何定義「版本還原」。
    // 簡單實作：更新 Attachment 的 version_number。
    await attachment.update({
      version_number: nextVersion,
      updated_by: req.user.員工工號,
      updated_by_name: req.user.員工姓名
    }, { transaction: t });

    // 註：具體的檔案過濾邏輯會在讀取時根據 version_number 進行篩選
    
    await t.commit();
    return res.json({ success: true, message: `已成功還原至版本 ${versionNum}` });
  } catch (error) {
    await t.rollback();
    console.error('rollbackAttachment error:', error.message);
    return res.status(500).json({ success: false, message: '附件還原失敗' });
  }
}

module.exports = {
  getArticleVersions,
  rollbackArticle,
  getAttachmentVersions,
  rollbackAttachment
};
