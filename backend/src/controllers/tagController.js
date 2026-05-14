/**
 * Tag Controller
 * 處理標籤 CRUD
 */
const { Tag } = require('../models');

/**
 * 取得所有標籤
 * GET /api/v1/tags
 */
async function getAllTags(req, res) {
  try {
    const tags = await Tag.findAll({
      order: [['id', 'ASC']],
    });
    return res.json({ success: true, data: tags });
  } catch (error) {
    console.error('getAllTags error:', error.message);
    return res.status(500).json({ success: false, message: '取得標籤列表失敗' });
  }
}

/**
 * 新增標籤
 * POST /api/v1/tags
 */
async function createTag(req, res) {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: '標籤名稱為必填' });
    }

    // 檢查是否已存在
    const existing = await Tag.findOne({ where: { name } });
    if (existing) {
      return res.status(400).json({ success: false, message: '標籤名稱已存在' });
    }

    const tag = await Tag.create({ name });
    return res.status(201).json({ success: true, data: tag });
  } catch (error) {
    console.error('createTag error:', error.message);
    return res.status(500).json({ success: false, message: '新增標籤失敗' });
  }
}

/**
 * 刪除標籤
 * DELETE /api/v1/tags/:id
 */
async function deleteTag(req, res) {
  try {
    const { id } = req.params;

    const tag = await Tag.findByPk(id);
    if (!tag) {
      return res.status(404).json({ success: false, message: '標籤不存在' });
    }

    await tag.destroy();
    return res.json({ success: true, message: '標籤已刪除' });
  } catch (error) {
    console.error('deleteTag error:', error.message);
    return res.status(500).json({ success: false, message: '刪除標籤失敗' });
  }
}

module.exports = {
  getAllTags,
  createTag,
  deleteTag,
};
