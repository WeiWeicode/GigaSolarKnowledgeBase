/**
 * Attachment Controller
 */
const {
  Attachment, AttachmentFile, Tag, AttachmentEditor,
  AttachmentVersionHistory, Directory, sequelize
} = require('../models');
const { canAccess } = require('../helpers/accessHelper');
const { v4: uuidv4 } = require('uuid');

// ── 取得附件包列表 ────────────────────────────────────────────
async function getAllAttachments(req, res) {
  try {
    const attachments = await Attachment.findAll({
      include: [
        { model: Tag,              through: { attributes: [] }, as: 'Tags' },
        { model: AttachmentEditor, attributes: ['editor_account'], as: 'Editors' },
      ],
      order: [['updated_at', 'DESC']],
    });

    const filtered = attachments.filter(att => {
      if (!att.is_published && req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
        const isEditor = att.Editors.some(e => e.editor_account === req.user.員工工號);
        if (!isEditor) return false;
      }
      return canAccess(req.user, att);
    });

    return res.json({ success: true, data: filtered });
  } catch (error) {
    console.error('getAllAttachments error:', error.message);
    return res.status(500).json({ success: false, message: '取得附件列表失敗' });
  }
}

// ── 取得單一附件包 ────────────────────────────────────────────
async function getAttachmentById(req, res) {
  try {
    const { id } = req.params;
    const attachment = await Attachment.findByPk(id, {
      include: [
        { model: AttachmentFile,   as: 'Files' },
        { model: Tag,              through: { attributes: [] }, as: 'Tags' },
        { model: AttachmentEditor, attributes: ['editor_account'], as: 'Editors' },
      ],
    });

    if (!attachment) {
      return res.status(404).json({ success: false, message: '找不到該附件包' });
    }
    if (!canAccess(req.user, attachment)) {
      return res.status(403).json({ success: false, message: '您無權存取此附件' });
    }

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
      name:         file.originalname,
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
      tagIds, editorAccounts, articleIds,
      files, directoryIds,
    } = req.body;

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

    // 3. 標籤
    if (tagIds?.length > 0) {
      await attachment.setTags(tagIds, { transaction: t });
    }

    // 4. 編輯者
    if (editorAccounts?.length > 0) {
      await AttachmentEditor.bulkCreate(
        editorAccounts.map(acc => ({ attachment_id: attachment.id, editor_account: acc })),
        { transaction: t }
      );
    }

    // 5. 文章關聯
    if (articleIds?.length > 0) {
      await attachment.setArticles(articleIds, { transaction: t });
    }

    // 6. 目錄捷徑節點
    if (directoryIds?.length > 0) {
      await Directory.bulkCreate(
        directoryIds.map(dirId => ({
          id:            `att-${attachment.id}-${dirId}`,
          parent_id:     dirId,
          type:          'attachment',
          label:         title,
          attachment_id: attachment.id,
          is_public:     isPublic,
          sort_order:    999,
        })),
        { transaction: t }
      );
    }

    await t.commit();
    return res.status(201).json({ success: true, data: attachment });
  } catch (error) {
    await t.rollback();
    console.error('createAttachment error:', error.message);
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
      tagIds, editorAccounts, articleIds,
      files, changeNote,
    } = req.body;

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

    // 1. 版本快照（儲存「目前版本號」，讓歷史記錄對應到此次更新前的狀態）
    const currentVersion = attachment.version_number;
    const nextVersion    = currentVersion + 1;

    await AttachmentVersionHistory.create({
      attachment_id:  attachment.id,
      version_number: currentVersion,          // ← 目前版本號
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
      version_number: nextVersion,             // ← 遞增到新版本號
      updated_by:    req.user.員工工號,
      updated_by_name: req.user.員工姓名,
    }, { transaction: t });

    // 3. ── FIX T-24：只插入真正新的檔案，避免 UUID 唯一約束衝突 ──
    if (files?.length > 0) {
      // 取得此附件包目前 DB 中所有 uuid
      const existingFiles = await AttachmentFile.findAll({
        where:      { attachment_id: id },
        attributes: ['uuid'],
        transaction: t,
      });
      const existingUUIDs = new Set(existingFiles.map(f => f.uuid));

      // 過濾出 uuid 不在 DB 的新檔案
      const newFiles = files.filter(f => f.uuid && !existingUUIDs.has(f.uuid));

      if (newFiles.length > 0) {
        await AttachmentFile.bulkCreate(
          newFiles.map(f => ({ ...f, attachment_id: id, version_number: nextVersion })),
          { transaction: t }
        );
      }
    }

    // 4. 標籤
    if (tagIds) {
      await attachment.setTags(tagIds, { transaction: t });
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
    if (articleIds) {
      await attachment.setArticles(articleIds, { transaction: t });
    }

    // 7. 目錄捷徑節點同步 label / is_public
    await Directory.update(
      { label: title, is_public: isPublic },
      { where: { attachment_id: id }, transaction: t }
    );

    await t.commit();
    return res.json({ success: true, data: attachment });
  } catch (error) {
    await t.rollback();
    console.error('updateAttachment error:', error.message);
    return res.status(500).json({ success: false, message: '更新附件包失敗' });
  }
}

module.exports = {
  getAllAttachments,
  getAttachmentById,
  uploadFiles,
  createAttachment,
  updateAttachment,
};
