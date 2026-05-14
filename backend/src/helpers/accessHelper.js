/**
 * Access Helper
 * 處理文章與附件的存取權限判斷
 */

/**
 * 判斷使用者是否可存取該資源（文章或附件）
 * 
 * @param {object} user - 當前登入使用者 (req.user)
 * @param {object} resource - 資源物件（需包含權限欄位）
 * @returns {boolean}
 */
function canAccess(user, resource) {
  // 1. 公開內容：所有人皆可存取
  if (resource.is_public === true || resource.isPublic === true) {
    return true;
  }

  // 2. 管理員 (ADMIN)：擁有最高權限
  if (user.role === 'ADMIN') {
    return true;
  }

  // 3. 部門限制：屬於指定部門的人員
  if (resource.access_dept && user.部門代碼 === resource.access_dept) {
    return true;
  }
  if (resource.accessDept && user.部門代碼 === resource.accessDept) {
    return true;
  }

  // 4. 人員限制：在指定名單內的人員
  const membersRaw = resource.access_members || resource.accessMembers;
  if (membersRaw) {
    try {
      const members = Array.isArray(membersRaw) ? membersRaw : JSON.parse(membersRaw);
      if (members.includes(user.員工工號)) {
        return true;
      }
    } catch (e) {
      console.error('Error parsing access_members:', e.message);
    }
  }

  // 5. 職級限制：職級小於等於指定等級的人員（數字越小職等越高）
  const levelLimit = resource.access_level ?? resource.accessLevel;
  if (levelLimit !== null && levelLimit !== undefined) {
    if (user.級職 !== null && user.級職 <= levelLimit) {
      return true;
    }
  }

  // 預設拒絕存取
  return false;
}

module.exports = {
  canAccess,
};
