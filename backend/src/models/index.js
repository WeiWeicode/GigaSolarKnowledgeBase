const { sequelize } = require('../config/sequelize');
const { DataTypes } = require('sequelize');

// ── 載入所有 Model ────────────────────────────────────────────
const Tag                      = require('./Tag');
const Article                  = require('./Article');
const ArticleVersionHistory    = require('./ArticleVersionHistory');
const Attachment               = require('./Attachment');
const AttachmentFile           = require('./AttachmentFile');
const AttachmentVersionHistory = require('./AttachmentVersionHistory');
const Directory                = require('./Directory');
const Comment                  = require('./Comment');
const Notification             = require('./Notification');
const UserToken  = require('./UserToken');
const UserRole   = require('./UserRole');
const UserExtraDepartment = require('./UserExtraDepartment');
const AiConfig   = require('./AiConfig');
const AiPromptTemplate = require('./AiPromptTemplate');
const RagSyncStatus = require('./RagSyncStatus');
const RagSyncConfig = require('./RagSyncConfig');
const RagSyncLog    = require('./RagSyncLog');


// ── 中間表 Model（定義在此，不另開檔案）─────────────────────

const ArticleTag = sequelize.define('ArticleTag', {
  article_id: { type: DataTypes.INTEGER, primaryKey: true },
  tag_id:     { type: DataTypes.INTEGER, primaryKey: true },
}, { tableName: 'article_tags', timestamps: false });

const ArticleEditor = sequelize.define('ArticleEditor', {
  article_id:     { type: DataTypes.INTEGER,     primaryKey: true },
  editor_account: { type: DataTypes.STRING(50),  primaryKey: true },
}, { tableName: 'article_editors', timestamps: false });

const AttachmentTag = sequelize.define('AttachmentTag', {
  attachment_id: { type: DataTypes.INTEGER, primaryKey: true },
  tag_id:        { type: DataTypes.INTEGER, primaryKey: true },
}, { tableName: 'attachment_tags', timestamps: false });

const AttachmentEditor = sequelize.define('AttachmentEditor', {
  attachment_id:  { type: DataTypes.INTEGER,    primaryKey: true },
  editor_account: { type: DataTypes.STRING(50), primaryKey: true },
}, { tableName: 'attachment_editors', timestamps: false });

const ArticleAttachment = sequelize.define('ArticleAttachment', {
  article_id:    { type: DataTypes.INTEGER, primaryKey: true },
  attachment_id: { type: DataTypes.INTEGER, primaryKey: true },
}, { tableName: 'article_attachments', timestamps: false });

// CommentRead：記錄哪位員工已讀哪則留言
// account 為員工工號（字串），非 FK → UserToken
const CommentRead = sequelize.define('CommentRead', {
  comment_id: { type: DataTypes.INTEGER,    primaryKey: true },
  account:    { type: DataTypes.STRING(50), primaryKey: true },
  read_at:    { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'comment_reads', timestamps: false });

// ── Associations ──────────────────────────────────────────────

// Article ↔ Tag (N:M)
Article.belongsToMany(Tag, { through: ArticleTag, foreignKey: 'article_id', otherKey: 'tag_id', as: 'Tags' });
Tag.belongsToMany(Article, { through: ArticleTag, foreignKey: 'tag_id', otherKey: 'article_id' });

// Article → ArticleEditor (1:N)
Article.hasMany(ArticleEditor, { foreignKey: 'article_id', as: 'Editors' });
ArticleEditor.belongsTo(Article, { foreignKey: 'article_id' });

// Article → ArticleVersionHistory (1:N)
Article.hasMany(ArticleVersionHistory, { foreignKey: 'article_id', as: 'Versions' });
ArticleVersionHistory.belongsTo(Article, { foreignKey: 'article_id' });

// Article ↔ Attachment (N:M)
Article.belongsToMany(Attachment, { through: ArticleAttachment, foreignKey: 'article_id', otherKey: 'attachment_id', as: 'Attachments' });
Attachment.belongsToMany(Article, { through: ArticleAttachment, foreignKey: 'attachment_id', otherKey: 'article_id', as: 'Articles' });

// Article → Comment (1:N)
Article.hasMany(Comment, { foreignKey: 'article_id', as: 'Comments' });
Comment.belongsTo(Article, { foreignKey: 'article_id' });

// Article → Notification (1:N)
Article.hasMany(Notification, { foreignKey: 'article_id' });
Notification.belongsTo(Article, { foreignKey: 'article_id' });

// Article → Directory 捷徑節點 (1:N)
Article.hasMany(Directory, { foreignKey: 'article_id', as: 'DirectoryNodes' });
Directory.belongsTo(Article, { foreignKey: 'article_id' });

// Attachment ↔ Tag (N:M)
Attachment.belongsToMany(Tag, { through: AttachmentTag, foreignKey: 'attachment_id', otherKey: 'tag_id', as: 'Tags' });
Tag.belongsToMany(Attachment, { through: AttachmentTag, foreignKey: 'tag_id', otherKey: 'attachment_id' });

// Attachment → AttachmentFile (1:N)
Attachment.hasMany(AttachmentFile, { foreignKey: 'attachment_id', as: 'Files' });
AttachmentFile.belongsTo(Attachment, { foreignKey: 'attachment_id' });

// Attachment → AttachmentEditor (1:N)
Attachment.hasMany(AttachmentEditor, { foreignKey: 'attachment_id', as: 'Editors' });
AttachmentEditor.belongsTo(Attachment, { foreignKey: 'attachment_id' });

// Attachment → AttachmentVersionHistory (1:N)
Attachment.hasMany(AttachmentVersionHistory, { foreignKey: 'attachment_id', as: 'Versions' });
AttachmentVersionHistory.belongsTo(Attachment, { foreignKey: 'attachment_id' });

// Attachment → Directory 捷徑節點 (1:N)
Attachment.hasMany(Directory, { foreignKey: 'attachment_id', as: 'DirectoryNodes' });
Directory.belongsTo(Attachment, { foreignKey: 'attachment_id' });

// Directory 自我參照（巢狀樹）
Directory.hasMany(Directory,  { foreignKey: 'parent_id', as: 'Children' });
Directory.belongsTo(Directory, { foreignKey: 'parent_id', as: 'Parent' });

// Comment → CommentRead (1:N)
Comment.hasMany(CommentRead, { foreignKey: 'comment_id', as: 'Reads' });
CommentRead.belongsTo(Comment, { foreignKey: 'comment_id' });

// Comment → Notification (1:N)
Comment.hasMany(Notification, { foreignKey: 'comment_id' });
Notification.belongsTo(Comment, { foreignKey: 'comment_id' });

// ── 匯出 ─────────────────────────────────────────────────────
module.exports = {
  sequelize,
  Tag,
  Article,
  ArticleVersionHistory,
  ArticleTag,
  ArticleEditor,
  Attachment,
  AttachmentFile,
  AttachmentVersionHistory,
  AttachmentTag,
  AttachmentEditor,
  ArticleAttachment,
  Directory,
  Comment,
  CommentRead,
  Notification,
  UserToken,
  UserRole,
  UserExtraDepartment,
  AiConfig,
  AiPromptTemplate,
  RagSyncStatus,
  RagSyncConfig,
  RagSyncLog,
};
