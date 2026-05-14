/**
 * Article Controller
 */
const {
  Article, Tag, ArticleEditor, ArticleVersionHistory,
  Directory, sequelize
} = require('../models');
const { canAccess } = require('../helpers/accessHelper');
const { Op } = require('sequelize');

// ── 取得文章列表 ──────────────────────────────────────────────
async function getAllArticles(req, res) {
  try {
    const articles = await Article.findAll({
      include: [
        { model: Tag,           through: { attributes: [] }, as: 'Tags' },
        { model: ArticleEditor, attributes: ['editor_account'], as: 'Editors' },
      ],
      order: [['updated_at', 'DESC']],
    });

    const filtered = articles.filter(article => {
      if (!article.is_published && req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
        const isEditor = article.Editors.some(e => e.editor_account === req.user.員工工號);
        if (!isEditor) return false;
      }
      return canAccess(req.user, article);
    });

    // B-03: 批次查詢每篇文章的 directoryIds（該文章所在目錄的 parent_id）
    const articleIds = filtered.map(a => a.id);
    const allDirNodes = articleIds.length
      ? await Directory.findAll({
          where: { article_id: articleIds, type: 'article' },
          attributes: ['article_id', 'parent_id'],
        })
      : [];

    const dirMap = {};
    allDirNodes.forEach(d => {
      if (!dirMap[d.article_id]) dirMap[d.article_id] = [];
      dirMap[d.article_id].push(d.parent_id);
    });

    filtered.forEach(a => a.setDataValue('directoryIds', dirMap[a.id] || []));

    return res.json({ success: true, data: filtered });
  } catch (error) {
    console.error('getAllArticles error:', error.message);
    return res.status(500).json({ success: false, message: '取得文章列表失敗' });
  }
}

// ── 取得單篇文章 ──────────────────────────────────────────────
async function getArticleById(req, res) {
  try {
    const { id }      = req.params;
    const { version } = req.query;

    const article = await Article.findByPk(id, {
      include: [
        { model: Tag,           through: { attributes: [] }, as: 'Tags' },
        { model: ArticleEditor, attributes: ['editor_account'], as: 'Editors' },
      ],
    });

    if (!article) {
      return res.status(404).json({ success: false, message: '找不到該文章' });
    }
    if (!canAccess(req.user, article)) {
      return res.status(403).json({ success: false, message: '您無權存取此文章' });
    }

    // 指定版本：用歷史快照的 content 覆蓋
    if (version) {
      const history = await ArticleVersionHistory.findOne({
        where: { article_id: id, version_number: version },
      });
      if (history) {
        article.setDataValue('content', history.content);
        article.setDataValue('requested_version', Number(version));
      }
    }

    // B-03: 補上該文章所在目錄的 parent_id 陣列
    const dirNodes = await Directory.findAll({
      where: { article_id: id, type: 'article' },
      attributes: ['parent_id'],
    });
    article.setDataValue('directoryIds', dirNodes.map(d => d.parent_id));

    return res.json({ success: true, data: article });
  } catch (error) {
    console.error('getArticleById error:', error.message);
    return res.status(500).json({ success: false, message: '取得文章失敗' });
  }
}

// ── 全文搜尋 ──────────────────────────────────────────────────
async function searchArticles(req, res) {
  try {
    const { q, tags } = req.query;
    const where       = { is_published: true };

    if (q) {
      where[Op.or] = [
        { title:   { [Op.like]: `%${q}%` } },
        { content: { [Op.like]: `%${q}%` } },
      ];
    }

    const include = [{ model: Tag, through: { attributes: [] }, as: 'Tags' }];
    if (tags) {
      const tagIds  = tags.split(',').map(i => parseInt(i));
      include[0].where = { id: { [Op.in]: tagIds } };
    }

    const articles = await Article.findAll({ where, include });
    const filtered = articles.filter(a => canAccess(req.user, a));

    return res.json({ success: true, data: filtered });
  } catch (error) {
    console.error('searchArticles error:', error.message);
    return res.status(500).json({ success: false, message: '搜尋文章失敗' });
  }
}

// ── 新增文章 ──────────────────────────────────────────────────
async function createArticle(req, res) {
  const t = await sequelize.transaction();
  try {
    const {
      title, content, isPublished, isPublic,
      accessDept, accessMembers, accessLevel,
      tagIds, editorAccounts, attachmentIds, directoryIds,
    } = req.body;

    // 1. 建立文章主表（version_number 預設為 1）
    const article = await Article.create({
      title,
      content,
      is_published:  isPublished,
      is_public:     isPublic,
      access_dept:   accessDept,
      access_members: Array.isArray(accessMembers) ? JSON.stringify(accessMembers) : accessMembers,
      access_level:  accessLevel,
      version_number: 1,
      created_by:    req.user.員工工號,
      created_by_name: req.user.員工姓名,
      updated_by:    req.user.員工工號,
      updated_by_name: req.user.員工姓名,
    }, { transaction: t });

    // FIX T-31：建立時即儲存版本 1 快照
    await ArticleVersionHistory.create({
      article_id:     article.id,
      version_number: 1,
      content:        content,
      diff_summary:   '初始版本',
      editor_id:      req.user.員工工號,
      editor_name:    req.user.員工姓名,
    }, { transaction: t });

    // 2. 標籤
    if (tagIds?.length > 0) {
      await article.setTags(tagIds, { transaction: t });
    }

    // 3. 編輯者
    if (editorAccounts?.length > 0) {
      await ArticleEditor.bulkCreate(
        editorAccounts.map(acc => ({ article_id: article.id, editor_account: acc })),
        { transaction: t }
      );
    }

    // 4. 附件關聯
    if (attachmentIds?.length > 0) {
      await article.setAttachments(attachmentIds, { transaction: t });
    }

    // 5. 目錄捷徑節點
    if (directoryIds?.length > 0) {
      await Directory.bulkCreate(
        directoryIds.map(dirId => ({
          id:         `art-${article.id}-${dirId}`,
          parent_id:  dirId,
          type:       'article',
          label:      title,
          article_id: article.id,
          is_public:  isPublic,
          sort_order: 999,
        })),
        { transaction: t }
      );
    }

    await t.commit();
    return res.status(201).json({ success: true, data: article });
  } catch (error) {
    await t.rollback();
    console.error('createArticle error:', error.message);
    return res.status(500).json({ success: false, message: '建立文章失敗' });
  }
}

// ── 更新文章 ──────────────────────────────────────────────────
async function updateArticle(req, res) {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const {
      title, content, isPublished, isPublic,
      accessDept, accessMembers, accessLevel,
      tagIds, editorAccounts, attachmentIds, directoryIds, changeNote,
    } = req.body;

    const article = await Article.findByPk(id, {
      include: [{ model: ArticleEditor, as: 'Editors' }],
    });

    if (!article) {
      return res.status(404).json({ success: false, message: '文章不存在' });
    }

    const isEditor  = article.Editors.some(e => e.editor_account === req.user.員工工號);
    const isCreator = article.created_by === req.user.員工工號;
    if (!isCreator && !isEditor && req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
      return res.status(403).json({ success: false, message: '您無權修改此文章' });
    }

    // FIX T-31：版本快照邏輯
    const currentVersion = article.version_number;
    const nextVersion    = currentVersion + 1;

    await ArticleVersionHistory.create({
      article_id:     article.id,
      version_number: currentVersion,
      content:        article.content,
      diff_summary:   changeNote || '更新內容',
      editor_id:      req.user.員工工號,
      editor_name:    req.user.員工姓名,
    }, { transaction: t });

    await article.update({
      title,
      content,
      is_published:  isPublished,
      is_public:     isPublic,
      access_dept:   accessDept,
      access_members: Array.isArray(accessMembers) ? JSON.stringify(accessMembers) : accessMembers,
      access_level:  accessLevel,
      version_number: nextVersion,
      updated_by:    req.user.員工工號,
      updated_by_name: req.user.員工姓名,
    }, { transaction: t });

    if (tagIds) {
      await article.setTags(tagIds, { transaction: t });
    }

    if (editorAccounts) {
      await ArticleEditor.destroy({ where: { article_id: id }, transaction: t });
      await ArticleEditor.bulkCreate(
        editorAccounts.map(acc => ({ article_id: id, editor_account: acc })),
        { transaction: t }
      );
    }

    if (attachmentIds) {
      await article.setAttachments(attachmentIds, { transaction: t });
    }

    // B-03: 同步目錄捷徑節點
    // 先更新既有節點的 label / is_public
    await Directory.update(
      { label: title, is_public: isPublic },
      { where: { article_id: id }, transaction: t }
    );

    // 若 directoryIds 有傳入，同步新增/移除目錄節點
    if (directoryIds) {
      const existingNodes = await Directory.findAll({
        where: { article_id: id, type: 'article' },
        attributes: ['id', 'parent_id'],
        transaction: t,
      });
      const existingParentIds = existingNodes.map(n => n.parent_id);

      // 新增不存在的目錄節點
      const toAdd = directoryIds.filter(pid => !existingParentIds.includes(pid));
      if (toAdd.length > 0) {
        await Directory.bulkCreate(
          toAdd.map(dirId => ({
            id:         `art-${id}-${dirId}`,
            parent_id:  dirId,
            type:       'article',
            label:      title,
            article_id: id,
            is_public:  isPublic,
            sort_order: 999,
          })),
          { transaction: t, ignoreDuplicates: true }
        );
      }

      // 移除已取消勾選的目錄節點
      const toRemove = existingParentIds.filter(pid => !directoryIds.includes(pid));
      if (toRemove.length > 0) {
        await Directory.destroy({
          where: { article_id: id, type: 'article', parent_id: toRemove },
          transaction: t,
        });
      }
    }

    await t.commit();
    return res.json({ success: true, data: article });
  } catch (error) {
    await t.rollback();
    console.error('updateArticle error:', error.message);
    return res.status(500).json({ success: false, message: '更新文章失敗' });
  }
}

// ── 圖片上傳 ──────────────────────────────────────────────────
async function uploadImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '未上傳檔案' });
    }
    const url = `/uploads/images/${req.file.filename}`;
    return res.json({ success: true, url });
  } catch (error) {
    console.error('uploadImage error:', error.message);
    return res.status(500).json({ success: false, message: '圖片上傳失敗' });
  }
}

module.exports = {
  getAllArticles,
  getArticleById,
  searchArticles,
  createArticle,
  updateArticle,
  uploadImage,
};
