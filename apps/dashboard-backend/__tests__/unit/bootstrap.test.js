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

  test('runs migrations then ensures admin user', async () => {
    await bootstrap();

    expect(runMigrations).toHaveBeenCalledWith(db.pool);
    expect(db.query).toHaveBeenCalled(); // ensureAdminUser
  });

  test('continues to admin user creation even if migrations fail', async () => {
    runMigrations.mockRejectedValueOnce(new Error('migration error'));

    await bootstrap();

    // Should still try ensureAdminUser
    expect(db.query).toHaveBeenCalled();
  });
});
