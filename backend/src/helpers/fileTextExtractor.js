/**
 * fileTextExtractor - 共用的 Word/PDF 文字抽取邏輯
 * 供 aiController.writingAssist（上傳檔案）與
 * attachmentController.extractFileText（已存磁碟的附件檔案）共用，避免重複程式碼。
 */
const mammoth       = require('mammoth');
const pdfParse      = require('pdf-parse');
const WordExtractor = require('word-extractor');

// 目前支援抽取文字的格式：PDF、舊版 .doc、.docx（見 AI_CHAT_MAIN_PAGE_PLAN.md 決策 1）
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function isSupportedMimeType(mimeType) {
  return SUPPORTED_MIME_TYPES.includes(mimeType);
}

// 舊版 .doc（Word 97-2003）是 OLE Compound File 二進位格式，開頭固定為這 8 bytes；
// .docx 則是 ZIP（OOXML），開頭是 "PK"。mammoth 只支援解析 .docx，
// 若直接把舊版 .doc 丟給 mammoth.extractRawText，會拋出令人困惑的
// "Can't find end of central directory : is this a zip file ?" 錯誤（因為它嘗試把檔案當 zip 解開）。
// 因此改為以檔頭 magic bytes 判斷格式，舊版 .doc 交給 word-extractor 解析。
// 註：不能只看 mime_type 或副檔名——實務上兩者都可能與真實格式不符（例如把 .doc
// 另存成 .docx 但沿用舊格式），檔頭才是可靠依據。
const LEGACY_DOC_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function isLegacyDocBuffer(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(LEGACY_DOC_SIGNATURE);
}

/**
 * @param {Buffer} buffer 檔案內容
 * @param {string} mimeType
 * @returns {Promise<string>} 抽取出的純文字（可能為空字串，例如掃描圖片型 PDF）
 */
async function extractTextFromBuffer(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    const result = await pdfParse(buffer);
    return result.text || '';
  }
  // 舊版 .doc（Word 97-2003）：word-extractor 支援直接吃 Buffer
  if (isLegacyDocBuffer(buffer)) {
    const doc = await new WordExtractor().extract(buffer);
    return doc.getBody() || '';
  }
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

module.exports = { SUPPORTED_MIME_TYPES, isSupportedMimeType, extractTextFromBuffer };
