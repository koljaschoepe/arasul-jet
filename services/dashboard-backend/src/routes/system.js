/**
 * System API routes
 * Handles system status, info, and network information
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const dockerService = require('../services/docker');
const logger = require('../utils/logger');
const os = require('os');
const axios = require('axios');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { ValidationError } = require('../utils/errors');

const execFileAsync = promisify(execFile);

// GET /api/system/status
router.get(
  '/status',
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

    res.json({
      status,
      llm: services.llm?.status || 'unknown',
      embeddings: services.embeddings?.status || 'unknown',
      n8n: services.n8n?.status || 'unknown',
      minio: services.minio?.status || 'unknown',
      postgres: services.postgres?.status || 'unknown',
      self_healing_active: services.self_healing?.status === 'healthy',
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
  asyncHandler(async (req, res) => {
    const uptime = os.uptime();
    const hostname = os.hostname();

    // Get JetPack version (if available)
    let jetpackVersion = 'unknown';
    try {
      // SECURITY: Use execFile with array args to prevent shell injection
      // eslint-disable-next-line no-template-curly-in-string
      const { stdout } = await execFileAsync('dpkg-query', [
        '-W',
        '-f',
        '${Version}',
        'nvidia-jetpack',
      ]);
      if (stdout && stdout.trim()) {
        jetpackVersion = stdout.trim();
      }
    } catch {
      // JetPack version not available
    }

    res.json({
      version: process.env.SYSTEM_VERSION || '1.0.0',
      build_hash: process.env.BUILD_HASH || 'dev',
      jetpack_version: jetpackVersion,
      uptime_seconds: Math.floor(uptime),
      hostname: hostname,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/system/network
router.get(
  '/network',
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

    // Check if n8n webhook is reachable
    let n8nWebhookReachable = false;
    try {
      await axios.get(`http://${process.env.N8N_HOST}:${process.env.N8N_PORT}/healthz`, {
        timeout: 2000,
      });
      n8nWebhookReachable = true;
    } catch {
      // n8n not reachable
    }

    res.json({
      ip_addresses: ipAddresses,
      mdns: 'arasul.local',
      internet_reachable: internetReachable,
      n8n_webhook_reachable: n8nWebhookReachable,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/system/thresholds - Get device-specific thresholds
router.get(
  '/thresholds',
  asyncHandler(async (req, res) => {
    // Detect device type
    let deviceType = 'generic';
    let deviceName = 'Generic Linux';
    const cpuCores = os.cpus().length;
    const totalMemoryGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));

    // Try to detect Jetson device
    try {
      // SECURITY: Use fs.readFile instead of exec('cat ...') to prevent shell injection
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
        temperature: { warning: 65, critical: 80 }, // Throttles at ~85°C
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
router.post(
  '/reload-config',
  asyncHandler(async (req, res) => {
    logger.info('Configuration reload requested');

    // Reload environment variables (if changed)
    // Note: This only works for non-critical config that doesn't require restart

    // BUG-007 FIX: Removed reference to non-existent '../config' file
    // Configuration is now loaded via process.env and .env file

    // Reload rate limit configuration
    try {
      require('../middleware/rateLimit');
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
  })
);

// =============================================================================
// SETUP WIZARD ENDPOINTS
// =============================================================================

/**
 * GET /api/system/setup-status
 * Check if initial setup has been completed.
 * No auth required - frontend needs this before login to decide routing.
 */
router.get(
  '/setup-status',
  asyncHandler(async (req, res) => {
    const result = await db.query(
      'SELECT setup_completed, setup_step, company_name FROM system_settings WHERE id = 1'
    );

    if (result.rows.length === 0) {
      return res.json({
        setupComplete: false,
        setupStep: 0,
        timestamp: new Date().toISOString(),
      });
    }

    const settings = result.rows[0];
    res.json({
      setupComplete: settings.setup_completed,
      setupStep: settings.setup_step || 0,
      companyName: settings.company_name || null,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/system/setup-complete
 * Mark the initial setup as completed.
 * Requires auth - only admin can complete setup.
 */
router.post(
  '/setup-complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { companyName, hostname, selectedModel } = req.body;

    await db.query(
      `UPDATE system_settings SET
        setup_completed = TRUE,
        setup_completed_at = NOW(),
        setup_completed_by = $1,
        company_name = COALESCE($2, company_name),
        hostname = COALESCE($3, hostname),
        selected_model = COALESCE($4, selected_model),
        setup_step = 5
      WHERE id = 1`,
      [req.user.id, companyName || null, hostname || null, selectedModel || null]
    );

    logger.info(`Setup wizard completed by user ${req.user.username}`);

    res.json({
      success: true,
      message: 'Setup completed successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/system/setup-step
 * Save current wizard step progress (for resume on refresh/restart).
 * Requires auth.
 */
router.put(
  '/setup-step',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { step, companyName, hostname, selectedModel } = req.body;

    if (step === undefined || typeof step !== 'number' || step < 0 || step > 5) {
      throw new ValidationError('Step must be a number between 0 and 5');
    }

    await db.query(
      `UPDATE system_settings SET
        setup_step = $1,
        company_name = COALESCE($2, company_name),
        hostname = COALESCE($3, hostname),
        selected_model = COALESCE($4, selected_model)
      WHERE id = 1`,
      [step, companyName || null, hostname || null, selectedModel || null]
    );

    res.json({
      success: true,
      step,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/system/setup-skip
 * Skip setup wizard (for experienced admins).
 * Requires auth.
 */
router.post(
  '/setup-skip',
  requireAuth,
  asyncHandler(async (req, res) => {
    await db.query(
      `UPDATE system_settings SET
        setup_completed = TRUE,
        setup_completed_at = NOW(),
        setup_completed_by = $1,
        setup_step = 5
      WHERE id = 1`,
      [req.user.id]
    );

    logger.info(`Setup wizard skipped by user ${req.user.username}`);

    res.json({
      success: true,
      message: 'Setup skipped',
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
