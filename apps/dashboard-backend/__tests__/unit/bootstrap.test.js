/**
 * Bootstrap Unit Tests
 */

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  pool: {},
}));

jest.mock('../../src/utils/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('$2b$12$hashed'),
}));

jest.mock('../../src/migrationRunner', () => ({
  runMigrations: jest.fn().mockResolvedValue({ applied: 0, skipped: 5, failed: null }),
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../../src/database');
const { hashPassword } = require('../../src/utils/password');
const { runMigrations } = require('../../src/migrationRunner');
const logger = require('../../src/utils/logger');
const { bootstrap, ensureAdminUser } = require('../../src/bootstrap');

describe('ensureAdminUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_PASSWORD = 'testpass';
    process.env.ADMIN_USERNAME = 'admin';
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_USERNAME;
  });

  test('skips when admin users already exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });

    await ensureAdminUser();

    // Should only have done the COUNT query
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('creates admin user when table is empty', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // COUNT
      .mockResolvedValueOnce({ rows: [{ werksreset_am: null }] }) // Merker
      .mockResolvedValueOnce({}); // INSERT

    await ensureAdminUser();

    expect(hashPassword).toHaveBeenCalledWith('testpass');
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.query.mock.calls[2][0]).toContain('INSERT INTO admin_users');
  });

  test('logs error when ADMIN_PASSWORD not set', async () => {
    delete process.env.ADMIN_PASSWORD;
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ werksreset_am: null }] });
    const logger = require('../../src/utils/logger');

    await ensureAdminUser();

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ADMIN_PASSWORD'));
    expect(db.query).toHaveBeenCalledTimes(2); // No INSERT
  });

  test('logs error when ADMIN_PASSWORD is redacted', async () => {
    process.env.ADMIN_PASSWORD = 'REDACTED_AFTER_BOOTSTRAP';
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ werksreset_am: null }] });
    const logger = require('../../src/utils/logger');

    await ensureAdminUser();

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ADMIN_PASSWORD'));
    expect(db.query).toHaveBeenCalledTimes(2); // No INSERT
  });

  /**
   * Der zweite Weg zum alten Passwort, gefunden in der Live-Abnahme am
   * 19.08.2026. Der Werksreset entwertet ADMIN_PASSWORD in der .env, aber
   * compose reicht dasselbe Passwort zusaetzlich als Docker-Secret durch
   * (ADMIN_PASSWORD_FILE), und resolveSecrets setzt process.env daraus. Der
   * naechste Start legte damit den alten Zugang wieder an: ein
   * zurueckgesetztes und weitergegebenes Geraet liesse sich vom Vorbesitzer
   * weiter oeffnen.
   */
  test('legt nach einem Werksreset keinen Administrator an, auch mit gueltigem Passwort', async () => {
    process.env.ADMIN_PASSWORD = 'das-alte-passwort';
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ werksreset_am: '2026-08-19T21:00:00Z' }] });
    const logger = require('../../src/utils/logger');

    await ensureAdminUser();

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Ersteinrichtung'));
  });

  test('ohne die Merker-Tabelle bleibt es beim Verhalten von vorher', async () => {
    // Sehr alte Datenbank, Migration 146 noch nicht gelaufen.
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockRejectedValueOnce(new Error('relation "arasul.geraet" does not exist'))
      .mockResolvedValueOnce({});

    await ensureAdminUser();

    expect(db.query.mock.calls[2][0]).toContain('INSERT INTO admin_users');
  });

  test('handles missing table gracefully', async () => {
    db.query.mockRejectedValueOnce(new Error('relation "admin_users" does not exist'));
    const logger = require('../../src/utils/logger');

    await ensureAdminUser();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not yet created'));
  });
});

describe('bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_PASSWORD = 'testpass';
    db.query.mockResolvedValue({ rows: [{ count: '1' }] });
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  // ensureAdminUser fragt als Erstes die Zahl der Administratoren ab. Andere
  // Bootstrap-Schritte reden ebenfalls mit der Datenbank, deshalb wird nicht
  // "wurde db.query gerufen" geprueft, sondern genau diese Abfrage.
  const adminZaehlungLief = () =>
    db.query.mock.calls.some(([sql]) => typeof sql === 'string' && sql.includes('FROM admin_users'));

  test('runs migrations then ensures admin user', async () => {
    await bootstrap();

    expect(runMigrations).toHaveBeenCalledWith(db.pool);
    expect(adminZaehlungLief()).toBe(true);
  });

  // Bis zum 20.08.2026 stand hier das Gegenteil ("continues to admin user
  // creation even if migrations fail"). Der Test hat den Fehler nicht
  // uebersehen, er hat ihn festgeschrieben. Was daran haengt, steht in
  // bootstrap.js ueber `schemaKaputt`.
  test('legt keinen Administrator an, wenn eine Migration gescheitert ist', async () => {
    runMigrations.mockResolvedValueOnce({
      applied: 5,
      skipped: 0,
      failed: '006_llm_jobs_schema.sql',
      schatten: [],
    });

    await bootstrap();

    expect(adminZaehlungLief()).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('KEIN Administrator ab Werk angelegt')
    );
  });

  test('legt keinen Administrator an, wenn Tabellen doppelt liegen', async () => {
    runMigrations.mockResolvedValueOnce({
      applied: 5,
      skipped: 0,
      failed: null,
      schatten: ['admin_users', 'chat_messages'],
    });

    await bootstrap();

    expect(adminZaehlungLief()).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('admin_users, chat_messages'));
  });

  test('legt keinen Administrator an, wenn der Migrationslauf abbricht', async () => {
    // Der Lauf ist abgebrochen, der Schemastand ist damit unbelegt. Ein Konto
    // mit werksbekanntem Passwort darf dann nicht entstehen.
    runMigrations.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    await bootstrap();

    expect(adminZaehlungLief()).toBe(false);
  });
});
