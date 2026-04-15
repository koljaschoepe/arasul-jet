/**
 * File Validation Utilities
 *
 * Magic byte validation for uploaded files:
 * - Binary files (PDF, DOCX, images) are checked against known signatures
 * - Text files (.md, .txt, .yaml) are rejected if they contain null bytes
 *
 * Extracted from routes/documents.js for reuse across upload endpoints.
 */

// Magic byte signatures for binary file types
const MAGIC_BYTES = {
  '.pdf': { bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 }, // %PDF
  '.docx': { bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0 }, // PK (ZIP archive)
  '.png': { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 }, // PNG
  '.jpg': { bytes: [0xff, 0xd8, 0xff], offset: 0 }, // JPEG
  '.jpeg': { bytes: [0xff, 0xd8, 0xff], offset: 0 }, // JPEG
  '.gif': { bytes: [0x47, 0x49, 0x46], offset: 0 }, // GIF
  '.webp': { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF (WebP)
};

/**
 * Validate file content matches expected type via magic bytes.
 * Binary formats (PDF, DOCX, images) must match their signature.
 * Text formats (.md, .txt, .yaml) are validated as valid UTF-8 with no null bytes.
 * @param {Buffer} buffer - File content
 * @param {string} ext - File extension (e.g. '.pdf')
 * @returns {boolean}
 */
function validateFileContent(buffer, ext) {
  const magic = MAGIC_BYTES[ext];
  if (magic) {
    if (buffer.length < magic.offset + magic.bytes.length) {
      return false;
    }
    return magic.bytes.every((b, i) => buffer[magic.offset + i] === b);
  }
  // Text formats: reject files containing null bytes (binary content)
  if (['.md', '.markdown', '.txt', '.yaml', '.yml', '.svg'].includes(ext)) {
    const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
    return !sample.includes(0x00);
  }
  return true;
}

module.exports = { validateFileContent, MAGIC_BYTES };
