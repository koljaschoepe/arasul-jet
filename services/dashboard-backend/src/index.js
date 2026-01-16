/**
 * ARASUL PLATFORM - Dashboard Backend
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

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
    const isLocalNetwork = origin && (
      origin.includes('://192.168.') ||
      origin.includes('://10.') ||
      /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./.test(origin) ||
      origin.includes('://localhost') ||
      origin.includes('://127.0.0.1') ||
      origin.includes('://dashboard-frontend') ||
      /\.local(:\d+)?$/.test(origin) ||
      origin.includes('.local/')
    );

    // Allow if: no origin (same-origin/curl), explicitly allowed, or local network
    if (!origin || allowedOrigins.includes(origin) || isLocalNetwork) {
      callback(null, true);
    } else {
      // PHASE3-FIX: Migrated from console.warn to logger
      // Note: logger imported later in file, use require inline
      require('./utils/logger').warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

// PHASE3-FIX: Migrated from console.log to logger (inline require for module order)
app.use((req, res, next) => {
  require('./utils/logger').debug(`${req.method} ${req.path}`);
  next();
});

// Audit logging middleware - logs all /api/* requests
const { createAuditMiddleware } = require('./middleware/audit');
app.use(createAuditMiddleware());

// Register all API routes
const authRouter = require('./routes/auth');
const systemRouter = require('./routes/system');
const metricsRouter = require('./routes/metrics');
const servicesRouter = require('./routes/services');
const databaseRouter = require('./routes/database');
const selfhealingRouter = require('./routes/selfhealing');
const logsRouter = require('./routes/logs');
const workflowsRouter = require('./routes/workflows');
const llmRouter = require('./routes/llm');
const embeddingsRouter = require('./routes/embeddings');
const updateRouter = require('./routes/update');
const docsRouter = require('./routes/docs');
const chatsRouter = require('./routes/chats');
const ragRouter = require('./routes/rag');
const settingsRouter = require('./routes/settings');
const documentsRouter = require('./routes/documents');
const appstoreRouter = require('./routes/appstore');
const modelsRouter = require('./routes/models');
const workspacesRouter = require('./routes/workspaces');
const spacesRouter = require('./routes/spaces');
const telegramRouter = require('./routes/telegram');
const telegramAppRouter = require('./routes/telegramApp');
const claudeTerminalRouter = require('./routes/claudeTerminal');
const alertsRouter = require('./routes/alerts');
const auditRouter = require('./routes/audit');

app.use('/api/auth', authRouter);
app.use('/api/system', systemRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/services', servicesRouter);
app.use('/api/database', databaseRouter);
app.use('/api/self-healing', selfhealingRouter);
app.use('/api/logs', logsRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/llm', llmRouter);
app.use('/api/embeddings', embeddingsRouter);
app.use('/api/update', updateRouter);
app.use('/api/docs', docsRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/rag', ragRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/apps', appstoreRouter);
app.use('/api/models', modelsRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/spaces', spacesRouter);
app.use('/api/telegram', telegramRouter);
app.use('/api/telegram-app', telegramAppRouter);
app.use('/api/claude-terminal', claudeTerminalRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/audit', auditRouter);

// Health check endpoint (public, no auth required)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'dashboard-backend',
    version: process.env.SYSTEM_VERSION || '1.0.0'
  });
});

// PHASE3-FIX: Migrated from console.error to logger
app.use((err, req, res, next) => {
  require('./utils/logger').error(`Request error: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// HIGH-001 FIX: WebSocket server for live metrics streaming
const wss = new WebSocket.Server({
  server,
  path: '/api/metrics/live-stream'
});

const axios = require('axios');
const logger = require('./utils/logger');
const llmJobService = require('./services/llmJobService');
const llmQueueService = require('./services/llmQueueService');
const modelService = require('./services/modelService');
const alertEngine = require('./services/alertEngine');

wss.on('connection', (ws) => {
  logger.info('WebSocket client connected to /api/metrics/live-stream');

  let intervalId = null;

  const sendMetrics = async () => {
    try {
      // Get live metrics from metrics collector
      const METRICS_COLLECTOR_URL = `http://${process.env.METRICS_COLLECTOR_HOST || 'metrics-collector'}:9100`;
      const response = await axios.get(`${METRICS_COLLECTOR_URL}/metrics`, { timeout: 2000 });

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          ...response.data,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      logger.error(`Error sending metrics via WebSocket: ${error.message}`);

      // Fallback: send error state
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          error: 'Metrics temporarily unavailable',
          timestamp: new Date().toISOString()
        }));
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

  ws.on('error', (error) => {
    logger.error(`WebSocket error: ${error.message}`);
    if (intervalId) {
      clearInterval(intervalId);
    }
  });
});

// Export app and server for testing
module.exports = { app, server, wss };

// Only start server if not in test mode
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', async () => {
    // PHASE3-FIX: Migrated from console.log to logger
    logger.info(`ARASUL DASHBOARD BACKEND - Port ${PORT}`);
    logger.info(`WebSocket server ready at ws://0.0.0.0:${PORT}/api/metrics/live-stream`);

    // Sync installed models with Ollama
    try {
      const syncResult = await modelService.syncWithOllama();
      if (syncResult.success) {
        logger.info(`Model sync complete: ${syncResult.ollamaModels?.length || 0} models found in Ollama`);
      } else {
        logger.warn(`Model sync failed: ${syncResult.error}`);
      }
    } catch (err) {
      logger.error(`Failed to sync models with Ollama: ${err.message}`);
    }

    // Initialize LLM Queue Service (handles cleanup and starts processing)
    try {
      await llmQueueService.initialize();
      logger.info('LLM Queue Service initialized successfully');
    } catch (err) {
      logger.error(`Failed to initialize LLM Queue Service: ${err.message}`);
    }

    // Set up periodic cleanup of old completed jobs (every 30 minutes)
    setInterval(async () => {
      try {
        await llmJobService.cleanupOldJobs();
      } catch (err) {
        logger.error(`Failed to cleanup old LLM jobs: ${err.message}`);
      }
    }, 30 * 60 * 1000); // 30 minutes

    // Initialize Alert Engine with WebSocket broadcast support
    try {
      // Create broadcast function for alert notifications
      const broadcastAlert = (data) => {
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      };

      await alertEngine.initialize({
        broadcast: broadcastAlert,
        checkIntervalMs: 30000  // Check every 30 seconds
      });
      logger.info('Alert Engine initialized successfully');
    } catch (err) {
      logger.error(`Failed to initialize Alert Engine: ${err.message}`);
    }
  });
}
