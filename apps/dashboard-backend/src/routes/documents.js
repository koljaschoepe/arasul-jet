/**
 * Documents API Routes
 * Provides comprehensive document management for the RAG system
 *
 * Features:
 * - Upload documents (PDF, DOCX, Markdown)
 * - List, search, and filter documents
 * - Document metadata and statistics
 * - Semantic search across documents
 * - Similar document detection
 * - Category management
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const Minio = require('minio');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const pool = require('../database');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');
const services = require('../config/services');

/**
 * SECURITY: Sanitize filename to prevent path traversal attacks
 * - Removes directory components (../, ./, /)
 * - Removes dangerous characters
 * - Limits length
 */
function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_file';
  }

  // Get only the basename (removes directory traversal attempts)
  let sanitized = path.basename(filename);

  // Remove any remaining path separators and dangerous characters
  sanitized = sanitized
    .replace(/[/\\]/g, '_') // Replace slashes with underscores
    .replace(/\.\./g, '_') // Replace double dots
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\x00-\x1F]/g, '') // Remove Windows forbidden chars and control chars
    .replace(/^\.+/, '') // Remove leading dots (hidden files)
    .trim();

  // Limit length (preserve extension)
  const maxLength = 200;
  if (sanitized.length > maxLength) {
    const ext = path.extname(sanitized);
    const nameWithoutExt = sanitized.slice(0, -(ext.length || 0));
    sanitized = nameWithoutExt.slice(0, maxLength - ext.length) + ext;
  }

  // Fallback if empty after sanitization
  if (!sanitized || sanitized === '') {
    sanitized = 'unnamed_file';
  }

  return sanitized;
}

/**
 * PHASE2-FIX: Validate file path from database before MinIO operations
 * Prevents path traversal attacks from manipulated database entries
 * @param {string} filePath - The file path to validate
 * @returns {boolean} - True if path is safe, false otherwise
 */
function isValidMinioPath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  // Check for path traversal sequences
  if (filePath.includes('..') || filePath.includes('./')) {
    return false;
  }

  // Must not start with slash (absolute path)
  if (filePath.startsWith('/')) {
    return false;
  }

  // Must not contain backslashes (Windows path)
  if (filePath.includes('\\')) {
    return false;
  }

  // Must not contain null bytes
  if (filePath.includes('\x00')) {
    return false;
  }

  return true;
}

// Configuration (using centralized service config)
const MINIO_HOST = services.minio.host;
const MINIO_PORT = services.minio.port;
const MINIO_ROOT_USER = process.env.MINIO_ROOT_USER;
const MINIO_ROOT_PASSWORD = process.env.MINIO_ROOT_PASSWORD;

if (!MINIO_ROOT_USER || !MINIO_ROOT_PASSWORD) {
  logger.error('MINIO_ROOT_USER and MINIO_ROOT_PASSWORD must be set in environment');
}
const MINIO_BUCKET = process.env.DOCUMENT_INDEXER_MINIO_BUCKET || 'documents';

const DOCUMENT_INDEXER_HOST = services.documentIndexer.host;
const DOCUMENT_INDEXER_PORT = services.documentIndexer.port;

const QDRANT_HOST = services.qdrant.host;
const QDRANT_PORT = services.qdrant.port;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';

const EMBEDDING_HOST = services.embedding.host;
const EMBEDDING_PORT = services.embedding.port;

// Allowed file types and size limits
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.md', '.markdown', '.txt', '.yaml', '.yml'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// MinIO client
let minioClient = null;

function getMinioClient() {
  if (!minioClient) {
    minioClient = new Minio.Client({
      endPoint: MINIO_HOST,
      port: MINIO_PORT,
      useSSL: false,
      accessKey: MINIO_ROOT_USER,
      secretKey: MINIO_ROOT_PASSWORD,
    });
  }
  return minioClient;
}

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Ungültiger Dateityp. Erlaubt: ${ALLOWED_EXTENSIONS.join(', ')}`));
    }
  },
});

/**
 * GET /api/documents
 * List documents with filtering and pagination
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      status,
      category_id,
      space_id,
      search,
      limit = 50,
      offset = 0,
      order_by = 'uploaded_at',
      order_dir = 'DESC',
    } = req.query;

    // Build query
    const conditions = ['d.deleted_at IS NULL'];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`d.status = $${paramIndex++}`);
      params.push(status);
    }

    if (category_id) {
      const parsedCategoryId = parseInt(category_id, 10);
      if (isNaN(parsedCategoryId)) {
        throw new ValidationError('category_id must be a number');
      }
      conditions.push(`d.category_id = $${paramIndex++}`);
      params.push(parsedCategoryId);
    }

    // Filter by space_id (new for RAG 2.0)
    if (space_id) {
      if (space_id === 'null' || space_id === 'unassigned') {
        conditions.push('d.space_id IS NULL');
      } else {
        conditions.push(`d.space_id = $${paramIndex++}`);
        params.push(space_id);
      }
    }

    if (search) {
      conditions.push(`(d.filename ILIKE $${paramIndex} OR d.title ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Validate order_by
    const validOrderFields = ['uploaded_at', 'filename', 'title', 'file_size', 'status'];
    const orderField = validOrderFields.includes(order_by) ? order_by : 'uploaded_at';
    const orderDirection = order_dir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM documents d WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get documents with space info
    const documentsResult = await pool.query(
      `SELECT d.*,
                dc.name as category_name, dc.color as category_color, dc.icon as category_icon,
                ks.name as space_name, ks.slug as space_slug, ks.icon as space_icon, ks.color as space_color
         FROM documents d
         LEFT JOIN document_categories dc ON d.category_id = dc.id
         LEFT JOIN knowledge_spaces ks ON d.space_id = ks.id
         WHERE ${whereClause}
         ORDER BY d.${orderField} ${orderDirection}
         LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      documents: documentsResult.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/documents/statistics
 * Get document statistics
 */
router.get(
  '/statistics',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { space_id, status, category_id } = req.query;

    // Use filter-aware function if any filter is provided, otherwise use original
    const hasFilters = space_id || status || category_id;
    let stats;

    if (hasFilters) {
      const result = await pool.query(
        'SELECT * FROM get_filtered_document_statistics($1, $2, $3)',
        [space_id || null, status || null, category_id ? parseInt(category_id, 10) : null]
      );
      stats = result.rows[0];
    } else {
      const result = await pool.query('SELECT * FROM get_document_statistics()');
      stats = result.rows[0];
    }

    // Get table count from data-db (cross-db) with matching filters
    let tableCount = 0;
    try {
      const dataDb = require('../dataDatabase');
      const tableConditions = [];
      const tableParams = [];
      let tParamIndex = 1;

      if (space_id) {
        tableConditions.push(`space_id = $${tParamIndex++}`);
        tableParams.push(space_id);
      }
      if (status) {
        // Map document status to table status
        const statusMap = { indexed: 'active', pending: 'draft', failed: 'archived' };
        const tableStatus = statusMap[status] || status;
        tableConditions.push(`status = $${tParamIndex++}`);
        tableParams.push(tableStatus);
      }

      const tableWhere = tableConditions.length > 0 ? `WHERE ${tableConditions.join(' AND ')}` : '';
      const tcResult = await dataDb.query(
        `SELECT COUNT(*)::int as count FROM dt_tables ${tableWhere}`,
        tableParams
      );
      tableCount = tcResult.rows[0].count;
    } catch (e) {
      logger.warn(`Failed to get table count from data-db: ${e.message}`);
    }

    // Get indexer status (non-critical, use fallback on error)
    let indexerStatus = { status: 'unknown' };
    try {
      const indexerResponse = await axios.get(
        `http://${DOCUMENT_INDEXER_HOST}:${DOCUMENT_INDEXER_PORT}/status`,
        { timeout: 5000 }
      );
      indexerStatus = indexerResponse.data;
    } catch (e) {
      logger.warn(`Failed to get indexer status: ${e.message}`);
    }

    res.json({
      ...stats,
      table_count: tableCount,
      indexer: indexerStatus,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/documents/categories
 * List document categories
 */
router.get(
  '/categories',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT * FROM document_categories ORDER BY is_system DESC, name ASC`
    );

    res.json({
      categories: result.rows,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/documents/:id
 * Get single document details
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT d.*, dc.name as category_name, dc.color as category_color, dc.icon as category_icon
         FROM documents d
         LEFT JOIN document_categories dc ON d.category_id = dc.id
         WHERE d.id = $1 AND d.deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Dokument nicht gefunden');
    }

    // Log access (non-critical)
    try {
      await pool.query(
        `INSERT INTO document_access_log (document_id, access_type, user_id)
             VALUES ($1, 'view', $2)`,
        [id, req.user?.username || 'admin']
      );
    } catch (e) {
      // Non-critical, ignore
    }

    res.json({
      document: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/documents/upload
 * Upload a new document
 */
router.post(
  '/upload',
  requireAuth,
  (req, res, next) => {
    // Handle multer errors (file type, size) and return 400 instead of 500
    upload.single('file')(req, res, err => {
      if (err) {
        return res.status(400).json({
          error: err.message || 'Fehler beim Datei-Upload',
          timestamp: new Date().toISOString(),
        });
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError('Keine Datei hochgeladen');
    }

    const file = req.file;
    // SECURITY FIX: Sanitize filename to prevent path traversal attacks
    const filename = sanitizeFilename(file.originalname);
    const fileExt = '.' + filename.split('.').pop().toLowerCase();

    // Get space_id from form data (RAG 2.0)
    const spaceId = req.body.space_id || null;

    // Validate space_id if provided
    if (spaceId) {
      const spaceCheck = await pool.query('SELECT id FROM knowledge_spaces WHERE id = $1', [
        spaceId,
      ]);
      if (spaceCheck.rows.length === 0) {
        throw new ValidationError('Ungültiger Wissensbereich');
      }
    }

    // Calculate hashes
    const contentHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const fileHash = crypto.createHash('sha256').update(`${filename}:${file.size}`).digest('hex');

    // Check for duplicates
    const existingResult = await pool.query(
      `SELECT id, filename FROM documents WHERE content_hash = $1 AND deleted_at IS NULL`,
      [contentHash]
    );

    if (existingResult.rows.length > 0) {
      throw new ConflictError('Dokument existiert bereits');
    }

    // Generate unique path in MinIO
    const timestamp = Date.now();
    const objectName = `${timestamp}_${filename}`;

    // Upload to MinIO
    const minio = getMinioClient();
    await minio.putObject(MINIO_BUCKET, objectName, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

    logger.info(`Uploaded file to MinIO: ${objectName}`);

    // Create document record in pending state
    const docId = crypto.randomUUID();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.md': 'text/markdown',
      '.markdown': 'text/markdown',
      '.txt': 'text/plain',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
    };

    await pool.query(
      `INSERT INTO documents (
            id, filename, original_filename, file_path, file_size,
            mime_type, file_extension, content_hash, file_hash,
            status, uploaded_by, space_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        docId,
        filename,
        filename,
        objectName,
        file.size,
        mimeTypes[fileExt] || 'application/octet-stream',
        fileExt,
        contentHash,
        fileHash,
        'pending',
        req.user?.username || 'admin',
        spaceId,
      ]
    );

    // Update space statistics if assigned to a space (non-critical)
    if (spaceId) {
      try {
        await pool.query('SELECT update_space_statistics($1)', [spaceId]);
      } catch (e) {
        logger.warn(`Failed to update space statistics: ${e.message}`);
      }
    }

    res.status(201).json({
      status: 'uploaded',
      document: {
        id: docId,
        filename,
        file_size: file.size,
        status: 'pending',
        space_id: spaceId,
      },
      message: 'Dokument erfolgreich hochgeladen. Indexierung wird gestartet.',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Get document info
    const docResult = await pool.query(
      `SELECT file_path FROM documents WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (docResult.rows.length === 0) {
      throw new NotFoundError('Dokument nicht gefunden');
    }

    const filePath = docResult.rows[0].file_path;

    // PHASE2-FIX: Validate file path before MinIO delete
    if (!isValidMinioPath(filePath)) {
      logger.error(`Invalid file path detected for deletion: ${filePath}`);
      throw new ValidationError('Ungültiger Dateipfad');
    }

    // Delete from MinIO (non-critical)
    try {
      const minio = getMinioClient();
      await minio.removeObject(MINIO_BUCKET, filePath);
      logger.info(`Deleted file from MinIO: ${filePath}`);
    } catch (e) {
      logger.warn(`Failed to delete from MinIO: ${e.message}`);
    }

    // Delete from Qdrant (non-critical)
    try {
      await axios.post(
        `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/delete`,
        {
          filter: {
            must: [
              {
                key: 'document_id',
                match: { value: id },
              },
            ],
          },
        },
        { timeout: 10000 }
      );
      logger.info(`Deleted document from Qdrant: ${id}`);
    } catch (e) {
      logger.warn(`Failed to delete from Qdrant: ${e.message}`);
    }

    // Soft delete in database
    await pool.query(`UPDATE documents SET deleted_at = NOW(), status = 'deleted' WHERE id = $1`, [
      id,
    ]);

    res.json({
      status: 'deleted',
      id,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/documents/:id/reindex
 * Trigger reindexing of a document
 */
router.post(
  '/:id/reindex',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if document exists
    const docResult = await pool.query(
      `SELECT id FROM documents WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (docResult.rows.length === 0) {
      throw new NotFoundError('Dokument nicht gefunden');
    }

    // Reset status to pending
    await pool.query(`UPDATE documents SET status = 'pending', retry_count = 0 WHERE id = $1`, [
      id,
    ]);

    res.json({
      status: 'queued',
      id,
      message: 'Dokument zur Neuindexierung eingeplant',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PATCH /api/documents/:id
 * Update document metadata
 */
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, category_id, user_tags, user_notes, is_favorite } = req.body;

    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (category_id !== undefined) {
      updates.push(`category_id = $${paramIndex++}`);
      params.push(category_id);
    }
    if (user_tags !== undefined) {
      updates.push(`user_tags = $${paramIndex++}`);
      params.push(user_tags);
    }
    if (user_notes !== undefined) {
      updates.push(`user_notes = $${paramIndex++}`);
      params.push(user_notes);
    }
    if (is_favorite !== undefined) {
      updates.push(`is_favorite = $${paramIndex++}`);
      params.push(is_favorite);
    }

    if (updates.length === 0) {
      throw new ValidationError('Keine Aktualisierungen angegeben');
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE documents SET ${updates.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Dokument nicht gefunden');
    }

    res.json({
      document: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/documents/:id/move
 * Move document to a different space (RAG 2.0)
 */
router.put(
  '/:id/move',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { space_id } = req.body;

    // Get current document
    const docResult = await pool.query(
      `SELECT id, space_id FROM documents WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (docResult.rows.length === 0) {
      throw new NotFoundError('Dokument nicht gefunden');
    }

    const oldSpaceId = docResult.rows[0].space_id;

    // Validate new space_id if provided
    const newSpaceId = space_id || null;
    if (newSpaceId) {
      const spaceCheck = await pool.query('SELECT id FROM knowledge_spaces WHERE id = $1', [
        newSpaceId,
      ]);
      if (spaceCheck.rows.length === 0) {
        throw new ValidationError('Ungültiger Wissensbereich');
      }
    }

    // Get new space details for Qdrant payload
    let newSpaceName = '';
    let newSpaceSlug = '';
    if (newSpaceId) {
      const spaceDetails = await pool.query(
        'SELECT name, slug FROM knowledge_spaces WHERE id = $1',
        [newSpaceId]
      );
      if (spaceDetails.rows.length > 0) {
        newSpaceName = spaceDetails.rows[0].name;
        newSpaceSlug = spaceDetails.rows[0].slug;
      }
    }

    // Update document's space
    await pool.query(`UPDATE documents SET space_id = $1, updated_at = NOW() WHERE id = $2`, [
      newSpaceId,
      id,
    ]);

    // Update Qdrant payloads for all chunks of this document (non-critical)
    try {
      await axios.post(
        `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/payload`,
        {
          payload: {
            space_id: newSpaceId || null,
            space_name: newSpaceName,
            space_slug: newSpaceSlug,
          },
          filter: {
            must: [
              {
                key: 'document_id',
                match: { value: id },
              },
            ],
          },
        },
        { timeout: 10000 }
      );
      logger.info(`Updated Qdrant payloads for document ${id} (space: ${newSpaceName || 'none'})`);
    } catch (e) {
      logger.warn(`Failed to update Qdrant payloads for document ${id}: ${e.message}`);
    }

    // Update statistics for both old and new spaces (non-critical)
    if (oldSpaceId) {
      try {
        await pool.query('SELECT update_space_statistics($1)', [oldSpaceId]);
      } catch (e) {
        logger.warn(`Failed to update old space statistics: ${e.message}`);
      }
    }

    if (newSpaceId) {
      try {
        await pool.query('SELECT update_space_statistics($1)', [newSpaceId]);
      } catch (e) {
        logger.warn(`Failed to update new space statistics: ${e.message}`);
      }
    }

    logger.info(`Document ${id} moved from space ${oldSpaceId} to ${newSpaceId}`);

    res.json({
      status: 'moved',
      id,
      old_space_id: oldSpaceId,
      new_space_id: newSpaceId,
      message: 'Dokument erfolgreich verschoben',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/documents/:id/similar
 * Get similar documents
 */
router.get(
  '/:id/similar',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { min_similarity = 0.7, limit = 10 } = req.query;

    const result = await pool.query(`SELECT * FROM find_similar_documents($1, $2, $3)`, [
      id,
      parseFloat(min_similarity),
      parseInt(limit),
    ]);

    res.json({
      document_id: id,
      similar_documents: result.rows,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/documents/search
 * Semantic search across all documents
 */
router.post(
  '/search',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { query, top_k = 10, category_id } = req.body;

    if (!query || typeof query !== 'string') {
      throw new ValidationError('Suchbegriff erforderlich');
    }

    // Get query embedding
    const embeddingResponse = await axios.post(
      `http://${EMBEDDING_HOST}:${EMBEDDING_PORT}/embed`,
      { texts: query },
      { timeout: 30000 }
    );

    const queryVector = embeddingResponse.data.vectors[0];

    // Build Qdrant filter
    const filter = category_id
      ? {
          must: [
            {
              key: 'category',
              match: { value: category_id },
            },
          ],
        }
      : undefined;

    // Search Qdrant
    const searchResponse = await axios.post(
      `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/search`,
      {
        vector: queryVector,
        limit: top_k * 2, // Get more to dedupe
        with_payload: true,
        filter,
      },
      { timeout: 10000 }
    );

    // Deduplicate by document
    const seenDocs = new Set();
    const results = [];

    for (const result of searchResponse.data.result || []) {
      const docId = result.payload?.document_id;
      if (docId && !seenDocs.has(docId)) {
        seenDocs.add(docId);
        results.push({
          document_id: docId,
          document_name: result.payload.document_name,
          title: result.payload.title,
          category: result.payload.category,
          chunk_text: result.payload.text?.substring(0, 300),
          score: result.score,
        });

        if (results.length >= top_k) {
          break;
        }
      }
    }

    // Log search (non-critical)
    for (const result of results) {
      try {
        await pool.query(
          `INSERT INTO document_access_log (document_id, access_type, query_text, user_id)
                 VALUES ($1, 'search', $2, $3)`,
          [result.document_id, query, req.user?.username || 'admin']
        );
      } catch (e) {
        // Non-critical
      }
    }

    res.json({
      query,
      results,
      total: results.length,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/documents/:id/content
 * Get raw file content (for editing markdown files)
 */
router.get(
  '/:id/content',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Get document info
    const docResult = await pool.query(
      `SELECT filename, file_path, mime_type, file_extension FROM documents WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (docResult.rows.length === 0) {
      throw new NotFoundError('Dokument nicht gefunden');
    }

    const doc = docResult.rows[0];

    // Only allow text-based files
    const editableExtensions = ['.md', '.markdown', '.txt', '.yaml', '.yml'];
    if (!editableExtensions.includes(doc.file_extension)) {
      throw new ValidationError('Dieser Dateityp kann nicht bearbeitet werden');
    }

    // PHASE2-FIX: Validate file path before MinIO access
    if (!isValidMinioPath(doc.file_path)) {
      logger.error(`Invalid file path detected: ${doc.file_path}`);
      throw new ValidationError('Ungültiger Dateipfad');
    }

    // Get file from MinIO
    const minio = getMinioClient();
    const dataStream = await minio.getObject(MINIO_BUCKET, doc.file_path);

    // Collect the stream data
    const chunks = [];
    for await (const chunk of dataStream) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString('utf-8');

    // Log access (non-critical)
    try {
      await pool.query(
        `INSERT INTO document_access_log (document_id, access_type, user_id)
             VALUES ($1, 'edit_view', $2)`,
        [id, req.user?.username || 'admin']
      );
    } catch (e) {
      // Non-critical
    }

    res.json({
      id,
      filename: doc.filename,
      content,
      mime_type: doc.mime_type,
      file_extension: doc.file_extension,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/documents/:id/content
 * Update file content (for markdown files)
 */
router.put(
  '/:id/content',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;

    if (content === undefined || typeof content !== 'string') {
      throw new ValidationError('Inhalt erforderlich');
    }

    // Get document info
    const docResult = await pool.query(
      `SELECT filename, file_path, mime_type, file_extension FROM documents WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (docResult.rows.length === 0) {
      throw new NotFoundError('Dokument nicht gefunden');
    }

    const doc = docResult.rows[0];

    // Only allow text-based files
    const editableExtensions = ['.md', '.markdown', '.txt', '.yaml', '.yml'];
    if (!editableExtensions.includes(doc.file_extension)) {
      throw new ValidationError('Dieser Dateityp kann nicht bearbeitet werden');
    }

    // Calculate new hash
    const contentBuffer = Buffer.from(content, 'utf-8');
    const newContentHash = crypto.createHash('sha256').update(contentBuffer).digest('hex');

    // Upload new content to MinIO
    const minio = getMinioClient();
    await minio.putObject(MINIO_BUCKET, doc.file_path, contentBuffer, contentBuffer.length, {
      'Content-Type': doc.mime_type,
    });

    // Update database record
    await pool.query(
      `UPDATE documents SET
            content_hash = $1,
            file_size = $2,
            status = 'pending',
            updated_at = NOW(),
            char_count = $3,
            word_count = $4
         WHERE id = $5`,
      [
        newContentHash,
        contentBuffer.length,
        content.length,
        content.split(/\s+/).filter(w => w.length > 0).length,
        id,
      ]
    );

    // Log edit (non-critical)
    try {
      await pool.query(
        `INSERT INTO document_access_log (document_id, access_type, user_id)
             VALUES ($1, 'edit_save', $2)`,
        [id, req.user?.username || 'admin']
      );
    } catch (e) {
      // Non-critical
    }

    logger.info(`Updated content for document ${id}`);

    res.json({
      status: 'updated',
      id,
      file_size: contentBuffer.length,
      message: 'Dokument gespeichert. Neuindexierung wird gestartet.',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/documents/:id/download
 * Download document file
 */
router.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Get document info
    const docResult = await pool.query(
      `SELECT filename, file_path, mime_type FROM documents WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (docResult.rows.length === 0) {
      throw new NotFoundError('Dokument nicht gefunden');
    }

    const doc = docResult.rows[0];

    // PHASE2-FIX: Validate file path before MinIO access
    if (!isValidMinioPath(doc.file_path)) {
      logger.error(`Invalid file path detected for download: ${doc.file_path}`);
      throw new ValidationError('Ungültiger Dateipfad');
    }

    // Get file from MinIO
    const minio = getMinioClient();
    const dataStream = await minio.getObject(MINIO_BUCKET, doc.file_path);

    // Log download (non-critical)
    try {
      await pool.query(
        `INSERT INTO document_access_log (document_id, access_type, user_id)
             VALUES ($1, 'download', $2)`,
        [id, req.user?.username || 'admin']
      );
    } catch (e) {
      // Non-critical
    }

    // Set headers and stream file
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.filename)}"`
    );

    dataStream.pipe(res);
  })
);

/**
 * POST /api/documents/create-markdown
 * Create a new markdown document
 */
router.post(
  '/create-markdown',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { filename, content, description, space_id } = req.body;

    if (!filename || typeof filename !== 'string' || !filename.trim()) {
      throw new ValidationError('Dateiname erforderlich');
    }

    // Sanitize filename and ensure .md extension
    let sanitizedName = filename
      .trim()
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s+/g, '_');

    // Add .md extension if not present
    if (
      !sanitizedName.toLowerCase().endsWith('.md') &&
      !sanitizedName.toLowerCase().endsWith('.markdown')
    ) {
      sanitizedName = `${sanitizedName}.md`;
    }

    // Validate space_id if provided
    const spaceId = space_id || null;
    if (spaceId) {
      const spaceCheck = await pool.query('SELECT id FROM knowledge_spaces WHERE id = $1', [
        spaceId,
      ]);
      if (spaceCheck.rows.length === 0) {
        throw new ValidationError('Ungültiger Wissensbereich');
      }
    }

    // Create default content if not provided
    const documentContent =
      content || `# ${filename.trim()}\n\n${description || 'Neues Dokument'}\n`;

    // Calculate hash
    const contentBuffer = Buffer.from(documentContent, 'utf-8');
    const contentHash = crypto.createHash('sha256').update(contentBuffer).digest('hex');

    // Check for duplicates
    const existingResult = await pool.query(
      `SELECT id, filename FROM documents WHERE content_hash = $1 AND deleted_at IS NULL`,
      [contentHash]
    );

    if (existingResult.rows.length > 0) {
      throw new ConflictError('Dokument mit identischem Inhalt existiert bereits');
    }

    // Generate unique path in MinIO
    const timestamp = Date.now();
    const objectName = `${timestamp}_${sanitizedName}`;

    // Upload to MinIO
    const minio = getMinioClient();
    await minio.putObject(MINIO_BUCKET, objectName, contentBuffer, contentBuffer.length, {
      'Content-Type': 'text/markdown',
    });

    logger.info(`Created markdown file in MinIO: ${objectName}`);

    // Create document record
    const docId = crypto.randomUUID();
    const fileHash = crypto
      .createHash('sha256')
      .update(`${sanitizedName}:${contentBuffer.length}`)
      .digest('hex');

    await pool.query(
      `INSERT INTO documents (
            id, filename, original_filename, file_path, file_size,
            mime_type, file_extension, content_hash, file_hash,
            status, uploaded_by, space_id, title,
            char_count, word_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        docId,
        sanitizedName,
        sanitizedName,
        objectName,
        contentBuffer.length,
        'text/markdown',
        '.md',
        contentHash,
        fileHash,
        'pending',
        req.user?.username || 'admin',
        spaceId,
        filename.trim(),
        documentContent.length,
        documentContent.split(/\s+/).filter(w => w.length > 0).length,
      ]
    );

    // Update space statistics if assigned
    if (spaceId) {
      try {
        await pool.query('SELECT update_space_statistics($1)', [spaceId]);
      } catch (e) {
        logger.warn(`Failed to update space statistics: ${e.message}`);
      }
    }

    logger.info(`Created new markdown document: ${docId}`);

    res.status(201).json({
      status: 'created',
      document: {
        id: docId,
        filename: sanitizedName,
        file_path: objectName,
        file_size: contentBuffer.length,
        status: 'pending',
        space_id: spaceId,
      },
      message: 'Markdown-Dokument erstellt.',
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
