/**
 * Comment Controller
 * 處理文章留言與通知觸發
 */
const { Comment, CommentRead, Notification, Article, sequelize } = require('../models');

/**
 * 取得文章留言列表 (含已讀狀態)
 * GET /api/v1/articles/:articleId/comments
 */
async function getCommentsByArticle(req, res) {
  try {
    const { articleId } = req.params;

    const comments = await Comment.findAll({
      where: { article_id: articleId },
      include: [
        { model: CommentRead, as: 'Reads', attributes: ['account'] }
      ],
      order: [['created_at', 'ASC']]
    });

    // 組裝回應資料，將 Reads 轉換為 isRead 物件方便前端判斷
    const formatted = comments.map(c => {
      const plain = c.get({ plain: true });
      const readMap = {};
      plain.Reads.forEach(r => {
        readMap[r.account] = true;
      });
      delete plain.Reads;
      return {
        ...plain,
        isRead: readMap
      };
    });

    return res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('getCommentsByArticle error:', error.message);
    return res.status(500).json({ success: false, message: '取得留言失敗' });
  }
}

/**
 * 新增留言
 * POST /api/v1/articles/:articleId/comments
 */
async function createComment(req, res) {
  const t = await sequelize.transaction();
  try {
    const { articleId } = req.params;
    const { content, mentions: clientMentions } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, message: '留言內容不可為空' });
    }

    const article = await Article.findByPk(articleId);
    if (!article) {
      return res.status(404).json({ success: false, message: '文章不存在' });
    }

    // 優先使用前端明確傳入的工號陣列；若無則 fallback 至內文 parse（保留相容）
    let mentions;
    if (Array.isArray(clientMentions)) {
      // 前端已明確傳入工號陣列，直接使用
      mentions = clientMentions;
    } else {
      // fallback: 僅抓英數工號（舊版相容）
      const mentionMatches = content.match(/@([A-Za-z0-9]+)/g) || [];
      mentions = mentionMatches.map(m => m.substring(1));
    }

    // 建立留言
    const comment = await Comment.create({
      article_id: articleId,
      author_account: req.user.員工工號,
      author_name: req.user.員工姓名,
      content,
      mentions: mentions
    }, { transaction: t });

    // 自動標記作者已讀
    await CommentRead.create({
      comment_id: comment.id,
      account: req.user.員工工號
    }, { transaction: t });

    // 產生 Mention 通知
    if (mentions.length > 0) {
      const notifications = mentions
        .filter(acc => acc !== req.user.員工工號) // 不用通知自己
        .map(acc => ({
          target_account: acc,
          article_id: articleId,
          article_title: article.title,
          mentioned_by_account: req.user.員工工號,
          mentioned_by_name: req.user.員工姓名,
          comment_id: comment.id,
          comment_preview: content.substring(0, 100),
          is_read: false
        }));

      if (notifications.length > 0) {
        await Notification.bulkCreate(notifications, { transaction: t });
      }
    }

    await t.commit();

    // 回傳包含 isRead 的完整格式
    return res.status(201).json({
      success: true,
      data: {
        ...comment.get({ plain: true }),
        isRead: { [req.user.員工工號]: true }
      }
    });
  } catch (error) {
    await t.rollback();
    console.error('createComment error:', error.message);
    return res.status(500).json({ success: false, message: '留言失敗' });
  }
}

/**
 * 標記留言為已讀
 * PATCH /api/v1/comments/:id/read
 */
async function markCommentAsRead(req, res) {
  try {
    const { id } = req.params;
    const account = req.user.員工工號;

    // 使用 findOrCreate 避免重複寫入
    await CommentRead.findOrCreate({
      where: { comment_id: id, account },
      defaults: { comment_id: id, account }
    });

    return res.json({ success: true, message: '已標記為已讀' });
  } catch (error) {
    console.error('markCommentAsRead error:', error.message);
    return res.status(500).json({ success: false, message: '操作失敗' });
  }
}

module.exports = {
  getCommentsByArticle,
  createComment,
  markCommentAsRead
};
