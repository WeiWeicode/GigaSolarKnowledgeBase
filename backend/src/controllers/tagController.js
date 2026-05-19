/**
 * Tag Controller
 * 處理標籤 CRUD（含部門綁定、自訂排序、熱度排序、公開設定）
 */
const { Tag } = require('../models');
const { Op } = require('sequelize');

/**
 * 解析 departments JSON 字串 → 陣列
 * @param {string|null} raw
 * @returns {string[]}
 */
function parseDepts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

/**
 * 取得標籤列表
 * GET /api/v1/tags
 *
 * Query params:
 *   scope     - 'public' | 'dept' | （省略 = 全部，管理介面用）
 *   deptCode  - scope=dept 時必填，用以篩選所屬部門
 *
 * 排序規則：
 *   - scope=public：只回傳 is_public=true，依 click_count DESC
 *   - scope=dept：篩選 departments 包含 deptCode，依 custom_order ASC
 *   - 無 scope：回傳全部，依 id ASC（管理介面）
 */
async function getAllTags(req, res) {
  try {
    const { scope, deptCode } = req.query;

    if (scope === 'public') {
      // 公開模式：只回傳 is_public=true，依熱度排序
      const tags = await Tag.findAll({
        where: { is_public: true },
        order: [['click_count', 'DESC'], ['id', 'ASC']],
      });
      return res.json({ success: true, data: tags.map(normalizeTag) });
    }

    if (scope === 'dept') {
      if (!deptCode) {
        return res.status(400).json({ success: false, message: 'scope=dept 時 deptCode 為必填' });
      }
      // 部門模式：departments 欄位包含 deptCode 的標籤（空值不顯示）
      const tags = await Tag.findAll({
        order: [['custom_order', 'ASC'], ['id', 'ASC']],
      });
      // departments 以 JSON 字串存，在應用層篩選含 deptCode 的項目
      const filtered = tags.filter(t => {
        const depts = parseDepts(t.departments);
        return depts.includes(deptCode);
      });
      return res.json({ success: true, data: filtered.map(normalizeTag) });
    }

    // 無 scope：回傳全部（管理介面使用）
    const tags = await Tag.findAll({
      order: [['id', 'ASC']],
    });
    return res.json({ success: true, data: tags.map(normalizeTag) });
  } catch (error) {
    console.error('getAllTags error:', error.message);
    return res.status(500).json({ success: false, message: '取得標籤列表失敗' });
  }
}

/**
 * 新增標籤
 * POST /api/v1/tags
 * Body: { name, departments?, customOrder?, isPublic? }
 */
async function createTag(req, res) {
  try {
    const { name, departments, customOrder, isPublic } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: '標籤名稱為必填' });
    }

    // 檢查是否已存在
    const existing = await Tag.findOne({ where: { name } });
    if (existing) {
      return res.status(400).json({ success: false, message: '標籤名稱已存在' });
    }

    const tag = await Tag.create({
      name,
      departments: Array.isArray(departments) ? JSON.stringify(departments) : (departments || null),
      custom_order: customOrder ?? 0,
      is_public:    isPublic ?? false,
    });
    return res.status(201).json({ success: true, data: normalizeTag(tag) });
  } catch (error) {
    console.error('createTag error:', error.message);
    return res.status(500).json({ success: false, message: '新增標籤失敗' });
  }
}

/**
 * 更新標籤
 * PATCH /api/v1/tags/:id
 * Body: { name?, departments?, customOrder?, isPublic? }
 */
async function updateTag(req, res) {
  try {
    const { id } = req.params;
    const { name, departments, customOrder, isPublic } = req.body;

    const tag = await Tag.findByPk(id);
    if (!tag) {
      return res.status(404).json({ success: false, message: '標籤不存在' });
    }

    // 若要更名，先檢查重複
    if (name && name !== tag.name) {
      const dup = await Tag.findOne({ where: { name, id: { [Op.ne]: Number(id) } } });
      if (dup) {
        return res.status(400).json({ success: false, message: '標籤名稱已存在' });
      }
    }

    const updates = {};
    if (name        !== undefined) updates.name         = name;
    if (departments !== undefined) updates.departments  = Array.isArray(departments)
                                                          ? JSON.stringify(departments)
                                                          : (departments || null);
    if (customOrder !== undefined) updates.custom_order = customOrder;
    if (isPublic    !== undefined) updates.is_public    = isPublic;

    await tag.update(updates);
    return res.json({ success: true, data: normalizeTag(tag) });
  } catch (error) {
    console.error('updateTag error:', error.message);
    return res.status(500).json({ success: false, message: '更新標籤失敗' });
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

/**
 * 累加點擊次數（公開模式下 tag chip 被點擊時呼叫）
 * POST /api/v1/tags/:id/click
 */
async function incrementClickCount(req, res) {
  try {
    const { id } = req.params;

    const tag = await Tag.findByPk(id);
    if (!tag) {
      return res.status(404).json({ success: false, message: '標籤不存在' });
    }

    await tag.increment('click_count', { by: 1 });
    return res.json({ success: true, data: { id: tag.id, click_count: tag.click_count + 1 } });
  } catch (error) {
    console.error('incrementClickCount error:', error.message);
    return res.status(500).json({ success: false, message: '更新點擊次數失敗' });
  }
}

/**
 * 標準化 Tag 輸出（解析 departments JSON、camelCase 欄位名）
 */
function normalizeTag(tag) {
  const plain = tag.toJSON ? tag.toJSON() : tag;
  return {
    id:           plain.id,
    name:         plain.name,
    departments:  parseDepts(plain.departments),
    customOrder:  plain.custom_order,
    clickCount:   plain.click_count,
    isPublic:     plain.is_public === true || plain.is_public === 1,
    createdAt:    plain.created_at,
  };
}

module.exports = {
  getAllTags,
  createTag,
  updateTag,
  deleteTag,
  incrementClickCount,
};
