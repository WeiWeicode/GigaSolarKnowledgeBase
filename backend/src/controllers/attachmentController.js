/**
 * Attachment Controller
 */
const { Op } = require('sequelize');
const {
  Attachment, AttachmentFile, Tag, AttachmentEditor,
  AttachmentVersionHistory, Directory, Article, UserExtraDepartment, sequelize
} = require('../models');
const { canAccess } = require('../helpers/accessHelper');
const { v4: uuidv4 } = require('uuid');

/**
 * 取得使用者的跨部門授權代碼清單
 */
async function getUserExtraDeptCodes(account) {
  const grants = await UserExtraDepartment.findAll({
    where: { account: String(account) },
    attributes: ['dept_code'],
  });
  return grants.map(g => g.dept_code);
}

// MSSQL 在 transaction 內部錯誤後會自動回滾，再次 ROLLBACK 會拋 error 3903
async function safeRollback(t) {
  try { await t.rollback(); } catch { /* MSSQL 已自動回滾，忽略 */ }
}

/**
 * resolveTagIds - BUG-010/BUG-012 共用 helper
 * el-select allow-create 模式下， tagIds 可能混入字串名稱與數字 ID。
 * 字串 → Tag.findOrCreate，數字 → 直接使用。
 */
async function resolveTagIds(tagIds, transaction) {
  if (!tagIds?.length) return [];
  const resolved = await Promise.all(
    tagIds.map(async (tag) => {
      const isNumeric = typeof tag === 'number' || (typeof tag === 'string' && /^\d+$/.test(tag));
      if (isNumeric) return Number(tag);
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

// ── 取得附件包列表 ────────────────────────────────────────────
async function getAllAttachments(req, res) {
  try {
    const attachments = await Attachment.findAll({
      include: [
        { model: Tag,            through: { attributes: [] }, as: 'Tags' },
        { model: AttachmentEditor, attributes: ['editor_account'], as: 'Editors' },
        // B-04: 列表帶第一個檔案的名稱，供前端選取附件時顯示
        { model: AttachmentFile, attributes: ['name', 'uuid'], limit: 1, as: 'Files',
          order: [['id', 'ASC']] },
      ],
      order: [['updated_at', 'DESC']],
    });

    const extraDeptCodes = await getUserExtraDeptCodes(req.user.員工工號);

    const filtered = attachments.filter(att => {
      if (!att.is_published && req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
        const isEditor = att.Editors.some(e => e.editor_account === req.user.員工工號);
        if (!isEditor) return false;
      }
      return canAccess(req.user, att, extraDeptCodes);
    });

    // B-03: 批次查詢每個附件包的 directoryIds
    const attIds = filtered.map(a => a.id);
    const allDirNodes = attIds.length
      ? await Directory.findAll({
          where: { attachment_id: attIds, type: 'attachment' },
          attributes: ['attachment_id', 'parent_id'],
        })
      : [];

    const dirMap = {};
    allDirNodes.forEach(d => {
      if (!dirMap[d.attachment_id]) dirMap[d.attachment_id] = [];
      dirMap[d.attachment_id].push(d.parent_id);
    });

    filtered.forEach(a => a.setDataValue('directoryIds', dirMap[a.id] || []));

    return res.json({ success: true, data: filtered });
  } catch (error) {
    console.error('getAllAttachments error:', error.message);
    return res.status(500).json({ success: false, message: '取得附件列表失敗' });
  }
}

// ── 全文搜尋 ──────────────────────────────────────────────────
async function searchAttachments(req, res) {
  try {
    const { q, tags, scope, deptCode } = req.query;
    const where = { is_published: true };
    // 使用 Op.and 陣列累積條件，避免多個 Op.or 互相覆蓋
    const andConditions = [];

    if (q) {
      andConditions.push({
        [Op.or]: [
          { title:       { [Op.like]: `%${q}%` } },
          { description: { [Op.like]: `%${q}%` } },
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

    const attachments = await Attachment.findAll({ where, include });
    const extraDeptCodes = await getUserExtraDeptCodes(req.user.員工工號);
    const filtered = attachments.filter(a => canAccess(req.user, a, extraDeptCodes));

    return res.json({ success: true, data: filtered });
  } catch (error) {
    console.error('searchAttachments error:', error.message);
    return res.status(500).json({ success: false, message: '搜尋附件失敗' });
  }
}

// ── 取得單一附件包 ────────────────────────────────────────────
async function getAttachmentById(req, res) {
  try {
    const { id } = req.params;
    const attachment = await Attachment.findByPk(id, {
      include: [
        { model: AttachmentFile, as: 'Files' },
        { model: Tag,            through: { attributes: [] }, as: 'Tags' },
        { model: AttachmentEditor, attributes: ['editor_account'], as: 'Editors' },
      ],
    });

    if (!attachment) {
      return res.status(404).json({ success: false, message: '找不到該附件包' });
    }
    const extraDeptCodes = await getUserExtraDeptCodes(req.user.員工工號);
    if (!canAccess(req.user, attachment, extraDeptCodes)) {
      return res.status(403).json({ success: false, message: '您無權存取此附件' });
    }

    // B-03: 補上所在目錄的 parent_id 陣列
    const dirNodes = await Directory.findAll({
      where: { attachment_id: id, type: 'attachment' },
      attributes: ['parent_id'],
    });
    attachment.setDataValue('directoryIds', dirNodes.map(d => d.parent_id));

    // 補上關聯文章 id 陣列
    const linkedArticles = await attachment.getArticles({ attributes: ['id'] });
    attachment.setDataValue('linkedArticleIds', linkedArticles.map(a => a.id));

    return res.json({ success: true, data: attachment });
  } catch (error) {
    console.error('getAttachmentById error:', error.message);
    return res.status(500).json({ success: false, message: '取得附件包失敗' });
  }
}

// ── 批次上傳檔案（不寫 DB，回傳 FileInfo） ────────────────────
async function uploadFiles(req, res) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: '未上傳檔案' });
    }

    const fileInfos = req.files.map(file => ({
      uuid:         uuidv4(),
      // BUG-004: multer 以 latin1 讀取 originalname，中文 UTF-8 檔名需轉碼
      name:         Buffer.from(file.originalname, 'latin1').toString('utf8'),
      size:         file.size,
      mime_type:    file.mimetype,
      storage_path: file.path,
      url:          `/uploads/attachments/${file.filename}`,
    }));

    return res.json({ success: true, data: fileInfos });
  } catch (error) {
    console.error('uploadFiles error:', error.message);
    return res.status(500).json({ success: false, message: '檔案上傳失敗' });
  }
}

// ── 新增附件包 ────────────────────────────────────────────────
async function createAttachment(req, res) {
  const t = await sequelize.transaction();
  try {
    const {
      title, description, isPublished, isPublic,
      accessDept, accessMembers, accessLevel,
      tagIds, editorAccounts,
      // 前端傳 linkedArticleIds，後端接受兩種名稱
      linkedArticleIds, articleIds,
      files, directoryIds,
    } = req.body;

    const relatedArticleIds = linkedArticleIds || articleIds || [];

    // 1. 建立主表
    const attachment = await Attachment.create({
      title,
      description,
      is_published:  isPublished,
      is_public:     isPublic,
      access_dept:   accessDept,
      access_members: Array.isArray(accessMembers) ? JSON.stringify(accessMembers) : accessMembers,
      access_level:  accessLevel,
      created_by:    req.user.員工工號,
      created_by_name: req.user.員工姓名,
      updated_by:    req.user.員工工號,
      updated_by_name: req.user.員工姓名,
    }, { transaction: t });

    // 2. 檔案（version_number = 1）
    if (files?.length > 0) {
      await AttachmentFile.bulkCreate(
        files.map(f => ({ ...f, attachment_id: attachment.id, version_number: 1 })),
        { transaction: t }
      );
    }

    // 3. 標籤（BUG-012: allow-create 字串名稱 → findOrCreate）
    if (tagIds?.length > 0) {
      const resolvedIds = await resolveTagIds(tagIds, t);
      await attachment.setTags(resolvedIds, { transaction: t });
    }

    // 4. 編輯者
    if (editorAccounts?.length > 0) {
      await AttachmentEditor.bulkCreate(
        editorAccounts.map(acc => ({ attachment_id: attachment.id, editor_account: acc })),
        { transaction: t }
      );
    }

    // 5. 文章關聯
    if (relatedArticleIds.length > 0) {
      await attachment.setArticles(relatedArticleIds, { transaction: t });
    }

    // 6. 目錄捷徑節點（BUG-003 修正：加入 dept_code，讓 getTree 查得到此節點）
    //    BUG-021 修正：dept_code 從父目錄查得，不用 accessDept 或 user.部門代碼
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
          id:            `att-${attachment.id}-${dirId}`,
          parent_id:     dirId,
          type:          'attachment',
          label:         title,
          attachment_id: attachment.id,
          is_public:     isPublic,
          sort_order:    999,
          dept_code:     deptCodeMap[dirId] || null,
        })),
        { transaction: t }
      );
    }

    await t.commit();
    return res.status(201).json({ success: true, data: attachment });
  } catch (error) {
    console.error('createAttachment error:', error.message);
    await safeRollback(t);
    return res.status(500).json({ success: false, message: '建立附件包失敗' });
  }
}

// ── 更新附件包 ────────────────────────────────────────────────
async function updateAttachment(req, res) {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const {
      title, description, isPublished, isPublic,
      accessDept, accessMembers, accessLevel,
      tagIds, editorAccounts,
      linkedArticleIds, articleIds,
      files, directoryIds, changeNote,
    } = req.body;

    const relatedArticleIds = linkedArticleIds || articleIds || null;

    const attachment = await Attachment.findByPk(id, {
      include: [{ model: AttachmentEditor, as: 'Editors' }],
    });

    if (!attachment) {
      return res.status(404).json({ success: false, message: '附件包不存在' });
    }

    const isEditor  = attachment.Editors.some(e => e.editor_account === req.user.員工工號);
    const isCreator = attachment.created_by === req.user.員工工號;
    if (!isCreator && !isEditor && req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
      return res.status(403).json({ success: false, message: '您無權修改此附件' });
    }

    // 1. 版本快照
    const currentVersion = attachment.version_number;
    const nextVersion    = currentVersion + 1;

    await AttachmentVersionHistory.create({
      attachment_id:  attachment.id,
      version_number: currentVersion,
      diff_summary:   changeNote || '更新內容',
      editor_id:      req.user.員工工號,
      editor_name:    req.user.員工姓名,
    }, { transaction: t });

    // 2. 更新主表
    await attachment.update({
      title,
      description,
      is_published:  isPublished,
      is_public:     isPublic,
      access_dept:   accessDept,
      access_members: Array.isArray(accessMembers) ? JSON.stringify(accessMembers) : accessMembers,
      access_level:  accessLevel,
      version_number: nextVersion,
      updated_by:    req.user.員工工號,
      updated_by_name: req.user.員工姓名,
    }, { transaction: t });

    // 3. 只插入真正新的檔案
    if (files?.length > 0) {
      const existingFiles = await AttachmentFile.findAll({
        where: { attachment_id: id }, attributes: ['uuid'], transaction: t,
      });
      const existingUUIDs = new Set(existingFiles.map(f => f.uuid));
      const newFiles = files.filter(f => f.uuid && !existingUUIDs.has(f.uuid));
      if (newFiles.length > 0) {
        await AttachmentFile.bulkCreate(
          newFiles.map(f => ({ ...f, attachment_id: id, version_number: nextVersion })),
          { transaction: t }
        );
      }
    }

    // 4. 標籤（BUG-012: allow-create 字串名稱 → findOrCreate）
    if (tagIds) {
      const resolvedIds = await resolveTagIds(tagIds, t);
      await attachment.setTags(resolvedIds, { transaction: t });
    }

    // 5. 編輯者
    if (editorAccounts) {
      await AttachmentEditor.destroy({ where: { attachment_id: id }, transaction: t });
      await AttachmentEditor.bulkCreate(
        editorAccounts.map(acc => ({ attachment_id: id, editor_account: acc })),
        { transaction: t }
      );
    }

    // 6. 文章關聯
    if (relatedArticleIds) {
      await attachment.setArticles(relatedArticleIds, { transaction: t });
    }

    // 7. 目錄捷徑節點同步
    await Directory.update(
      { label: title, is_public: isPublic },
      { where: { attachment_id: id }, transaction: t }
    );

    // B-03: 同步新增/移除目錄節點（修正：加入 dept_code）
    if (directoryIds) {
      const existingNodes = await Directory.findAll({
        where: { attachment_id: id, type: 'attachment' },
        attributes: ['id', 'parent_id'],
        transaction: t,
      });
      const existingParentIds = existingNodes.map(n => n.parent_id);

      const toAdd = directoryIds.filter(pid => !existingParentIds.includes(pid));
      if (toAdd.length > 0) {
        // BUG-021 修正：dept_code 從父目錄查得，不用 accessDept 或 user.部門代碼
        const parentDirs = await Directory.findAll({
          where: { id: toAdd },
          attributes: ['id', 'dept_code'],
          transaction: t,
        });
        const deptCodeMap = {};
        parentDirs.forEach(d => { deptCodeMap[d.id] = d.dept_code; });

        await Directory.bulkCreate(
          toAdd.map(dirId => ({
            id:            `att-${id}-${dirId}`,
            parent_id:     dirId,
            type:          'attachment',
            label:         title,
            attachment_id: id,
            is_public:     isPublic,
            sort_order:    999,
            dept_code:     deptCodeMap[dirId] || null,
          })),
          { transaction: t }
        );
      }

      const toRemove = existingParentIds.filter(pid => !directoryIds.includes(pid));
      if (toRemove.length > 0) {
        await Directory.destroy({
          where: { attachment_id: id, type: 'attachment', parent_id: toRemove },
          transaction: t,
        });
      }
    }

    await t.commit();
    return res.json({ success: true, data: attachment });
  } catch (error) {
    console.error('updateAttachment error:', error.message);
    await safeRollback(t);
    return res.status(500).json({ success: false, message: '更新附件包失敗' });
  }
}

// 下載附件檔案（透過 UUID 識別）
// 設定 Content-Disposition 帶原始檔名，避免瀏覽器用 storage 檔名
async function downloadFile(req, res) {
  try {
    const { uuid } = req.params;

    const file = await AttachmentFile.findOne({
      where: { uuid },
      include: [{ model: Attachment }],
    });

    if (!file) {
      return res.status(404).json({ success: false, message: '檔案不存在' });
    }

    // 檢查存取權限
    if (!canAccess(req.user, file.Attachment)) {
      return res.status(403).json({ success: false, message: '您無權下載此檔案' });
    }

    const fs   = require('fs');
    const path = require('path');

    // 實體檔案路徑
    const filePath = path.isAbsolute(file.storage_path)
      ? file.storage_path
      : path.join(process.cwd(), file.storage_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '實體檔案不存在' });
    }

    // RFC 5987 編碼中文檔名，同時提供 ASCII fallback
    const encodedName = encodeURIComponent(file.name);
    const asciiFallback = file.name.replace(/[^\x20-\x7e]/g, '_');
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
    );
    res.setHeader('Content-Length', fs.statSync(filePath).size);

    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('downloadFile error:', error.message);
    return res.status(500).json({ success: false, message: '下載失敗' });
  }
}

module.exports = {
  getAllAttachments,
  searchAttachments,
  getAttachmentById,
  uploadFiles,
  createAttachment,
  updateAttachment,
  downloadFile,
};
