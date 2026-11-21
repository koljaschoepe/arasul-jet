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

/**
 * Rückmeldungen in der Auskunft (21.11.2026, J42, M7): Text, Seite,
 * Markierung und das Bildschirmfoto selbst als data-URL. Bis dahin ließ die
 * Auskunft sie aus.
 */
describe('GET /api/gdpr/export mit Rückmeldungen', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const MIT_BILD = '11111111-2222-3333-4444-555555555555.png';
  const OHNE_DATEI = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png';
  let appsDir;
  let vorher;

  const zeile = (id, bild) => ({
    id: String(id),
    app_id: 'belege',
    stand: 'live',
    seite: '/apps/belege/',
    text: `Meldung ${id}`,
    bild,
    markierung: bild ? { x: 0.1, y: 0.2, breite: 0.3, hoehe: 0.1 } : null,
    stand_meldung: 'neu',
    grund: null,
    stand_geaendert_am: null,
    erstellt_am: '2026-11-20T10:00:00.000Z',
  });

  beforeEach(() => {
    vorher = process.env.APPS_DIR;
    appsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auskunft-'));
    process.env.APPS_DIR = appsDir;
    fs.mkdirSync(path.join(appsDir, '.rueckmeldungen'));
    fs.writeFileSync(path.join(appsDir, '.rueckmeldungen', MIT_BILD), PNG);
    db.query.mockReset();
    db.query.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM public.rueckmeldungen')) {
        expect(params).toEqual([42]);
        return { rows: [zeile(3, MIT_BILD), zeile(2, OHNE_DATEI), zeile(1, null)] };
      }
      return { rows: [] };
    });
  });

  afterEach(() => {
    process.env.APPS_DIR = vorher;
    fs.rmSync(appsDir, { recursive: true, force: true });
  });

  test('enthält die eigenen Meldungen samt Bild als data-URL', async () => {
    const res = await request(buildApp()).get('/api/gdpr/export');

    expect(res.status).toBe(200);
    const r = res.body.rueckmeldungen;
    expect(r.count).toBe(3);
    expect(r.unvollstaendig).toBeUndefined();
    const [mit, fehlt, ohne] = r.data;
    expect(mit.text).toBe('Meldung 3');
    expect(mit.markierung).toEqual({ x: 0.1, y: 0.2, breite: 0.3, hoehe: 0.1 });
    expect(mit.bild.daten).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
    expect(mit.bild.bytes).toBe(PNG.length);
    expect(fehlt.bild.fehlt).toMatch(/nicht mehr vorhanden/);
    expect(ohne.bild).toBeNull();
    // Der Dateiname am Gerät steht nirgends in der Auskunft.
    expect(JSON.stringify(res.body)).not.toContain(MIT_BILD);
    expect(res.body._meta.unvollstaendig).toEqual([]);
  });

  test('ein Bild, das sich nicht lesen lässt, macht die Kategorie unvollständig', async () => {
    // Ein Ordner statt einer Datei: readFile scheitert mit EISDIR, nicht ENOENT.
    fs.mkdirSync(path.join(appsDir, '.rueckmeldungen', OHNE_DATEI));

    const res = await request(buildApp()).get('/api/gdpr/export');

    expect(res.status).toBe(200);
    expect(res.body.rueckmeldungen.data[1].bild.fehlt).toMatch(/nicht gelesen/);
    expect(res.body.rueckmeldungen.unvollstaendig).toMatch(/1 Bild/);
    expect(res.body._meta.unvollstaendig).toEqual([
      { kategorie: 'rueckmeldungen', grund: expect.stringMatching(/1 Bild/) },
    ]);
  });

  test('die Übersicht nennt die Rückmeldungen mit Zahl', async () => {
    db.query.mockReset();
    db.query.mockImplementation(async sql =>
      sql.includes('public.rueckmeldungen')
        ? { rows: [{ count: '3' }] }
        : { rows: [{ count: '0' }] }
    );
    const res = await request(buildApp()).get('/api/gdpr/categories');
    const k = res.body.categories.find(c => c.name === 'Rückmeldungen');
    expect(k.count).toBe(3);
  });
});
