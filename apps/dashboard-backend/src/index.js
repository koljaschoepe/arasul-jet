/**
 * ARASUL PLATFORM - Dashboard Backend
 */

require('dotenv').config();
require('./utils/resolveSecrets')();

// Validate required environment variables at startup
const REQUIRED_ENV_VARS = [
  'POSTGRES_PASSWORD',
  'JWT_SECRET',
  'MINIO_ROOT_USER',
  'MINIO_ROOT_PASSWORD',
];
const missingVars = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  // Use stderr directly since logger may not be initialized yet
  process.stderr.write(
    `FATAL: Missing required environment variables: ${missingVars.join(', ')}\n`
  );
  process.stderr.write('Set these in your .env file or environment before starting the backend.\n');
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

// Validate secret strength in production (prevent weak/default secrets)
if (process.env.NODE_ENV === 'production') {
  const weakPatterns = ['dev', 'test', 'default', 'example', 'changeme', 'password'];
  const secretChecks = [
    { name: 'JWT_SECRET', minLen: 32 },
    { name: 'POSTGRES_PASSWORD', minLen: 16 },
    { name: 'MINIO_ROOT_PASSWORD', minLen: 16 },
  ];
  const weakSecrets = secretChecks.filter(({ name, minLen }) => {
    const val = process.env[name] || '';
    return val.length < minLen || weakPatterns.some(p => val.toLowerCase().includes(p));
  });
  if (weakSecrets.length > 0) {
    process.stderr.write(
      `FATAL: Weak secrets detected: ${weakSecrets.map(s => s.name).join(', ')}\n`
    );
    process.stderr.write('Re-run "./arasul setup" to generate secure secrets.\n');
    process.exit(1);
  }
}

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');
const { monitorEventLoopDelay } = require('perf_hooks');

const helmet = require('helmet');

// PERF-001: Event loop delay monitoring (detects blocked event loop over months of uptime)
const eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
eventLoopMonitor.enable();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Security headers via helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: [
          "'self'",
          'ws:',
          'wss:',
          'http://localhost:*',
          'https://localhost:*',
          'http://192.168.*:*',
          'https://192.168.*:*',
          'http://10.*:*',
          'https://10.*:*',
        ],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow LAN resource loading
    hsts: { maxAge: 63072000, includeSubDomains: false }, // Defense in depth (also set by Traefik)
  })
);

// Trust single reverse proxy hop (Traefik) — prevents IP spoofing via X-Forwarded-For
app.set('trust proxy', 1);

// TRACE-001: Request correlation IDs for distributed tracing
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
});

// TIMEOUT-001: 60s request timeout safety net (prevents indefinitely hanging requests)
app.use((req, res, next) => {
  res.setTimeout(60000, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  next();
});

// SEC-007 FIX: Restrict CORS to specific origins + allow local network access
const corsOptions = {
  origin: (origin, callback) => {
    // Explicitly allowed origins from environment
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : [];

    // Check if origin is from a local/private network (RFC 1918) or mDNS
    // Use strict regex to prevent bypass via crafted domains (e.g. attacker-10.example.com)
    const isPrivateIP =
      origin &&
      /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
        origin
      );
    const isLocalNetwork =
      origin &&
      (isPrivateIP ||
        origin.includes('://localhost') ||
        origin.includes('://127.0.0.1') ||
        origin.includes('://dashboard-frontend') ||
        /\.local(:\d+)?$/.test(origin) ||
        origin.includes('.local/'));

    // Allow if: no origin (same-origin/curl), explicitly allowed, or local network
    if (!origin || allowedOrigins.includes(origin) || isLocalNetwork) {
      callback(null, true);
    } else {
      require('./utils/logger').warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    require('./utils/logger').debug(`${req.method} ${req.path}`);
    next();
  });
}

// Audit logging middleware - logs all /api/* requests
const { createAuditMiddleware } = require('./middleware/audit');
app.use(createAuditMiddleware());

// CSRF protection for state-changing requests (double-submit cookie pattern)
const { csrfProtection } = require('./middleware/csrf');
app.use('/api', csrfProtection);

// Register all API routes (centralized in routes/index.js)
app.use('/api', require('./routes'));

// Health check endpoint (public, no auth required)
// ?detail=true returns full dependency status
app.get('/api/health', async (req, res) => {
  const { circuitBreakers } = require('./utils/retry');
  const showDetail = req.query.detail === 'true';

  if (!showDetail) {
    // Fast path for Traefik/Docker health checks
    return res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'dashboard-backend',
      version: process.env.SYSTEM_VERSION || '1.0.0',
    });
  }

  // PERF-001: Event loop delay metrics (milliseconds)
  const eventLoop = {
    min: +(eventLoopMonitor.min / 1e6).toFixed(2),
    max: +(eventLoopMonitor.max / 1e6).toFixed(2),
    mean: +(eventLoopMonitor.mean / 1e6).toFixed(2),
    p99: +(eventLoopMonitor.percentile(99) / 1e6).toFixed(2),
    stddev: +(eventLoopMonitor.stddev / 1e6).toFixed(2),
  };

  // Detailed health check - verify all dependencies
  const db = require('./database');
  const axios = require('axios');
  const services = require('./config/services');
  const checks = {};

  // Database
  try {
    const dbHealth = await db.healthCheck();
    checks.database = { status: dbHealth.healthy ? 'ok' : 'error', latencyMs: dbHealth.latency };
  } catch {
    checks.database = { status: 'error' };
  }

  // Ollama (LLM)
  try {
    const llmRes = await axios.get(`${services.llm.url}/api/tags`, { timeout: 5000 });
    const modelCount = (llmRes.data.models || []).length;
    checks.ollama = { status: 'ok', models: modelCount };
  } catch {
    checks.ollama = { status: 'unreachable' };
  }

  // Embeddings
  try {
    await axios.get(`http://${services.embedding.host}:${services.embedding.port}/health`, {
      timeout: 3000,
    });
    checks.embeddings = { status: 'ok' };
  } catch {
    checks.embeddings = { status: 'unreachable' };
  }

  // MinIO
  try {
    await axios.get(
      `http://${process.env.MINIO_HOST || 'minio'}:${process.env.MINIO_PORT || '9000'}/minio/health/live`,
      { timeout: 3000 }
    );
    checks.minio = { status: 'ok' };
  } catch {
    checks.minio = { status: 'unreachable' };
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const hasCritical = checks.database?.status === 'error';

  res.status(hasCritical ? 503 : 200).json({
    status: hasCritical ? 'CRITICAL' : allOk ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    service: 'dashboard-backend',
    version: process.env.SYSTEM_VERSION || '1.0.0',
    build_hash: process.env.BUILD_HASH || 'dev',
    checks,
    eventLoop,
    circuitBreakers: circuitBreakers.getAllStatus(),
  });
});

// Import centralized error handling
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last middleware)
app.use(errorHandler);

// HIGH-001 FIX: WebSocket server for live metrics streaming
// Use noServer to prevent dual-WSS upgrade conflict with Telegram WSS
const wss = new WebSocket.Server({ noServer: true });

const axios = require('axios');
// TIMEOUT-002: Global safety-net timeout (prevents hanging requests if per-call timeout is missing)
if (axios.defaults) {
  axios.defaults.timeout = 30000; // 30s
}
const logger = require('./utils/logger');
const services = require('./config/services');
const llmJobService = require('./services/llm/llmJobService');
const llmQueueService = require('./services/llm/llmQueueService');
const modelService = require('./services/llm/modelService');
const alertEngine = require('./services/alertEngine');
const ollamaReadiness = require('./services/llm/ollamaReadiness');
const dataDatabase = require('./dataDatabase');
const telegramWebSocketService = require('./services/telegram/telegramWebSocketService');
const telegramPollingManager = require('./services/telegram/telegramPollingManager');
const eventListenerService = require('./services/core/eventListenerService');
const { cacheService } = require('./services/core/cacheService');
const { bootstrap } = require('./bootstrap');
const pool = require('./database');

wss.on('connection', ws => {
  logger.info('WebSocket client connected to /api/metrics/live-stream');

  let intervalId = null;

  // Register client for Docker/system event broadcasting
  eventListenerService.registerWsClient(ws);

  // WS-001: Heartbeat to detect dead connections
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const sendMetrics = async () => {
    try {
      // Get live metrics from metrics collector
      const response = await axios.get(services.metrics.metricsEndpoint, { timeout: 2000 });

      // WS-BACKPRESSURE: Skip send if client can't keep up (>64KB buffered)
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) {
        ws.send(
          JSON.stringify({
            ...response.data,
            timestamp: new Date().toISOString(),
          })
        );
      } else if (ws.bufferedAmount >= 65536) {
        logger.debug('WebSocket backpressure: skipping metrics send');
      }
    } catch (error) {
      logger.error(`Error sending metrics via WebSocket: ${error.message}`);

      // Fallback: send error state
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) {
        ws.send(
          JSON.stringify({
            error: 'Metrics temporarily unavailable',
            timestamp: new Date().toISOString(),
          })
        );
      }
    }
  };

  // Send initial metrics immediately
  sendMetrics();

  // Then send every 5 seconds (per CLAUDE.md specification)
  intervalId = setInterval(sendMetrics, 5000);

  ws.on('close', () => {
    logger.info('WebSocket client disconnected from /api/metrics/live-stream');
    if (intervalId) {
      clearInterval(intervalId);
    }
  });

  ws.on('error', error => {
    logger.error(`WebSocket error: ${error.message}`);
    if (intervalId) {
      clearInterval(intervalId);
    }
  });
});

// WS-001: Heartbeat interval to detect and clean up dead metrics WS connections
// LEAK-001: Reduced from 30s to 15s for faster zombie detection
const metricsHeartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      logger.debug('Terminating dead metrics WebSocket connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 15000);

wss.on('close', () => {
  clearInterval(metricsHeartbeat);
});

// LEAK-001: Track all intervals/timeouts for graceful shutdown
const globalIntervals = [];
const globalTimeouts = [];

// Export app and server for testing
module.exports = { app, server, wss };

// ROBUST-001: Uncaught exception and unhandled rejection handlers
process.on('uncaughtException', error => {
  logger.error(`Uncaught exception: ${error.message}`, { stack: error.stack });
  // Give time for log to flush, then exit
  setTimeout(() => process.exit(1), 1000);
});

let unhandledRejectionCount = 0;
const MAX_UNHANDLED_REJECTIONS = 10;

process.on('unhandledRejection', reason => {
  unhandledRejectionCount++;
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error(
    `Unhandled rejection (${unhandledRejectionCount}/${MAX_UNHANDLED_REJECTIONS}): ${message}`,
    { stack }
  );

  if (unhandledRejectionCount >= MAX_UNHANDLED_REJECTIONS) {
    logger.error('Max unhandled rejections reached, initiating graceful shutdown');
    gracefulShutdown('MAX_REJECTIONS');
  }
});

// ROBUST-002: Graceful shutdown handler
let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info(`${signal} received - starting graceful shutdown...`);

  // Safety-net: force exit if graceful shutdown takes too long
  const shutdownTimer = setTimeout(() => {
    logger.error('Graceful shutdown timeout (30s) - forcing exit');
    process.exit(1);
  }, 30000);
  shutdownTimer.unref(); // Don't prevent process exit

  // 1. Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // 2. Close WebSocket connections
  try {
    wss.clients.forEach(client => {
      client.close(1001, 'Server shutting down');
    });
    wss.close();
    logger.info('WebSocket server closed');
  } catch (err) {
    logger.warn(`WebSocket cleanup error: ${err.message}`);
  }

  // 3. Clear all tracked intervals and timeouts (LEAK-001)
  globalIntervals.forEach(id => clearInterval(id));
  globalTimeouts.forEach(id => clearTimeout(id));
  globalIntervals.length = 0;
  globalTimeouts.length = 0;

  // 4. Stop services
  try {
    eventListenerService.stop();
  } catch (e) {
    /* ignore */
  }
  try {
    llmQueueService.stop();
  } catch (e) {
    /* ignore */
  }
  try {
    ollamaReadiness.shutdown();
  } catch (e) {
    /* ignore */
  }
  try {
    telegramPollingManager.shutdown();
  } catch (e) {
    /* ignore */
  }
  try {
    cacheService.shutdown();
  } catch (e) {
    /* ignore */
  }
  // LEAK-001: Destroy HTTP agent for Ollama connections
  try {
    const { destroyOllamaAgent } = require('./services/llm/llmJobProcessor');
    destroyOllamaAgent();
  } catch (e) {
    /* ignore */
  }
  // LEAK-002: Shutdown Telegram WebSocket heartbeat
  try {
    const telegramOrchestrator = require('./services/telegram/telegramOrchestratorService');
    telegramOrchestrator.shutdown();
  } catch (e) {
    /* ignore */
  }

  // 5. Close database pool
  try {
    await pool.close();
    logger.info('Database pool closed');
  } catch (err) {
    logger.warn(`Database pool close error: ${err.message}`);
  }

  logger.info('Graceful shutdown complete');
  clearTimeout(shutdownTimer);
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Only start server if not in test mode
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', async () => {
    logger.info(`ARASUL DASHBOARD BACKEND - Port ${PORT}`);
    logger.info(`WebSocket server ready at ws://0.0.0.0:${PORT}/api/metrics/live-stream`);

    // Bootstrap: run migrations + ensure admin user (critical for fresh deploys)
    try {
      await bootstrap();
    } catch (err) {
      logger.error(`Bootstrap failed: ${err.message}`);
    }

    // Initialize Telegram WebSocket Service for real-time setup notifications
    try {
      telegramWebSocketService.initialize(server);
      logger.info(`Telegram WebSocket ready at ws://0.0.0.0:${PORT}/api/telegram-app/ws`);
    } catch (err) {
      logger.error(`Failed to initialize Telegram WebSocket Service: ${err.message}`);
    }

    // Central upgrade handler - routes WebSocket connections by path
    // Prevents dual-WSS conflict where two servers corrupt each other's upgrades
    server.on('upgrade', (request, socket, head) => {
      const { pathname } = new URL(request.url, `http://${request.headers.host}`);

      if (pathname === '/api/metrics/live-stream') {
        // SEC: Verify JWT before allowing WebSocket upgrade
        const { verifyToken } = require('./utils/jwt');
        const url = new URL(request.url, `http://${request.headers.host}`);
        const tokenFromQuery = url.searchParams.get('token');
        const authHeader = request.headers['authorization'];
        const cookieHeader = request.headers['cookie'];
        let token = tokenFromQuery;
        if (!token && authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.slice(7);
        }
        if (!token && cookieHeader) {
          const match = cookieHeader.match(/arasul_token=([^;]+)/);
          if (match) {
            token = match[1];
          }
        }
        if (!token) {
          logger.warn('WebSocket upgrade rejected: no auth token');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        verifyToken(token)
          .then(() => {
            wss.handleUpgrade(request, socket, head, ws => {
              wss.emit('connection', ws, request);
            });
          })
          .catch(err => {
            logger.warn(`WebSocket upgrade rejected: ${err.message}`);
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
          });
      } else if (pathname === '/api/telegram-app/ws' && telegramWebSocketService.wss) {
        telegramWebSocketService.wss.handleUpgrade(request, socket, head, ws => {
          telegramWebSocketService.wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    // Initialize Data Database for Datentabellen feature
    try {
      const dataDbInitialized = await dataDatabase.initialize();
      if (dataDbInitialized) {
        logger.info('Data Database (Datentabellen) initialized successfully');
      } else {
        logger.warn('Data Database initialization skipped - database may not exist yet');
      }
    } catch (err) {
      logger.warn(`Data Database initialization failed (non-critical): ${err.message}`);
    }

    // Initialize Telegram Polling Manager (getUpdates for bots when no PUBLIC_URL)
    try {
      await telegramPollingManager.initialize();
    } catch (err) {
      logger.error(`Failed to initialize Telegram Polling Manager: ${err.message}`);
    }

    // Initialize Ollama Readiness Service (handles waiting for Ollama + periodic sync)
    try {
      await ollamaReadiness.initialize({ modelService });
      logger.info('Ollama Readiness Service initialized - models synced');
    } catch (err) {
      logger.error(`Failed to initialize Ollama Readiness Service: ${err.message}`);
    }

    // Initialize LLM Queue Service (handles cleanup and starts processing)
    try {
      await llmQueueService.initialize();
      logger.info('LLM Queue Service initialized successfully');
    } catch (err) {
      logger.error(`Failed to initialize LLM Queue Service: ${err.message}`);
    }

    // LEAK-001: Track all intervals for graceful shutdown cleanup
    // Set up periodic cleanup of old completed jobs (every 30 minutes)
    globalIntervals.push(
      setInterval(
        async () => {
          try {
            await llmJobService.cleanupOldJobs();
          } catch (err) {
            logger.error(`Failed to cleanup old LLM jobs: ${err.message}`);
          }
        },
        30 * 60 * 1000
      )
    );

    // Database cleanup: run_all_cleanups() every 4 hours (retention policies)
    const DB_CLEANUP_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours
    const runDbCleanup = async () => {
      try {
        const result = await pool.query('SELECT run_all_cleanups() as report');
        const report = result.rows[0]?.report;
        logger.info('Database cleanup completed', { report });
      } catch (err) {
        logger.warn(`Database cleanup failed (non-critical): ${err.message}`);
      }
    };
    // Initial cleanup after 60s delay (let migrations finish)
    const dbCleanupTimeout = setTimeout(runDbCleanup, 60 * 1000);
    globalTimeouts.push(dbCleanupTimeout);
    globalIntervals.push(setInterval(runDbCleanup, DB_CLEANUP_INTERVAL));

    // Initialize Datentabellen Re-index Service (periodic Qdrant sync)
    if (dataDatabase.isInitialized()) {
      try {
        const reindexService = require('./services/datentabellen/reindexService');
        reindexService.initialize({ intervalMs: 300000 }); // 5 minutes
        globalIntervals.push(reindexService.getIntervalId());
        logger.info('Datentabellen Re-index Service initialized (5 min interval)');
      } catch (err) {
        logger.warn(`Datentabellen Re-index Service failed to start: ${err.message}`);
      }
    }

    // Initialize Alert Engine with WebSocket broadcast support
    try {
      // Create broadcast function for alert notifications
      const broadcastAlert = data => {
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      };

      await alertEngine.initialize({
        broadcast: broadcastAlert,
        checkIntervalMs: 30000, // Check every 30 seconds
      });
      logger.info('Alert Engine initialized successfully');
    } catch (err) {
      logger.error(`Failed to initialize Alert Engine: ${err.message}`);
    }

    // Initialize Event Listener Service (Docker events, self-healing, workflow events)
    // SEC-FIX: Was imported but never started — Docker events were not broadcast to WebSocket clients
    try {
      await eventListenerService.start();
      logger.info('Event Listener Service initialized successfully');
    } catch (err) {
      logger.error(`Failed to initialize Event Listener Service: ${err.message}`);
    }

    // Startup readiness summary
    try {
      const { detectDevice, getGpuInfo, getLlmRamGB } = require('./utils/hardware');
      const [device, gpu] = await Promise.all([detectDevice(), getGpuInfo()]);
      // fire-and-forget: DB health check failure just reports false, non-critical for startup summary
      const dbHealth = await pool
        .query('SELECT 1')
        .then(() => true)
        .catch(() => false);
      const llmRamGB = getLlmRamGB();

      logger.info('=== SYSTEM READINESS ===');
      logger.info(
        `Device: ${device.name} | ${device.totalMemoryGB}GB RAM | ${device.cpuCores} cores`
      );
      logger.info(
        `GPU: ${gpu.available ? gpu.name : 'NOT AVAILABLE (CPU only)'} | CUDA: ${gpu.cudaVersion || 'N/A'}`
      );
      logger.info(
        `LLM RAM: ${llmRamGB}GB | DB: ${dbHealth ? 'OK' : 'ERROR'} | Ollama: ${ollamaReadiness.isReady() ? 'READY' : 'WAITING'}`
      );
      logger.info('========================');
    } catch (err) {
      logger.warn(`Startup summary failed: ${err.message}`);
    }
  });
}
