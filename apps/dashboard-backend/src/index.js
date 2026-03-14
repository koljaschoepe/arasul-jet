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
const WebSocket = require('ws');

const helmet = require('helmet');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Security headers via helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // SPA serves own CSP via meta tag
    crossOriginEmbedderPolicy: false, // Allow LAN resource loading
    hsts: false, // HSTS handled by Traefik reverse proxy
  })
);

// Trust reverse proxy (Traefik) for rate limiting and client IP detection
app.set('trust proxy', true);

// SEC-007 FIX: Restrict CORS to specific origins + allow local network access
const corsOptions = {
  origin: (origin, callback) => {
    // Explicitly allowed origins from environment
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : [];

    // Check if origin is from a local/private network (RFC 1918) or mDNS
    const isLocalNetwork =
      origin &&
      (origin.includes('://192.168.') ||
        origin.includes('://10.') ||
        /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./.test(origin) ||
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
app.get('/api/health', (req, res) => {
  const { circuitBreakers } = require('./utils/retry');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'dashboard-backend',
    version: process.env.SYSTEM_VERSION || '1.0.0',
    build_hash: process.env.BUILD_HASH || 'dev',
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

  // WS-001: Heartbeat to detect dead connections
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const sendMetrics = async () => {
    try {
      // Get live metrics from metrics collector
      const response = await axios.get(services.metrics.metricsEndpoint, { timeout: 2000 });

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            ...response.data,
            timestamp: new Date().toISOString(),
          })
        );
      }
    } catch (error) {
      logger.error(`Error sending metrics via WebSocket: ${error.message}`);

      // Fallback: send error state
      if (ws.readyState === WebSocket.OPEN) {
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

process.on('unhandledRejection', reason => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error(`Unhandled rejection: ${message}`, { stack });
});

// ROBUST-002: Graceful shutdown handler
let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info(`${signal} received - starting graceful shutdown...`);

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

  // 5. Close database pool
  try {
    await pool.close();
    logger.info('Database pool closed');
  } catch (err) {
    logger.warn(`Database pool close error: ${err.message}`);
  }

  logger.info('Graceful shutdown complete');
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
        wss.handleUpgrade(request, socket, head, ws => {
          wss.emit('connection', ws, request);
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
  });
}
