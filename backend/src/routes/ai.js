const { Router } = require('express');
const multer     = require('multer');
const { authMiddleware }           = require('../middlewares/auth');
const { summarize, writingAssist } = require('../controllers/aiController');

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('僅接受 .doc、.docx 或 .pdf 格式的檔案'));
    }
  },
});

// 處理 multer 檔案類型 / 大小錯誤
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? '檔案大小不可超過 5 MB' : err.message;
    return res.status(400).json({ success: false, message: msg });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
}

router.post('/summarize',      authMiddleware, summarize);
router.post('/writing-assist', authMiddleware, upload.single('file'), handleUploadError, writingAssist);

module.exports = router;
