/**
 * /api/benutzer (Phasen C1 und C2): der Administrator legt Benutzer an, sieht
 * sie, setzt ihr Passwort, legt sie still und loescht sie. Der Mitarbeiter
 * bekommt auf jedem dieser Wege 403.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/auditLog', () => ({ logSecurityEvent: jest.fn() }));
jest.mock('../../src/utils/jwt', () => ({
  blacklistAllUserTokens: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../src/utils/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('$hash$'),
  verifyPassword: jest.fn(),
  validatePasswordComplexity: jest.fn(() => ({ valid: true, errors: [] })),
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
    invalidateUserCache: jest.fn(),
  };
});

const db = require('../../src/database');
const auth = require('../../src/middleware/auth');
const router = require('../../src/routes/admin/benutzer');
const { errorHandler } = require('../../src/middleware/errorHandler');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/benutzer', router);
  a.use(errorHandler);
  return a;
}

// Die Kennungen sind ZEICHENKETTEN, weil `admin_users.id` BIGSERIAL ist und
// `node-postgres` `int8` als String liefert. Bis zum 27.08.2026 stand hier eine
// Zahl, und genau deshalb sahen die Tests zwei Schutzwaelle gruen, die in
// Wirklichkeit nie griffen (`'1' === 1` ist false). Ein Mock, der etwas anderes
// liefert als die Datenbank, prueft den Code gegen eine Welt, die es nicht gibt.
const ADMIN = { id: '1', username: 'admin', role: 'admin' };
const MITARBEITER = { id: '2', username: 'mia', role: 'mitarbeiter' };

describe('/api/benutzer', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.transaction.mockReset();
    auth.__setUser(ADMIN);
  });

  test('GET listet alle Benutzer mit Rolle', async () => {
    db.query.mockResolvedValueOnce({ rows: [ADMIN, MITARBEITER] });
    const res = await request(app()).get('/api/benutzer');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[1].role).toBe('mitarbeiter');
  });

  test.each([
    ['get', '/api/benutzer'],
    ['post', '/api/benutzer'],
    ['delete', '/api/benutzer/1'],
    ['put', '/api/benutzer/1/passwort'],
    ['put', '/api/benutzer/1/aktiv'],
  ])('%s %s: Mitarbeiter bekommt 403', async (verb, pfad) => {
    auth.__setUser(MITARBEITER);
    const res = await request(app())[verb](pfad).send({});
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('POST legt einen Mitarbeiter an und liefert 201', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 7, username: 'mia', email: 'mia@firma.de', role: 'mitarbeiter' }],
    });
    const res = await request(app()).post('/api/benutzer').send({
      username: 'mia',
      password: 'Startpasswort1!',
      email: 'mia@firma.de',
      rolle: 'mitarbeiter',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('mitarbeiter');
    expect(db.query.mock.calls[0][1]).toEqual(['mia', '$hash$', 'mia@firma.de', 'mitarbeiter']);
  });

  test('POST lehnt eine fremde Rolle mit 400 ab', async () => {
    const res = await request(app())
      .post('/api/benutzer')
      .send({ username: 'x', password: 'Startpasswort1!', rolle: 'viewer' });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('POST meldet einen vergebenen Namen als 409', async () => {
    db.query.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await request(app())
      .post('/api/benutzer')
      .send({ username: 'admin', password: 'Startpasswort1!', rolle: 'admin' });
    expect(res.status).toBe(409);
  });

  // --- Passwort setzen (C2) -------------------------------------------------

  test('PUT /:id/passwort setzt das Passwort und beendet die Sitzungen', async () => {
    const { blacklistAllUserTokens } = require('../../src/utils/jwt');
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 2, username: 'mia', role: 'mitarbeiter' }] }) // holeBenutzer
      .mockResolvedValueOnce({ rows: [{ username: 'mia' }] }); // setzePasswort: Existenz
    const calls = [];
    db.transaction.mockImplementation(async cb =>
      cb({
        query: jest.fn(async (sql, params) => {
          calls.push({ sql: sql.replace(/\s+/g, ' '), params });
          return { rowCount: 1, rows: [] };
        }),
      })
    );
    const res = await request(app())
      .put('/api/benutzer/2/passwort')
      .send({ password: 'Startpasswort1!' });
    expect(res.status).toBe(200);
    expect(calls.some(c => c.sql.includes('UPDATE admin_users SET password_hash'))).toBe(true);
    // Die Historie haelt fest, WER gesetzt hat: der Administrator, nicht der Betroffene.
    const historie = calls.find(c => c.sql.includes('INSERT INTO password_history'));
    expect(historie.params[0]).toBe(2);
    expect(historie.params[2]).toBe('admin');
    expect(blacklistAllUserTokens).toHaveBeenCalledWith(2);
  });

  test('PUT /:id/passwort lehnt ein zu kurzes Passwort mit 400 ab', async () => {
    const res = await request(app()).put('/api/benutzer/2/passwort').send({ password: 'kurz' });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('PUT /:id/passwort eines unbekannten Benutzers ist 404', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app())
      .put('/api/benutzer/404/passwort')
      .send({ password: 'Startpasswort1!' });
    expect(res.status).toBe(404);
  });

  // --- Stilllegen und wieder zulassen (C2) ----------------------------------

  test('PUT /:id/aktiv legt einen Mitarbeiter still und beendet seine Sitzungen', async () => {
    const { blacklistAllUserTokens } = require('../../src/utils/jwt');
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 2, username: 'mia', role: 'mitarbeiter' }] }) // holeBenutzer
      .mockResolvedValueOnce({ rows: [{ id: 2, username: 'mia', is_active: false }] }); // UPDATE
    const res = await request(app()).put('/api/benutzer/2/aktiv').send({ aktiv: false });
    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(false);
    expect(db.query.mock.calls[1][0]).toContain('UPDATE admin_users SET is_active');
    expect(db.query.mock.calls[1][1]).toEqual([2, false]);
    expect(blacklistAllUserTokens).toHaveBeenCalledWith(2);
    // Ohne das bliebe er bis zu 60 s im Identitaets-Zwischenspeicher aktiv.
    expect(auth.invalidateUserCache).toHaveBeenCalledWith(2);
  });

  test('PUT /:id/aktiv laesst einen Stillgelegten wieder zu, ohne Sitzungen zu beenden', async () => {
    const { blacklistAllUserTokens } = require('../../src/utils/jwt');
    blacklistAllUserTokens.mockClear();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 2, username: 'mia', role: 'mitarbeiter' }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, username: 'mia', is_active: true }] });
    const res = await request(app()).put('/api/benutzer/2/aktiv').send({ aktiv: true });
    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(true);
    expect(blacklistAllUserTokens).not.toHaveBeenCalled();
  });

  test('PUT /:id/aktiv auf das eigene Konto ist 400', async () => {
    const res = await request(app()).put('/api/benutzer/1/aktiv').send({ aktiv: false });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('PUT /:id/aktiv darf sich nicht an der Zeichenkette aus der Datenbank vorbeimogeln', async () => {
    // `req.user.id` ist '1' (String, int8 aus pg), der Pfadparameter die Zahl 1.
    // Der Vergleich muss beides als dieselbe Person erkennen, sonst sperrt sich
    // ein Administrator selbst aus, sobald ein zweiter existiert.
    auth.__setUser({ id: '1', username: 'admin', role: 'admin' });
    const res = await request(app()).put('/api/benutzer/1/aktiv').send({ aktiv: false });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/eigene Konto/);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('PUT /:id/aktiv auf ein FREMDES Konto laeuft trotzdem durch', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 2, username: 'mia', role: 'mitarbeiter' }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, username: 'mia', is_active: false }] });
    const res = await request(app()).put('/api/benutzer/2/aktiv').send({ aktiv: false });
    expect(res.status).toBe(200);
  });

  test('PUT /:id/aktiv legt den letzten aktiven Administrator nicht still', async () => {
    auth.__setUser({ id: '9', username: 'zweiter', role: 'admin' });
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', role: 'admin' }] }) // holeBenutzer
      .mockResolvedValueOnce({ rows: [{ n: 1 }] }); // istLetzterAktiverAdmin
    const res = await request(app()).put('/api/benutzer/1/aktiv').send({ aktiv: false });
    expect(res.status).toBe(400);
    expect(db.query.mock.calls.some(c => c[0].includes('UPDATE admin_users SET is_active'))).toBe(
      false
    );
  });

  test('PUT /:id/aktiv verlangt einen Wahrheitswert', async () => {
    const res = await request(app()).put('/api/benutzer/2/aktiv').send({ aktiv: 'nein' });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('DELETE des eigenen Kontos wird auf /gdpr/me verwiesen (400)', async () => {
    const res = await request(app()).delete('/api/benutzer/1');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/gdpr\/me/);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('DELETE loescht einen Mitarbeiter samt Daten', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 2, username: 'mia', role: 'mitarbeiter' }] }) // holeBenutzer
      .mockResolvedValueOnce({ rows: [{ n: 1 }] }); // adminCount
    const calls = [];
    db.transaction.mockImplementation(async cb =>
      cb({
        query: jest.fn(async (sql, params) => {
          calls.push({ sql: sql.replace(/\s+/g, ' '), params });
          return { rowCount: 1, rows: [] };
        }),
      })
    );
    const res = await request(app()).delete('/api/benutzer/2');
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.zugangBleibt).toBe(false);
    expect(calls.some(c => c.sql.includes('DELETE FROM admin_users') && c.params[0] === 2)).toBe(
      true
    );
    expect(calls.some(c => c.sql.includes('DELETE FROM api_keys'))).toBe(true);
    expect(calls.some(c => c.sql.includes('DELETE FROM public.app_members'))).toBe(true);
    expect(auth.invalidateUserCache).toHaveBeenCalledWith(2);
  });

  test('DELETE des letzten Admins laesst die Zugangs-Zeile stehen', async () => {
    auth.__setUser({ id: '9', username: 'zweiter', role: 'admin' });
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', role: 'admin' }] })
      .mockResolvedValueOnce({ rows: [{ n: 1 }] });
    const calls = [];
    db.transaction.mockImplementation(async cb =>
      cb({
        query: jest.fn(async sql => {
          calls.push(sql);
          return { rowCount: 1, rows: [] };
        }),
      })
    );
    const res = await request(app()).delete('/api/benutzer/1');
    expect(res.status).toBe(200);
    expect(res.body.zugangBleibt).toBe(true);
    expect(calls.some(s => s.includes('DELETE FROM admin_users'))).toBe(false);
  });

  test('DELETE eines unbekannten Benutzers ist 404', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).delete('/api/benutzer/404');
    expect(res.status).toBe(404);
  });
});
