/**
 * ARASUL PLATFORM - Dashboard Backend
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
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
    error: 'Internal server error'
  });
});

// Export app for testing
module.exports = app;

// Only start server if not in test mode
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('ARASUL DASHBOARD BACKEND - Port', PORT);
  });
}
