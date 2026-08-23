/**
 * Backup API routes (SSD-based backup)
 * Stub endpoints for future external SSD backup management
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError, NotImplementedError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFilePromise = promisify(execFile);

const EXTERNAL_MOUNT = process.env.EXTERNAL_BACKUP_PATH || '/mnt/external-ssd';
// Dieselbe Datei, aus der `/api/ops/overview` liest. Eine zweite Quelle fuer
// dieselbe Zahl waere genau der Widerspruch, den dieser Endpunkt hatte.
const BACKUP_REPORT_PATH = process.env.BACKUP_REPORT_PATH || '/arasul/backups/backup_report.json';

/**
 * Der letzte Sicherungslauf, so wie ihn das Sicherungs-Skript hinterlaesst.
 *
 * Faellt der Bericht weg, gilt die Sicherung als fehlend und veraltet. Ein
 * fehlender Bericht ist kein "unbekannt": wer nicht belegen kann, dass er
 * gesichert hat, hat fuer diese Frage nicht gesichert.
 */
async function leseSicherungsbericht() {
  try {
    const roh = await fs.readFile(BACKUP_REPORT_PATH, 'utf8');
    const bericht = JSON.parse(roh);
    const stat = await fs.stat(BACKUP_REPORT_PATH);
    const alterStunden = Math.round((Date.now() - stat.mtimeMs) / 36e5);
    return {
      status: bericht.status || 'unknown',
      timestamp: bericht.timestamp || null,
      ageHours: alterStunden,
      stale: alterStunden > 48,
    };
  } catch {
    return { status: 'missing', timestamp: null, ageHours: null, stale: true };
  }
}

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
 *
 * Zwei verschiedene Dinge, die hier bis zum 23.08.2026 eines waren.
 *
 * `backupEnabled` stand auf `ssdStatus.mounted`, also auf "haengt eine externe
 * Platte dran". Auf dem Orin gemessen: keine Platte angesteckt, Antwort
 * `backupEnabled: false` — und gleichzeitig 38 Postgres-Sicherungen, 37 fuer
 * MinIO, 328 WAL-Segmente, 4,9 GB, letzte Sicherung drei Stunden alt, und eine
 * Wiederherstellungsprobe derselben Nacht mit sechs geprueften Tabellen.
 *
 * Das Geraet sichert also, und der Endpunkt sagte das Gegenteil. Wer eine
 * eigene Anwendung dagegen baut, schliesst daraus, die Sicherung sei aus.
 *
 * Jetzt sagt die Antwort beides getrennt: ob eine externe Platte da ist, und ob
 * wirklich gesichert wird. Die Quelle fuer das Zweite ist dieselbe Datei, aus
 * der auch `/api/ops/overview` liest.
 */
router.get(
  '/status',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const ssdStatus = await getSsdStatus();
    const bericht = await leseSicherungsbericht();

    res.json({
      ssd: ssdStatus,
      // Bleibt erhalten, weil eine dokumentierte Antwortform nicht still die
      // Bedeutung wechselt. Aber sie sagt jetzt die Wahrheit: laeuft die
      // Sicherung.
      backupEnabled: bericht.status === 'completed' && !bericht.stale,
      // Was frueher `backupEnabled` hiess und wirklich gemeint war.
      ssdBackupMoeglich: ssdStatus.mounted,
      letzteSicherung: {
        status: bericht.status,
        zeitpunkt: bericht.timestamp,
        alterStunden: bericht.ageHours ?? null,
        veraltet: bericht.stale,
      },
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
      // P8.1: throw typed error so the global error handler returns the
      // canonical {error:{code,message}} envelope instead of a bare-string.
      throw new ValidationError(
        'Keine externe SSD erkannt. Bitte SSD anschliessen und erneut versuchen.',
        { ssd: ssdStatus }
      );
    }

    // On-demand backup is not implemented: backup.sh runs on a schedule inside
    // the separate backup-service container (BACKUP_USB_ENABLED / BACKUP_USB_MOUNT),
    // not on request from this backend process. Report that honestly instead of
    // returning success:true without doing anything.
    logger.warn(
      `Manual backup requested by ${req.user.username} but on-demand trigger is not implemented`
    );
    throw new NotImplementedError(
      'Manuelles Backup ist noch nicht verfügbar. Backups laufen automatisch geplant über den Backup-Service.',
      { scheduled: true, targetPath: EXTERNAL_MOUNT }
    );
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
