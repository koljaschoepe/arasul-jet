/**
 * Backup API routes (SSD-based backup)
 * Stub endpoints for future external SSD backup management
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFilePromise = promisify(execFile);

const EXTERNAL_MOUNT = process.env.EXTERNAL_BACKUP_PATH || '/mnt/external-ssd';

/**
 * Check if external SSD is mounted and accessible
 */
async function getSsdStatus() {
  try {
    await fs.access(EXTERNAL_MOUNT);
    const stats = await fs.stat(EXTERNAL_MOUNT);

    if (!stats.isDirectory()) {
      return { mounted: false, reason: 'Mount point is not a directory' };
    }

    // Check if it's a real mount (not just an empty dir)
    let isMounted = false;
    try {
      const { stdout } = await execFilePromise('mountpoint', ['-q', EXTERNAL_MOUNT]);
      isMounted = true;
    } catch {
      // mountpoint returns non-zero if not a mount
      isMounted = false;
    }

    if (!isMounted) {
      return { mounted: false, reason: 'No device mounted at mount point' };
    }

    // Get disk usage
    const { stdout } = await execFilePromise('df', [
      '-B1',
      '--output=size,used,avail',
      EXTERNAL_MOUNT,
    ]);
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      const [size, used, avail] = lines[1].trim().split(/\s+/).map(Number);
      return {
        mounted: true,
        path: EXTERNAL_MOUNT,
        totalBytes: size,
        usedBytes: used,
        availableBytes: avail,
      };
    }

    return { mounted: true, path: EXTERNAL_MOUNT };
  } catch {
    return { mounted: false, reason: 'Mount point not accessible' };
  }
}

/**
 * GET /api/backup/status
 * Check if external SSD is detected and mounted
 */
router.get(
  '/status',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const ssdStatus = await getSsdStatus();

    res.json({
      ssd: ssdStatus,
      backupEnabled: ssdStatus.mounted,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/backup/trigger
 * Trigger a manual backup to external SSD
 */
router.post(
  '/trigger',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const ssdStatus = await getSsdStatus();

    if (!ssdStatus.mounted) {
      return res.status(400).json({
        error: 'Keine externe SSD erkannt. Bitte SSD anschliessen und erneut versuchen.',
        ssd: ssdStatus,
        timestamp: new Date().toISOString(),
      });
    }

    // TODO: Implement actual backup trigger via backup.sh with BACKUP_PATH
    logger.info(`Manual backup triggered by ${req.user.username} to ${EXTERNAL_MOUNT}`);

    res.json({
      success: true,
      message: 'Backup wird gestartet...',
      targetPath: EXTERNAL_MOUNT,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/backup/history
 * List previous backups on external SSD
 */
router.get(
  '/history',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const ssdStatus = await getSsdStatus();

    if (!ssdStatus.mounted) {
      return res.json({
        backups: [],
        ssd: ssdStatus,
        timestamp: new Date().toISOString(),
      });
    }

    // List backup directories on the SSD
    const backupsDir = `${EXTERNAL_MOUNT}/backups`;
    let backups = [];

    try {
      const entries = await fs.readdir(backupsDir, { withFileTypes: true });
      backups = entries
        .filter(e => e.isDirectory())
        .map(e => ({ name: e.name }))
        .sort((a, b) => b.name.localeCompare(a.name));
    } catch {
      // No backups directory yet
    }

    res.json({
      backups,
      ssd: ssdStatus,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
