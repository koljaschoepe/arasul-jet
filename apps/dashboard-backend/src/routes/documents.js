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
 *
 * Business logic is delegated to service files:
 * - services/documents/minioService.js — MinIO operations
 * - services/documents/qdrantService.js — Qdrant vector operations
 * - services/documents/documentService.js — Orchestration (DB + MinIO + Qdrant)
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const pool = require('../database');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');
const { uploadLimiter } = require('../middleware/rateLimit');
const { buildSetClauses } = require('../utils/queryBuilder');
const { getEmbedding } = require('../services/embeddingService');

// Document services
const minioService = require('../services/documents/minioService');
const qdrantService = require('../services/documents/qdrantService');
const documentService = require('../services/documents/documentService');

// Allowed file types and size limits
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.md', '.markdown', '.txt', '.yaml', '.yml'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

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
    const stats = await documentService.getStatistics({ space_id, status, category_id });

    res.json({
      ...stats,
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
 *
 * NOTE: The compensating transaction (delete MinIO object if DB insert fails)
 * is kept inline here intentionally — it must stay tightly coupled with the upload flow.
 */
router.post(
  '/upload',
  requireAuth,
  uploadLimiter,
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
    const filename = minioService.sanitizeFilename(file.originalname);
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

    // Check bucket quota before upload
    await minioService.enforceQuota(file.size);

    // Generate unique path in MinIO
    const timestamp = Date.now();
    const objectName = `${timestamp}_${filename}`;

    // Upload to MinIO
    await minioService.uploadObject(objectName, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

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

    try {
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
    } catch (dbError) {
      // Compensating transaction: cleanup MinIO file if database insert fails
      try {
        const minio = minioService.getMinioClient();
        await minio.removeObject(minioService.MINIO_BUCKET, objectName);
        logger.info(`Cleaned up orphaned MinIO file after DB error: ${objectName}`);
      } catch (cleanupError) {
        logger.warn(`Failed to cleanup MinIO file ${objectName}: ${cleanupError.message}`);
      }
      throw dbError;
    }

    // Update space statistics if assigned to a space (non-critical)
    if (spaceId) {
      await documentService.updateSpaceStatistics(spaceId);
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
      indexing_interval_seconds: parseInt(process.env.DOCUMENT_INDEXER_INTERVAL || '120', 10),
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

    await documentService.deleteDocument(id, docResult.rows[0].file_path);

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
    const { setClauses, params, paramIndex } = buildSetClauses(
      { title, category_id, user_tags, user_notes, is_favorite },
      { includeUpdatedAt: false }
    );

    if (setClauses.length === 0) {
      throw new ValidationError('Keine Aktualisierungen angegeben');
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE documents SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
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
    const newSpaceId = space_id || null;

    // Validate new space_id if provided
    if (newSpaceId) {
      const spaceCheck = await pool.query('SELECT id FROM knowledge_spaces WHERE id = $1', [
        newSpaceId,
      ]);
      if (spaceCheck.rows.length === 0) {
        throw new ValidationError('Ungültiger Wissensbereich');
      }
    }

    await documentService.moveDocument(id, oldSpaceId, newSpaceId);

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
    const queryVector = await getEmbedding(query);
    if (!queryVector) {
      throw new ValidationError('Embedding-Service nicht verfügbar');
    }

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
    const searchResults = await qdrantService.searchDocuments(queryVector, top_k * 2, filter);

    // Deduplicate by document
    const seenDocs = new Set();
    const results = [];

    for (const result of searchResults) {
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

    if (!minioService.isValidMinioPath(doc.file_path)) {
      logger.error(`Invalid file path detected: ${doc.file_path}`);
      throw new ValidationError('Ungültiger Dateipfad');
    }

    // Get file from MinIO
    const dataStream = await minioService.getObject(doc.file_path);

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
    await minioService.uploadObject(doc.file_path, contentBuffer, contentBuffer.length, {
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

    if (!minioService.isValidMinioPath(doc.file_path)) {
      logger.error(`Invalid file path detected for download: ${doc.file_path}`);
      throw new ValidationError('Ungültiger Dateipfad');
    }

    // Get file from MinIO
    const dataStream = await minioService.getObject(doc.file_path);

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
    await minioService.uploadObject(objectName, contentBuffer, contentBuffer.length, {
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
      await documentService.updateSpaceStatistics(spaceId);
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

/**
 * GET /api/documents/storage
 * Get document storage usage statistics
 */
router.get(
  '/storage',
  requireAuth,
  asyncHandler(async (req, res) => {
    const storageInfo = await documentService.getStorageInfo();
    res.json(storageInfo);
  })
);

/**
 * POST /api/documents/cleanup-orphaned
 * Detect and clean up orphaned files
 */
router.post(
  '/cleanup-orphaned',
  requireAuth,
  asyncHandler(async (req, res) => {
    const dryRun = req.query.dry_run === 'true';
    const result = await documentService.cleanupOrphaned(dryRun);

    res.json({
      dry_run: result.dryRun,
      orphaned_in_minio: result.orphanedInMinio.length,
      orphaned_in_db: result.orphanedInDb.length,
      purge_candidates: result.purgedCount || undefined,
      cleaned: result.dryRun
        ? undefined
        : {
            deleted_from_minio: result.deletedFromMinio,
            marked_failed_in_db: result.markedInDb,
            purged_soft_deleted: result.purgedCount,
          },
      details: {
        minio_files: result.orphanedInMinio,
        db_records: result.orphanedInDb.map(o => ({
          id: o.id,
          filename: o.filename,
          status: o.status,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/documents/batch/delete
 * Bulk delete multiple documents
 */
router.post(
  '/batch/delete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError('Mindestens eine Dokument-ID erforderlich');
    }
    if (ids.length > 100) {
      throw new ValidationError('Maximal 100 Dokumente gleichzeitig');
    }

    const result = await documentService.batchDelete(ids);

    res.json({
      deleted: result.deleted,
      requested: ids.length,
      errors: result.errors.length > 0 ? result.errors : undefined,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/documents/batch/reindex
 * Bulk reindex multiple documents
 */
router.post(
  '/batch/reindex',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError('Mindestens eine Dokument-ID erforderlich');
    }
    if (ids.length > 100) {
      throw new ValidationError('Maximal 100 Dokumente gleichzeitig');
    }

    const result = await documentService.batchReindex(ids);

    res.json({
      queued: result.queued,
      requested: ids.length,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/documents/batch/move
 * Bulk move multiple documents to a space
 */
router.post(
  '/batch/move',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { ids, space_id } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError('Mindestens eine Dokument-ID erforderlich');
    }
    if (ids.length > 100) {
      throw new ValidationError('Maximal 100 Dokumente gleichzeitig');
    }

    const newSpaceId = space_id || null;

    // Validate space
    if (newSpaceId) {
      const spaceCheck = await pool.query(
        'SELECT id, name, slug FROM knowledge_spaces WHERE id = $1',
        [newSpaceId]
      );
      if (spaceCheck.rows.length === 0) {
        throw new ValidationError('Ungültiger Wissensbereich');
      }
    }

    const result = await documentService.batchMove(ids, newSpaceId);

    res.json({
      moved: result.moved,
      requested: ids.length,
      space_id: newSpaceId,
      timestamp: new Date().toISOString(),
    });
  })
);

// ==========================================
// IMAGE UPLOAD for inline document images
// ==========================================

const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Ungültiger Bildtyp. Erlaubt: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`));
    }
  },
});

/**
 * POST /images/upload — Upload an image for inline use in documents
 */
router.post(
  '/images/upload',
  requireAuth,
  (req, res, next) => {
    imageUpload.single('image')(req, res, err => {
      if (err) {
        if (err instanceof multer.MulterError) {
          return res.status(400).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      throw new ValidationError('Kein Bild hochgeladen');
    }

    const filename = minioService.sanitizeFilename(file.originalname);
    const timestamp = Date.now();
    const objectName = `images/${timestamp}_${filename}`;

    await minioService.uploadObject(objectName, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

    logger.info(`Image uploaded: ${objectName} (${file.size} bytes)`);

    res.json({
      url: `/api/documents/images/${encodeURIComponent(objectName.replace('images/', ''))}`,
      objectName,
      size: file.size,
    });
  })
);

/**
 * GET /images/:filename — Serve an uploaded image from MinIO
 */
router.get(
  '/images/:filename',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const objectName = `images/${filename}`;

    if (!minioService.isValidMinioPath(objectName)) {
      throw new ValidationError('Ungültiger Dateipfad');
    }

    try {
      const stat = await minioService.statObject(objectName);
      res.set('Content-Type', stat.metaData?.['content-type'] || 'application/octet-stream');
      res.set('Cache-Control', 'public, max-age=31536000, immutable');

      const stream = await minioService.getObject(objectName);
      stream.pipe(res);
    } catch (err) {
      if (err.code === 'NotFound' || err.code === 'NoSuchKey') {
        throw new NotFoundError('Bild nicht gefunden');
      }
      throw err;
    }
  })
);

module.exports = router;
