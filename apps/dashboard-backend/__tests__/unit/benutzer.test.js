/**
 * /api/benutzer (Phase C1): der Administrator legt Benutzer an, sieht sie und
 * loescht sie. Der Mitarbeiter bekommt auf allen drei Wegen 403.
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

const ADMIN = { id: 1, username: 'admin', role: 'admin' };
const MITARBEITER = { id: 2, username: 'mia', role: 'mitarbeiter' };

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

  test.each(['get', 'post', 'delete'])('%s: Mitarbeiter bekommt 403', async verb => {
    auth.__setUser(MITARBEITER);
    const pfad = verb === 'delete' ? '/api/benutzer/1' : '/api/benutzer';
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

  test('DELETE des eigenen Kontos wird auf /gdpr/me verwiesen (400)', async () => {
    const res = await request(app()).delete('/api/benutzer/1');
    expect(res.status).toBe(400);
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
    expect(auth.invalidateUserCache).toHaveBeenCalledWith(2);
  });

  test('DELETE des letzten Admins laesst die Zugangs-Zeile stehen', async () => {
    auth.__setUser({ id: 9, username: 'zweiter', role: 'admin' });
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
