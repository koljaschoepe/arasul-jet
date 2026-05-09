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
  };
});

const db = require('../../src/database');
const auth = require('../../src/middleware/auth');
const gdprRouter = require('../../src/routes/admin/gdpr');
const { errorHandler } = require('../../src/middleware/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/gdpr', gdprRouter);
  app.use(errorHandler);
  return app;
}

describe('DELETE /api/gdpr/me', () => {
  beforeEach(() => {
    // mockReset (statt clearAllMocks) leert auch die mockResolvedValueOnce-Queue,
    // sonst leakt ein nicht-konsumierter Once-Wert in den nächsten Test.
    db.query.mockReset();
    db.transaction.mockReset();
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

  test('blockiert letzten aktiven Admin', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ n: 1 }] });
    const app = buildApp();

    const res = await request(app)
      .delete('/api/gdpr/me')
      .send({ confirm: 'LOESCHEN-BESTAETIGT' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test('führt Löschung in einer Transaction aus, wenn Backup-Admin existiert', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ n: 2 }] });

    // Transaction-Callback simulieren: Client zählt rowCount für jede Query.
    const queryCalls = [];
    const fakeClient = {
      query: jest.fn().mockImplementation((sql, params) => {
        queryCalls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        return Promise.resolve({ rowCount: 1 });
      }),
    };
    db.transaction.mockImplementation(async cb => cb(fakeClient));

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
    expect(sqls.some(s => s.includes('UPDATE login_attempts SET username = NULL'))).toBe(true);

    // Session-Cookie geräumt
    const setCookies = res.headers['set-cookie'] || [];
    const cookieStr = Array.isArray(setCookies) ? setCookies.join('|') : String(setCookies);
    expect(cookieStr).toMatch(/arasul_session=/);
  });

  test('User ohne admin-Rolle braucht keinen Single-Box-Schutz', async () => {
    auth.__setUser({ id: 99, username: 'gast', role: 'user' });
    // count=1 darf den Nicht-Admin nicht blocken — der ist ja kein Admin
    db.query.mockResolvedValueOnce({ rows: [{ n: 1 }] });

    const fakeClient = { query: jest.fn().mockResolvedValue({ rowCount: 0 }) };
    db.transaction.mockImplementation(async cb => cb(fakeClient));

    const app = buildApp();
    const res = await request(app)
      .delete('/api/gdpr/me')
      .send({ confirm: 'LOESCHEN-BESTAETIGT' });

    expect(res.status).toBe(200);
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
