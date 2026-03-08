/**
 * Migration Runner Unit Tests
 */

const fs = require('fs');

jest.mock('fs');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { runMigrations, extractVersion, getMigrationFiles } = require('../../src/migrationRunner');

describe('extractVersion', () => {
  test('extracts version from standard filename', () => {
    expect(extractVersion('005_chat_schema.sql')).toBe(5);
    expect(extractVersion('047_telegram_rag.sql')).toBe(47);
    expect(extractVersion('000_schema_migrations.sql')).toBe(0);
  });

  test('extracts version from sub-version filename', () => {
    expect(extractVersion('032a_create_data_database.sh')).toBe(32);
  });

  test('returns null for invalid filenames', () => {
    expect(extractVersion('readme.md')).toBeNull();
    expect(extractVersion('no_number.sql')).toBeNull();
  });
});

describe('getMigrationFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns empty array when dir does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    expect(getMigrationFiles()).toEqual([]);
  });

  test('filters and sorts SQL files by version', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue([
      '005_chat.sql',
      '001_init.sql',
      'readme.md',
      '032a_data.sh',
      '010_alerts.sql',
    ]);

    const files = getMigrationFiles();
    expect(files).toHaveLength(3);
    expect(files[0].filename).toBe('001_init.sql');
    expect(files[1].filename).toBe('005_chat.sql');
    expect(files[2].filename).toBe('010_alerts.sql');
  });
});

describe('runMigrations', () => {
  let mockClient;
  let mockPool;
  let queryResults;
  let callIndex;

  beforeEach(() => {
    jest.clearAllMocks();
    callIndex = 0;
    queryResults = [];

    mockClient = {
      query: jest.fn().mockImplementation((...args) => {
        const result = queryResults[callIndex] || { rows: [] };
        callIndex++;
        if (result instanceof Error) return Promise.reject(result);
        return Promise.resolve(result);
      }),
      release: jest.fn(),
    };
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    fs.existsSync.mockReturnValue(false);
  });

  test('returns zeros when no migration files found', async () => {
    queryResults = [
      {}, // SET statement_timeout
      {}, // CREATE TABLE schema_migrations
    ];

    const result = await runMigrations(mockPool);
    expect(result).toEqual({ applied: 0, skipped: 0, failed: null });
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('seeds existing database and skips all', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['001_init.sql', '005_chat.sql']);
    fs.readFileSync.mockReturnValue('SELECT 1;');

    queryResults = [
      {}, // SET statement_timeout
      {}, // CREATE TABLE schema_migrations
      { rows: [{ count: '1' }] }, // seedExisting: COUNT schema_migrations (only version 0)
      { rows: [{ count: '2' }] }, // seedExisting: core tables check (admin_users, chats exist)
      { rows: [] }, // seedExisting: SELECT for version 1 (not tracked)
      {}, // seedExisting: INSERT version 1
      { rows: [] }, // seedExisting: SELECT for version 5 (not tracked)
      {}, // seedExisting: INSERT version 5
      { rows: [{ version: 0 }, { version: 1 }, { version: 5 }] }, // getAppliedVersions
    ];

    const result = await runMigrations(mockPool);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(2);
  });

  test('skips already-applied migrations', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['001_init.sql', '005_chat.sql']);

    queryResults = [
      {}, // SET statement_timeout
      {}, // CREATE TABLE schema_migrations
      { rows: [{ count: '48' }] }, // seedExisting: COUNT (>5, skip seed)
      { rows: [{ version: 1 }, { version: 5 }] }, // getAppliedVersions
    ];

    const result = await runMigrations(mockPool);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.failed).toBeNull();
  });

  test('applies unapplied migration in transaction', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['001_init.sql']);
    fs.readFileSync.mockReturnValue('CREATE TABLE test (id INT);');

    queryResults = [
      {}, // SET statement_timeout
      {}, // CREATE TABLE schema_migrations
      { rows: [{ count: '48' }] }, // seedExisting: COUNT (>5, skip seed)
      { rows: [] }, // getAppliedVersions (empty)
      {}, // BEGIN
      {}, // SQL content
      {}, // INSERT INTO schema_migrations
      {}, // COMMIT
    ];

    const result = await runMigrations(mockPool);
    expect(result.applied).toBe(1);
    expect(result.failed).toBeNull();

    const calls = mockClient.query.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : '');
    expect(calls).toContain('BEGIN');
    expect(calls).toContain('COMMIT');
  });

  test('rolls back and stops on failure', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['001_init.sql', '005_chat.sql']);
    fs.readFileSync.mockReturnValue('INVALID SQL;');

    queryResults = [
      {}, // SET statement_timeout
      {}, // CREATE TABLE schema_migrations
      { rows: [{ count: '48' }] }, // seedExisting: COUNT (>5, skip seed)
      { rows: [] }, // getAppliedVersions (empty)
      {}, // BEGIN
      new Error('syntax error'), // SQL fails
      {}, // ROLLBACK
      {}, // INSERT failure record
    ];

    const result = await runMigrations(mockPool);
    expect(result.applied).toBe(0);
    expect(result.failed).toBe('001_init.sql');
  });
});
