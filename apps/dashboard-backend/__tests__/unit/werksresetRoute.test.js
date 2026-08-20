/**
 * Werksreset, Route (Plan 023 B5).
 *
 * Der Dienst darunter ist eigen getestet. Hier geht es nur um das, was die
 * Route selbst entscheidet, und das ist bei einem Endpunkt ohne Rueckweg viel
 * wert: wer darf, was fehlen darf und was auf keinen Fall geraten wird.
 */

const request = require('supertest');
const express = require('express');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/utils/auditLog', () => ({ logSecurityEvent: jest.fn().mockResolvedValue() }));

let mockRolle = 'admin';
jest.mock('../../src/middleware/auth', () => ({
  optionalAuth: (req, res, next) => next(),
  requireAuth: (req, res, next) => {
    req.user = { id: 1, username: 'kolja', role: mockRolle };
    next();
  },
  requireAdmin: (req, res, next) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Nur Administratoren' } });
    }
    next();
  },
  invalidateUserCache: jest.fn(),
}));

jest.mock('../../src/services/werksreset/werksreset', () => ({
  STUFEN: ['inhalte', 'auslieferung'],
  vorschau: jest.fn().mockResolvedValue({ durchfuehrbar: true }),
  ausfuehren: jest.fn().mockResolvedValue({ zeilenGesamt: 5, dauerMs: 10, tabellen: {} }),
}));

const werksreset = require('../../src/services/werksreset/werksreset');
const routen = require('../../src/routes/admin/werksreset');
const { errorHandler } = require('../../src/middleware/errorHandler');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/werksreset', routen);
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  mockRolle = 'admin';
  werksreset.ausfuehren.mockClear();
  werksreset.vorschau.mockClear();
});

test('ohne Administratorrechte gibt es weder Vorschau noch Ausfuehrung', async () => {
  mockRolle = 'user';

  await request(app()).get('/api/werksreset/vorschau?stufe=inhalte').expect(403);
  await request(app())
    .post('/api/werksreset')
    .send({ stufe: 'inhalte', bestaetigung: 'arasul' })
    .expect(403);

  expect(werksreset.ausfuehren).not.toHaveBeenCalled();
});

test('eine fehlende Stufe wird nicht geraten, sondern abgelehnt', async () => {
  const res = await request(app()).post('/api/werksreset').send({ bestaetigung: 'arasul' });

  expect(res.status).toBe(400);
  expect(res.body.error.message).toMatch(/Stufe fehlt/);
  // Der teure Fehler waere hier ein stiller Vorgabewert auf die groessere Stufe.
  expect(werksreset.ausfuehren).not.toHaveBeenCalled();
});

test('eine unbekannte Stufe wird abgelehnt', async () => {
  const res = await request(app())
    .post('/api/werksreset')
    .send({ stufe: 'alles', bestaetigung: 'arasul' });

  expect(res.status).toBe(400);
  expect(werksreset.ausfuehren).not.toHaveBeenCalled();
});

test('ohne Bestaetigung passiert nichts', async () => {
  const res = await request(app()).post('/api/werksreset').send({ stufe: 'auslieferung' });

  expect(res.status).toBe(400);
  expect(res.body.error.message).toMatch(/Bestätigung fehlt/);
  expect(werksreset.ausfuehren).not.toHaveBeenCalled();
});

test('reicht Stufe, Modelloption und Ausloeser durch', async () => {
  await request(app())
    .post('/api/werksreset')
    .send({ stufe: 'auslieferung', bestaetigung: 'arasul', modelleLoeschen: true })
    .expect(200);

  expect(werksreset.ausfuehren).toHaveBeenCalledWith({
    stufe: 'auslieferung',
    bestaetigung: 'arasul',
    modelleLoeschen: true,
    ausgeloestVon: 'kolja',
  });
});

test('die Vorschau braucht die Stufe genauso ausdruecklich', async () => {
  await request(app()).get('/api/werksreset/vorschau').expect(400);
  expect(werksreset.vorschau).not.toHaveBeenCalled();

  await request(app()).get('/api/werksreset/vorschau?stufe=auslieferung&modelle=true').expect(200);
  expect(werksreset.vorschau).toHaveBeenCalledWith({
    stufe: 'auslieferung',
    modelleLoeschen: true,
  });
});
