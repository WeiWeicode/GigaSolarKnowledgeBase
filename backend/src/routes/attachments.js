const express = require('express');
const router = express.Router();
const attachmentController = require('../controllers/attachmentController');
const versionRouter = require('./versions');
const { authMiddleware } = require('../middlewares/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- Multer 設定 (用於附件檔案上傳) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const attachmentDir = path.join(uploadDir, 'attachments');
    
    // 確保目錄存在
    if (!fs.existsSync(attachmentDir)) {
      fs.mkdirSync(attachmentDir, { recursive: true });
    }
    cb(null, attachmentDir);
  },
  filename: (req, file, cb) => {
    // 檔名：時間戳-隨機數-原始副檔名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 限制單一檔案 50MB
});

// 所有附件路由均需登入
router.use(authMiddleware);

/**
 * @route GET /api/v1/attachments
 * @desc  取得附件包列表
 */
router.get('/', attachmentController.getAllAttachments);

/**
 * @route POST /api/v1/attachments/upload
 * @desc  批次上傳實體檔案 (回傳檔案資訊，不寫 DB)
 */
router.post('/upload', upload.array('files', 10), attachmentController.uploadFiles);

/**
 * @route GET /api/v1/attachments/search
 * @desc  搜尋附件
 */
router.get('/search', attachmentController.searchAttachments);


/**
 * @route GET /api/v1/attachments/files/:uuid/download
 * @desc  下載附件檔案（透過 UUID 識別）
 * 必須放在 /:id 之前，防止 express 把 'files' 當成 :id
 */
router.get('/files/:uuid/download', attachmentController.downloadFile);

/**
 * @route GET /api/v1/attachments/files/:uuid/extract-text
 * @desc  抽取附件檔案文字內容（僅支援 PDF/Word，供 AI 問答頁面拖曳引用使用）
 * 必須放在 /:id 之前，防止 express 把 'files' 當成 :id
 */
router.get('/files/:uuid/extract-text', attachmentController.extractFileText);

/**
 * @route GET /api/v1/attachments/:id
 * @desc  取得單一附件包
 */
router.get('/:id', attachmentController.getAttachmentById);

/**
 * @route POST /api/v1/attachments
 * @desc  建立新附件包 (將上傳後的檔案資訊寫入 DB)
 */
router.post('/', attachmentController.createAttachment);

/**
 * @route PUT /api/v1/attachments/:id
 * @desc  更新附件包
 */
router.put('/:id', attachmentController.updateAttachment);

// --- 子路由 ---
router.use('/:attachmentId/versions', versionRouter);

module.exports = router;
