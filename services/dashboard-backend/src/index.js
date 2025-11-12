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

const servicesRouter = require('./routes/services');
app.use('/api/services', servicesRouter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'dashboard-backend',
    version: process.env.SYSTEM_VERSION || '1.0.0'
  });
});

app.get('/api/system/info', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    version: process.env.SYSTEM_VERSION || '1.0.0',
    uptime: process.uptime()
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('ARASUL DASHBOARD BACKEND - Port', PORT);
});
