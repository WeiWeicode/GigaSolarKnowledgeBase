/**
 * NaNa 人事資料庫服務
 * 封裝 NaNa DB 的員工查詢功能
 * SQL 依據 docs/04_DB_SCHEMA.md §1.2
 */
const mssql = require('mssql');
const { getNaNaPool } = require('../config/db');

// ── 完整員工查詢 SQL（含組織、部門、主管）──────────────────
// 直接取自 04_DB_SCHEMA.md §1.2，只在 WHERE 後追加篩選條件
const BASE_EMPLOYEE_SQL = `
  SELECT
    org.organizationName       AS 組織名稱,
    org.OID                    AS 組織OID,
    EFGP_USER.id               AS 員工工號,
    EFGP_USER.userName         AS 員工姓名,
    EFGP_USER.mailAddress      AS 員工Mail,
    dbo.FunctionDefinition.functionDefinitionName AS 職稱,
    FL.levelValue              AS 職級,
    Fun.isMain                 AS 主要部門,
    ORG_UNIT.id                AS 部門代碼,
    ORG_UNIT.organizationUnitName AS 部門名稱,

    CASE
      WHEN ISNULL(SpecBoss.id, Boss.id) = EFGP_USER.id THEN
        CASE
          WHEN UpBoss.id <> EFGP_USER.id THEN UpBoss.id
          ELSE Up2Boss.id
        END
      ELSE ISNULL(SpecBoss.id, Boss.id)
    END AS 主管工號,

    CASE
      WHEN ISNULL(SpecBoss.id, Boss.id) = EFGP_USER.id THEN
        CASE
          WHEN UpBoss.id <> EFGP_USER.id THEN UpBoss.userName
          ELSE Up2Boss.userName
        END
      ELSE ISNULL(SpecBoss.userName, Boss.userName)
    END AS 主管姓名,

    CASE
      WHEN ISNULL(SpecBoss.id, Boss.id) = EFGP_USER.id THEN
        CASE
          WHEN UpBoss.id <> EFGP_USER.id THEN UpBoss.mailAddress
          ELSE Up2Boss.mailAddress
        END
      ELSE ISNULL(SpecBoss.mailAddress, Boss.mailAddress)
    END AS 主管電子郵件

  FROM dbo.OrganizationUnit AS ORG_UNIT
    INNER JOIN dbo.Functions           AS Fun        ON ORG_UNIT.OID             = Fun.organizationUnitOID
    INNER JOIN dbo.Organization        AS org        ON ORG_UNIT.organizationOID  = org.OID
    INNER JOIN dbo.Users               AS Boss       ON ORG_UNIT.managerOID       = Boss.OID
    INNER JOIN dbo.Users               AS EFGP_USER  ON Fun.occupantOID           = EFGP_USER.OID
    INNER JOIN dbo.FunctionDefinition               ON Fun.definitionOID          = dbo.FunctionDefinition.OID
    LEFT  JOIN dbo.Users               AS SpecBoss   ON Fun.specifiedManagerOID   = SpecBoss.OID
    LEFT  JOIN dbo.OrganizationUnit    AS UP_UNIT    ON ORG_UNIT.superUnitOID     = UP_UNIT.OID
    LEFT  JOIN dbo.Users               AS UpBoss     ON UP_UNIT.managerOID        = UpBoss.OID
    LEFT  JOIN dbo.OrganizationUnit    AS UP2_UNIT   ON UP_UNIT.superUnitOID      = UP2_UNIT.OID
    LEFT  JOIN dbo.Users               AS Up2Boss    ON UP2_UNIT.managerOID       = Up2Boss.OID
    JOIN  dbo.FunctionLevel            AS FL         ON FL.OID                    = Fun.approvalLevelOID
  WHERE
    Fun.isMain = 1
    AND org.organizationName = '碩禾電子材料'
    --     AND EFGP_USER.leaveDate IS NULL
`;

/**
 * 將 DB row 轉換為標準員工物件，並推導 role
 */
function rowToUser(row) {
  // 角色推導：級職 < 6 → MANAGER，其餘 → MEMBER
  const role = row.職級 != null && row.職級 < 6 ? 'MANAGER' : 'MEMBER';

  return {
    組織名稱:     row.組織名稱     || '',
    組織OID:      row.組織OID      || '',
    員工工號:     row.員工工號     || '',
    員工姓名:     row.員工姓名     || '',
    員工Mail:     row.員工Mail     || '',
    職稱:         row.職稱         || '',
    級職:         row.職級         ?? null,
    主要部門:     row.主要部門     ?? null,
    部門代碼:     row.部門代碼     || '',
    部門名稱:     row.部門名稱     || '',
    主管工號:     row.主管工號     || '',
    主管姓名:     row.主管姓名     || '',
    主管電子郵件: row.主管電子郵件 || '',
    role,
  };
}

/**
 * 依工號查詢單一員工完整資料
 * @param {string} account - 員工工號
 * @returns {Promise<object|null>}
 */
async function getUserByAccount(account) {
  try {
    const pool = getNaNaPool();
    const sql = BASE_EMPLOYEE_SQL + ' AND EFGP_USER.id = @account';

    const result = await pool.request()
      .input('account', mssql.NVarChar(50), account)
      .query(sql);

    if (result.recordset.length === 0) return null;

    return rowToUser(result.recordset[0]);
  } catch (error) {
    console.error('nanaService.getUserByAccount error:', error.message);
    throw error;
  }
}

/**
 * 取得所有在職員工（用於 /api/colleagues）
 * 只回傳 Colleague 所需欄位
 * @returns {Promise<Array>}
 */
async function getAllColleagues() {
  try {
    const pool = getNaNaPool();
    const sql = `
      SELECT
        EFGP_USER.id               AS 員工工號,
        EFGP_USER.userName         AS 員工姓名,
        ORG_UNIT.id                AS 部門代碼,
        ORG_UNIT.organizationUnitName AS 部門名稱,
        EFGP_USER.mailAddress      AS 員工Mail
      FROM dbo.OrganizationUnit AS ORG_UNIT
        INNER JOIN dbo.Functions  AS Fun       ON ORG_UNIT.OID    = Fun.organizationUnitOID
        INNER JOIN dbo.Organization AS org     ON ORG_UNIT.organizationOID = org.OID
        INNER JOIN dbo.Users      AS EFGP_USER ON Fun.occupantOID = EFGP_USER.OID
      WHERE
        Fun.isMain = 1
        AND org.organizationName = '碩禾電子材料'
      ORDER BY EFGP_USER.id
    `;

    const result = await pool.request().query(sql);
    return result.recordset;
  } catch (error) {
    console.error('nanaService.getAllColleagues error:', error.message);
    throw error;
  }
}

/**
 * 取得公司清單（用於 /api/meta/companies）
 * @returns {Promise<Array>}
 */
async function getCompanies() {
  try {
    const pool = getNaNaPool();
    const sql = `
      SELECT DISTINCT
        org.OID              AS 組織OID,
        org.organizationName AS 組織名稱
      FROM dbo.Organization        AS org
      INNER JOIN dbo.OrganizationUnit AS ou ON ou.organizationOID = org.OID
      WHERE org.organizationName = '碩禾電子材料'
      ORDER BY org.organizationName
      
    `;

    const result = await pool.request().query(sql);
    return result.recordset;
  } catch (error) {
    console.error('nanaService.getCompanies error:', error.message);
    throw error;
  }
}

/**
 * 依組織 OID 取得部門清單（用於 /api/meta/departments）
 * @param {string} orgOID
 * @returns {Promise<Array>}
 */
async function getDepartmentsByOrg(orgOID) {
  try {
    const pool = getNaNaPool();
    const sql = `
      SELECT DISTINCT
        ou.id                     AS 部門代碼,
        ou.organizationUnitName   AS 部門名稱
      FROM dbo.OrganizationUnit AS ou
      INNER JOIN dbo.Organization AS org ON ou.organizationOID = org.OID
      WHERE org.OID = @orgOID
      AND org.organizationName = '碩禾電子材料'
      ORDER BY ou.id
    `;

    const result = await pool.request()
      .input('orgOID', mssql.NVarChar(50), orgOID)
      .query(sql);

    return result.recordset;
  } catch (error) {
    console.error('nanaService.getDepartmentsByOrg error:', error.message);
    throw error;
  }
}

module.exports = {
  getUserByAccount,
  getAllColleagues,
  getCompanies,
  getDepartmentsByOrg,
};
