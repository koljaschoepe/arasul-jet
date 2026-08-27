/**
 * /api/notizen (Phase D1): der Zettel in der rechten Spalte der Shell.
 *
 * Zwei Wege, kein dritter, und keine Kennung in der Adresse: der Zettel gehoert
 * dem Angemeldeten, und wer das ist, sagt die Sitzung.
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
const router = require('../../src/routes/notizen');
const { errorHandler } = require('../../src/middleware/errorHandler');

// Die Kennung ist eine ZEICHENKETTE: `admin_users.id` ist BIGSERIAL, und
// `node-postgres` liefert `int8` als String (siehe benutzer.test.js).
const MITARBEITER = { id: '7', username: 'mia', role: 'mitarbeiter' };
const ADMIN = { id: '1', username: 'admin', role: 'admin' };

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/notizen', router);
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.__setUser(MITARBEITER);
});

describe('GET /api/notizen', () => {
  it('liefert den Zettel des Angemeldeten', async () => {
    db.query.mockResolvedValue({
      rows: [{ inhalt: 'Rueckruf Meier', geaendert_am: '2026-08-27T10:00:00.000Z' }],
    });
    const res = await request(app()).get('/api/notizen');
    expect(res.status).toBe(200);
    expect(res.body.data.inhalt).toBe('Rueckruf Meier');
    // Gesucht wird mit der Nummer aus der SITZUNG, nicht aus der Anfrage.
    expect(db.query.mock.calls[0][1]).toEqual(['7']);
  });

  /**
   * „Ich habe noch nichts geschrieben" ist kein Fehler. Ein 404 zwaenge die
   * Oberflaeche, zwei Faelle zu unterscheiden, die dasselbe bedeuten.
   */
  it('ohne Zeile ein leerer Zettel, keine 404', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app()).get('/api/notizen');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ inhalt: '', geaendert_am: null });
  });
});

describe('PUT /api/notizen', () => {
  it('schreibt den Zettel und gibt ihn zurueck', async () => {
    db.query.mockResolvedValue({
      rows: [{ inhalt: 'neu', geaendert_am: '2026-08-27T11:00:00.000Z' }],
    });
    const res = await request(app()).put('/api/notizen').send({ inhalt: 'neu' });
    expect(res.status).toBe(200);
    expect(res.body.data.inhalt).toBe('neu');
    expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT');
    expect(db.query.mock.calls[0][1]).toEqual(['7', 'neu']);
  });

  it('ein leerer Zettel ist der Weg zum Loeschen, kein Fehler', async () => {
    db.query.mockResolvedValue({ rows: [{ inhalt: '', geaendert_am: null }] });
    const res = await request(app()).put('/api/notizen').send({ inhalt: '' });
    expect(res.status).toBe(200);
  });

  it('ein Feld zuviel ist ein 400 und laeuft nicht still ins Leere', async () => {
    const res = await request(app()).put('/api/notizen').send({ inhalt: 'x', benutzer_id: 1 });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('ein zu langer Zettel ist ein 400 und kein Datenbankfehler', async () => {
    const res = await request(app())
      .put('/api/notizen')
      .send({ inhalt: 'x'.repeat(20001) });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('Wer darf', () => {
  it('der Administrator hat seinen eigenen Zettel', async () => {
    auth.__setUser(ADMIN);
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app()).get('/api/notizen');
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][1]).toEqual(['1']);
  });

  it('ohne bekannte Rolle 403', async () => {
    auth.__setUser({ id: '9', username: 'x', role: 'viewer' });
    const res = await request(app()).get('/api/notizen');
    expect(res.status).toBe(403);
  });

  /**
   * Es gibt keinen Weg mit Kennung. Das ist die Stelle, an der es auffallen
   * soll, wenn jemand einen einfuehrt.
   */
  it('es gibt keinen Zettel eines anderen', async () => {
    const res = await request(app()).get('/api/notizen/1');
    expect(res.status).toBe(404);
  });

  it('und kein DELETE', async () => {
    const res = await request(app()).delete('/api/notizen');
    expect(res.status).toBe(404);
  });
});
