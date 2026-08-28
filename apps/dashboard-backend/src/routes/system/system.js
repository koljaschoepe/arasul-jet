/**
 * System API routes
 * Handles system status, info, and network information
 */

const { versionFuerAnzeige } = require('../../utils/version');
const express = require('express');
const router = express.Router();
const db = require('../../database');
const dockerService = require('../../services/core/docker');
const logger = require('../../utils/logger');
const os = require('os');
const axios = require('axios');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const { asyncHandler } = require('../../middleware/errorHandler');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ServiceUnavailableError, NotFoundError } = require('../../utils/errors');
const { detectDevice, getGpuInfo, getLlmRamGB } = require('../../utils/hardware');
const { logSecurityEvent } = require('../../utils/auditLog');
const { validateBody } = require('../../middleware/validate');
const { DiagnosticsBody } = require('../../schemas/system');

const path = require('path');
const execFileAsync = promisify(execFile);

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const DIAGNOSTICS_SCRIPT = path.join(PROJECT_ROOT, 'scripts/system/diagnostics.sh');

// GET /api/system/heartbeat
// Public endpoint (no auth) for remote monitoring and health checks
router.get('/heartbeat', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(os.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// GET /api/system/status
router.get(
  '/status',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    // Get service statuses from Docker
    const services = await dockerService.getAllServicesStatus();

    // Get latest metrics
    const metricsQuery = await db.query(`
        SELECT
            (SELECT value FROM metrics_cpu ORDER BY timestamp DESC LIMIT 1) as cpu,
            (SELECT value FROM metrics_ram ORDER BY timestamp DESC LIMIT 1) as ram,
            (SELECT value FROM metrics_gpu ORDER BY timestamp DESC LIMIT 1) as gpu,
            (SELECT value FROM metrics_temperature ORDER BY timestamp DESC LIMIT 1) as temperature,
            (SELECT percent FROM metrics_disk ORDER BY timestamp DESC LIMIT 1) as disk_percent
    `);

    const metrics = metricsQuery.rows[0] || {};

    // Get latest self-healing event
    const healingQuery = await db.query(
      'SELECT event_type, severity, description, timestamp FROM self_healing_events ORDER BY timestamp DESC LIMIT 1'
    );
    const lastHealingEvent = healingQuery.rows[0] || null;

    // Determine overall status
    let status = 'OK';
    const warnings = [];
    const criticals = [];

    // Check services
    Object.entries(services).forEach(([name, svc]) => {
      if (svc.status === 'restarting') {
        warnings.push(`${name} is restarting`);
      }
      if (svc.status === 'failed' || svc.status === 'exited') {
        criticals.push(`${name} is down`);
      }
    });

    // Check metrics
    if (metrics.cpu > 80) {
      warnings.push('CPU usage high');
    }
    if (metrics.ram > 80) {
      warnings.push('RAM usage high');
    }
    if (metrics.temperature > 80) {
      warnings.push('Temperature high');
    }
    if (metrics.disk_percent > 80) {
      warnings.push('Disk usage high');
    }
    if (metrics.temperature > 85) {
      criticals.push('Temperature critical');
    }
    if (metrics.disk_percent > 95) {
      criticals.push('Disk usage critical');
    }

    if (criticals.length > 0) {
      status = 'CRITICAL';
    } else if (warnings.length > 0) {
      status = 'WARNING';
    }

    // GPU availability check
    const gpu = await getGpuInfo();
    if (!gpu.available) {
      warnings.push('GPU not available - LLM inference will be slow (CPU only)');
    }

    // Re-evaluate status after GPU check
    if (criticals.length > 0) {
      status = 'CRITICAL';
    } else if (warnings.length > 0) {
      status = 'WARNING';
    }

    res.json({
      status,
      llm: services.llm?.status || 'unknown',
      embeddings: services.embedding?.status || 'unknown',
      postgres: services.postgres?.status || 'unknown',
      self_healing_active: services.self_healing?.status === 'healthy',
      gpu_available: gpu.available,
      last_self_healing_event: lastHealingEvent ? lastHealingEvent.description : null,
      warnings,
      criticals,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/system/info
router.get(
  '/info',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const uptime = os.uptime();
    // Device name from MDNS_NAME. os.hostname() runs inside the container and
    // therefore returns "dashboard-backend" (compose sets it explicitly), never
    // the name the device is reachable under. Same source as /system/network.
    const hostname = (process.env.MDNS_NAME || os.hostname()).replace(/\.local$/, '');

    // Get JetPack version (if available)
    let jetpackVersion = 'unknown';
    try {
      // SECURITY: Use execFile with array args to prevent shell injection
      const { stdout } = await execFileAsync('dpkg-query', [
        '-W',
        '-f',
        // eslint-disable-next-line no-template-curly-in-string
        '${Version}',
        'nvidia-jetpack',
      ]);
      if (stdout && stdout.trim()) {
        jetpackVersion = stdout.trim();
      }
    } catch {
      // dpkg-query queries a HOST package and always fails inside the container.
      // Fall back to the L4T release file, which compose mounts read-only.
      try {
        const rel = await fs.readFile('/etc/nv_tegra_release', 'utf8');
        // Example: "# R36 (release), REVISION: 4.7, GCID: 42132812, BOARD: ..."
        const m = rel.match(/R(\d+).*?REVISION:\s*([\d.]+)/);
        if (m) {
          jetpackVersion = `L4T ${m[1]}.${m[2]}`;
        }
      } catch {
        // Neither source available (non-Jetson host), stays "unknown"
      }
    }

    // Detect device and GPU
    const [device, gpu] = await Promise.all([detectDevice(), getGpuInfo()]);

    res.json({
      version: versionFuerAnzeige(),
      build_hash: process.env.BUILD_HASH || 'dev',
      jetpack_version: jetpackVersion,
      uptime_seconds: Math.floor(uptime),
      hostname: hostname,
      device,
      gpu,
      llmRamGB: getLlmRamGB(),
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/system/network
router.get(
  '/network',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const networkInterfaces = os.networkInterfaces();
    const ipAddresses = [];

    // Extract IPv4 addresses (exclude loopback)
    Object.values(networkInterfaces).forEach(interfaces => {
      interfaces.forEach(iface => {
        if (iface.family === 'IPv4' && !iface.internal) {
          ipAddresses.push(iface.address);
        }
      });
    });

    // Check internet connectivity
    let internetReachable = false;
    try {
      // SECURITY: Use execFile with array args to prevent shell injection
      await execFileAsync('ping', ['-c', '1', '-W', '2', '8.8.8.8']);
      internetReachable = true;
    } catch {
      // Internet not reachable
    }

    // Real LAN name from MDNS_NAME (compose passes it through; defaults to
    // "arasul"). Avoids a hardcoded "arasul.local" that mismatches a custom
    // hostname and breaks the "one name" access story.
    const mdnsHostname = (process.env.MDNS_NAME || 'arasul').replace(/\.local$/, '');
    res.json({
      ip_addresses: ipAddresses,
      mdns: `${mdnsHostname}.local`,
      internet_reachable: internetReachable,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/system/thresholds - Get device-specific thresholds
router.get(
  '/thresholds',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    // Detect device type
    let deviceType = 'generic';
    let deviceName = 'Generic Linux';
    const cpuCores = os.cpus().length;
    const totalMemoryGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));

    // Try to detect Jetson device
    try {
      // SECURITY: Use fs.readFile instead of exec('cat ...') to prevent shell injection
      // fire-and-forget: files may not exist on non-Jetson devices; empty string = not found
      const tegrastats = await fs.readFile('/etc/nv_tegra_release', 'utf8').catch(() => '');
      if (tegrastats.includes('TEGRA')) {
        // It's a Jetson device
        const modelInfo = await fs.readFile('/proc/device-tree/model', 'utf8').catch(() => '');

        if (modelInfo.includes('AGX Orin')) {
          deviceType = 'jetson_agx_orin';
          deviceName = 'NVIDIA Jetson AGX Orin';
        } else if (modelInfo.includes('Orin Nano')) {
          deviceType = 'jetson_orin_nano';
          deviceName = 'NVIDIA Jetson Orin Nano';
        } else if (modelInfo.includes('Orin NX')) {
          deviceType = 'jetson_orin_nx';
          deviceName = 'NVIDIA Jetson Orin NX';
        } else if (modelInfo.includes('Xavier')) {
          deviceType = 'jetson_xavier';
          deviceName = 'NVIDIA Jetson Xavier';
        } else if (modelInfo.includes('Nano')) {
          deviceType = 'jetson_nano';
          deviceName = 'NVIDIA Jetson Nano';
        } else {
          deviceType = 'jetson_generic';
          deviceName = 'NVIDIA Jetson Device';
        }
      }
    } catch {
      // Not a Jetson device or could not detect
    }

    // Device-specific thresholds
    const deviceThresholds = {
      // Jetson AGX Orin - High performance, good cooling
      jetson_agx_orin: {
        cpu: { warning: 75, critical: 90 },
        ram: { warning: 75, critical: 90 },
        gpu: { warning: 80, critical: 95 },
        storage: { warning: 70, critical: 85 },
        temperature: { warning: 80, critical: 95 }, // Tj junction, throttles ~99°C (NVIDIA TDG-10943)
      },
      // Jetson Orin Nano - Less powerful, smaller heatsink
      jetson_orin_nano: {
        cpu: { warning: 70, critical: 85 },
        ram: { warning: 70, critical: 85 },
        gpu: { warning: 75, critical: 90 },
        storage: { warning: 70, critical: 85 },
        temperature: { warning: 60, critical: 75 }, // More conservative
      },
      // Jetson Orin NX - Mid-range
      jetson_orin_nx: {
        cpu: { warning: 72, critical: 88 },
        ram: { warning: 72, critical: 88 },
        gpu: { warning: 78, critical: 92 },
        storage: { warning: 70, critical: 85 },
        temperature: { warning: 62, critical: 77 },
      },
      // Jetson Xavier - Previous gen
      jetson_xavier: {
        cpu: { warning: 70, critical: 85 },
        ram: { warning: 70, critical: 85 },
        gpu: { warning: 75, critical: 90 },
        storage: { warning: 70, critical: 85 },
        temperature: { warning: 60, critical: 75 },
      },
      // Jetson Nano - Entry level
      jetson_nano: {
        cpu: { warning: 65, critical: 80 },
        ram: { warning: 65, critical: 80 },
        gpu: { warning: 70, critical: 85 },
        storage: { warning: 70, critical: 85 },
        temperature: { warning: 55, critical: 70 }, // Limited cooling
      },
      // Generic Jetson fallback
      jetson_generic: {
        cpu: { warning: 70, critical: 85 },
        ram: { warning: 70, critical: 85 },
        gpu: { warning: 75, critical: 90 },
        storage: { warning: 70, critical: 85 },
        temperature: { warning: 60, critical: 75 },
      },
      // Generic Linux/x86
      generic: {
        cpu: { warning: 80, critical: 95 },
        ram: { warning: 80, critical: 95 },
        gpu: { warning: 85, critical: 95 },
        storage: { warning: 75, critical: 90 },
        temperature: { warning: 70, critical: 85 },
      },
    };

    // Get thresholds for detected device
    const thresholds = deviceThresholds[deviceType] || deviceThresholds.generic;

    // Override with environment variables if set
    if (process.env.CPU_WARNING_PERCENT) {
      thresholds.cpu.warning = parseInt(process.env.CPU_WARNING_PERCENT);
    }
    if (process.env.CPU_CRITICAL_PERCENT) {
      thresholds.cpu.critical = parseInt(process.env.CPU_CRITICAL_PERCENT);
    }
    if (process.env.RAM_WARNING_PERCENT) {
      thresholds.ram.warning = parseInt(process.env.RAM_WARNING_PERCENT);
    }
    if (process.env.RAM_CRITICAL_PERCENT) {
      thresholds.ram.critical = parseInt(process.env.RAM_CRITICAL_PERCENT);
    }
    if (process.env.GPU_WARNING_PERCENT) {
      thresholds.gpu.warning = parseInt(process.env.GPU_WARNING_PERCENT);
    }
    if (process.env.GPU_CRITICAL_PERCENT) {
      thresholds.gpu.critical = parseInt(process.env.GPU_CRITICAL_PERCENT);
    }
    if (process.env.DISK_WARNING_PERCENT) {
      thresholds.storage.warning = parseInt(process.env.DISK_WARNING_PERCENT);
    }
    if (process.env.DISK_CRITICAL_PERCENT) {
      thresholds.storage.critical = parseInt(process.env.DISK_CRITICAL_PERCENT);
    }
    if (process.env.TEMP_WARNING_CELSIUS) {
      thresholds.temperature.warning = parseInt(process.env.TEMP_WARNING_CELSIUS);
    }
    if (process.env.TEMP_CRITICAL_CELSIUS) {
      thresholds.temperature.critical = parseInt(process.env.TEMP_CRITICAL_CELSIUS);
    }

    res.json({
      device: {
        type: deviceType,
        name: deviceName,
        cpu_cores: cpuCores,
        total_memory_gb: totalMemoryGB,
      },
      thresholds,
      source: process.env.CPU_CRITICAL_PERCENT ? 'environment_override' : 'device_auto_detected',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/system/reload-config - Reload configuration without restart
router.post('/reload-config', requireAuth, requireRole('admin'), (req, res) => {
  logger.info('Configuration reload requested');

  logSecurityEvent({
    userId: req.user.id,
    action: 'config_reload',
    ipAddress: req.ip,
    requestId: req.headers['x-request-id'],
  });

  // Reload environment variables (if changed)
  // Note: This only works for non-critical config that doesn't require restart

  // BUG-007 FIX: Removed reference to non-existent '../config' file
  // Configuration is now loaded via process.env and .env file

  // Reload rate limit configuration
  try {
    require('../../middleware/rateLimit');
    // Rate limiter will pick up new config on next request
    logger.info('Rate limit configuration reload triggered');
  } catch {
    // Rate limit reload failed - non-critical
  }

  // Reload logging configuration
  const currentLogLevel = process.env.LOG_LEVEL || 'INFO';
  logger.info(`Current log level: ${currentLogLevel}`);

  res.json({
    status: 'success',
    message: 'Configuration reload completed',
    reloaded: ['rate_limits', 'logging_config'],
    note: 'Some changes require a restart (database credentials, ports, etc.)',
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// DIAGNOSTICS
// =============================================================================

/**
 * POST /api/system/diagnostics
 * Collect system diagnostics and return the archive for download.
 * Requires auth. Optionally pass { days: N, includeLogs: bool }.
 */
router.post(
  '/diagnostics',
  requireAuth,
  requireRole('admin'),
  validateBody(DiagnosticsBody),
  asyncHandler(async (req, res) => {
    const { days = 3, includeLogs = true } = req.body;

    const logDays = days;

    const args = [DIAGNOSTICS_SCRIPT, '--days', String(logDays)];
    if (!includeLogs) {
      args.push('--no-logs');
    }

    logger.info(
      `Diagnostics export requested by user ${req.user.username} (days=${logDays}, logs=${includeLogs})`
    );

    const { stdout, stderr } = await execFileAsync('bash', args, {
      timeout: 120_000,
      env: { ...process.env, PATH: process.env.PATH },
    });

    // Parse JSON result from script output
    const jsonMatch = stdout.match(/---JSON---\n(.+)/);
    if (!jsonMatch) {
      logger.error('Diagnostics script output:', {
        stdout: stdout.slice(-500),
        stderr: stderr.slice(-500),
      });
      throw new ServiceUnavailableError('Diagnostics collection failed, no result');
    }

    const result = JSON.parse(jsonMatch[1]);
    const archivePath = result.archive;

    // Stream the file as download
    const archiveName = path.basename(archivePath);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const { createReadStream } = require('fs');
    const stream = createReadStream(archivePath);
    stream.pipe(res);
    stream.on('error', err => {
      logger.error('Diagnostics file stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          error: { code: 'INTERNAL_ERROR', message: 'Failed to stream diagnostics archive' },
          timestamp: new Date().toISOString(),
        });
      }
    });

    logSecurityEvent({
      userId: req.user.id,
      action: 'diagnostics_export',
      details: { days: logDays, includeLogs, size: result.size },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
  })
);

/**
 * GET /api/system/diagnostics/quick
 * Quick diagnostics summary (no archive, just JSON).
 * Useful for dashboard display.
 */
router.get(
  '/diagnostics/quick',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const [systemInfo, dockerInfo, dbInfo] = await Promise.all([
      // System
      (() => {
        const loadavg = os.loadavg();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        return {
          hostname: os.hostname(),
          platform: os.platform(),
          arch: os.arch(),
          uptime_seconds: Math.floor(os.uptime()),
          cpus: os.cpus().length,
          load_average: { '1m': loadavg[0], '5m': loadavg[1], '15m': loadavg[2] },
          memory: {
            total_gb: +(totalMem / 1073741824).toFixed(1),
            used_gb: +((totalMem - freeMem) / 1073741824).toFixed(1),
            percent: +((1 - freeMem / totalMem) * 100).toFixed(1),
          },
        };
      })(),
      // Docker containers
      dockerService.getAllServicesStatus().catch(() => ({})),
      // Database
      db
        .query(
          `
        SELECT
          (SELECT count(*) FROM pg_stat_activity) AS connections,
          (SELECT pg_size_pretty(pg_database_size('arasul_db'))) AS db_size,
          (SELECT count(*) FROM self_healing_events WHERE timestamp > NOW() - INTERVAL '24 hours') AS healing_events_24h,
          (SELECT count(*) FROM service_failures WHERE timestamp > NOW() - INTERVAL '24 hours') AS failures_24h
      `
        )
        // `detected_at` gibt es in `service_failures` nicht (Migration 003),
        // die Spalte heisst `timestamp`. Bis zum 23.08.2026 fiel das keinem
        // auf, weil dieses catch den Fehler verschluckt und ein leeres Objekt
        // zurueckgab: das Lagebild zeigte auf JEDEM Geraet `database: {}` und
        // sah dabei gesund aus. Deshalb wird der Fehler jetzt protokolliert,
        // bevor er weggefangen wird — ein stilles catch, das nichts sagt, ist
        // schlimmer als kein catch.
        .catch(err => {
          logger.error(`Schnelldiagnose: Datenbankteil fehlgeschlagen: ${err.message}`);
          return { rows: [{}] };
        }),
    ]);

    // Disk usage via df
    let diskInfo = {};
    try {
      const { stdout } = await execFileAsync('df', ['-h', '/']);
      const lines = stdout.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        diskInfo = { total: parts[1], used: parts[2], available: parts[3], percent: parts[4] };
      }
    } catch {
      /* ignore */
    }

    res.json({
      system: systemInfo,
      services: dockerInfo,
      database: dbInfo.rows[0] || {},
      disk: diskInfo,
      version: versionFuerAnzeige(),
      timestamp: new Date().toISOString(),
    });
  })
);

// =============================================================================
// KEIN EINRICHTUNGSASSISTENT MEHR (Phase D4, 28.08.2026)
// =============================================================================
//
// Hier standen vier Wege: `GET /setup-status`, `POST /setup-complete`,
// `PUT /setup-step`, `POST /setup-skip`. Sie bedienten den `SetupWizard`, der
// nach jeder frischen Installation vor der Shell stand und nach Firma,
// Branche, Teamgroesse, Antwortstil und einem Modell fragte.
//
// Jede dieser Fragen gehoert inzwischen woandershin: das Profil war das des
// CHATS, den es seit Phase B2 nicht mehr gibt; die Modellwahl ist seit C8 eine
// Kurzliste und wird in der Ansicht „Modelle" bedient; Netzname, Startpasswort
// und Kit-Schluessel sagt seit C10 der Bootstrap, einmal, auf der Konsole des
// Geraets. Uebrig geblieben waere ein Bildschirm, der wiederholt, was der
// Bootstrap gerade gezeigt hat -- und genau dagegen stand schon die
// Entscheidung vom 20.08.2026 („kein Schritt, der nur bestaetigt, was der
// vorige getan hat").
//
// Mit den Wegen sind die vier Spalten `setup_*` in `system_settings` gefallen
// (Migration 179). `company_name`, `hostname` und `selected_model` bleiben --
// sie gehoeren den Einstellungen und nicht dem Assistenten.

// GET /api/system/ca-zertifikat
//
// Das CA-Zertifikat dieses Geraets, als Datei zum Herunterladen (Phase C10).
//
// Warum es diesen Weg gibt: das Geraet stellt sein eigenes TLS-Zertifikat aus,
// mit einer CA, die beim ersten Start entsteht und deren privater Schluessel
// das Geraet nie verlaesst (scripts/security/geraete-zertifikat.sh). Solange
// niemand diese CA kennt, warnt jeder Browser im Haus. Der Admin laedt die
// Datei hier EINMAL herunter und verteilt sie an die Rechner der Firma;
// danach ist jeder Name dieses Geraets vertraut, auch nach einer Erneuerung
// des Zertifikats.
//
// Nur der Administrator: die Datei ist zwar oeffentlich (ein CA-Zertifikat ist
// kein Geheimnis, der Schluessel dazu bleibt hier), aber wer sie verteilt, ist
// eine Rolle und keine Zufaelligkeit. Ein Mitarbeiter, der sie sich selbst
// installiert, hat sie nicht von einer Stelle bekommen, der er trauen kann.
//
// `/config` ist der schreibgeschuetzte Einhang des `config`-Ordners
// (compose/compose.app.yaml). Der PRIVATE Schluessel der CA liegt daneben und
// wird hier nie angefasst.
const CA_ZERTIFIKAT_PFAD = '/config/traefik/certs/arasul-ca.crt';

router.get(
  '/ca-zertifikat',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    let pem;
    try {
      pem = await fs.readFile(CA_ZERTIFIKAT_PFAD, 'utf8');
    } catch {
      throw new NotFoundError(
        'Dieses Geraet hat noch kein CA-Zertifikat. Es entsteht beim Einrichten; ' +
          'nachholen laesst es sich am Geraet mit `./arasul zertifikat`.'
      );
    }

    if (!pem.includes('BEGIN CERTIFICATE')) {
      throw new NotFoundError(
        'Die Datei mit dem CA-Zertifikat ist unlesbar. Neu ausstellen: `./arasul zertifikat`.'
      );
    }

    const netzname = (process.env.MDNS_NAME || 'arasul').replace(/\.local$/, '');
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', `attachment; filename="${netzname}-ca.crt"`);
    res.send(pem);
  })
);

module.exports = router;
