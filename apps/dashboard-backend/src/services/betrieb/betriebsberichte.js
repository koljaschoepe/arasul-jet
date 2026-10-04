/**
 * Die Berichte von Sicherung und Wiederherstellungstest fuer die
 * Betriebsuebersicht (`GET /api/ops/overview`).
 *
 * Aus `routes/admin/ops.js` hierher gezogen (M5, Auftrag jet-fehlerklassen):
 * Routen fangen keine Fehler. Ein fehlender oder kaputter Bericht ist hier
 * eine Aussage (`missing`, `never_run`), kein Fehler der Seite.
 */

const fs = require('fs').promises;
const path = require('path');

const BACKUP_REPORT_PATH = process.env.BACKUP_REPORT_PATH || '/arasul/backups/backup_report.json';

async function readBackupReport() {
  try {
    const raw = await fs.readFile(BACKUP_REPORT_PATH, 'utf8');
    const report = JSON.parse(raw);
    const stat = await fs.stat(BACKUP_REPORT_PATH);
    const ageMs = Date.now() - stat.mtimeMs;
    const ageHours = Math.round(ageMs / 36e5);
    return {
      status: report.status || 'unknown',
      timestamp: report.timestamp || null,
      ageHours,
      stale: ageHours > 48,
      postgresBackups: report.postgres_backups ?? null,
      walSegments: report.wal_segments ?? null,
      totalSize: report.total_size || null,
    };
  } catch (err) {
    return { status: 'missing', reason: err.code || 'read_failed', stale: true };
  }
}

async function readRestoreDrillReport() {
  try {
    const drillPath = path.join(path.dirname(BACKUP_REPORT_PATH), 'restore_drill_report.json');
    const raw = await fs.readFile(drillPath, 'utf8');
    const report = JSON.parse(raw);
    const stat = await fs.stat(drillPath);
    const ageDays = Math.round((Date.now() - stat.mtimeMs) / 864e5);
    return {
      status: report.status || 'unknown',
      timestamp: report.timestamp || null,
      ageDays,
      stale: ageDays > 14,
      verifiedTables: report.verified_tables ?? null,
      duration: report.duration_seconds ?? null,
    };
  } catch {
    return { status: 'never_run', stale: true };
  }
}

module.exports = { readBackupReport, readRestoreDrillReport };
