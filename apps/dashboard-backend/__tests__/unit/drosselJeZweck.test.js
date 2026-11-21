/**
 * Drosseln je Person zählen je Zweck getrennt (21.11.2026, J42, M7).
 *
 * Bis dahin schrieb jede Drossel aus `createUserRateLimiter` in DENSELBEN
 * Speicher je Person. Drei gedrosselte Aufrufe an anderer Stelle (etwa drei
 * Rückmeldungen) sperrten danach 15 Minuten lang den Passwortwechsel, dessen
 * Drossel bei drei Einträgen zumacht. Gefunden am 20.11.2026 (Jet-PR 942).
 *
 * Hier laufen die ECHTEN Limiter, nicht der Ersatz aus helpers/rateLimitMock.
 */

const express = require('express');
const request = require('supertest');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const VIERTELSTUNDE = 15 * 60 * 1000;

function app(person, ...zwecke) {
  const { createUserRateLimiter } = require('../../src/middleware/rateLimit');
  const a = express();
  a.use((req, res, next) => {
    req.user = person;
    next();
  });
  // Eine Route je Zweck; die Grenzen wie in den echten Routen.
  const drosseln = {
    passwort: createUserRateLimiter(3, VIERTELSTUNDE, 'passwort'),
    rueckmeldung: createUserRateLimiter(20, VIERTELSTUNDE, 'rueckmeldung'),
    'werksreset-vorschau': createUserRateLimiter(20, 5 * 60 * 1000, 'werksreset-vorschau'),
  };
  for (const zweck of zwecke) {
    a.post(`/${zweck}`, drosseln[zweck], (req, res) => res.json({ ok: true }));
  }
  return a;
}

describe('createUserRateLimiter zählt je Zweck', () => {
  let vorher;
  beforeEach(() => {
    vorher = process.env.RATE_LIMIT_ENABLED;
    process.env.RATE_LIMIT_ENABLED = 'true';
    jest.resetModules(); // frischer Speicher je Test
  });
  afterEach(() => {
    process.env.RATE_LIMIT_ENABLED = vorher;
  });

  test('drei Rückmeldungen und drei Vorschauen sperren den Passwortwechsel nicht', async () => {
    const a = app({ id: 7, username: 'mia' }, 'passwort', 'rueckmeldung', 'werksreset-vorschau');
    for (let i = 0; i < 3; i += 1) {
      expect((await request(a).post('/rueckmeldung')).status).toBe(200);
      expect((await request(a).post('/werksreset-vorschau')).status).toBe(200);
    }
    // Drei Passwortwechsel gehen durch, der vierte nicht: dessen Zähler
    // hat nur die eigenen drei gesehen.
    for (let i = 0; i < 3; i += 1) {
      expect((await request(a).post('/passwort')).status).toBe(200);
    }
    const vierter = await request(a).post('/passwort');
    expect(vierter.status).toBe(429);
    expect(vierter.body.error.code).toBe('RATE_LIMITED');
  });

  test('ein voller Passwort-Zähler sperrt das Melden nicht', async () => {
    const a = app({ id: 7, username: 'mia' }, 'passwort', 'rueckmeldung');
    for (let i = 0; i < 4; i += 1) await request(a).post('/passwort');
    expect((await request(a).post('/passwort')).status).toBe(429);
    expect((await request(a).post('/rueckmeldung')).status).toBe(200);
  });

  test('das Melden hat eine eigene Drossel: die 21. Meldung je Viertelstunde ist 429', async () => {
    const a = app({ id: 7, username: 'mia' }, 'rueckmeldung');
    for (let i = 0; i < 20; i += 1) {
      expect((await request(a).post('/rueckmeldung')).status).toBe(200);
    }
    expect((await request(a).post('/rueckmeldung')).status).toBe(429);
  });

  test('zwei Personen zählen getrennt', async () => {
    const mia = app({ id: 7, username: 'mia' }, 'passwort');
    const tom = app({ id: 8, username: 'tom' }, 'passwort');
    for (let i = 0; i < 3; i += 1) await request(mia).post('/passwort');
    expect((await request(mia).post('/passwort')).status).toBe(429);
    expect((await request(tom).post('/passwort')).status).toBe(200);
  });

  test('ohne Zweck lässt sich keine Drossel bauen', () => {
    const { createUserRateLimiter } = require('../../src/middleware/rateLimit');
    expect(() => createUserRateLimiter(3, VIERTELSTUNDE)).toThrow(/Zweck/);
    expect(() => createUserRateLimiter(3, VIERTELSTUNDE, '  ')).toThrow(/Zweck/);
  });
});

describe('die Route POST /api/rueckmeldungen trägt die eigene Drossel', () => {
  test('in der Kette steht eine Drossel mit Zweck rueckmeldung', () => {
    jest.resetModules();
    jest.doMock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));
    const echt = jest.requireActual('../../src/middleware/rateLimit');
    const gebaut = [];
    jest.doMock('../../src/middleware/rateLimit', () => ({
      ...echt,
      createUserRateLimiter: (max, ms, zweck) => {
        gebaut.push({ max, ms, zweck });
        return echt.createUserRateLimiter(max, ms, zweck);
      },
    }));
    require('../../src/routes/rueckmeldungen');
    expect(gebaut).toEqual([{ max: 20, ms: VIERTELSTUNDE, zweck: 'rueckmeldung' }]);
  });
});
