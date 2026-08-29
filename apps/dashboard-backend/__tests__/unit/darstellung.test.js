/**
 * /api/darstellung (Phase H1): die Darstellung der Oberflaeche, je Mensch.
 *
 * Ein Weg, und zwar der schreibende. Gelesen wird das Theme ueber
 * `GET /api/auth/session`, wo die Oberflaeche ohnehin fragt, wer angemeldet
 * ist; ein GET hier waere eine dritte Anfrage auf jedem Seitenaufbau.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// requireAuth injiziert den Nutzer aus dem Test; requireRole ist der echte.
jest.mock('../../src/middleware/auth', () => {
  const echt = jest.requireActual('../../src/middleware/auth');
  let mockUser = null;
  return {
    __setUser: u => {
      mockUser = u;
    },
    requireAuth: (req, res, next) => {
      req.user = mockUser;
      next();
    },
    requireRole: echt.requireRole,
    ROLLEN: echt.ROLLEN,
  };
});

const db = require('../../src/database');
const auth = require('../../src/middleware/auth');
const router = require('../../src/routes/darstellung');
const { errorHandler } = require('../../src/middleware/errorHandler');

// Die Kennung ist eine ZEICHENKETTE: `admin_users.id` ist BIGSERIAL, und
// `node-postgres` liefert `int8` als String.
const MITARBEITER = { id: '7', username: 'mia', role: 'mitarbeiter' };
const ADMIN = { id: '1', username: 'admin', role: 'admin' };

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/darstellung', router);
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.__setUser(MITARBEITER);
});

describe('PUT /api/darstellung', () => {
  it('setzt das Theme des Angemeldeten', async () => {
    db.query.mockResolvedValue({ rows: [{ theme: 'dark' }] });
    const res = await request(app()).put('/api/darstellung').send({ theme: 'dark' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ theme: 'dark' });
    // Geschrieben wird auf die Nummer aus der SITZUNG, nicht aus der Anfrage.
    expect(db.query.mock.calls[0][1]).toEqual(['7', 'dark']);
  });

  it('antwortet mit dem Wert, den die Datenbank bestaetigt hat', async () => {
    db.query.mockResolvedValue({ rows: [{ theme: 'light' }] });
    const res = await request(app()).put('/api/darstellung').send({ theme: 'light' });
    expect(res.body.data.theme).toBe('light');
  });

  /**
   * Ein unbekanntes Theme ist eine 400 aus dem Schema und keine 500 aus dem
   * CHECK der Spalte: der Aufrufer soll lesen koennen, was falsch war.
   */
  it('weist ein unbekanntes Theme mit 400 ab, ohne die Datenbank zu fragen', async () => {
    const res = await request(app()).put('/api/darstellung').send({ theme: 'schwarz' });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('weist einen leeren Rumpf mit 400 ab', async () => {
    const res = await request(app()).put('/api/darstellung').send({});
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  /**
   * `.strict()`: ein Feld, das niemand liest, waere eine stille Zusage. Wer
   * `benutzer_id` mitschickt, soll nicht glauben, sie sei angekommen.
   */
  it('weist ein zusaetzliches Feld mit 400 ab', async () => {
    const res = await request(app())
      .put('/api/darstellung')
      .send({ theme: 'dark', benutzer_id: 1 });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  /**
   * Administrator UND Mitarbeiter: wie jemand seinen Bildschirm sieht, ist
   * keine Verwaltungsfrage.
   */
  it('gilt auch fuer einen Administrator', async () => {
    auth.__setUser(ADMIN);
    db.query.mockResolvedValue({ rows: [{ theme: 'dark' }] });
    const res = await request(app()).put('/api/darstellung').send({ theme: 'dark' });
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][1]).toEqual(['1', 'dark']);
  });
});
