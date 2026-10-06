/**
 * System API routes
 * Handles system status, info, and network information
 */

const { versionFuerAnzeige } = require('../../utils/version');
const express = require('express');
const router = express.Router();
const db = require('../../database');
const dockerService = require('../../services/core/docker');
const os = require('os');
const { asyncHandler } = require('../../middleware/errorHandler');
const { requireAuth, requireRole } = require('../../middleware/auth');
const geraet = require('../../services/core/geraeteInfo');
const { detectDevice, getGpuInfo, getLlmRamGB } = require('../../utils/hardware');

// GET /api/system/heartbeat
// Public endpoint (no auth) for remote monitoring and health checks
router.get(
  '/heartbeat',
  asyncHandler(async (req, res) => {
    res.json({
      status: 'ok',
      uptime: Math.floor(os.uptime()),
      timestamp: new Date().toISOString(),
    });
  })
);

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

    // Get JetPack version (if available), sonst "unknown"
    const jetpackVersion = await geraet.jetpackVersion();

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
    const internetReachable = await geraet.internetErreichbar();

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

// =============================================================================
// DIAGNOSTICS
// =============================================================================

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
    // 404 mit Satz, wenn es fehlt oder beschaedigt ist
    const pem = await geraet.caZertifikatLesen(CA_ZERTIFIKAT_PFAD);

    const netzname = (process.env.MDNS_NAME || 'arasul').replace(/\.local$/, '');
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', `attachment; filename="${netzname}-ca.crt"`);
    res.send(pem);
  })
);

module.exports = router;
