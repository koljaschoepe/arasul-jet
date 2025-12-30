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
const Minio = require('minio');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const pool = require('../database');

// Configuration
const MINIO_HOST = process.env.MINIO_HOST || 'minio';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000');
const MINIO_ROOT_USER = process.env.MINIO_ROOT_USER || 'admin';
const MINIO_ROOT_PASSWORD = process.env.MINIO_ROOT_PASSWORD || '';
const MINIO_BUCKET = process.env.DOCUMENT_INDEXER_MINIO_BUCKET || 'documents';

const DOCUMENT_INDEXER_HOST = process.env.DOCUMENT_INDEXER_HOST || 'document-indexer';
const DOCUMENT_INDEXER_PORT = process.env.DOCUMENT_INDEXER_API_PORT || '9102';

const QDRANT_HOST = process.env.QDRANT_HOST || 'qdrant';
const QDRANT_PORT = process.env.QDRANT_PORT || '6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';

const EMBEDDING_HOST = process.env.EMBEDDING_SERVICE_HOST || 'embedding-service';
const EMBEDDING_PORT = process.env.EMBEDDING_SERVICE_PORT || '11435';

// Allowed file types and size limits
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.md', '.markdown', '.txt'];
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
            secretKey: MINIO_ROOT_PASSWORD
        });
    }
    return minioClient;
}

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_FILE_SIZE
    },
    fileFilter: (req, file, cb) => {
        const ext = '.' + file.originalname.split('.').pop().toLowerCase();
        if (ALLOWED_EXTENSIONS.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Ungültiger Dateityp. Erlaubt: ${ALLOWED_EXTENSIONS.join(', ')}`));
        }
    }
});

/**
 * GET /api/documents
 * List documents with filtering and pagination
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const {
            status,
            category_id,
            search,
            limit = 50,
            offset = 0,
            order_by = 'uploaded_at',
            order_dir = 'DESC'
        } = req.query;

        // Build query
        const conditions = ['deleted_at IS NULL'];
        const params = [];
        let paramIndex = 1;

        if (status) {
            conditions.push(`status = $${paramIndex++}`);
            params.push(status);
        }

        if (category_id) {
            conditions.push(`category_id = $${paramIndex++}`);
            params.push(parseInt(category_id));
        }

        if (search) {
            conditions.push(`(filename ILIKE $${paramIndex} OR title ILIKE $${paramIndex})`);
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
            `SELECT COUNT(*) FROM documents WHERE ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get documents
        const documentsResult = await pool.query(
            `SELECT d.*, dc.name as category_name, dc.color as category_color, dc.icon as category_icon
             FROM documents d
             LEFT JOIN document_categories dc ON d.category_id = dc.id
             WHERE ${whereClause}
             ORDER BY ${orderField} ${orderDirection}
             LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        res.json({
            documents: documentsResult.rows,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`List documents error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Dokumente',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/documents/statistics
 * Get document statistics
 */
router.get('/statistics', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM get_document_statistics()');
        const stats = result.rows[0];

        // Get indexer status
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
            indexer: indexerStatus,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Statistics error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Statistiken',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/documents/categories
 * List document categories
 */
router.get('/categories', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM document_categories ORDER BY is_system DESC, name ASC`
        );

        res.json({
            categories: result.rows,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Categories error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Kategorien',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/documents/:id
 * Get single document details
 */
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT d.*, dc.name as category_name, dc.color as category_color, dc.icon as category_icon
             FROM documents d
             LEFT JOIN document_categories dc ON d.category_id = dc.id
             WHERE d.id = $1 AND d.deleted_at IS NULL`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Dokument nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        // Log access
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
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Get document error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden des Dokuments',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/documents/upload
 * Upload a new document
 */
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'Keine Datei hochgeladen',
                timestamp: new Date().toISOString()
            });
        }

        const file = req.file;
        const filename = file.originalname;
        const fileExt = '.' + filename.split('.').pop().toLowerCase();

        // Calculate hashes
        const contentHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
        const fileHash = crypto.createHash('sha256')
            .update(`${filename}:${file.size}`)
            .digest('hex');

        // Check for duplicates
        const existingResult = await pool.query(
            `SELECT id, filename FROM documents WHERE content_hash = $1 AND deleted_at IS NULL`,
            [contentHash]
        );

        if (existingResult.rows.length > 0) {
            return res.status(409).json({
                error: 'Dokument existiert bereits',
                existing_document: existingResult.rows[0],
                timestamp: new Date().toISOString()
            });
        }

        // Generate unique path in MinIO
        const timestamp = Date.now();
        const objectName = `${timestamp}_${filename}`;

        // Upload to MinIO
        const minio = getMinioClient();
        await minio.putObject(MINIO_BUCKET, objectName, file.buffer, file.size, {
            'Content-Type': file.mimetype
        });

        logger.info(`Uploaded file to MinIO: ${objectName}`);

        // Create document record in pending state
        const docId = crypto.randomUUID();
        const mimeTypes = {
            '.pdf': 'application/pdf',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.md': 'text/markdown',
            '.markdown': 'text/markdown',
            '.txt': 'text/plain'
        };

        await pool.query(
            `INSERT INTO documents (
                id, filename, original_filename, file_path, file_size,
                mime_type, file_extension, content_hash, file_hash,
                status, uploaded_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
                req.user?.username || 'admin'
            ]
        );

        res.status(201).json({
            status: 'uploaded',
            document: {
                id: docId,
                filename,
                file_size: file.size,
                status: 'pending'
            },
            message: 'Dokument erfolgreich hochgeladen. Indexierung wird gestartet.',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Upload error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Hochladen',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Get document info
        const docResult = await pool.query(
            `SELECT file_path FROM documents WHERE id = $1 AND deleted_at IS NULL`,
            [id]
        );

        if (docResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Dokument nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        const filePath = docResult.rows[0].file_path;

        // Delete from MinIO
        try {
            const minio = getMinioClient();
            await minio.removeObject(MINIO_BUCKET, filePath);
            logger.info(`Deleted file from MinIO: ${filePath}`);
        } catch (e) {
            logger.warn(`Failed to delete from MinIO: ${e.message}`);
        }

        // Delete from Qdrant
        try {
            await axios.post(
                `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/delete`,
                {
                    filter: {
                        must: [
                            {
                                key: 'document_id',
                                match: { value: id }
                            }
                        ]
                    }
                },
                { timeout: 10000 }
            );
            logger.info(`Deleted document from Qdrant: ${id}`);
        } catch (e) {
            logger.warn(`Failed to delete from Qdrant: ${e.message}`);
        }

        // Soft delete in database
        await pool.query(
            `UPDATE documents SET deleted_at = NOW(), status = 'deleted' WHERE id = $1`,
            [id]
        );

        res.json({
            status: 'deleted',
            id,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Delete error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Löschen',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/documents/:id/reindex
 * Trigger reindexing of a document
 */
router.post('/:id/reindex', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if document exists
        const docResult = await pool.query(
            `SELECT id FROM documents WHERE id = $1 AND deleted_at IS NULL`,
            [id]
        );

        if (docResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Dokument nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        // Reset status to pending
        await pool.query(
            `UPDATE documents SET status = 'pending', retry_count = 0 WHERE id = $1`,
            [id]
        );

        res.json({
            status: 'queued',
            id,
            message: 'Dokument zur Neuindexierung eingeplant',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Reindex error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Einplanen der Neuindexierung',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * PATCH /api/documents/:id
 * Update document metadata
 */
router.patch('/:id', requireAuth, async (req, res) => {
    try {
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
            return res.status(400).json({
                error: 'Keine Aktualisierungen angegeben',
                timestamp: new Date().toISOString()
            });
        }

        params.push(id);
        const result = await pool.query(
            `UPDATE documents SET ${updates.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
            params
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Dokument nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            document: result.rows[0],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Update error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Aktualisieren',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/documents/:id/similar
 * Get similar documents
 */
router.get('/:id/similar', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { min_similarity = 0.7, limit = 10 } = req.query;

        const result = await pool.query(
            `SELECT * FROM find_similar_documents($1, $2, $3)`,
            [id, parseFloat(min_similarity), parseInt(limit)]
        );

        res.json({
            document_id: id,
            similar_documents: result.rows,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Similar documents error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Suchen ähnlicher Dokumente',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/documents/search
 * Semantic search across all documents
 */
router.post('/search', requireAuth, async (req, res) => {
    try {
        const { query, top_k = 10, category_id } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: 'Suchbegriff erforderlich',
                timestamp: new Date().toISOString()
            });
        }

        // Get query embedding
        const embeddingResponse = await axios.post(
            `http://${EMBEDDING_HOST}:${EMBEDDING_PORT}/embed`,
            { texts: query },
            { timeout: 30000 }
        );

        const queryVector = embeddingResponse.data.vectors[0];

        // Build Qdrant filter
        const filter = category_id ? {
            must: [
                {
                    key: 'category',
                    match: { value: category_id }
                }
            ]
        } : undefined;

        // Search Qdrant
        const searchResponse = await axios.post(
            `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/search`,
            {
                vector: queryVector,
                limit: top_k * 2, // Get more to dedupe
                with_payload: true,
                filter
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
                    score: result.score
                });

                if (results.length >= top_k) break;
            }
        }

        // Log search
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
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Search error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler bei der Suche',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/documents/:id/content
 * Get raw file content (for editing markdown files)
 */
router.get('/:id/content', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Get document info
        const docResult = await pool.query(
            `SELECT filename, file_path, mime_type, file_extension FROM documents WHERE id = $1 AND deleted_at IS NULL`,
            [id]
        );

        if (docResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Dokument nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        const doc = docResult.rows[0];

        // Only allow text-based files
        const editableExtensions = ['.md', '.markdown', '.txt'];
        if (!editableExtensions.includes(doc.file_extension)) {
            return res.status(400).json({
                error: 'Dieser Dateityp kann nicht bearbeitet werden',
                allowed: editableExtensions,
                timestamp: new Date().toISOString()
            });
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

        // Log access
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
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Get content error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden des Inhalts',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * PUT /api/documents/:id/content
 * Update file content (for markdown files)
 */
router.put('/:id/content', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;

        if (content === undefined || typeof content !== 'string') {
            return res.status(400).json({
                error: 'Inhalt erforderlich',
                timestamp: new Date().toISOString()
            });
        }

        // Get document info
        const docResult = await pool.query(
            `SELECT filename, file_path, mime_type, file_extension FROM documents WHERE id = $1 AND deleted_at IS NULL`,
            [id]
        );

        if (docResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Dokument nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        const doc = docResult.rows[0];

        // Only allow text-based files
        const editableExtensions = ['.md', '.markdown', '.txt'];
        if (!editableExtensions.includes(doc.file_extension)) {
            return res.status(400).json({
                error: 'Dieser Dateityp kann nicht bearbeitet werden',
                allowed: editableExtensions,
                timestamp: new Date().toISOString()
            });
        }

        // Calculate new hash
        const contentBuffer = Buffer.from(content, 'utf-8');
        const newContentHash = crypto.createHash('sha256').update(contentBuffer).digest('hex');

        // Upload new content to MinIO
        const minio = getMinioClient();
        await minio.putObject(MINIO_BUCKET, doc.file_path, contentBuffer, contentBuffer.length, {
            'Content-Type': doc.mime_type
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
                id
            ]
        );

        // Log edit
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
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Update content error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Speichern',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/documents/:id/download
 * Download document file
 */
router.get('/:id/download', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Get document info
        const docResult = await pool.query(
            `SELECT filename, file_path, mime_type FROM documents WHERE id = $1 AND deleted_at IS NULL`,
            [id]
        );

        if (docResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Dokument nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        const doc = docResult.rows[0];

        // Get file from MinIO
        const minio = getMinioClient();
        const dataStream = await minio.getObject(MINIO_BUCKET, doc.file_path);

        // Log download
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
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.filename)}"`);

        dataStream.pipe(res);

    } catch (error) {
        logger.error(`Download error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Download',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
