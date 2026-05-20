const express = require('express');
const router = express.Router();
const articleController = require('../controllers/articleController');
const commentRouter = require('./comments');
const versionRouter = require('./versions');
const { authMiddleware } = require('../middlewares/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- Multer 設定 (用於文章插圖上傳) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const imageDir = path.join(uploadDir, 'images');
    
    // 確保目錄存在
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }
    cb(null, imageDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 限制 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只允許上傳圖片檔案 (jpg, png, gif)'));
    }
  }
});

// 所有文章路由均需登入
router.use(authMiddleware);

/**
 * @route GET /api/v1/articles
 * @desc  取得文章列表
 */
router.get('/', articleController.getAllArticles);

/**
 * @route GET /api/v1/articles/search
 * @desc  全文搜尋文章
 */
router.get('/search', articleController.searchArticles);

/**
 * @route POST /api/v1/articles/upload-image
 * @desc  上傳文章插圖
 */
router.post('/upload-image', upload.single('image'), articleController.uploadImage);

/**
 * @route GET /api/v1/articles/:id
 * @desc  取得單一文章
 */
router.get('/:id', articleController.getArticleById);

/**
 * @route POST /api/v1/articles
 * @desc  建立新文章
 */
router.post('/', articleController.createArticle);

/**
 * @route PUT /api/v1/articles/:id
 * @desc  更新文章內容
 */
router.put('/:id', articleController.updateArticle);

/**
 * @route PATCH /api/v1/articles/:id/tags
 * @desc  AI 建議標籤：新增標籤至文章（findOrCreate + addTags，不覆蓋現有標籤）
 * @body  { tagNames: string[] }
 */
router.patch('/:id/tags', articleController.addTagsToArticle);

// --- 子路由 ---
router.use('/:articleId/comments', commentRouter);
router.use('/:articleId/versions', versionRouter);

module.exports = router;
