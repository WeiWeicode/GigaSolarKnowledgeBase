-- ============================================================
-- GigaSolar Knowledge Base — KB DB 建表腳本
-- 依據 docs/04_DB_SCHEMA.md
-- 執行環境：MS SQL Server
-- 執行前請先切換到正確的資料庫（修改下方 USE 語句）
-- ============================================================

USE [KnowledgeBase];  -- ← 請替換成實際的 KB DB 名稱
GO

-- ============================================================
-- 1. tags（標籤）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tags')
BEGIN
    CREATE TABLE tags (
        id          INT             IDENTITY(1,1)   PRIMARY KEY,
        name        NVARCHAR(100)   NOT NULL,
        created_at  DATETIME2       NOT NULL        DEFAULT GETDATE(),

        CONSTRAINT UQ_tags_name UNIQUE (name)
    );
    PRINT 'tags：建立成功';
END
ELSE
    PRINT 'tags：已存在，跳過';
GO

-- ============================================================
-- 2. articles（知識文章）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'articles')
BEGIN
    CREATE TABLE articles (
        id                  INT             IDENTITY(1,1)   PRIMARY KEY,
        title               NVARCHAR(500)   NOT NULL,
        content             NVARCHAR(MAX)   NOT NULL,
        is_published        BIT             NOT NULL        DEFAULT 0,
        is_public           BIT             NOT NULL        DEFAULT 0,
        -- HasAccess
        access_dept         NVARCHAR(20)    NULL,                           -- hasAccess.部門代碼
        access_members      NVARCHAR(MAX)   NULL,                           -- hasAccess.人員，JSON 陣列 '["GV112001"]'
        access_level        INT             NULL,                           -- hasAccess.職級門檻
        -- 版本
        version_number      INT             NOT NULL        DEFAULT 1,
        -- 建立者（快照）
        created_by          NVARCHAR(50)    NOT NULL,
        created_by_name     NVARCHAR(100)   NOT NULL,
        -- 最後更新者（快照）
        updated_by          NVARCHAR(50)    NOT NULL,
        updated_by_name     NVARCHAR(100)   NOT NULL,
        -- 時間戳
        created_at          DATETIME2       NOT NULL        DEFAULT GETDATE(),
        updated_at          DATETIME2       NOT NULL        DEFAULT GETDATE()
    );
    PRINT 'articles：建立成功';
END
ELSE
    PRINT 'articles：已存在，跳過';
GO

-- ============================================================
-- 3. article_version_history（文章版本歷史）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'article_version_history')
BEGIN
    CREATE TABLE article_version_history (
        id              INT             IDENTITY(1,1)   PRIMARY KEY,
        article_id      INT             NOT NULL,
        version_number  INT             NOT NULL,
        content         NVARCHAR(MAX)   NOT NULL,           -- Markdown 快照
        diff_summary    NVARCHAR(500)   NULL,               -- 修改說明
        editor_id       NVARCHAR(50)    NOT NULL,           -- 員工工號
        editor_name     NVARCHAR(100)   NOT NULL,           -- 員工姓名（快照）
        saved_at        DATETIME2       NOT NULL        DEFAULT GETDATE(),

        CONSTRAINT FK_article_version_article
            FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_article_version_article_id
        ON article_version_history (article_id, version_number DESC);

    PRINT 'article_version_history：建立成功';
END
ELSE
    PRINT 'article_version_history：已存在，跳過';
GO

-- ============================================================
-- 4. article_tags（文章 ↔ 標籤 多對多）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'article_tags')
BEGIN
    CREATE TABLE article_tags (
        article_id  INT NOT NULL,
        tag_id      INT NOT NULL,

        CONSTRAINT PK_article_tags PRIMARY KEY (article_id, tag_id),
        CONSTRAINT FK_article_tags_article
            FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
        CONSTRAINT FK_article_tags_tag
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
    PRINT 'article_tags：建立成功';
END
ELSE
    PRINT 'article_tags：已存在，跳過';
GO

-- ============================================================
-- 5. article_editors（文章 ↔ 編輯者 多對多）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'article_editors')
BEGIN
    CREATE TABLE article_editors (
        article_id      INT             NOT NULL,
        editor_account  NVARCHAR(50)    NOT NULL,           -- 員工工號

        CONSTRAINT PK_article_editors PRIMARY KEY (article_id, editor_account),
        CONSTRAINT FK_article_editors_article
            FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );
    PRINT 'article_editors：建立成功';
END
ELSE
    PRINT 'article_editors：已存在，跳過';
GO

-- ============================================================
-- 6. attachments（附件包）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'attachments')
BEGIN
    CREATE TABLE attachments (
        id                  INT             IDENTITY(1,1)   PRIMARY KEY,
        title               NVARCHAR(500)   NOT NULL,
        description         NVARCHAR(MAX)   NULL,
        is_published        BIT             NOT NULL        DEFAULT 0,
        is_public           BIT             NOT NULL        DEFAULT 0,
        -- HasAccess
        access_dept         NVARCHAR(20)    NULL,
        access_members      NVARCHAR(MAX)   NULL,           -- JSON 陣列
        access_level        INT             NULL,
        -- 版本
        version_number      INT             NOT NULL        DEFAULT 1,
        -- 建立者（快照）
        created_by          NVARCHAR(50)    NOT NULL,
        created_by_name     NVARCHAR(100)   NOT NULL,
        -- 最後更新者（快照）
        updated_by          NVARCHAR(50)    NOT NULL,
        updated_by_name     NVARCHAR(100)   NOT NULL,
        -- 時間戳
        created_at          DATETIME2       NOT NULL        DEFAULT GETDATE(),
        updated_at          DATETIME2       NOT NULL        DEFAULT GETDATE()
    );
    PRINT 'attachments：建立成功';
END
ELSE
    PRINT 'attachments：已存在，跳過';
GO

-- ============================================================
-- 7. attachment_files（附件包內的單一檔案）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'attachment_files')
BEGIN
    CREATE TABLE attachment_files (
        id              INT             IDENTITY(1,1)   PRIMARY KEY,
        attachment_id   INT             NOT NULL,
        uuid            NVARCHAR(36)    NOT NULL,           -- 檔案唯一識別（UUID v4）
        name            NVARCHAR(500)   NOT NULL,           -- 原始檔名
        size            BIGINT          NOT NULL,           -- 位元組
        mime_type       NVARCHAR(200)   NOT NULL,
        storage_path    NVARCHAR(MAX)   NOT NULL,           -- 實體儲存路徑
        url             NVARCHAR(MAX)   NOT NULL,           -- 對外存取 URL
        version_number  INT             NOT NULL,           -- 所屬附件版本號（新上傳時打版本號）
        created_at      DATETIME2       NOT NULL        DEFAULT GETDATE(),

        CONSTRAINT UQ_attachment_files_uuid UNIQUE (uuid),
        CONSTRAINT FK_attachment_files_attachment
            FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_attachment_files_attachment_id
        ON attachment_files (attachment_id);

    PRINT 'attachment_files：建立成功';
END
ELSE
    PRINT 'attachment_files：已存在，跳過';
GO

-- ============================================================
-- 8. attachment_version_history（附件版本歷史）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'attachment_version_history')
BEGIN
    CREATE TABLE attachment_version_history (
        id              INT             IDENTITY(1,1)   PRIMARY KEY,
        attachment_id   INT             NOT NULL,
        version_number  INT             NOT NULL,
        diff_summary    NVARCHAR(500)   NULL,
        editor_id       NVARCHAR(50)    NOT NULL,
        editor_name     NVARCHAR(100)   NOT NULL,
        saved_at        DATETIME2       NOT NULL        DEFAULT GETDATE(),

        CONSTRAINT FK_attachment_version_attachment
            FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_attachment_version_attachment_id
        ON attachment_version_history (attachment_id, version_number DESC);

    PRINT 'attachment_version_history：建立成功';
END
ELSE
    PRINT 'attachment_version_history：已存在，跳過';
GO

-- ============================================================
-- 9. attachment_tags（附件 ↔ 標籤 多對多）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'attachment_tags')
BEGIN
    CREATE TABLE attachment_tags (
        attachment_id   INT NOT NULL,
        tag_id          INT NOT NULL,

        CONSTRAINT PK_attachment_tags PRIMARY KEY (attachment_id, tag_id),
        CONSTRAINT FK_attachment_tags_attachment
            FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE,
        CONSTRAINT FK_attachment_tags_tag
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
    PRINT 'attachment_tags：建立成功';
END
ELSE
    PRINT 'attachment_tags：已存在，跳過';
GO

-- ============================================================
-- 10. attachment_editors（附件 ↔ 編輯者 多對多）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'attachment_editors')
BEGIN
    CREATE TABLE attachment_editors (
        attachment_id   INT             NOT NULL,
        editor_account  NVARCHAR(50)    NOT NULL,           -- 員工工號

        CONSTRAINT PK_attachment_editors PRIMARY KEY (attachment_id, editor_account),
        CONSTRAINT FK_attachment_editors_attachment
            FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
    );
    PRINT 'attachment_editors：建立成功';
END
ELSE
    PRINT 'attachment_editors：已存在，跳過';
GO

-- ============================================================
-- 11. article_attachments（文章 ↔ 附件 多對多）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'article_attachments')
BEGIN
    CREATE TABLE article_attachments (
        article_id      INT NOT NULL,
        attachment_id   INT NOT NULL,

        CONSTRAINT PK_article_attachments PRIMARY KEY (article_id, attachment_id),
        CONSTRAINT FK_article_attachments_article
            FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
        CONSTRAINT FK_article_attachments_attachment
            FOREIGN KEY (attachment_id) REFERENCES attachments(id)
            -- 不加 ON DELETE CASCADE，避免與 articles 的 CASCADE 產生多路徑衝突
    );
    PRINT 'article_attachments：建立成功';
END
ELSE
    PRINT 'article_attachments：已存在，跳過';
GO

-- ============================================================
-- 12. directories（目錄節點）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'directories')
BEGIN
    CREATE TABLE directories (
        id              NVARCHAR(100)   NOT NULL,           -- 自訂字串 id，如 dir-1、dir-trash-s1800
        parent_id       NVARCHAR(100)   NULL,               -- 根節點為 NULL；自我參照 FK
        type            NVARCHAR(20)    NOT NULL,           -- company|department|directory|article|attachment|trash
        label           NVARCHAR(500)   NOT NULL,
        sort_order      INT             NULL,               -- 僅 directory 節點使用，同層排序
        -- 各 type 專用欄位
        org_oid         NVARCHAR(50)    NULL,               -- company 節點專用
        dept_code       NVARCHAR(20)    NULL,               -- department 節點專用
        article_id      INT             NULL,               -- article 節點專用
        attachment_id   INT             NULL,               -- attachment 節點專用
        is_public       BIT             NULL,               -- article/attachment 節點的 isPublic 快照
        -- 時間戳
        created_at      DATETIME2       NOT NULL    DEFAULT GETDATE(),
        updated_at      DATETIME2       NOT NULL    DEFAULT GETDATE(),

        CONSTRAINT PK_directories PRIMARY KEY (id),
        CONSTRAINT FK_directories_parent
            FOREIGN KEY (parent_id) REFERENCES directories(id),
        CONSTRAINT FK_directories_article
            FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL,
        CONSTRAINT FK_directories_attachment
            FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE SET NULL,
        CONSTRAINT CK_directories_type
            CHECK (type IN ('company', 'department', 'directory', 'article', 'attachment', 'trash'))
    );

    CREATE INDEX IX_directories_parent_id
        ON directories (parent_id);

    CREATE INDEX IX_directories_dept_code
        ON directories (dept_code);

    CREATE INDEX IX_directories_article_id
        ON directories (article_id);

    CREATE INDEX IX_directories_attachment_id
        ON directories (attachment_id);

    PRINT 'directories：建立成功';
END
ELSE
    PRINT 'directories：已存在，跳過';
GO

-- ============================================================
-- 13. comments（留言）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'comments')
BEGIN
    CREATE TABLE comments (
        id              INT             IDENTITY(1,1)   PRIMARY KEY,
        article_id      INT             NOT NULL,
        author_account  NVARCHAR(50)    NOT NULL,           -- 員工工號
        author_name     NVARCHAR(100)   NOT NULL,           -- 員工姓名（快照）
        content         NVARCHAR(MAX)   NOT NULL,
        mentions        NVARCHAR(MAX)   NULL,               -- JSON 陣列 '["GV112001","S094009"]'
        created_at      DATETIME2       NOT NULL        DEFAULT GETDATE(),

        CONSTRAINT FK_comments_article
            FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_comments_article_id
        ON comments (article_id, created_at ASC);

    PRINT 'comments：建立成功';
END
ELSE
    PRINT 'comments：已存在，跳過';
GO

-- ============================================================
-- 14. comment_reads（留言已讀狀態）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'comment_reads')
BEGIN
    CREATE TABLE comment_reads (
        comment_id  INT             NOT NULL,
        account     NVARCHAR(50)    NOT NULL,               -- 員工工號
        read_at     DATETIME2       NOT NULL    DEFAULT GETDATE(),

        CONSTRAINT PK_comment_reads PRIMARY KEY (comment_id, account),
        CONSTRAINT FK_comment_reads_comment
            FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
    );
    PRINT 'comment_reads：建立成功';
END
ELSE
    PRINT 'comment_reads：已存在，跳過';
GO

-- ============================================================
-- 15. notifications（通知）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'notifications')
BEGIN
    CREATE TABLE notifications (
        id                      INT             IDENTITY(1,1)   PRIMARY KEY,
        target_account          NVARCHAR(50)    NOT NULL,       -- 通知對象員工工號
        article_id              INT             NOT NULL,
        article_title           NVARCHAR(500)   NOT NULL,       -- 文章標題快照
        mentioned_by_account    NVARCHAR(50)    NOT NULL,       -- 發出 Mention 的員工工號
        mentioned_by_name       NVARCHAR(100)   NOT NULL,       -- 員工姓名（快照）
        comment_id              INT             NOT NULL,
        comment_preview         NVARCHAR(200)   NOT NULL,       -- 留言預覽（前 100 字）
        is_read                 BIT             NOT NULL        DEFAULT 0,
        created_at              DATETIME2       NOT NULL        DEFAULT GETDATE(),

        CONSTRAINT FK_notifications_article
            FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
        CONSTRAINT FK_notifications_comment
            FOREIGN KEY (comment_id) REFERENCES comments(id)
            -- 不加 CASCADE，comments 已透過 articles CASCADE，避免多路徑衝突
    );

    CREATE INDEX IX_notifications_target
        ON notifications (target_account, is_read, created_at DESC);

    PRINT 'notifications：建立成功';
END
ELSE
    PRINT 'notifications：已存在，跳過';
GO

-- ============================================================
-- 16. user_tokens（登入 Token 紀錄）
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'user_tokens')
BEGIN
    CREATE TABLE user_tokens (
        id          INT             IDENTITY(1,1)   PRIMARY KEY,
        account     NVARCHAR(50)    NOT NULL,               -- 員工工號（對應 NaNa DB，無 FK）
        token       NVARCHAR(MAX)   NOT NULL,               -- BPM 核發的 JWT 原文
        token_hash  NVARCHAR(64)    NOT NULL,               -- SHA-256(token) hex，用於索引查詢
        login_at    DATETIME2       NOT NULL        DEFAULT GETDATE(),
        expires_at  DATETIME2       NOT NULL,               -- 從 JWT payload exp 解析
        ip_address  NVARCHAR(45)    NULL,                   -- 登入來源 IP（IPv4/IPv6）
        is_revoked  BIT             NOT NULL        DEFAULT 0,  -- logout 時設為 1
        created_at  DATETIME2       NOT NULL        DEFAULT GETDATE()
    );

    -- token_hash 為 NVARCHAR(64)，可正常建立唯一索引
    CREATE UNIQUE INDEX IX_user_tokens_token_hash
        ON user_tokens (token_hash);

    CREATE INDEX IX_user_tokens_account
        ON user_tokens (account);

    -- 方便定期清除過期 token
    CREATE INDEX IX_user_tokens_expires
        ON user_tokens (expires_at, is_revoked);

    PRINT 'user_tokens：建立成功';
END
ELSE
    PRINT 'user_tokens：已存在，跳過';
GO

-- ============================================================
-- 完成
-- ============================================================
PRINT '========================================';
PRINT '所有資料表建立完成（共 16 張）';
PRINT '========================================';
