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
      .mockResolvedValueOnce({}); // INSERT

    await ensureAdminUser();

    expect(hashPassword).toHaveBeenCalledWith('testpass');
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[1][0]).toContain('INSERT INTO admin_users');
  });

  test('logs error when ADMIN_PASSWORD not set', async () => {
    delete process.env.ADMIN_PASSWORD;
    db.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    const logger = require('../../src/utils/logger');

    await ensureAdminUser();

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ADMIN_PASSWORD'));
    expect(db.query).toHaveBeenCalledTimes(1); // No INSERT
  });

  test('logs error when ADMIN_PASSWORD is redacted', async () => {
    process.env.ADMIN_PASSWORD = 'REDACTED_AFTER_BOOTSTRAP';
    db.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    const logger = require('../../src/utils/logger');

    await ensureAdminUser();

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ADMIN_PASSWORD'));
    expect(db.query).toHaveBeenCalledTimes(1); // No INSERT
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
