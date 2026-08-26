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

    expect(db.query.mock.calls.length).toBeGreaterThanOrEqual(8);
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

  test('eine gescheiterte Kategorie wird gemeldet, nicht als leer ausgegeben', async () => {
    db.query.mockImplementation(async sql => {
      if (sql.includes('FROM chat_attachments')) {
        throw new Error('column "file_type" does not exist');
      }
      return { rows: [] };
    });

    const res = await request(buildApp()).get('/api/gdpr/export');

    expect(res.status).toBe(200);
    expect(res.body.attachments.unvollstaendig).toMatch(/file_type/);
    expect(res.body._meta.unvollstaendig).toEqual([
      { kategorie: 'anhaenge', grund: 'column "file_type" does not exist' },
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

  test('nennt dieselben Kategorien, die der Export auch liefert', async () => {
    const res = await request(buildApp()).get('/api/gdpr/categories');
    const namen = res.body.categories.map(k => k.name);

    expect(namen).toContain('Chat-Konversationen');
    expect(namen).toContain('Aktivitätsprotokoll');
    // Dokumente, Wissensräume und Projekte sind mit Phase B4 (26.08.2026) weg.
    expect(namen).not.toContain('Dokumente');
    expect(namen).not.toContain('Wissensräume');
  });
});
