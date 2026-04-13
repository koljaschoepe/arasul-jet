/**
 * Document Analysis API Routes
 * Enables document upload + AI analysis in the chat context.
 *
 * Flow: Upload file → Extract text (OCR if needed) → Send to LLM with prompt → Stream response
 * Reuses the existing LLM queue system for GPU-safe sequential processing.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, ServiceUnavailableError } = require('../utils/errors');
const { uploadLimiter } = require('../middleware/rateLimit');
const database = require('../database');
const minioService = require('../services/documents/minioService');
const extractionService = require('../services/documents/extractionService');
const llmQueueService = require('../services/llm/llmQueueService');
const llmJobService = require('../services/llm/llmJobService');
const { initSSE, trackConnection } = require('../utils/sseHelper');

// Multer: memory storage, 50MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      '.pdf',
      '.docx',
      '.txt',
      '.md',
      '.markdown',
      '.yaml',
      '.yml',
      '.png',
      '.jpg',
      '.jpeg',
      '.tiff',
      '.tif',
      '.bmp',
    ];
    const ext = '.' + (file.originalname.split('.').pop() || '').toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new ValidationError(`Dateityp ${ext} nicht unterstützt`));
    }
  },
});

/**
 * POST /api/document-analysis/analyze
 * Upload a document, extract text, and send to LLM for analysis.
 * Returns SSE stream like /api/llm/chat.
 */
router.post(
  '/analyze',
  requireAuth,
  uploadLimiter,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError('Keine Datei hochgeladen');
    }

    const { conversation_id, prompt, model, temperature } = req.body;

    if (!conversation_id) {
      throw new ValidationError('conversation_id ist erforderlich');
    }

    const chatId = parseInt(conversation_id);
    if (isNaN(chatId) || chatId <= 0) {
      throw new ValidationError('Ungültige conversation_id');
    }

    // Verify conversation exists
    const chatCheck = await database.query(
      `SELECT id FROM chat_conversations WHERE id = $1 AND deleted_at IS NULL`,
      [chatId]
    );
    if (chatCheck.rows.length === 0) {
      throw new ValidationError('Chat nicht gefunden');
    }

    const file = req.file;
    const filename = minioService.sanitizeFilename(file.originalname);

    // 1. Save user message with attachment info
    const userContent = prompt
      ? `📎 ${filename}\n\n${prompt}`
      : `📎 ${filename}\n\nBitte analysiere dieses Dokument.`;

    const userMsg = await database.query(
      `INSERT INTO chat_messages (conversation_id, role, content, status)
       VALUES ($1, 'user', $2, 'completed') RETURNING id`,
      [chatId, userContent]
    );
    const userMessageId = userMsg.rows[0].id;

    // 2. Upload file to MinIO for persistence
    const timestamp = Date.now();
    const minioPath = `chat-attachments/${chatId}/${timestamp}_${filename}`;
    await minioService.uploadObject(minioPath, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

    // 3. Save attachment record
    const ext = '.' + (filename.split('.').pop() || '').toLowerCase();
    await database.query(
      `INSERT INTO chat_attachments (message_id, conversation_id, filename, original_filename, file_path, file_size, mime_type, file_extension, extraction_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'extracting')`,
      [userMessageId, chatId, filename, file.originalname, minioPath, file.size, file.mimetype, ext]
    );

    // 4. Extract text from document
    let extractedText;
    let extractionMetadata;
    try {
      const result = await extractionService.extractFromBuffer(file.buffer, filename);
      extractedText = result.text;
      extractionMetadata = result.metadata;

      // Update attachment with extracted text
      await database.query(
        `UPDATE chat_attachments SET extracted_text = $1, extraction_metadata = $2, extraction_status = 'done'
         WHERE message_id = $3`,
        [extractedText, JSON.stringify(extractionMetadata), userMessageId]
      );
    } catch (extractErr) {
      logger.error(`Text extraction failed for ${filename}: ${extractErr.message}`);
      await database.query(
        `UPDATE chat_attachments SET extraction_status = 'failed' WHERE message_id = $1`,
        [userMessageId]
      );
      throw new ServiceUnavailableError(`Textextraktion fehlgeschlagen: ${extractErr.message}`);
    }

    // 5. Build LLM prompt with extracted text
    const wasTruncated = extractedText.length > 30000;
    const truncatedText = wasTruncated
      ? extractedText.substring(0, 30000) + '\n\n[... Text gekürzt, da zu lang ...]'
      : extractedText;

    if (wasTruncated) {
      logger.info(`Document text truncated: ${extractedText.length} → 30000 chars for ${filename}`);
    }

    const analysisPrompt = prompt
      ? `Der Benutzer hat folgendes Dokument hochgeladen: "${filename}"\n\nExtrahierter Text:\n---\n${truncatedText}\n---\n\nFrage des Benutzers: ${prompt}`
      : `Der Benutzer hat folgendes Dokument hochgeladen: "${filename}"\n\nExtrahierter Text:\n---\n${truncatedText}\n---\n\nBitte analysiere dieses Dokument und fasse die wichtigsten Inhalte zusammen.`;

    // 6. Enqueue LLM job (reuses existing queue system)
    const messages = [{ role: 'user', content: analysisPrompt }];
    const requestData = {
      messages,
      temperature: parseFloat(temperature) || 0.7,
      max_tokens: 4096,
      stream: true,
      thinking: false,
      conversation_id: chatId,
    };

    const { jobId, messageId, queuePosition } = await llmQueueService.enqueue(
      chatId,
      'chat',
      requestData,
      { model: model || null, priority: 0 }
    );

    // 7. Initialize SSE and stream response (same as /api/llm/chat)
    initSSE(res);
    const conn = trackConnection(res);

    // Send initial event
    res.write(
      `data: ${JSON.stringify({
        type: 'job_started',
        jobId,
        messageId,
        userMessageId,
        queuePosition,
        model: model || 'default',
        status: queuePosition > 1 ? 'queued' : 'pending',
        attachment: {
          filename,
          size: file.size,
          extractedChars: extractedText.length,
          truncated: wasTruncated,
          originalChars: wasTruncated ? extractedText.length : undefined,
        },
      })}\n\n`
    );

    // Subscribe to job updates and forward to client
    const unsubscribe = llmQueueService.subscribeToJob(jobId, event => {
      if (!conn.isConnected()) {
        unsubscribe();
        return;
      }
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.done) {
          unsubscribe();
          res.end();
        }
      } catch {
        unsubscribe();
      }
    });

    // Cleanup on client disconnect
    conn.onClose(() => {
      unsubscribe();
    });
  })
);

/**
 * POST /api/document-analysis/extract
 * Pure text extraction without LLM analysis.
 * Used by n8n workflows and internal tools.
 */
router.post(
  '/extract',
  requireAuth,
  (req, res, next) => {
    upload.single('file')(req, res, err => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new ValidationError('Datei zu groß (max. 50 MB)'));
        }
        if (err instanceof ValidationError) {
          return next(err);
        }
        return next(new ValidationError(`Upload-Fehler: ${err.message}`));
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

    const result = await extractionService.extractFromBuffer(file.buffer, filename);

    res.json({
      text: result.text,
      filename,
      metadata: result.metadata,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
