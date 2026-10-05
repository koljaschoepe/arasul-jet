/**
 * DSGVO Art. 15 — Auskunft (GET /api/gdpr/export).
 *
 * Am 19.08.2026 lief der Export auf dem Gerät in einen 500er:
 * `column "model" does not exist`. Ursache war Schema-Drift — die Abfragen
 * standen gegen Spalten, die es seit mehreren Umbauten nicht mehr gibt. Vier
 * weitere Kategorien lieferten still eine leere Liste, weil ein
 * `.catch(() => ({ rows: [] }))` jeden Fehler verschluckte.
 *
 * Diese Tests halten beides fest: die Abfragen müssen zum Schema passen, und
 * ein Fehlschlag darf nie wieder wie "dazu gibt es nichts" aussehen.
 */

const request = require('supertest');
const express = require('express');

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/utils/auditLog', () => ({ logSecurityEvent: jest.fn() }));

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 42, username: 'kolja', role: 'admin' };
    next();
  },
  requireRole: () => (req, res, next) => next(),
  ROLLEN: ['admin', 'mitarbeiter'],
  optionalAuth: (req, res, next) => next(),
  invalidateUserCache: jest.fn(),
}));

jest.mock('../../src/utils/jwt', () => ({
  blacklistAllUserTokens: jest.fn().mockResolvedValue(true),
}));

const db = require('../../src/database');
const gdprRouter = require('../../src/routes/admin/gdpr');
const { errorHandler } = require('../../src/middleware/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/gdpr', gdprRouter);
  app.use(errorHandler);
  return app;
}

/** Alle abgesetzten SQL-Texte in einem Rutsch. */
const allesSql = () => db.query.mock.calls.map(c => c[0]).join('\n---\n');

describe('GET /api/gdpr/export', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue({ rows: [] });
  });

  test('liefert 200 und alle Kategorien', async () => {
    const res = await request(buildApp()).get('/api/gdpr/export');

    expect(res.status).toBe(200);
    for (const schluessel of [
      'profile',
      'flowRuns',
      'loginHistory',
      'activeSessions',
      'activityLog',
      'securityEvents',
    ]) {
      expect(res.body).toHaveProperty(schluessel);
    }
    expect(res.body._meta.unvollstaendig).toEqual([]);
  });

  test('feuert nicht alle Abfragen gleichzeitig los', async () => {
    // Zwoelf parallele Abfragen reissen den Verbindungspool leer; database.js
    // klinkt bei mehr als zehn Wartenden aus. Am 19.08.2026 kamen deshalb
    // direkt nach dem Deploy zwei Kategorien als unvollstaendig zurueck.
    let laufend = 0;
    let hoechstwert = 0;
    db.query.mockImplementation(async () => {
      laufend += 1;
      hoechstwert = Math.max(hoechstwert, laufend);
      await new Promise(f => setTimeout(f, 5));
      laufend -= 1;
      return { rows: [] };
    });

    await request(buildApp()).get('/api/gdpr/export');

    expect(db.query.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(hoechstwert).toBeLessThanOrEqual(3);
  });

  test('fragt keine Spalten ab, die es nicht gibt', async () => {
    await request(buildApp()).get('/api/gdpr/export');
    const sql = allesSql();

    // Die Chat-Tabellen sind mit Phase B6 (26.08.2026, Migration 165) weg;
    // der konkrete 500er vom 19.08.2026 (`preferred_model`) kann nicht
    // wiederkommen, weil die Abfrage nicht mehr existiert.
    expect(sql).not.toContain('chat_');
    // knowledge_spaces.created_by gibt es seit Migration 089 nicht mehr.
    expect(sql).not.toContain('created_by');
    // Die verbliebenen Nutzerdaten: Flow-Laeufe mit Argumenten und Ergebnis.
    expect(sql).toContain('FROM flow_runs');
  });

  test('eine gescheiterte Kategorie wird gemeldet, nicht als leer ausgegeben', async () => {
    db.query.mockImplementation(async sql => {
      if (sql.includes('FROM flow_runs')) {
        throw new Error('column "file_type" does not exist');
      }
      return { rows: [] };
    });

    const res = await request(buildApp()).get('/api/gdpr/export');

    expect(res.status).toBe(200);
    expect(res.body.flowRuns.unvollstaendig).not.toMatch(/file_type/);
    expect(res.body._meta.unvollstaendig).toEqual([
      { kategorie: 'laeufe', grund: 'Diese Kategorie konnte nicht gelesen werden.' },
    ]);
    // Eine intakte Kategorie bleibt sauber.
    expect(res.body.loginHistory.unvollstaendig).toBeUndefined();
  });
});

describe('GET /api/gdpr/export?benutzer=', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue({ rows: [] });
  });

  test('der Administrator holt die Auskunft über eine andere Person', async () => {
    db.query.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM admin_users WHERE id')) {
        return { rows: [{ id: 7, username: 'anna@firma.de', role: 'mitarbeiter' }] };
      }
      return { rows: [] };
    });

    const res = await request(buildApp()).get('/api/gdpr/export?benutzer=7');

    expect(res.status).toBe(200);
    expect(res.body._meta.username).toBe('anna@firma.de');
    expect(res.body._meta.userId).toBe(7);
    expect(res.headers['content-disposition']).toContain('anna@firma.de');
    // Die Kategorien fragen nach der Person, nicht nach dem Aufrufer (42).
    const mitFlows = db.query.mock.calls.find(c => c[0].includes('FROM flow_runs'));
    expect(mitFlows[1]).toEqual([7]);
  });

  test('eine unbekannte Person ist 404', async () => {
    const res = await request(buildApp()).get('/api/gdpr/export?benutzer=99');
    expect(res.status).toBe(404);
  });

  test('keine Zahl ist 400', async () => {
    const res = await request(buildApp()).get('/api/gdpr/export?benutzer=abc');
    expect(res.status).toBe(400);
  });

  // Befund 12 der zweiten Pruefung (05.10.2026): von Hand geprueft statt mit
  // `validateQuery`; `Number('0x7')` ist 7 und ging als Person 7 durch.
  test('die Angabe prueft Zod: Fehler mit Quelle query, keine Hex- oder Exponentenzahl', async () => {
    for (const roh of ['abc', '0x7', '1e1', '0', '-3']) {
      const res = await request(buildApp()).get(`/api/gdpr/export?benutzer=${roh}`);
      expect(res.status).toBe(400);
      expect(res.body.error.details.source).toBe('query');
    }
  });

  test('leer ist der Aufrufer selbst', async () => {
    const res = await request(buildApp()).get('/api/gdpr/export?benutzer=');
    expect(res.status).toBe(200);
    expect(res.body._meta.fremd ?? false).toBe(false);
  });
});

describe('GET /api/gdpr/categories', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue({ rows: [{ count: '0' }] });
  });

  test('nennt dieselben Kategorien, die der Export auch liefert', async () => {
    const res = await request(buildApp()).get('/api/gdpr/categories');
    const namen = res.body.categories.map(k => k.name);

    expect(namen).toContain('Flow-Läufe');
    expect(namen).toContain('Aktivitätsprotokoll');
    // Dokumente, Wissensräume und Projekte sind mit Phase B4 (26.08.2026) weg,
    // die Chats mit B6.
    expect(namen).not.toContain('Chat-Konversationen');
    expect(namen).not.toContain('Dokumente');
    expect(namen).not.toContain('Wissensräume');
  });
});
