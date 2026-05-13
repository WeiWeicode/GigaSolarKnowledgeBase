# 04 DB Schema

> 命名慣例：資料表用 `snake_case`，欄位名稱用 `snake_case`

---

## 目錄

- [資料庫連線總覽](#0-資料庫連線總覽)
1. [外部資料來源：NaNa DB — 員工基本資料查詢](#1-外部資料來源nana-db--員工基本資料查詢)
2. [user_tokens（登入 Token 紀錄）](#2-user_tokens登入-token-紀錄)
3. [articles（知識文章）](#3-articles知識文章)
4. [article_version_history（文章版本歷史）](#4-article_version_history文章版本歷史)
5. [attachments（附件包）](#5-attachments附件包)
6. [attachment_files（附件包內的單一檔案）](#6-attachment_files附件包內的單一檔案)
7. [attachment_version_history（附件版本歷史）](#7-attachment_version_history附件版本歷史)
8. [directories（目錄節點）](#8-directories目錄節點)
9. [tags（標籤）](#9-tags標籤)
10. [article_tags（文章 ↔ 標籤 多對多）](#10-article_tags文章--標籤-多對多)
11. [attachment_tags（附件 ↔ 標籤 多對多）](#11-attachment_tags附件--標籤-多對多)
12. [article_attachments（文章 ↔ 附件 多對多）](#12-article_attachments文章--附件-多對多)
13. [article_editors（文章 ↔ 編輯者 多對多）](#13-article_editors文章--編輯者-多對多)
14. [attachment_editors（附件 ↔ 編輯者 多對多）](#14-attachment_editors附件--編輯者-多對多)
15. [comments（留言）](#15-comments留言)
16. [comment_reads（留言已讀狀態）](#16-comment_reads留言已讀狀態)
17. [notifications（通知）](#17-notifications通知)
18. [Table 關聯總覽](#18-table-關聯總覽)

---

## 0. 資料庫連線總覽

本系統共使用**兩個** SQL Server 資料庫：

| 識別 | 用途 | 主機 | 資料庫名稱 | 存取方式 | ORM |
|------|------|------|----------|----------|-----|
| **KB DB** | 知識庫主資料庫（本系統自建） | *(待填入)* | *(待填入)* | Sequelize | ✅ |
| **NaNa DB** | 人事 / 組織資料（唯讀，外部系統） | `10.10.130.190` | `NaNa` | 原生 SQL（`mssql` / `tedious`） | ❌ |

> NaNa DB 為唯讀資料來源，**不透過 Sequelize**，改用原生 SQL 查詢以避免 ORM 對外部 Schema 的耦合。
> 連線帳號、密碼待確認後填入 `.env`。

### .env 連線設定（參考）

```env
# ── 知識庫主資料庫（KB DB）──────────────────────────────────
KB_DB_HOST=
KB_DB_PORT=1433
KB_DB_NAME=
KB_DB_USER=
KB_DB_PASS=

# ── NaNa 人事資料庫（唯讀）──────────────────────────────────
NANA_DB_HOST=10.10.130.190
NANA_DB_PORT=1433
NANA_DB_NAME=NaNa
NANA_DB_USER=        ← 待填入
NANA_DB_PASS=        ← 待填入
```

---

## 1. 外部資料來源：NaNa DB — 員工基本資料查詢

### 1.1 說明

員工基本資料（姓名、部門、職稱、主管等）**不存於 KB DB**，每次需要時直接向 NaNa DB 發出原生 SQL 查詢。

使用情境：
- 登入時取得使用者完整資訊，附加至 `req.user`
- `GET /api/colleagues`：取得同仁清單（用於 @Mention 選單、editorIds 指派）
- `GET /api/meta/companies` / `GET /api/meta/departments`：取得組織架構

### 1.2 查詢語法

```sql
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
    INNER JOIN dbo.Functions           AS Fun            ON ORG_UNIT.OID           = Fun.organizationUnitOID
    INNER JOIN dbo.Organization        AS org            ON ORG_UNIT.organizationOID = org.OID
    INNER JOIN dbo.Users               AS Boss           ON ORG_UNIT.managerOID    = Boss.OID
    INNER JOIN dbo.Users               AS EFGP_USER      ON Fun.occupantOID        = EFGP_USER.OID
    INNER JOIN dbo.FunctionDefinition                    ON Fun.definitionOID      = dbo.FunctionDefinition.OID
    LEFT  JOIN dbo.Users               AS SpecBoss       ON Fun.specifiedManagerOID = SpecBoss.OID
    LEFT  JOIN dbo.OrganizationUnit    AS UP_UNIT        ON ORG_UNIT.superUnitOID  = UP_UNIT.OID
    LEFT  JOIN dbo.Users               AS UpBoss         ON UP_UNIT.managerOID     = UpBoss.OID
    LEFT  JOIN dbo.OrganizationUnit    AS UP2_UNIT       ON UP_UNIT.superUnitOID   = UP2_UNIT.OID
    LEFT  JOIN dbo.Users               AS Up2Boss        ON UP2_UNIT.managerOID    = Up2Boss.OID
    JOIN  dbo.FunctionLevel            AS FL             ON FL.OID                 = Fun.approvalLevelOID
WHERE
    Fun.isMain = 1
    AND EFGP_USER.leaveDate IS NULL
```

### 1.3 查詢變體

**依工號篩選單一員工**（登入 / 取得 `req.user` 時使用）：

```sql
-- 在上方 WHERE 後追加：
AND EFGP_USER.id = @account
```

**依組織 OID 篩選（取得特定公司的所有員工）**：

```sql
AND org.OID = @orgOID
```

**依部門代碼篩選**：

```sql
AND ORG_UNIT.id = @deptCode
```

### 1.4 回傳欄位對應 API 模型

| SQL 欄位 | API 模型欄位 | 說明 |
|----------|------------|------|
| `組織名稱` | `CurrentUser.組織名稱` / `Company.組織名稱` | |
| `組織OID` | `CurrentUser.組織OID` / `Company.組織OID` | |
| `員工工號` | `CurrentUser.員工工號` / `Colleague.員工工號` | |
| `員工姓名` | `CurrentUser.員工姓名` / `Colleague.員工姓名` | |
| `員工Mail` | `CurrentUser.員工Mail` / `Colleague.員工Mail` | |
| `職稱` | `CurrentUser.職稱` | |
| `職級` | `CurrentUser.級職` | 數字越小職位越高，用於 MANAGER 角色推導 |
| `主要部門` | `CurrentUser.主要部門` | `1` 表示此列為主要部門 |
| `部門代碼` | `CurrentUser.部門代碼` / `Department.部門代碼` | |
| `部門名稱` | `CurrentUser.部門名稱` / `Department.部門名稱` | |
| `主管工號` | `CurrentUser.主管工號` | |
| `主管姓名` | `CurrentUser.主管姓名` | |
| `主管電子郵件` | `CurrentUser.主管電子郵件` | |

### 1.5 角色推導邏輯（登入時執行）

後端取得員工資料後，依以下規則寫入 `req.user.role`：

```
1. KB DB 中 user_tokens 查到此帳號曾被手動設為 ADMIN
   → role = 'ADMIN'

2. 職級 (levelValue) < 6  OR  此員工工號 = 其他員工的主管工號
   → role = 'MANAGER'

3. 其餘
   → role = 'MEMBER'
```

### 1.6 快取策略

同仁清單資料變動頻率低，建議加上 Redis 快取：

| 快取 Key | TTL | 說明 |
|----------|-----|------|
| `colleagues:all` | 1 小時 | `GET /api/colleagues` 結果 |
| `user:{account}` | 15 分鐘 | 單一員工資料，登入後快取 |
| `companies` | 1 小時 | 公司清單 |
| `departments:{orgOID}` | 1 小時 | 特定公司的部門清單 |

---

## 2. user_tokens（登入 Token 紀錄）

**所在資料庫：KB DB**

記錄每次成功登入的 token，用於後端驗證請求身分與稽核查詢。

| 欄位 | 型別 | 限制 | 說明 |
|------|------|------|------|
| `id` | `INT` | PK, IDENTITY | 自動遞增主鍵 |
| `account` | `NVARCHAR(50)` | NOT NULL | 員工工號（來自 NaNa DB） |
| `token` | `NVARCHAR(MAX)` | NOT NULL | BPM 核發的 JWT authToken 原文 |
| `token_hash` | `NVARCHAR(64)` | NOT NULL | SHA-256(token) hex，用於索引查詢 |
| `login_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | 登入時間 |
| `expires_at` | `DATETIME2` | NOT NULL | Token 到期時間（從 JWT payload `exp` 解析） |
| `ip_address` | `NVARCHAR(45)` | NULL | 登入來源 IP（IPv4 / IPv6） |
| `is_revoked` | `BIT` | NOT NULL, DEFAULT 0 | 是否已撤銷（logout 時設為 `1`） |
| `created_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | 紀錄建立時間 |

**DDL**

```sql
CREATE TABLE user_tokens (
    id          INT             IDENTITY(1,1)  PRIMARY KEY,
    account     NVARCHAR(50)    NOT NULL,
    token       NVARCHAR(MAX)   NOT NULL,
    token_hash  NVARCHAR(64)    NOT NULL,
    login_at    DATETIME2       NOT NULL  DEFAULT GETDATE(),
    expires_at  DATETIME2       NOT NULL,
    ip_address  NVARCHAR(45)    NULL,
    is_revoked  BIT             NOT NULL  DEFAULT 0,
    created_at  DATETIME2       NOT NULL  DEFAULT GETDATE()
);

CREATE UNIQUE INDEX IX_user_tokens_token_hash ON user_tokens (token_hash);
CREATE        INDEX IX_user_tokens_account    ON user_tokens (account);
```

**Middleware 驗證邏輯**

```
1. 取出 Header Authorization: Bearer <token>
2. 計算 SHA-256(token) → token_hash
3. SELECT * FROM user_tokens
   WHERE token_hash = @hash
     AND expires_at > GETDATE()
     AND is_revoked = 0
4. 查無紀錄 → 401 Unauthorized
5. 查到紀錄 → 以 account 查 NaNa DB（或 Redis 快取）取得 req.user，繼續執行
```

---

## 3. articles（知識文章）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 | 說明 |
|------|------|------|------|
| `id` | `INT` | PK, IDENTITY | |
| `title` | `NVARCHAR(500)` | NOT NULL | 文章標題 |
| `content` | `NVARCHAR(MAX)` | NOT NULL | Markdown 內文 |
| `is_published` | `BIT` | NOT NULL, DEFAULT 0 | 是否已發布 |
| `is_public` | `BIT` | NOT NULL, DEFAULT 0 | 是否跨部門公開 |
| `access_dept` | `NVARCHAR(20)` | NULL | hasAccess.部門代碼 |
| `access_members` | `NVARCHAR(MAX)` | NULL | hasAccess.人員，JSON 陣列如 `["GV112001"]` |
| `access_level` | `INT` | NULL | hasAccess.職級門檻 |
| `version_number` | `INT` | NOT NULL, DEFAULT 1 | 目前版本號 |
| `created_by` | `NVARCHAR(50)` | NOT NULL | 員工工號 |
| `created_by_name` | `NVARCHAR(100)` | NOT NULL | 員工姓名（快照） |
| `updated_by` | `NVARCHAR(50)` | NOT NULL | 員工工號 |
| `updated_by_name` | `NVARCHAR(100)` | NOT NULL | 員工姓名（快照） |
| `created_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | |
| `updated_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | |

---

## 4. article_version_history（文章版本歷史）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 | 說明 |
|------|------|------|------|
| `id` | `INT` | PK, IDENTITY | |
| `article_id` | `INT` | NOT NULL, FK → articles.id | |
| `version_number` | `INT` | NOT NULL | 版本號 |
| `content` | `NVARCHAR(MAX)` | NOT NULL | Markdown 快照 |
| `diff_summary` | `NVARCHAR(500)` | NULL | 修改說明 |
| `editor_id` | `NVARCHAR(50)` | NOT NULL | 員工工號 |
| `editor_name` | `NVARCHAR(100)` | NOT NULL | 員工姓名（快照） |
| `saved_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | |

```sql
CREATE INDEX IX_article_version_article_id
    ON article_version_history (article_id, version_number DESC);
```

---

## 5. attachments（附件包）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 | 說明 |
|------|------|------|------|
| `id` | `INT` | PK, IDENTITY | |
| `title` | `NVARCHAR(500)` | NOT NULL | |
| `description` | `NVARCHAR(MAX)` | NULL | |
| `is_published` | `BIT` | NOT NULL, DEFAULT 0 | |
| `is_public` | `BIT` | NOT NULL, DEFAULT 0 | |
| `access_dept` | `NVARCHAR(20)` | NULL | hasAccess.部門代碼 |
| `access_members` | `NVARCHAR(MAX)` | NULL | hasAccess.人員，JSON 陣列 |
| `access_level` | `INT` | NULL | hasAccess.職級門檻 |
| `version_number` | `INT` | NOT NULL, DEFAULT 1 | |
| `created_by` | `NVARCHAR(50)` | NOT NULL | |
| `created_by_name` | `NVARCHAR(100)` | NOT NULL | |
| `updated_by` | `NVARCHAR(50)` | NOT NULL | |
| `updated_by_name` | `NVARCHAR(100)` | NOT NULL | |
| `created_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | |
| `updated_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | |

---

## 6. attachment_files（附件包內的單一檔案）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 | 說明 |
|------|------|------|------|
| `id` | `INT` | PK, IDENTITY | |
| `attachment_id` | `INT` | NOT NULL, FK → attachments.id | |
| `uuid` | `NVARCHAR(36)` | NOT NULL, UNIQUE | 檔案唯一識別 |
| `name` | `NVARCHAR(500)` | NOT NULL | 原始檔名 |
| `size` | `BIGINT` | NOT NULL | 位元組 |
| `mime_type` | `NVARCHAR(200)` | NOT NULL | MIME 類型 |
| `storage_path` | `NVARCHAR(MAX)` | NOT NULL | Docker Volume 實體路徑 |
| `url` | `NVARCHAR(MAX)` | NOT NULL | 對外存取 URL |
| `version_number` | `INT` | NOT NULL | 所屬附件版本號 |
| `created_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | |

---

## 7. attachment_version_history（附件版本歷史）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 | 說明 |
|------|------|------|------|
| `id` | `INT` | PK, IDENTITY | |
| `attachment_id` | `INT` | NOT NULL, FK → attachments.id | |
| `version_number` | `INT` | NOT NULL | |
| `diff_summary` | `NVARCHAR(500)` | NULL | |
| `editor_id` | `NVARCHAR(50)` | NOT NULL | |
| `editor_name` | `NVARCHAR(100)` | NOT NULL | |
| `saved_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | |

---

## 8. directories（目錄節點）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 | 說明 |
|------|------|------|------|
| `id` | `NVARCHAR(100)` | PK | 自訂字串 id，如 `dir-1`、`dir-trash-s1800` |
| `parent_id` | `NVARCHAR(100)` | NULL, FK → directories.id | 根節點為 NULL |
| `type` | `NVARCHAR(20)` | NOT NULL | `company` / `department` / `directory` / `article` / `attachment` / `trash` |
| `label` | `NVARCHAR(500)` | NOT NULL | 顯示名稱 |
| `sort_order` | `INT` | NULL | 僅 `directory` 節點使用，同層排序 |
| `org_oid` | `NVARCHAR(50)` | NULL | `company` 節點專用 |
| `dept_code` | `NVARCHAR(20)` | NULL | `department` 節點專用 |
| `article_id` | `INT` | NULL, FK → articles.id | `article` 節點專用 |
| `attachment_id` | `INT` | NULL, FK → attachments.id | `attachment` 節點專用 |
| `is_public` | `BIT` | NULL | `article` / `attachment` 節點快照 |
| `created_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | |
| `updated_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | |

---

## 9. tags（標籤）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 | 說明 |
|------|------|------|------|
| `id` | `INT` | PK, IDENTITY | |
| `name` | `NVARCHAR(100)` | NOT NULL, UNIQUE | |
| `created_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | |

---

## 10. article_tags（文章 ↔ 標籤 多對多）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 |
|------|------|------|
| `article_id` | `INT` | PK, FK → articles.id |
| `tag_id` | `INT` | PK, FK → tags.id |

---

## 11. attachment_tags（附件 ↔ 標籤 多對多）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 |
|------|------|------|
| `attachment_id` | `INT` | PK, FK → attachments.id |
| `tag_id` | `INT` | PK, FK → tags.id |

---

## 12. article_attachments（文章 ↔ 附件 多對多）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 | 說明 |
|------|------|------|------|
| `article_id` | `INT` | PK, FK → articles.id | |
| `attachment_id` | `INT` | PK, FK → attachments.id | |

> 維護雙向關聯：`Article.attachmentIds` ↔ `Attachment.linkedArticleIds`，任一端更新時此表同步。

---

## 13. article_editors（文章 ↔ 編輯者 多對多）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 |
|------|------|------|
| `article_id` | `INT` | PK, FK → articles.id |
| `editor_account` | `NVARCHAR(50)` | PK（員工工號） |

---

## 14. attachment_editors（附件 ↔ 編輯者 多對多）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 |
|------|------|------|
| `attachment_id` | `INT` | PK, FK → attachments.id |
| `editor_account` | `NVARCHAR(50)` | PK（員工工號） |

---

## 15. comments（留言）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 | 說明 |
|------|------|------|------|
| `id` | `INT` | PK, IDENTITY | |
| `article_id` | `INT` | NOT NULL, FK → articles.id | |
| `author_account` | `NVARCHAR(50)` | NOT NULL | 員工工號 |
| `author_name` | `NVARCHAR(100)` | NOT NULL | 員工姓名（快照） |
| `content` | `NVARCHAR(MAX)` | NOT NULL | |
| `mentions` | `NVARCHAR(MAX)` | NULL | JSON 陣列，如 `["GV112001","S094009"]` |
| `created_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | |

---

## 16. comment_reads（留言已讀狀態）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 | 說明 |
|------|------|------|------|
| `comment_id` | `INT` | PK, FK → comments.id | |
| `account` | `NVARCHAR(50)` | PK（員工工號） | |
| `read_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | |

> 對應 `Comment.isRead: { [員工工號]: boolean }` 的平展儲存。

---

## 17. notifications（通知）

**所在資料庫：KB DB**

| 欄位 | 型別 | 限制 | 說明 |
|------|------|------|------|
| `id` | `INT` | PK, IDENTITY | |
| `target_account` | `NVARCHAR(50)` | NOT NULL | 通知對象員工工號 |
| `article_id` | `INT` | NOT NULL, FK → articles.id | |
| `article_title` | `NVARCHAR(500)` | NOT NULL | 文章標題快照 |
| `mentioned_by_account` | `NVARCHAR(50)` | NOT NULL | 發出 Mention 的員工工號 |
| `mentioned_by_name` | `NVARCHAR(100)` | NOT NULL | 員工姓名（快照） |
| `comment_id` | `INT` | NOT NULL, FK → comments.id | |
| `comment_preview` | `NVARCHAR(200)` | NOT NULL | 留言預覽（前 100 字） |
| `is_read` | `BIT` | NOT NULL, DEFAULT 0 | |
| `created_at` | `DATETIME2` | NOT NULL, DEFAULT GETDATE() | |

```sql
CREATE INDEX IX_notifications_target
    ON notifications (target_account, is_read, created_at DESC);
```

---

## 18. Table 關聯總覽

```
【外部資料來源 — NaNa DB (10.10.130.190)】
  原生 SQL 查詢，唯讀，不存入 KB DB
  提供：員工工號、姓名、部門、職級、主管等

【KB DB — 本系統自建資料表】

user_tokens
  ├── account ─────────────────────────────────► (NaNa DB 員工工號，無 FK)
  └── token_hash ──UNIQUE INDEX

articles
  ├── id ──1:N──► article_version_history.article_id
  ├── id ──N:M──► article_tags           (中間表)
  ├── id ──N:M──► article_attachments    (中間表) ◄──N:M── attachments.id
  ├── id ──N:M──► article_editors        (中間表)
  ├── id ──1:N──► comments.article_id
  ├── id ──1:N──► notifications.article_id
  └── id ──1:N──► directories.article_id   [type=article 節點]

attachments
  ├── id ──1:N──► attachment_files.attachment_id
  ├── id ──1:N──► attachment_version_history.attachment_id
  ├── id ──N:M──► attachment_tags        (中間表)
  ├── id ──N:M──► attachment_editors     (中間表)
  └── id ──1:N──► directories.attachment_id  [type=attachment 節點]

comments
  ├── id ──1:N──► comment_reads.comment_id
  └── id ──1:N──► notifications.comment_id

directories
  └── id ──1:N──► directories.parent_id  (自我參照，巢狀樹狀結構)

tags
  ├── id ──N:M──► article_tags.tag_id
  └── id ──N:M──► attachment_tags.tag_id
```
