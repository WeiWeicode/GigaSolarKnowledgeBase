/**
 * File Type Helper
 * 可送進 RAG 切分的檔案 MIME 白名單（PDF / Word），供 routes/ai.js 與 ragSyncService.js 共用。
 */
const SYNCABLE_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
];

module.exports = {
  SYNCABLE_MIME_TYPES,
};
