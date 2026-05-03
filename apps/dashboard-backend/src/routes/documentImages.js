/**
 * Document Images API Routes
 *
 * Upload and serve inline images for documents:
 * - POST /images/upload — Upload an image to MinIO
 * - GET /images/:filename — Serve an image from MinIO
 *
 * Extracted from routes/documents.js for maintainability.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { validateFileContent } = require('../utils/fileValidation');
const minioService = require('../services/documents/minioService');

// =============================================================================
// Constants
// =============================================================================

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

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /images/upload — Upload an image for inline use in documents
 */
router.post(
  '/images/upload',
  requireAuth,
  (req, res, next) => {
    imageUpload.single('image')(req, res, err => {
      if (err) {
        const code = err instanceof multer.MulterError ? 'UPLOAD_ERROR' : 'VALIDATION_ERROR';
        return res.status(400).json({
          error: { code, message: err.message },
          timestamp: new Date().toISOString(),
        });
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
    const imageExt = '.' + filename.split('.').pop().toLowerCase();

    // Validate image content matches extension (magic byte check)
    if (!validateFileContent(file.buffer, imageExt)) {
      throw new ValidationError('Bildinhalt stimmt nicht mit dem Dateietyp überein');
    }

    // Phase 2.4 IDOR: User-ID im Pfad einbetten ("U<id>") sodass der GET-
    // Endpoint serverseitig owner-checken kann ohne extra DB-Roundtrip.
    // Legacy-Images ohne U-Prefix werden vom GET-Handler nur für Admins
    // freigegeben.
    const timestamp = Date.now();
    const objectName = `images/U${req.user.id}_${timestamp}_${filename}`;

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

    // Phase 2.4 IDOR: User-Owner-Check via Path-Prefix.
    // Format ab Phase 2.4: U<userid>_<timestamp>_<file>.
    // Legacy ohne U-Prefix → nur Admin.
    if (req.user.role !== 'admin') {
      const ownerMatch = filename.match(/^U(\d+)_/);
      if (!ownerMatch) {
        throw new NotFoundError('Bild nicht gefunden');
      }
      const ownerId = parseInt(ownerMatch[1], 10);
      if (ownerId !== Number(req.user.id)) {
        throw new NotFoundError('Bild nicht gefunden');
      }
    }

    try {
      const stat = await minioService.statObject(objectName);
      res.set('Content-Type', stat.metaData?.['content-type'] || 'application/octet-stream');
      res.set('Cache-Control', 'public, max-age=31536000, immutable');

      const stream = await minioService.getObject(objectName);

      // Cleanup MinIO stream if client disconnects
      res.on('close', () => {
        if (!stream.destroyed) {
          stream.destroy();
        }
      });

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
