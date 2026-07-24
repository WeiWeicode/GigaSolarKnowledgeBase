/**
 * Article Controller
 */
const {
  Article, Tag, ArticleEditor, ArticleVersionHistory,
  Directory, UserExtraDepartment, sequelize
} = require('../models');
const { canAccess } = require('../helpers/accessHelper');
const { Op } = require('sequelize');
const ragSyncService = require('../services/ragSyncService');

/**
 * 取得使用者的跨部門授權代碼清單
 * 供 canAccess 判斷跨部門存取權限使用
 */
async function getUserExtraDeptCodes(account) {
  const grants = await UserExtraDepartment.findAll({
    where: { account: String(account) },
    attributes: ['dept_code'],
  });
  return grants.map(g => g.dept_code);
}

/**
 * resolveTagIds
 * el-select allow-create 模式下，form.tagIds 可能混入字串（新標籤名稱）與數字（既有 tag id）。
 * 此 helper 統一解析：數字照用、字串則 findOrCreate 取得 id。
 * MSSQL 不支援在 transaction 中 INSERT IGNORE，所以先 findOrCreate 再 setTags。
 */
async function resolveTagIds(tagIds, transaction) {
  if (!tagIds?.length) return [];
  const resolved = await Promise.all(
    tagIds.map(async (tag) => {
      const isNumeric = typeof tag === 'number' || (typeof tag === 'string' && /^\d+$/.test(tag));
      if (isNumeric) return Number(tag);
      // 字串 = allow-create 新標籤名稱
      const [record] = await Tag.findOrCreate({
        where:    { name: String(tag).trim() },
        defaults: { name: String(tag).trim() },
        transaction,
      });
      return record.id;
    })
  );
  return resolved;
}

// ── 安全 rollback（MSSQL 發生錯誤後會自動回滾，再次 ROLLBACK 會拋 error 3903） ──
async function safeRollback(t) {
  try { await t.rollback(); } catch { /* MSSQL 已自動回滾，忽略 */ }
}

// ── 取得文章列表 ──────────────────────────────────────────────
async function getAllArticles(req, res) {
  try {
    const extraDeptCodes = await getUserExtraDeptCodes(req.user.員工工號);

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
      return canAccess(req.user, article, extraDeptCodes);
    });

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

    const ragStatusMap = await ragSyncService.getStatusMap('article', articleIds);
    filtered.forEach(a => a.setDataValue('ragSyncStatus', ragStatusMap[a.id] || null));

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
    const extraDeptCodes = await getUserExtraDeptCodes(req.user.員工工號);
    if (!canAccess(req.user, article, extraDeptCodes)) {
      return res.status(403).json({ success: false, message: '您無權存取此文章' });
    }

    if (version) {
      const history = await ArticleVersionHistory.findOne({
        where: { article_id: id, version_number: version },
      });
      if (history) {
        article.setDataValue('content', history.content);
        article.setDataValue('requested_version', Number(version));
      }
    }

    const dirNodes = await Directory.findAll({
      where: { article_id: id, type: 'article' },
      attributes: ['parent_id'],
    });
    article.setDataValue('directoryIds', dirNodes.map(d => d.parent_id));

    // BUG-025: 補上文章所屬部門代碼，供前端點進跨部門文章時自動切換目錄樹
    // getTree API 只回傳當前部門的節點，跨部門瀏覽時 getDirLabel 無法解析 directoryIds → 顯示 raw ID
    let deptCode = null;
    if (dirNodes.length > 0) {
      const parentDir = await Directory.findOne({
        where: { id: dirNodes[0].parent_id },
        attributes: ['dept_code'],
      });
      deptCode = parentDir?.dept_code || null;
    }
    article.setDataValue('deptCode', deptCode);

    // BUG-006: 補上關聯附件 id 陣列
    const linkedAttachments = await article.getAttachments({ attributes: ['id'] });
    article.setDataValue('attachmentIds', linkedAttachments.map(a => a.id));

    const ragStatusMap = await ragSyncService.getStatusMap('article', [article.id]);
    article.setDataValue('ragSyncStatus', ragStatusMap[article.id] || null);

    return res.json({ success: true, data: article });
  } catch (error) {
    console.error('getArticleById error:', error.message);
    return res.status(500).json({ success: false, message: '取得文章失敗' });
  }
}

// ── 全文搜尋 ──────────────────────────────────────────────────
async function searchArticles(req, res) {
  try {
    const { q, tags, scope, deptCode } = req.query;
    const where = { is_published: true };
    // 使用 Op.and 陣列累積條件，避免多個 Op.or 互相覆蓋
    const andConditions = [];

    if (q) {
      andConditions.push({
        [Op.or]: [
          { title:   { [Op.like]: `%${q}%` } },
          { content: { [Op.like]: `%${q}%` } },
        ],
      });
    }

    if (scope === 'public') {
      where.is_public = true;
    } else if (scope === 'dept') {
      where.is_public = false;
      // access_dept 為 NULL（職級/人員限制）或明確屬於此部門的私有內容均應納入
      // 再由 canAccess() 做最終存取判斷，防止跨部門資料外洩
      if (deptCode) {
        andConditions.push({
          [Op.or]: [
            { access_dept: deptCode },
            { access_dept: null },
            { access_dept: '' },   // MSSQL: 空字串 '' ≠ NULL，前端表單未設部門時存入 ''，需明確匹配
          ],
        });
      }
    }

    if (andConditions.length > 0) {
      where[Op.and] = andConditions;
    }

    const include = [{ model: Tag, through: { attributes: [] }, as: 'Tags' }];
    if (tags) {
      const tagIds = tags.split(',').map(i => parseInt(i));
      include[0].where = { id: { [Op.in]: tagIds } };
    }

    const articles = await Article.findAll({ where, include });
    const extraDeptCodes = await getUserExtraDeptCodes(req.user.員工工號);
    const filtered = articles.filter(a => canAccess(req.user, a, extraDeptCodes));

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

    // 1. 建立文章主表
    const article = await Article.create({
      title,
      content,
      is_published:   isPublished,
      is_public:      isPublic,
      access_dept:    accessDept || req.user.部門代碼,
      access_members: Array.isArray(accessMembers) ? JSON.stringify(accessMembers) : accessMembers,
      access_level:   accessLevel,
      version_number: 1,
      created_by:     req.user.員工工號,
      created_by_name: req.user.員工姓名,
      updated_by:     req.user.員工工號,
      updated_by_name: req.user.員工姓名,
    }, { transaction: t });

    // 2. 版本 1 快照
    await ArticleVersionHistory.create({
      article_id:     article.id,
      version_number: 1,
      content:        content,
      diff_summary:   '初始版本',
      editor_id:      req.user.員工工號,
      editor_name:    req.user.員工姓名,
    }, { transaction: t });

    // 3. 標籤（BUG-010: allow-create 字串名稱 → findOrCreate 解析為數字 id）
    if (tagIds?.length > 0) {
      const resolvedIds = await resolveTagIds(tagIds, t);
      await article.setTags(resolvedIds, { transaction: t });
    }

    // 4. 編輯者
    if (editorAccounts?.length > 0) {
      await ArticleEditor.bulkCreate(
        editorAccounts.map(acc => ({ article_id: article.id, editor_account: acc })),
        { transaction: t }
      );
    }

    // 5. 附件關聯
    if (attachmentIds?.length > 0) {
      await article.setAttachments(attachmentIds, { transaction: t });
    }

    // 6. 目錄捷徑節點
    if (directoryIds?.length > 0) {
      const parentDirs = await Directory.findAll({
        where: { id: directoryIds },
        attributes: ['id', 'dept_code'],
        transaction: t,
      });
      const deptCodeMap = {};
      parentDirs.forEach(d => { deptCodeMap[d.id] = d.dept_code; });

      await Directory.bulkCreate(
        directoryIds.map(dirId => ({
          id:         `art-${article.id}-${dirId}`,
          parent_id:  dirId,
          type:       'article',
          label:      title,
          article_id: article.id,
          is_public:  isPublic,
          dept_code:  deptCodeMap[dirId] || null,
          sort_order: 999,
        })),
        { transaction: t }
      );
    }

    await t.commit();

    ragSyncService.notifyChanged('article', article.id, 'upsert')
      .catch(err => console.error('RAG sync notify failed:', err.message));

    return res.status(201).json({ success: true, data: article });
  } catch (error) {
    // 先記錄原始錯誤，再安全 rollback（MSSQL 自動回滾後再呼叫 ROLLBACK 會拋 error 3903）
    console.error('createArticle error:', error.message);
    await safeRollback(t);
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

    // 版本快照（BUG-015：先查 history 最大版本號再 +1，避免 createArticle 已寫入 v1 後重複寫入）
    const maxHistoryVersion = await ArticleVersionHistory.max('version_number', {
      where: { article_id: article.id },
      transaction: t,
    }) || 0;
    const nextVersion = maxHistoryVersion + 1;

    await ArticleVersionHistory.create({
      article_id:     article.id,
      version_number: nextVersion,
      content:        content,        // 儲存本次更新後的新內容
      diff_summary:   changeNote || '更新內容',
      editor_id:      req.user.員工工號,
      editor_name:    req.user.員工姓名,
    }, { transaction: t });

    await article.update({
      title,
      content,
      is_published:   isPublished,
      is_public:      isPublic,
      access_dept:    accessDept || article.access_dept || req.user.部門代碼,
      access_members: Array.isArray(accessMembers) ? JSON.stringify(accessMembers) : accessMembers,
      access_level:   accessLevel,
      version_number: nextVersion,
      updated_by:     req.user.員工工號,
      updated_by_name: req.user.員工姓名,
    }, { transaction: t });

    // 標籤（BUG-010: allow-create 字串名稱 → findOrCreate）
    if (tagIds) {
      const resolvedIds = await resolveTagIds(tagIds, t);
      await article.setTags(resolvedIds, { transaction: t });
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

    // 目錄節點同步
    await Directory.update(
      { label: title, is_public: isPublic },
      { where: { article_id: id }, transaction: t }
    );

    if (directoryIds) {
      const existingNodes = await Directory.findAll({
        where: { article_id: id, type: 'article' },
        attributes: ['id', 'parent_id'],
        transaction: t,
      });
      const existingParentIds = existingNodes.map(n => n.parent_id);

      const toAdd = directoryIds.filter(pid => !existingParentIds.includes(pid));
      if (toAdd.length > 0) {
        const parentDirs = await Directory.findAll({
          where: { id: toAdd },
          attributes: ['id', 'dept_code'],
          transaction: t,
        });
        const deptCodeMap = {};
        parentDirs.forEach(d => { deptCodeMap[d.id] = d.dept_code; });

        await Directory.bulkCreate(
          toAdd.map(dirId => ({
            id:         `art-${id}-${dirId}`,
            parent_id:  dirId,
            type:       'article',
            label:      title,
            article_id: id,
            is_public:  isPublic,
            dept_code:  deptCodeMap[dirId] || null,
            sort_order: 999,
          })),
          { transaction: t }
        );
      }

      const toRemove = existingParentIds.filter(pid => !directoryIds.includes(pid));
      if (toRemove.length > 0) {
        await Directory.destroy({
          where: { article_id: id, type: 'article', parent_id: toRemove },
          transaction: t,
        });
      }
    }

    await t.commit();

    ragSyncService.notifyChanged('article', article.id, 'upsert')
      .catch(err => console.error('RAG sync notify failed:', err.message));

    return res.json({ success: true, data: article });
  } catch (error) {
    console.error('updateArticle error:', error.message);
    await safeRollback(t);
    return res.status(500).json({ success: false, message: '更新文章失敗' });
  }
}

// ── AI 建議標籤：新增標籤至文章（不覆蓋現有標籤）────────────
async function addTagsToArticle(req, res) {
  try {
    const { id } = req.params;
    const { tagNames } = req.body;

    if (!Array.isArray(tagNames) || tagNames.length === 0) {
      return res.status(400).json({ success: false, message: '請提供標籤名稱' });
    }

    const article = await Article.findByPk(id, {
      include: [{ model: ArticleEditor, as: 'Editors' }],
    });

    if (!article) {
      return res.status(404).json({ success: false, message: '文章不存在' });
    }

    const isEditor  = article.Editors.some(e => e.editor_account === req.user.員工工號);
    const isCreator = article.created_by === req.user.員工工號;
    if (!isCreator && !isEditor && req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
      return res.status(403).json({ success: false, message: '您無權修改此文章標籤' });
    }

    const tags = await Promise.all(
      tagNames.map(name =>
        Tag.findOrCreate({
          where:    { name: name.trim() },
          defaults: { name: name.trim() },
        }).then(([record]) => record)
      )
    );

    await article.addTags(tags);

    const updatedTags = await article.getTags();
    return res.json({
      success: true,
      data: updatedTags.map(t => ({ id: t.id, name: t.name })),
    });
  } catch (error) {
    console.error('addTagsToArticle error:', error.message);
    return res.status(500).json({ success: false, message: '新增標籤失敗' });
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
  addTagsToArticle,
  uploadImage,
};
