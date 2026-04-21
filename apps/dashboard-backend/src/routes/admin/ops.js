/**
 * Ops overview — aggregates backup, WAL, alerts, service health, disk, GPU
 * into a single dashboard widget payload.
 *
 * Why consolidated: the System-Gesundheit widget would otherwise fan out to
 * 5+ separate endpoints. One query surface, one cache horizon.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const db = require('../../database');
const dockerService = require('../../services/core/docker');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

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
      minioBackups: report.minio_backups ?? null,
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

// GET /api/ops/overview
router.get(
  '/overview',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [backup, drill, services, alerts, unsent, metrics, retention] = await Promise.all([
      readBackupReport(),
      readRestoreDrillReport(),
      dockerService.getAllServicesStatus().catch(err => {
        logger.warn('ops/overview: docker status failed', { error: err.message });
        return {};
      }),
      db
        .query(
          `
        SELECT id, metric_type, severity, current_value, threshold_value,
               message, fired_at
          FROM alert_history
         WHERE acknowledged = false
           AND resolved_at IS NULL
         ORDER BY fired_at DESC
         LIMIT 10
      `
        )
        .then(r => r.rows)
        .catch(() => []),
      db
        .query(
          `
        SELECT COUNT(*)::int AS unsent,
               COUNT(*) FILTER (WHERE severity = 'critical')::int AS unsent_critical
          FROM notification_events
         WHERE notification_sent = false
           AND created_at > NOW() - INTERVAL '24 hours'
      `
        )
        .then(r => r.rows[0] || { unsent: 0, unsent_critical: 0 })
        .catch(() => ({ unsent: 0, unsent_critical: 0 })),
      db
        .query(
          `
        SELECT
          (SELECT value FROM metrics_cpu ORDER BY timestamp DESC LIMIT 1) AS cpu,
          (SELECT value FROM metrics_ram ORDER BY timestamp DESC LIMIT 1) AS ram,
          (SELECT value FROM metrics_gpu ORDER BY timestamp DESC LIMIT 1) AS gpu,
          (SELECT value FROM metrics_temperature ORDER BY timestamp DESC LIMIT 1) AS temperature,
          (SELECT percent FROM metrics_disk ORDER BY timestamp DESC LIMIT 1) AS disk_percent
      `
        )
        .then(r => r.rows[0] || {})
        .catch(() => ({})),
      db
        .query(
          `
        SELECT
          (SELECT COUNT(*)::int FROM app_events)         AS app_events,
          (SELECT COUNT(*)::int FROM chat_messages)      AS chat_messages,
          (SELECT COUNT(*)::int FROM self_healing_events) AS self_healing_events
      `
        )
        .then(r => r.rows[0] || {})
        .catch(() => ({})),
    ]);

    const serviceEntries = Object.entries(services);
    const serviceHealth = {
      total: serviceEntries.length,
      healthy: serviceEntries.filter(([, s]) => s.status === 'healthy' || s.status === 'running')
        .length,
      degraded: serviceEntries.filter(
        ([, s]) => s.status === 'restarting' || s.status === 'starting'
      ).length,
      down: serviceEntries.filter(
        ([, s]) => s.status === 'failed' || s.status === 'exited' || s.status === 'unhealthy'
      ).length,
      down_services: serviceEntries
        .filter(
          ([, s]) => s.status === 'failed' || s.status === 'exited' || s.status === 'unhealthy'
        )
        .map(([name]) => name),
    };

    const criticals = [];
    const warnings = [];

    if (backup.stale)
      {criticals.push(
        `Backup ${backup.status === 'missing' ? 'missing' : 'stale'} (${backup.ageHours ?? '?'}h old)`
      );}
    if (drill.status === 'never_run') {warnings.push('Restore-Drill wurde nie ausgeführt');}
    else if (drill.stale) {warnings.push(`Letzter Restore-Drill ${drill.ageDays} Tage alt`);}
    if (serviceHealth.down > 0)
      {criticals.push(
        `${serviceHealth.down} Service(s) offline: ${serviceHealth.down_services.join(', ')}`
      );}
    if (alerts.length > 0) {warnings.push(`${alerts.length} unbestätigte Alerts`);}
    if (unsent.unsent_critical > 0)
      {criticals.push(`${unsent.unsent_critical} kritische Benachrichtigungen unversandt`);}
    if (metrics.disk_percent > 90)
      {criticals.push(`Disk-Nutzung kritisch (${metrics.disk_percent}%)`);}
    else if (metrics.disk_percent > 80)
      {warnings.push(`Disk-Nutzung hoch (${metrics.disk_percent}%)`);}
    if (metrics.temperature > 85) {criticals.push(`Temperatur kritisch (${metrics.temperature}°C)`);}
    else if (metrics.temperature > 80) {warnings.push(`Temperatur hoch (${metrics.temperature}°C)`);}

    let status = 'OK';
    if (criticals.length > 0) {status = 'CRITICAL';}
    else if (warnings.length > 0) {status = 'WARNING';}

    res.json({
      status,
      warnings,
      criticals,
      backup,
      restore_drill: drill,
      services: serviceHealth,
      alerts: {
        active: alerts.length,
        items: alerts.map(a => ({
          id: a.id,
          metric: a.metric_type,
          severity: a.severity,
          value: a.current_value,
          threshold: a.threshold_value,
          message: a.message,
          fired_at: a.fired_at,
        })),
      },
      notifications: {
        unsent_24h: unsent.unsent,
        unsent_critical_24h: unsent.unsent_critical,
      },
      metrics: {
        cpu_percent: metrics.cpu ?? null,
        ram_percent: metrics.ram ?? null,
        gpu_percent: metrics.gpu ?? null,
        temperature_c: metrics.temperature ?? null,
        disk_percent: metrics.disk_percent ?? null,
      },
      retention_counts: {
        app_events: retention.app_events ?? null,
        chat_messages: retention.chat_messages ?? null,
        self_healing_events: retention.self_healing_events ?? null,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
