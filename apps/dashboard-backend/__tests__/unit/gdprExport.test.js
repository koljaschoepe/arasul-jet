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
  requireAdmin: (req, res, next) => next(),
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
      'conversations',
      'messages',
      'attachments',
      'documents',
      'aiMemories',
      'loginHistory',
      'activeSessions',
      'activityLog',
      'securityEvents',
      'knowledgeSpaces',
      'projects',
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

    expect(db.query.mock.calls.length).toBeGreaterThanOrEqual(12);
    expect(hoechstwert).toBeLessThanOrEqual(3);
  });

  test('fragt keine Spalten ab, die es nicht gibt', async () => {
    await request(buildApp()).get('/api/gdpr/export');
    const sql = allesSql();

    // Der konkrete 500er vom 19.08.2026.
    expect(sql).toContain('preferred_model');
    expect(sql).not.toMatch(/\bm\.model\b/);
    expect(sql).not.toMatch(/\bm\.token_count\b/);
    expect(sql).not.toMatch(/\bm\.duration_ms\b/);
    // Anhänge heißen filename/mime_type, nicht file_name/file_type.
    expect(sql).not.toMatch(/\ba\.file_name\b/);
    expect(sql).not.toMatch(/\ba\.file_type\b/);
    // knowledge_spaces.created_by gibt es seit Migration 089 nicht mehr.
    expect(sql).not.toContain('created_by');
  });

  test('findet Wissensraeume auch ohne owner_id, wie die Loeschung', async () => {
    /**
     * Am 23.08.2026 auf dem Pruefstand gemessen: ein ueber die Oberflaeche
     * angelegter Wissensraum traegt `owner_id = NULL` und haengt an einem
     * Projekt. Die Auskunft nach Art. 15 filterte nur auf `owner_id` und
     * meldete null Raeume, waehrend die Loeschung nach Art. 17 ihn sehr wohl
     * entfernte.
     *
     * Auskunft und Loeschung duerfen sich nicht widersprechen. Wer nicht
     * erfaehrt, was gespeichert ist, kann seine Rechte daran nicht ausueben.
     */
    await request(buildApp()).get('/api/gdpr/export');
    const raeume = db.query.mock.calls.find(c => c[0].includes('FROM knowledge_spaces'));

    expect(raeume).toBeDefined();
    expect(raeume[0]).toContain('owner_id = $1');
    expect(raeume[0]).toContain('project_id IN (SELECT id FROM projects)');
  });

  test('sucht Dokumente über Id UND Name, weil uploaded_by ein Name ist', async () => {
    await request(buildApp()).get('/api/gdpr/export');
    const dokumente = db.query.mock.calls.find(c => c[0].includes('FROM documents'));

    expect(dokumente).toBeDefined();
    expect(dokumente[0]).toContain('owner_id = $1');
    expect(dokumente[0]).toContain('uploaded_by = $2');
    expect(dokumente[1]).toEqual([42, 'kolja']);
  });

  test('eine gescheiterte Kategorie wird gemeldet, nicht als leer ausgegeben', async () => {
    db.query.mockImplementation(async sql => {
      if (sql.includes('FROM documents')) {
        throw new Error('column "file_type" does not exist');
      }
      return { rows: [] };
    });

    const res = await request(buildApp()).get('/api/gdpr/export');

    expect(res.status).toBe(200);
    expect(res.body.documents.unvollstaendig).toMatch(/file_type/);
    expect(res.body._meta.unvollstaendig).toEqual([
      { kategorie: 'dokumente', grund: 'column "file_type" does not exist' },
    ]);
    // Eine intakte Kategorie bleibt sauber.
    expect(res.body.conversations.unvollstaendig).toBeUndefined();
  });
});

describe('GET /api/gdpr/categories', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue({ rows: [{ count: '0' }] });
  });

  test('zählt Dokumente mit derselben Bedingung wie der Export', async () => {
    const res = await request(buildApp()).get('/api/gdpr/categories');

    expect(res.status).toBe(200);
    const dokumente = db.query.mock.calls.find(c => c[0].includes('FROM documents'));
    expect(dokumente[1]).toEqual([42, 'kolja']);
    // ai_memories hat keine Nutzerspalte — danach darf nicht gefiltert werden.
    const memories = db.query.mock.calls.find(c => c[0].includes('FROM ai_memories'));
    expect(memories[0]).not.toContain('user_id');
  });

  test('nennt dieselben Kategorien, die der Export auch liefert', async () => {
    const res = await request(buildApp()).get('/api/gdpr/categories');
    const namen = res.body.categories.map(k => k.name);

    // Wissensräume und Projekte fehlten hier, obwohl der Export sie ausgibt.
    expect(namen).toContain('Wissensräume');
    expect(namen).toContain('Projekte');
  });
});
