/**
 * Text-Extraktion ueber den Document-Indexer.
 *
 * Die Datei geht als multipart-Upload direkt an `POST /extract-text`. Bis
 * Phase B4 (26.08.2026) lag sie dafuer kurz in MinIO und der Indexer holte
 * sie dort ab; ein Container fuer eine Zwischendatei war zu viel, MinIO ist
 * mit den Dokumenten gefallen. Einziger Nutzer ist die externe API
 * (`/api/v1/external/document/*`) samt den Stilvorlagen der Flows.
 */

const axios = require('axios');
const services = require('../../config/services');
const logger = require('../../utils/logger');
const { ServiceUnavailableError } = require('../../utils/errors');

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
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);

    const response = await axios.post(`${INDEXER_URL}/extract-text`, form, {
      timeout: EXTRACT_TIMEOUT_MS,
      maxBodyLength: Infinity,
    });

    const { text, metadata } = response.data;

    if (!text) {
      throw new ServiceUnavailableError('Document Indexer returned empty text');
    }

    logger.info(
      `Extracted text from ${filename}: ${text.length} chars (OCR: ${metadata?.ocr_used || false})`
    );

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
