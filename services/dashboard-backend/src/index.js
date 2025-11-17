/**
 * ARASUL PLATFORM - Dashboard Backend
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// SEC-007 FIX: Restrict CORS to specific origins
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://dashboard-frontend', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

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

// Health check endpoint (public, no auth required)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'dashboard-backend',
    version: process.env.SYSTEM_VERSION || '1.0.0'
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
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
  server.listen(PORT, '0.0.0.0', () => {
    console.log('ARASUL DASHBOARD BACKEND - Port', PORT);
    console.log('WebSocket server ready at ws://0.0.0.0:' + PORT + '/api/metrics/live-stream');
  });
}
