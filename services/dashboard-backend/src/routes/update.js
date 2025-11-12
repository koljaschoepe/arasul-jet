/**
 * Update API routes
 * Handles system updates via dashboard upload
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const db = require('../database');
const logger = require('../utils/logger');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const { requireAuth } = require('../middleware/auth');
const updateService = require('../services/updateService');

const execAsync = promisify(exec);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = '/tmp/updates';
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        cb(null, `update_${timestamp}_${file.originalname}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 * 1024 // 10 GB max
    },
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname) === '.araupdate') {
            cb(null, true);
        } else {
            cb(new Error('Only .araupdate files are allowed'));
        }
    }
});

// POST /api/update/upload
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                timestamp: new Date().toISOString()
            });
        }

        const filePath = req.file.path;
        const fileName = req.file.filename;

        logger.info(`Update file uploaded: ${fileName} (${req.file.size} bytes)`);

        // Check for signature file
        const signatureFilePath = `${filePath}.sig`;
        if (!req.files || !req.files.signature) {
            // Signature should be uploaded separately or be in same directory
            logger.warn('Signature file not found, validation may fail');
        }

        // Move to permanent location
        const permanentPath = path.join('/arasul/updates', fileName);
        await fs.mkdir('/arasul/updates', { recursive: true });
        await fs.rename(filePath, permanentPath);

        // If signature was uploaded, move it too
        if (req.files && req.files.signature) {
            await fs.rename(req.files.signature[0].path, `${permanentPath}.sig`);
        }

        // Validate update using UpdateService
        const validation = await updateService.validateUpdate(permanentPath);

        if (!validation.valid) {
            // Clean up file
            await fs.unlink(permanentPath).catch(() => {});
            await fs.unlink(`${permanentPath}.sig`).catch(() => {});

            return res.status(400).json({
                error: validation.error || 'Update validation failed',
                timestamp: new Date().toISOString()
            });
        }

        const manifest = validation.manifest;

        // Log update event
        const currentVersion = process.env.SYSTEM_VERSION || '1.0.0';
        await db.query(
            `INSERT INTO update_events (version_from, version_to, status, source, components_updated)
             VALUES ($1, $2, $3, $4, $5)`,
            [currentVersion, manifest.version, 'validated', 'dashboard', JSON.stringify(manifest.components)]
        );

        res.json({
            status: 'validated',
            version: manifest.version,
            size: req.file.size,
            components: manifest.components,
            requires_reboot: manifest.requires_reboot || false,
            timestamp: new Date().toISOString(),
            message: 'Update package validated successfully. Use /api/update/apply to install.',
            file_path: permanentPath
        });

    } catch (error) {
        logger.error(`Error in /api/update/upload: ${error.message}`);
        res.status(400).json({
            error: error.message || 'Update validation failed',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/update/apply
router.post('/apply', requireAuth, async (req, res) => {
    try {
        const { file_path } = req.body;

        if (!file_path) {
            return res.status(400).json({
                error: 'Update file path is required',
                timestamp: new Date().toISOString()
            });
        }

        // Check if update is already in progress
        const currentState = await updateService.getUpdateState();
        if (currentState && currentState.status === 'in_progress') {
            return res.status(409).json({
                error: 'Update already in progress',
                currentStep: currentState.currentStep,
                timestamp: new Date().toISOString()
            });
        }

        // Verify file exists
        try {
            await fs.access(file_path);
        } catch (error) {
            return res.status(404).json({
                error: 'Update file not found',
                timestamp: new Date().toISOString()
            });
        }

        // Start update process asynchronously
        logger.info(`Starting update application for: ${file_path}`);

        // Return immediately and process update in background
        res.json({
            status: 'started',
            message: 'Update process started. Use /api/update/status to monitor progress.',
            timestamp: new Date().toISOString()
        });

        // Apply update asynchronously
        updateService.applyUpdate(file_path).then(result => {
            if (result.success) {
                logger.info(`Update completed successfully: ${result.version}`);
            } else {
                logger.error(`Update failed: ${result.error}`);
            }
        }).catch(error => {
            logger.error(`Update process error: ${error.message}`);
        });

    } catch (error) {
        logger.error(`Error in /api/update/apply: ${error.message}`);
        res.status(500).json({
            error: 'Failed to start update process',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/update/status
router.get('/status', requireAuth, async (req, res) => {
    try {
        const state = await updateService.getUpdateState();

        if (!state) {
            return res.json({
                status: 'idle',
                message: 'No update in progress',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            ...state,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/update/status: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get update status',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/update/history
router.get('/history', requireAuth, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM update_events ORDER BY timestamp DESC LIMIT 10'
        );

        res.json({
            updates: result.rows,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/update/history: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get update history',
            timestamp: new Date().toISOString()
        });
    }
});

// Helper function to compare semantic versions
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;

        if (part1 > part2) return 1;
        if (part1 < part2) return -1;
    }

    return 0;
}

module.exports = router;
