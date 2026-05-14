/**
 * Tree Helper
 * 將資料庫的平面 Directory 陣列轉換為巢狀結構
 */

/**
 * 組裝目錄樹
 * 
 * @param {Array} rows - 從資料庫查出的平面節點陣列
 * @returns {Array} 巢狀目錄樹
 */
function buildTree(rows) {
  const map = {};
  const tree = [];

  // 1. 初始化 map，並建立基礎物件
  rows.forEach(row => {
    // 轉換為普通物件並初始化 children
    const node = (typeof row.toJSON === 'function') ? row.toJSON() : { ...row };
    node.children = [];
    map[node.id] = node;
  });

  // 2. 根據 parent_id 連結父子關係
  rows.forEach(row => {
    const node = map[row.id];
    if (node.parent_id && map[node.parent_id]) {
      map[node.parent_id].children.push(node);
    } else {
      // 沒有父節點或父節點不在清單中，視為頂層節點
      tree.push(node);
    }
  });

  // 3. 排序（同層根據 sort_order 排序）
  const sortFunc = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);
  
  const sortRecursive = (nodes) => {
    nodes.sort(sortFunc);
    nodes.forEach(n => {
      if (n.children && n.children.length > 0) {
        sortRecursive(n.children);
      }
    });
  };

  sortRecursive(tree);

  return tree;
}

module.exports = {
  buildTree,
};
