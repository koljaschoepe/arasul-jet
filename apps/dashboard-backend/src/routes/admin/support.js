/**
 * Support-Bundle-Export (Phase 5.5)
 *
 * Sammelt Diagnose-Daten in ein Tar-Archiv für Support-Fälle. Customer
 * kann das Bundle direkt aus dem Dashboard herunterladen, ohne SSH-Zugriff.
 *
 * Sicherheits-Prinzip: Sammelt Service-Status, Logs (letzte 500 Zeilen),
 * System-Metriken und Self-Healing-Events. Keine Passwörter, Tokens,
 * Personen-Daten.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const logger = require('../../utils/logger');
const db = require('../../database');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ServiceUnavailableError } = require('../../utils/errors');
const { logSecurityEvent } = require('../../utils/auditLog');

/**
 * POST /api/support/bundle
 * Erzeugt ein Diagnose-Tar-Archiv und sendet es als Download.
 *
 * Hinweis: Bundle-Erzeugung läuft IM Container, weil das Backend keinen
 * direkten Host-Shell-Zugriff hat. Wir sammeln die für uns erreichbaren
 * Daten direkt: DB-Stats, System-Settings, Service-Health, Audit-Log.
 */
router.post(
  '/bundle',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'arasul-support-'));
    const bundleName = `support-bundle-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`;
    const bundlePath = path.join(tmpDir, bundleName);

    const stagingDir = path.join(tmpDir, 'staging');
    await fs.promises.mkdir(stagingDir, { recursive: true });

    try {
      // 1. System-Info
      const sysInfo = {
        node_version: process.version,
        platform: os.platform(),
        arch: os.arch(),
        uptime_seconds: Math.round(os.uptime()),
        loadavg: os.loadavg(),
        totalmem_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
        freemem_gb: Math.round(os.freemem() / 1024 / 1024 / 1024),
        timestamp: new Date().toISOString(),
      };
      await fs.promises.writeFile(
        path.join(stagingDir, 'system-info.json'),
        JSON.stringify(sysInfo, null, 2)
      );

      // 2. DB-Health (counts only, no row data)
      const tables = [
        'admin_users',
        'chat_conversations',
        'documents',
        'knowledge_spaces',
        'projects',
      ];
      const dbHealth = {};
      for (const t of tables) {
        try {
          const r = await db.query(`SELECT COUNT(*) AS c FROM ${t}`);
          dbHealth[t] = parseInt(r.rows[0].c, 10);
        } catch (e) {
          dbHealth[t] = `error: ${e.message}`;
        }
      }
      await fs.promises.writeFile(
        path.join(stagingDir, 'db-health.json'),
        JSON.stringify(dbHealth, null, 2)
      );

      // 3. Schema-Migrations-Status
      try {
        const migs = await db.query(
          'SELECT version, filename, applied_at, success FROM schema_migrations ORDER BY version DESC LIMIT 30'
        );
        await fs.promises.writeFile(
          path.join(stagingDir, 'migrations.json'),
          JSON.stringify(migs.rows, null, 2)
        );
      } catch (e) {
        await fs.promises.writeFile(
          path.join(stagingDir, 'migrations.json'),
          JSON.stringify({ error: e.message })
        );
      }

      // 4. Audit-Log-Health (Phase 1.5)
      try {
        const ahealth = await db.query(
          'SELECT failure_count, last_failure_at, last_failure_reason, last_success_at FROM audit_log_health WHERE id = 1'
        );
        await fs.promises.writeFile(
          path.join(stagingDir, 'audit-health.json'),
          JSON.stringify(ahealth.rows[0] || {}, null, 2)
        );
      } catch (e) {
        // Tabelle gibt es nur wenn Migration 088 angewendet — defensive
        await fs.promises.writeFile(
          path.join(stagingDir, 'audit-health.json'),
          JSON.stringify({ note: 'audit_log_health table missing (Phase 1.5 not applied?)' })
        );
      }

      // 5. Self-Healing Events (letzte 50)
      try {
        const events = await db.query(
          `SELECT timestamp, event_type, severity, container, status
             FROM self_healing_events
             ORDER BY timestamp DESC LIMIT 50`
        );
        await fs.promises.writeFile(
          path.join(stagingDir, 'self-healing-events.json'),
          JSON.stringify(events.rows, null, 2)
        );
      } catch (e) {
        await fs.promises.writeFile(
          path.join(stagingDir, 'self-healing-events.json'),
          JSON.stringify({ error: e.message })
        );
      }

      // 6. Compliance-Status (Phase 1.4 + 1.6)
      try {
        const comp = await db.query(
          `SELECT telegram_enabled, telegram_disclaimer_accepted, ai_transparency_enabled
             FROM system_settings WHERE id = 1`
        );
        await fs.promises.writeFile(
          path.join(stagingDir, 'compliance-status.json'),
          JSON.stringify(comp.rows[0] || {}, null, 2)
        );
      } catch (e) {
        // ignore
      }

      // 7. Backend-Version
      let backendPkg = {};
      try {
        backendPkg = JSON.parse(await fs.promises.readFile('/app/package.json', 'utf8'));
      } catch (_) {}
      await fs.promises.writeFile(
        path.join(stagingDir, 'backend-version.json'),
        JSON.stringify(
          {
            name: backendPkg.name,
            version: backendPkg.version,
            node_version: process.version,
          },
          null,
          2
        )
      );

      // 8. README für den Support
      await fs.promises.writeFile(
        path.join(stagingDir, 'README.txt'),
        [
          'Arasul Support-Bundle',
          '======================',
          `Erzeugt am: ${new Date().toISOString()}`,
          `User: ${req.user.username} (id=${req.user.id})`,
          '',
          'Inhalt:',
          '  system-info.json          — Node-Version, OS, RAM',
          '  db-health.json            — Tabellen-Zeilenzahlen',
          '  migrations.json           — Letzte 30 Migrationen',
          '  audit-health.json         — Audit-Pipeline-Status',
          '  self-healing-events.json  — Letzte 50 Heal-Events',
          '  compliance-status.json    — Telegram/AI-Transparenz-Flags',
          '  backend-version.json      — Backend-Version',
          '',
          'Keine Passwörter, Tokens oder personenbezogenen Daten enthalten.',
          'Senden Sie das Archiv an support@arasul.local.',
        ].join('\n')
      );

      // 9. Tar-Archiv erstellen via spawn
      await new Promise((resolve, reject) => {
        const tar = spawn('tar', ['-czf', bundlePath, '-C', stagingDir, '.']);
        tar.on('error', reject);
        tar.on('exit', code => (code === 0 ? resolve() : reject(new Error(`tar exit ${code}`))));
      });

      // 10. Audit-Log-Eintrag
      logSecurityEvent({
        userId: req.user.id,
        action: 'support_bundle_export',
        details: {},
        ipAddress: req.ip,
        requestId: req.headers['x-request-id'],
      });

      const stat = await fs.promises.stat(bundlePath);
      logger.info(
        `Support-Bundle generiert: ${bundleName} (${stat.size} bytes) by ${req.user.username}`
      );

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${bundleName}"`);
      res.setHeader('Content-Length', stat.size);
      const stream = fs.createReadStream(bundlePath);
      stream.pipe(res);

      // Cleanup nach Stream-Ende
      stream.on('close', async () => {
        try {
          await fs.promises.rm(tmpDir, { recursive: true, force: true });
        } catch (_) {}
      });
    } catch (err) {
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      } catch (_) {}
      throw new ServiceUnavailableError(
        `Support-Bundle konnte nicht erstellt werden: ${err.message}`
      );
    }
  })
);

module.exports = router;
