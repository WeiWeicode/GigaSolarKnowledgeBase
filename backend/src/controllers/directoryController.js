/**
 * Directory Controller
 * 處理目錄樹的 CRUD 與 權限過濾
 */
const { Directory, Article, Attachment, sequelize } = require('../models');
const { buildTree } = require('../helpers/treeHelper');
const { Op } = require('sequelize');

/**
 * 取得目錄樹
 * GET /api/v1/directories?組織OID=xxx&部門代碼=xxx[&scope=public]
 *
 * scope=public：不限部門，僅回傳已發佈且公開的文章 / 附件及其容器節點（排除垃圾桶）
 */
async function getTree(req, res) {
  try {
    const { 組織OID, 部門代碼, scope } = req.query;

    const includeAssoc = [
      {
        model: Article,
        attributes: ['is_published', 'is_public', 'access_dept', 'access_members', 'access_level'],
      },
      {
        model: Attachment,
        attributes: ['is_published', 'is_public', 'access_dept', 'access_members', 'access_level'],
      },
    ];

    // ── 公開模式：不限部門，全量抓取後僅留公開已發佈資料 ──────
    if (scope === 'public') {
      const allRows = await Directory.findAll({
        include: includeAssoc,
        order: [['sort_order', 'ASC']],
      });

      // 排除垃圾桶；文章 / 附件只保留已發佈且 is_public=true 的
      const publicRows = allRows.filter(row => {
        if (row.type === 'trash') return false;
        if (row.type === 'article') {
          return row.Article && row.Article.is_published && row.Article.is_public;
        }
        if (row.type === 'attachment') {
          return row.Attachment && row.Attachment.is_published && row.Attachment.is_public;
        }
        return true; // company / department / directory：保留結構，前端 filterPublic 再修剪空容器
      });

      const tree = buildTree(publicRows);
      return res.json({ success: true, data: tree });
    }

    // ── 部門模式（預設）：只取當前部門及公司節點 ───────────────
    const rows = await Directory.findAll({
      where: {
        [Op.or]: [
          { type: 'company' },      // 公司節點（全域）
          { dept_code: 部門代碼 },  // 指定部門
        ],
      },
      include: includeAssoc,
      order: [['sort_order', 'ASC']],
    });

    // 過濾規則：
    // - 文章 / 附件：已發佈才顯示（ADMIN / MANAGER 可看未發佈）
    //   存取權限交給前端 checkItemAccess 處理（沒有權限顯示禁止眼睛 icon，不直接隱藏）
    // - 其他節點（directory、department 等）：一律顯示
    const isManager = req.user.role === 'ADMIN' || req.user.role === 'MANAGER';
    const filteredRows = rows.filter(row => {
      if (row.type === 'article') {
        if (!row.Article) return false;
        if (!row.Article.is_published && !isManager) return false;
        return true;
      }
      if (row.type === 'attachment') {
        if (!row.Attachment) return false;
        if (!row.Attachment.is_published && !isManager) return false;
        return true;
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

/**
 * 刪除目錄節點（僅允許空的 directory 類型）
 * DELETE /api/v1/directories/:id
 */
async function deleteNode(req, res) {
  try {
    const { id } = req.params;

    const node = await Directory.findByPk(id);
    if (!node) {
      return res.status(404).json({ success: false, message: '節點不存在' });
    }
    if (node.type !== 'directory') {
      return res.status(400).json({ success: false, message: '只能刪除 directory 類型節點' });
    }

    const children = await Directory.findAll({ where: { parent_id: id } });
    if (children.length > 0) {
      return res.status(400).json({ success: false, message: '目錄內還有子節點，請先清空' });
    }

    const parentId = node.parent_id;
    await node.destroy();
    await recalcSortOrder(parentId);

    return res.json({ success: true, message: '目錄已刪除' });
  } catch (error) {
    console.error('deleteNode error:', error.message);
    return res.status(500).json({ success: false, message: '刪除目錄失敗' });
  }
}

module.exports = {
  getTree,
  createNode,
  renameNode,
  moveNode,
  deleteNode,
};
