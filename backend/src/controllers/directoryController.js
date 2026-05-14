/**
 * Directory Controller
 * 處理目錄樹的 CRUD 與 權限過濾
 */
const { Directory, Article, Attachment, sequelize } = require('../models');
const { buildTree } = require('../helpers/treeHelper');
const { canAccess } = require('../helpers/accessHelper');
const { Op } = require('sequelize');

/**
 * 取得目錄樹
 * GET /api/v1/directories?組織OID=xxx&部門代碼=xxx
 */
async function getTree(req, res) {
  try {
    const { 組織OID, 部門代碼 } = req.query;
    
    // 查詢該部門下的所有節點
    // 包含 Article 與 Attachment 的權限欄位以便過濾
    const rows = await Directory.findAll({
      where: {
        [Op.or]: [
          { type: 'company' }, // 公司節點（全域）
          { dept_code: 部門代碼 }, // 指定部門
        ]
      },
      include: [
        { 
          model: Article, 
          attributes: ['is_published', 'is_public', 'access_dept', 'access_members', 'access_level'] 
        },
        { 
          model: Attachment, 
          attributes: ['is_published', 'is_public', 'access_dept', 'access_members', 'access_level'] 
        }
      ],
      order: [['sort_order', 'ASC']]
    });

    // 權限過濾：過濾掉使用者無權存取的文章或附件節點
    const filteredRows = rows.filter(row => {
      if (row.type === 'article') {
        if (!row.Article) return false; // 文章不存在
        if (!row.Article.is_published && req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
          return false; // 未發佈且非管理職
        }
        return canAccess(req.user, row.Article);
      }
      
      if (row.type === 'attachment') {
        if (!row.Attachment) return false; // 附件不存在
        if (!row.Attachment.is_published && req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
          return false; // 未發佈且非管理職
        }
        return canAccess(req.user, row.Attachment);
      }
      
      return true; // 目錄節點預設顯示
    });

    const tree = buildTree(filteredRows);
    return res.json({ success: true, data: tree });
  } catch (error) {
    console.error('getTree error:', error.message);
    return res.status(500).json({ success: false, message: '取得目錄樹失敗' });
  }
}

/**
 * 新增目錄節點
 * POST /api/v1/directories
 */
async function createNode(req, res) {
  try {
    const { id, parentId, label, sortOrder, deptCode } = req.body;

    if (!id || !label) {
      return res.status(400).json({ success: false, message: 'ID 與標籤為必填' });
    }

    const node = await Directory.create({
      id,
      parent_id: parentId,
      type: 'directory',
      label,
      sort_order: sortOrder,
      dept_code: deptCode
    });

    // 重算同層排序（確保排序連續）
    await recalcSortOrder(parentId);

    return res.status(201).json({ success: true, data: node });
  } catch (error) {
    console.error('createNode error:', error.message);
    return res.status(500).json({ success: false, message: '建立目錄節點失敗' });
  }
}

/**
 * 重命名節點
 * PATCH /api/v1/directories/:id/rename
 */
async function renameNode(req, res) {
  try {
    const { id } = req.params;
    const { label } = req.body;

    if (!label) {
      return res.status(400).json({ success: false, message: '標籤為必填' });
    }

    await Directory.update({ label }, { where: { id } });
    
    return res.json({ success: true, data: { id, label } });
  } catch (error) {
    console.error('renameNode error:', error.message);
    return res.status(500).json({ success: false, message: '重新命名失敗' });
  }
}

/**
 * 移動節點（更新父節點與排序）
 * PATCH /api/v1/directories/move
 */
async function moveNode(req, res) {
  const t = await sequelize.transaction();
  try {
    const { draggingId, dropId, dropType } = req.body;

    // dropType: 'inner' (子節點), 'before' (同層前), 'after' (同層後)
    const draggingNode = await Directory.findByPk(draggingId);
    const dropNode = await Directory.findByPk(dropId);

    if (!draggingNode || !dropNode) {
      return res.status(404).json({ success: false, message: '節點不存在' });
    }

    let newParentId = null;
    let newSortOrder = 0;

    if (dropType === 'inner') {
      newParentId = dropId;
      newSortOrder = 999; // 放到最後面，之後再 recalc
    } else {
      newParentId = dropNode.parent_id;
      newSortOrder = dropType === 'before' ? dropNode.sort_order - 0.5 : dropNode.sort_order + 0.5;
    }

    await draggingNode.update({
      parent_id: newParentId,
      sort_order: newSortOrder
    }, { transaction: t });

    await t.commit();

    // 完成後統一重算該層排序
    await recalcSortOrder(newParentId);

    return res.json({ success: true, message: '移動成功' });
  } catch (error) {
    await t.rollback();
    console.error('moveNode error:', error.message);
    return res.status(500).json({ success: false, message: '移動節點失敗' });
  }
}

/**
 * Helper: 重新計算同層節點的 sort_order (1, 2, 3...)
 */
async function recalcSortOrder(parentId) {
  const siblings = await Directory.findAll({
    where: { parent_id: parentId },
    order: [['sort_order', 'ASC']]
  });

  for (let i = 0; i < siblings.length; i++) {
    await siblings[i].update({ sort_order: i + 1 });
  }
}

module.exports = {
  getTree,
  createNode,
  renameNode,
  moveNode,
};
