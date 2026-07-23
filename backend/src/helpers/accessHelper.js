/**
 * Access Helper
 * 處理文章與附件的存取權限判斷
 */

/**
 * 判斷使用者是否可存取該資源（文章或附件）
 *
 * @param {object}   user           - 當前登入使用者 (req.user)
 * @param {object}   resource       - 資源物件（需包含權限欄位）
 * @param {string[]} extraDeptCodes - 使用者的跨部門授權代碼清單（由 UserExtraDepartment 查詢）
 * @returns {boolean}
 */
function canAccess(user, resource, extraDeptCodes = []) {
  // 1. 公開內容：所有人皆可存取
  if (resource.is_public === true || resource.isPublic === true) {
    return true;
  }

  // 2. 管理員 (ADMIN)：擁有最高權限
  if (user.role === 'ADMIN') {
    return true;
  }

  // 3. 部門限制：支援精確比對、前三碼比對、跨部門授權三種方式
  const rDept = resource.access_dept || resource.accessDept || '';
  if (rDept) {
    const uDept = user.部門代碼 || '';

    // 3-a. 精確比對
    const exactMatch  = uDept === rDept;

    // 3-b. 前三碼相同（例：S1820 可看 S1800、S1810 的文章）
    const prefixMatch = uDept.length >= 3 && rDept.length >= 3
                     && uDept.substring(0, 3) === rDept.substring(0, 3);

    // 3-c. 跨部門授權（user_extra_departments 中有此部門代碼）
    const crossMatch  = extraDeptCodes.includes(rDept);

    if (exactMatch || prefixMatch || crossMatch) {
      return true;
    }
  }

  // 4. 人員限制：在指定名單內的人員
  const membersRaw = resource.access_members || resource.accessMembers;
  if (membersRaw) {
    try {
      const members = Array.isArray(membersRaw) ? membersRaw : JSON.parse(membersRaw);
      if (members.map(String).includes(String(user.員工工號))) {
        return true;
      }
    } catch (e) {
      console.error('Error parsing access_members:', e.message);
    }
  }

  // 5. 職級限制：職級小於等於指定等級的人員（數字越小職等越高）
  //    access_level = 10 代表「一般人員（全員可見）」，無需職級限制，直接允許
  //    與前端 ArticleView「access_level=10 跳過檢查」邏輯保持一致
  const levelLimit = resource.access_level ?? resource.accessLevel;
  if (levelLimit !== null && levelLimit !== undefined) {
    if (Number(levelLimit) >= 10) return true;
    if (user.級職 !== null && user.級職 !== undefined && user.級職 <= levelLimit) {
      return true;
    }
  }

  // 預設拒絕存取
  return false;
}

/**
 * 將 access_members 正規化為陣列。
 * access_members 在 MSSQL 以 JSON 字串儲存；部分舊資料曾被重複 JSON.stringify，
 * 導致 Article/Attachment model 的 getter 解析一次後仍是字串（例如 "[]"）而非陣列。
 */
function normalizeAccessMembers(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

module.exports = {
  canAccess,
  normalizeAccessMembers,
};
