/**
 * Document Extraction Service
 * Extracts text from documents via the Document Indexer microservice.
 * Used for chat document analysis and n8n external API.
 */

const axios = require('axios');
const services = require('../../config/services');
const logger = require('../../utils/logger');
const minioService = require('./minioService');

const INDEXER_URL = services.documentIndexer.url;
const EXTRACT_TIMEOUT_MS = 120000; // 2 min for large PDFs with OCR

class DocumentExtractionService {
  /**
   * Extract text from a file buffer via Document Indexer
   * @param {Buffer} buffer - File content
   * @param {string} filename - Original filename (used for parser selection)
   * @returns {Promise<{text: string, metadata: object}>}
   */
  async extractFromBuffer(buffer, filename) {
    // Upload temporarily to MinIO, then call Document Indexer
    const timestamp = Date.now();
    const sanitized = minioService.sanitizeFilename(filename);
    const tempPath = `_tmp_extract/${timestamp}_${sanitized}`;

    try {
      // Upload to MinIO temp path
      await minioService.uploadObject(tempPath, buffer, buffer.length, {
        'Content-Type': 'application/octet-stream',
      });

      // Call Document Indexer extract-text endpoint
      const response = await axios.post(
        `${INDEXER_URL}/extract-text`,
        { minio_path: tempPath, filename },
        { timeout: EXTRACT_TIMEOUT_MS }
      );

      const { text, metadata } = response.data;

      if (!text) {
        throw new Error('Document Indexer returned empty text');
      }

      logger.info(
        `Extracted text from ${filename}: ${text.length} chars (OCR: ${metadata?.ocr_used || false})`
      );

      return { text, metadata: metadata || {} };
    } finally {
      // Clean up temp file from MinIO
      try {
        await minioService.removeObject(tempPath);
      } catch (cleanupErr) {
        logger.debug(`Temp file cleanup failed for ${tempPath}: ${cleanupErr.message}`);
      }
    }
  }

  /**
   * Extract text from a file already in MinIO
   * @param {string} minioPath - Path in MinIO bucket
   * @param {string} filename - Original filename
   * @returns {Promise<{text: string, metadata: object}>}
   */
  async extractFromMinio(minioPath, filename) {
    const response = await axios.post(
      `${INDEXER_URL}/extract-text`,
      { minio_path: minioPath, filename },
      { timeout: EXTRACT_TIMEOUT_MS }
    );

    const { text, metadata } = response.data;

    if (!text) {
      throw new Error('Document Indexer returned empty text');
    }

    return { text, metadata: metadata || {} };
  }

  /**
   * Check if Document Indexer is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const response = await axios.get(`${INDEXER_URL}/health`, { timeout: 5000 });
      return response.data?.status === 'healthy' || response.data?.status === 'degraded';
    } catch {
      return false;
    }
  }
}

module.exports = new DocumentExtractionService();
