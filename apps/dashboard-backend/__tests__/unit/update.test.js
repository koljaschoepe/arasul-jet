const request = require('supertest');
const express = require('express');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/services/betrieb/fassungsdienst', () => ({}));
jest.mock('../../src/services/betrieb/nachtUpdate', () => ({}));

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 1, username: 'admin', role: 'admin' };
    next();
  },
  requireRole: () => (req, res, next) => next(),
  ROLLEN: ['admin', 'mitarbeiter'],
  optionalAuth: (req, res, next) => next(),
}));

const updateRouter = require('../../src/routes/admin/update');
const { errorHandler } = require('../../src/middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/update', updateRouter);
app.use(errorHandler);

describe('Update API Routes', () => {
  describe('GET /api/update/status', () => {
    // Das Ara-Kit liest hier `fassung.version` vor und nach einem Update
    // (`upgrade.mjs`). Das Feld muss bleiben.
    it('nennt die eigene Fassung', async () => {
      const res = await request(app).get('/api/update/status');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('idle');
      expect(res.body.fassung).toHaveProperty('version');
      expect(res.body.fassung).toHaveProperty('anzeige');
      expect(res.body.fassung).toHaveProperty('bekannt');
    });
  });

  // Der Offline-Weg ueber ein `.araupdate`-Paket lief am Geraet nie (kein
  // `docker` im Backend) und ist am 06.10.2026 gefallen.
  it.each([
    ['post', '/api/update/upload'],
    ['post', '/api/update/apply'],
    ['get', '/api/update/history'],
    ['get', '/api/update/usb-devices'],
    ['post', '/api/update/install-from-usb'],
    ['get', '/api/update/check'],
    ['post', '/api/update/download'],
  ])('%s %s gibt es nicht mehr', async (verb, pfad) => {
    const res = await request(app)[verb](pfad).send({});
    expect(res.status).toBe(404);
  });
});
