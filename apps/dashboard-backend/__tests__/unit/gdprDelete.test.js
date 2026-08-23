/**
 * Phase 5.6 — DSGVO Recht auf Löschung.
 *
 * Coverage für DELETE /api/gdpr/me:
 *   - Confirmation-Token muss exakt sein → ValidationError
 *   - Letzter aktiver Admin darf sich NICHT löschen → ForbiddenError
 *   - Erfolgreicher Pfad: Transaction läuft, Daten gelöscht/anonymisiert,
 *     Cookie geräumt, summary returned
 *   - Auth fehlt → 401 (vom requireAuth-Mock)
 */

const request = require('supertest');
const express = require('express');

jest.mock('../../src/database', () => {
  return {
    query: jest.fn(),
    transaction: jest.fn(),
    initialize: jest.fn().mockResolvedValue(true),
  };
});

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/utils/auditLog', () => ({
  logSecurityEvent: jest.fn(),
}));

// requireAuth + requireAdmin: testweise pass-through, der req.user injiziert.
jest.mock('../../src/middleware/auth', () => {
  let mockUser = { id: 42, username: 'kolja', role: 'admin' };
  return {
    __setUser: u => {
      mockUser = u;
    },
    __clearUser: () => {
      mockUser = null;
    },
    optionalAuth: (req, res, next) => next(),
    requireAuth: (req, res, next) => {
      if (!mockUser) {
        return res
          .status(401)
          .json({ error: { code: 'UNAUTHORIZED', message: 'no user' } });
      }
      req.user = mockUser;
      next();
    },
    requireAdmin: (req, res, next) => {
      if (!req.user || req.user.role !== 'admin') {
        return res
          .status(403)
          .json({ error: { code: 'FORBIDDEN', message: 'admin required' } });
      }
      next();
    },
    invalidateUserCache: jest.fn(),
  };
});

// jwt: nur die für den Delete-Pfad genutzte Token-Invalidierung mocken.
jest.mock('../../src/utils/jwt', () => ({
  blacklistAllUserTokens: jest.fn().mockResolvedValue(true),
}));

const db = require('../../src/database');
const auth = require('../../src/middleware/auth');
const { blacklistAllUserTokens } = require('../../src/utils/jwt');
const gdprRouter = require('../../src/routes/admin/gdpr');
const { errorHandler } = require('../../src/middleware/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/gdpr', gdprRouter);
  app.use(errorHandler);
  return app;
}

/**
 * Ein Transaktions-Doppel, das mitschreibt.
 *
 * `rows: []` ist nicht Kosmetik: die Loeschung SAMMELT vor dem Loeschen die
 * Dateipfade und Projekt-Ids ein (sonst weiss danach niemand mehr, welche
 * Bytes zu raeumen sind). Ein Client ohne `rows` laesst genau diesen Teil
 * abstuerzen.
 */
function fakeTransaction() {
  const queryCalls = [];
  const fakeClient = {
    query: jest.fn().mockImplementation((sql, params) => {
      queryCalls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      return Promise.resolve({ rowCount: 1, rows: [] });
    }),
  };
  db.transaction.mockImplementation(async cb => cb(fakeClient));
  return { queryCalls, fakeClient };
}

describe('DELETE /api/gdpr/me', () => {
  beforeEach(() => {
    // mockReset (statt clearAllMocks) leert auch die mockResolvedValueOnce-Queue,
    // sonst leakt ein nicht-konsumierter Once-Wert in den nächsten Test.
    db.query.mockReset();
    db.transaction.mockReset();
    blacklistAllUserTokens.mockClear();
    auth.invalidateUserCache.mockClear();
    auth.__setUser({ id: 42, username: 'kolja', role: 'admin' });
  });

  test('verlangt confirmation-Token im Body', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ n: 2 }] });
    const app = buildApp();

    const res = await request(app).delete('/api/gdpr/me').send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test('lehnt falschen confirmation-Token ab', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ n: 2 }] });
    const app = buildApp();

    const res = await request(app)
      .delete('/api/gdpr/me')
      .send({ confirm: 'JA-LOESCHEN' });

    expect(res.status).toBe(400);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  /**
   * Plan 023 J4: der letzte Admin loescht seine DATEN, behaelt aber den Zugang.
   *
   * Vorher warf diese Stelle einen 403. Mit einem Zugang je Geraet
   * (Entscheidung E1) ist der Antragsteller IMMER der letzte Admin, und Art. 17
   * lief damit auf einem Kundengeraet grundsaetzlich ins Leere. Ein gemauertes
   * Geraet waere die schlechtere Antwort auf einen Loeschantrag.
   */
  test('letzter Admin: Daten weg, Zugang bleibt, und die Antwort sagt es', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ n: 1 }] });
    const { queryCalls } = fakeTransaction();

    const app = buildApp();
    const res = await request(app)
      .delete('/api/gdpr/me')
      .send({ confirm: 'LOESCHEN-BESTAETIGT' });

    expect(res.status).toBe(200);
    expect(res.body.zugangBleibt).toBe(true);
    expect(res.body.message).toMatch(/Zugang selbst bleibt bestehen/);
    // Die Daten sind trotzdem weg …
    expect(queryCalls.some(c => c.sql.includes('DELETE FROM chat_conversations'))).toBe(true);
    expect(queryCalls.some(c => c.sql.includes('DELETE FROM documents'))).toBe(true);
    // … nur die Zugangs-Zeile nicht.
    expect(queryCalls.some(c => c.sql.includes('DELETE FROM admin_users'))).toBe(false);
    expect(res.body.summary.admin_users).toBe(0);
  });

  test('führt Löschung in einer Transaction aus, wenn Backup-Admin existiert', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ n: 2 }] });

    const { queryCalls } = fakeTransaction();

    const app = buildApp();
    const res = await request(app)
      .delete('/api/gdpr/me')
      .send({ confirm: 'LOESCHEN-BESTAETIGT' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.summary).toBeDefined();
    expect(db.transaction).toHaveBeenCalledTimes(1);

    const sqls = queryCalls.map(c => c.sql);
    // Reihenfolge: Kinder vor Parents
    const idxAttachments = sqls.findIndex(s => s.includes('chat_attachments'));
    const idxMessages = sqls.findIndex(s => s.includes('DELETE FROM chat_messages'));
    const idxConvs = sqls.findIndex(s => s.includes('DELETE FROM chat_conversations'));
    const idxAdminDelete = sqls.findIndex(s => s.includes('DELETE FROM admin_users'));
    expect(idxAttachments).toBeGreaterThanOrEqual(0);
    expect(idxAttachments).toBeLessThan(idxMessages);
    expect(idxMessages).toBeLessThan(idxConvs);
    // admin_users zuletzt
    expect(idxAdminDelete).toBeGreaterThan(idxConvs);

    // Anonymisierungs-Updates auf Compliance-Tabellen
    expect(sqls.some(s => s.includes('UPDATE audit_logs SET user_id = NULL'))).toBe(true);
    expect(sqls.some(s => s.includes('UPDATE rag_query_log SET user_id = NULL'))).toBe(true);
    // Bis zum 23.08.2026 stand hier `SET username = NULL`. Die Spalte ist
    // NOT NULL, und der Test hat damit festgehalten, was am Geraet IMMER
    // scheiterte. Ein Test, der eine Zusage prueft, die es nicht gibt,
    // ist schlimmer als kein Test.
    expect(sqls.some(s => s.includes('UPDATE login_attempts SET username = $2'))).toBe(true);

    // Session-Cookie geräumt
    const setCookies = res.headers['set-cookie'] || [];
    const cookieStr = Array.isArray(setCookies) ? setCookies.join('|') : String(setCookies);
    expect(cookieStr).toMatch(/arasul_session=/);

    // Auth-Invalidierung: Token blacklisten (vor der Session-Löschung) + userCache leeren,
    // damit der Token nicht bis zu 60s aus den in-memory Caches gültig bleibt.
    expect(blacklistAllUserTokens).toHaveBeenCalledWith(42);
    expect(auth.invalidateUserCache).toHaveBeenCalledWith(42);
  });

  test('User ohne admin-Rolle braucht keinen Single-Box-Schutz', async () => {
    auth.__setUser({ id: 99, username: 'gast', role: 'user' });
    // count=1 darf den Nicht-Admin nicht blocken — der ist ja kein Admin
    db.query.mockResolvedValueOnce({ rows: [{ n: 1 }] });

    fakeTransaction();

    const app = buildApp();
    const res = await request(app)
      .delete('/api/gdpr/me')
      .send({ confirm: 'LOESCHEN-BESTAETIGT' });

    expect(res.status).toBe(200);
    // Kein Admin, also auch kein Letzter-Admin-Fall: die Zugangs-Zeile geht mit.
    expect(res.body.zugangBleibt).toBe(false);
  });

  test('ohne Auth → 401', async () => {
    auth.__clearUser();
    const app = buildApp();
    const res = await request(app)
      .delete('/api/gdpr/me')
      .send({ confirm: 'LOESCHEN-BESTAETIGT' });

    expect(res.status).toBe(401);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

/**
 * Plan 023 J4: die drei Fehler, die am 22.08.2026 gefunden wurden.
 *
 * Alle drei hatten gemeinsam, dass die Antwort Erfolg meldete. Ein
 * `documents: 0` sieht aus wie „es gab nichts zu löschen", nicht wie „die
 * Abfrage hat nie getroffen". Deshalb prüfen diese Tests nicht das Ergebnis,
 * sondern das SQL.
 */
describe('DELETE /api/gdpr/me — was wirklich gelöscht wird (Plan 023 J4)', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.transaction.mockReset();
    auth.__setUser({ id: 42, username: 'kolja', role: 'admin' });
  });

  async function loeschen() {
    db.query.mockResolvedValueOnce({ rows: [{ n: 2 }] });
    const { queryCalls } = fakeTransaction();
    const app = buildApp();
    const res = await request(app)
      .delete('/api/gdpr/me')
      .send({ confirm: 'LOESCHEN-BESTAETIGT' });
    return { res, queryCalls, sqls: queryCalls.map(c => c.sql) };
  }

  test('Dokumente werden ueber BEIDE Spalten geloescht, nicht nur ueber die Id', async () => {
    // `uploaded_by` ist character varying und enthaelt einen NAMEN
    // ('admin', 'ordner-sync', 'nightrun'). Der alte Vergleich mit der
    // numerischen Id traf nie und meldete trotzdem Erfolg.
    const { queryCalls } = await loeschen();
    const del = queryCalls.find(c => c.sql.startsWith('DELETE FROM documents'));
    expect(del).toBeDefined();
    expect(del.sql).toContain('owner_id = $1');
    expect(del.sql).toContain('uploaded_by = $2');
    expect(del.params).toEqual([42, 'kolja']);
  });

  test('die Dateipfade werden VOR dem Loeschen eingesammelt', async () => {
    // Danach weiss niemand mehr, welche MinIO-Objekte zu raeumen sind, und
    // "Metadaten weg, Bytes da" ist keine Loeschung.
    const { sqls } = await loeschen();
    const idxSelect = sqls.findIndex(s => s.includes('SELECT file_path FROM documents'));
    const idxDelete = sqls.findIndex(s => s.startsWith('DELETE FROM documents'));
    expect(idxSelect).toBeGreaterThanOrEqual(0);
    expect(idxSelect).toBeLessThan(idxDelete);
  });

  test('Wissensraeume und Projekte werden geloescht', async () => {
    // Der Kommentar zaehlte sie auf, der Code loeschte sie nicht.
    const { sqls } = await loeschen();
    expect(sqls.some(s => s.includes('DELETE FROM knowledge_spaces'))).toBe(true);
    expect(sqls.some(s => s.includes('DELETE FROM projects'))).toBe(true);
  });

  /**
   * Am 23.08.2026 auf dem Pruefstand: der Raum "Allgemein" traegt
   * `owner_id = NULL` und haengt an einem Projekt. Der Filter auf `owner_id`
   * liess ihn stehen, und weil `knowledge_spaces_project_id_fkey` auf RESTRICT
   * steht, scheiterte eine Zeile spaeter die ganze Transaktion:
   *
   *   update or delete on table "projects" violates foreign key constraint
   *   "knowledge_spaces_project_id_fkey"
   *
   * Die Loeschung nach Art. 17 war damit auf einem GEWOEHNLICHEN Geraet
   * unmoeglich, nicht in einem Sonderfall.
   */
  test('auch ein Wissensraum OHNE Besitzer am Projekt wird geloescht', async () => {
    const { sqls } = await loeschen();
    const zeile = sqls.find(s => s.includes('DELETE FROM knowledge_spaces'));
    expect(zeile).toBeDefined();
    expect(zeile).toMatch(/project_id IN \(SELECT id FROM projects\)/);
  });

  test('die Wissensraeume gehen VOR den Projekten', async () => {
    // Andersherum steht der Fremdschluessel im Weg.
    const { sqls } = await loeschen();
    const idxRaum = sqls.findIndex(s => s.includes('DELETE FROM knowledge_spaces'));
    const idxProjekt = sqls.findIndex(s => s.startsWith('DELETE FROM projects'));
    expect(idxRaum).toBeGreaterThanOrEqual(0);
    expect(idxRaum).toBeLessThan(idxProjekt);
  });

  test('die Projekt-Ids werden VOR dem Loeschen eingesammelt', async () => {
    // Sonst bleiben die Ablage-Ordner des Kunden auf der Platte stehen.
    const { sqls } = await loeschen();
    const idxSelect = sqls.findIndex(s => s.includes('SELECT id FROM projects'));
    const idxDelete = sqls.findIndex(s => s.startsWith('DELETE FROM projects'));
    expect(idxSelect).toBeGreaterThanOrEqual(0);
    expect(idxSelect).toBeLessThan(idxDelete);
  });

  test('Chunks gehen vor den Dokumenten', async () => {
    const { sqls } = await loeschen();
    const idxChunks = sqls.findIndex(s => s.includes('DELETE FROM document_chunks'));
    const idxDocs = sqls.findIndex(s => s.startsWith('DELETE FROM documents'));
    expect(idxChunks).toBeGreaterThanOrEqual(0);
    expect(idxChunks).toBeLessThan(idxDocs);
  });

  test('die Antwort zaehlt auch die Bytes, nicht nur die Zeilen', async () => {
    const { res } = await loeschen();
    expect(res.body.summary).toHaveProperty('minio_objekte');
    expect(res.body.summary).toHaveProperty('minio_offen');
    expect(res.body.summary).toHaveProperty('projekt_ordner');
  });

  /**
   * `login_attempts.username` ist NOT NULL. Ein `SET username = NULL` liess die
   * ganze Transaktion zurueckrollen:
   *
   *   null value in column "username" of relation "login_attempts"
   *   violates not-null constraint
   *
   * Da jedes Geraet Anmeldeversuche hat, ist das kein Sonderfall: die Loeschung
   * nach Art. 17 scheiterte daran IMMER. Gefunden auf dem Pruefstand, nachdem
   * der Fremdschluessel auf `knowledge_spaces` behoben war und die naechste
   * Schicht sichtbar wurde.
   */
  test('login_attempts bekommt einen Platzhalter statt NULL', async () => {
    const { sqls } = await loeschen();
    const zeile = sqls.find(s2 => s2.includes('UPDATE login_attempts'));
    expect(zeile).toBeDefined();
    expect(zeile).not.toMatch(/SET username = NULL/);
    expect(zeile).toMatch(/SET username = \$2/);
  });

  test('die anderen Trails bleiben bei NULL, dort ist die Spalte nullable', async () => {
    // Nicht alles gleichmachen: `audit_logs.user_id` darf NULL sein, und ein
    // Platzhalter waere dort eine Zahl, die es nicht gibt.
    const { sqls } = await loeschen();
    expect(sqls.some(s2 => s2.includes('UPDATE audit_logs SET user_id = NULL'))).toBe(true);
  });

});
