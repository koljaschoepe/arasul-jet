/**
 * /api/freigaben (Phase C2): der Administrator gibt eine App fuer einen
 * Benutzer frei, sieht die Freigaben und nimmt sie zurueck. Der Mitarbeiter
 * bekommt auf jedem der drei Wege 403 — die Freigabe ist das, was ueber ihn
 * entschieden wird, nicht das, was er selbst setzt.
 *
 * Seit Phase C3 traegt sie ausserdem einen `stand`: `live` fuer den Normalfall,
 * `test` fuer einen Tester, der zusaetzlich den Teststand der App sieht.
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
jest.mock('../../src/utils/auditLog', () => ({ logSecurityEvent: jest.fn() }));

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
const router = require('../../src/routes/admin/freigaben');
const { errorHandler } = require('../../src/middleware/errorHandler');
const { logSecurityEvent } = require('../../src/utils/auditLog');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/freigaben', router);
  a.use(errorHandler);
  return a;
}

// Kennungen als ZEICHENKETTE, so wie `node-postgres` `int8` liefert; siehe die
// Begruendung in benutzer.test.js.
const ADMIN = { id: '1', username: 'admin', role: 'admin' };
const MITARBEITER = { id: '2', username: 'mia', role: 'mitarbeiter' };
const FREIGABE = {
  app_id: 'urlaub',
  user_id: 2,
  stand: 'live',
  freigegeben_von: 1,
  freigegeben_am: '2026-08-27T09:00:00.000Z',
};

describe('/api/freigaben', () => {
  beforeEach(() => {
    db.query.mockReset();
    logSecurityEvent.mockClear();
    auth.__setUser(ADMIN);
  });

  test.each([
    ['get', '/api/freigaben'],
    ['post', '/api/freigaben'],
    ['delete', '/api/freigaben/urlaub/2'],
  ])('%s %s: Mitarbeiter bekommt 403', async (verb, pfad) => {
    auth.__setUser(MITARBEITER);
    const res = await request(app())[verb](pfad).send({});
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('GET liefert alle Freigaben', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FREIGABE, username: 'mia', app_name: 'Urlaub' }] });
    const res = await request(app()).get('/api/freigaben');
    expect(res.status).toBe(200);
    expect(res.body.data[0].app_id).toBe('urlaub');
    expect(res.body.data[0].stand).toBe('live');
    // Ohne Filter steht kein WHERE in der Abfrage.
    expect(db.query.mock.calls[0][0]).not.toContain('WHERE');
    expect(db.query.mock.calls[0][1]).toEqual([]);
  });

  test('GET filtert nach Benutzer', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).get('/api/freigaben?benutzer_id=2');
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][0]).toContain('f.user_id = $1');
    expect(db.query.mock.calls[0][1]).toEqual([2]);
  });

  test('GET weist eine unmoegliche App-Kennung mit 400 ab', async () => {
    const res = await request(app()).get('/api/freigaben?app_id=Mein%20Urlaub');
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('POST gibt frei und liefert 201', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FREIGABE, neu: true }] });
    const res = await request(app())
      .post('/api/freigaben')
      .send({ app_id: 'urlaub', benutzer_id: 2 });
    expect(res.status).toBe(201);
    expect(res.body.neu).toBe(true);
    // Ohne Angabe ist der Stand `live`: der Normalfall, nicht der Tester.
    expect(db.query.mock.calls[0][1]).toEqual(['urlaub', 2, 'live', '1']);
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'freigabe_erteilt' })
    );
  });

  test('POST macht aus einem Nutzer einen Tester', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FREIGABE, stand: 'test', neu: false }] });
    const res = await request(app())
      .post('/api/freigaben')
      .send({ app_id: 'urlaub', benutzer_id: 2, stand: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.data.stand).toBe('test');
    expect(db.query.mock.calls[0][1]).toEqual(['urlaub', 2, 'test', '1']);
  });

  test('POST weist einen erfundenen Stand mit 400 ab', async () => {
    const res = await request(app())
      .post('/api/freigaben')
      .send({ app_id: 'urlaub', benutzer_id: 2, stand: 'abnahme' });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('POST auf eine bestehende Freigabe ist 200 und laesst den Zeitstempel stehen', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FREIGABE, neu: false }] });
    const res = await request(app())
      .post('/api/freigaben')
      .send({ app_id: 'urlaub', benutzer_id: 2 });
    expect(res.status).toBe(200);
    expect(res.body.neu).toBe(false);
    expect(res.body.data.freigegeben_am).toBe(FREIGABE.freigegeben_am);
    // Kein zweiter Protokolleintrag fuer einen Zustand, der schon galt.
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  test('POST antwortet zweimal mit derselben Form, 201 wie 200', async () => {
    // Ein Aufruf, eine Zeile, eine Form. Bis Phase C3 las der Service den
    // Bestand mit einer ZWEITEN Abfrage nach, und dabei konnte sich die Form
    // der Antwort unterscheiden -- und die Nachlese ins Leere greifen, wenn
    // jemand die Freigabe in derselben Sekunde zurueckgenommen hat.
    db.query.mockResolvedValueOnce({ rows: [{ ...FREIGABE, neu: true }] });
    const neu = await request(app())
      .post('/api/freigaben')
      .send({ app_id: 'urlaub', benutzer_id: 2 });
    db.query.mockResolvedValueOnce({ rows: [{ ...FREIGABE, neu: false }] });
    const bestand = await request(app())
      .post('/api/freigaben')
      .send({ app_id: 'urlaub', benutzer_id: 2 });
    expect(Object.keys(bestand.body.data).sort()).toEqual(Object.keys(neu.body.data).sort());
    expect(bestand.body.data).not.toHaveProperty('neu');
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('POST fuer eine unbekannte App ist 400 (Fremdschluessel seit 169)', async () => {
    db.query.mockRejectedValueOnce(Object.assign(new Error('fk'), { code: '23503' }));
    const res = await request(app())
      .post('/api/freigaben')
      .send({ app_id: 'gibt-es-nicht', benutzer_id: 2 });
    expect(res.status).toBe(400);
  });

  test('POST fuer einen unbekannten Benutzer ist 400 (Fremdschluessel)', async () => {
    db.query.mockRejectedValueOnce(Object.assign(new Error('fk'), { code: '23503' }));
    const res = await request(app())
      .post('/api/freigaben')
      .send({ app_id: 'urlaub', benutzer_id: 999 });
    expect(res.status).toBe(400);
  });

  test('POST weist ein unbekanntes Feld mit 400 ab', async () => {
    const res = await request(app())
      .post('/api/freigaben')
      .send({ app_id: 'urlaub', benutzer_id: 2, permission: 'admin' });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('DELETE nimmt die Freigabe zurueck', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app()).delete('/api/freigaben/urlaub/2');
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][1]).toEqual(['urlaub', 2]);
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'freigabe_zurueckgenommen' })
    );
  });

  test('DELETE einer Freigabe, die es nicht gibt, ist 404', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(app()).delete('/api/freigaben/urlaub/2');
    expect(res.status).toBe(404);
  });
});
