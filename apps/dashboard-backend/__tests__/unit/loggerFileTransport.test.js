/**
 * Tests for utils/logger.js file-rotation transport.
 *
 * NODE_ENV=test (set in jest.setup.js) means file transport is OFF by default.
 * We force it on via LOG_FILE_ENABLED=true and verify the rotation transport
 * is wired up; we don't actually write files (the transport instance only
 * touches disk when log() is called and the dirname exists).
 */

const path = require('path');

const FRESH_LOAD = (envOverrides = {}) => {
  jest.resetModules();
  const prev = {};
  for (const [k, v] of Object.entries(envOverrides)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  // eslint-disable-next-line global-require
  const logger = require('../../src/utils/logger');
  // restore on next teardown
  return { logger, restore: () => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  } };
};

describe('utils/logger', () => {
  let restoreFn = () => {};
  afterEach(() => {
    restoreFn();
    restoreFn = () => {};
  });

  it('only registers the Console transport in NODE_ENV=test by default', () => {
    const { logger, restore } = FRESH_LOAD({
      LOG_FILE_ENABLED: undefined, // honor NODE_ENV=test default
    });
    restoreFn = restore;

    expect(logger.transports).toHaveLength(1);
    expect(logger.transports[0].name).toBe('console');
  });

  it('registers Console + 2× DailyRotateFile when LOG_FILE_ENABLED=true', () => {
    const { logger, restore } = FRESH_LOAD({
      LOG_FILE_ENABLED: 'true',
      LOG_DIR: path.join('/tmp', 'arasul-logger-test'),
    });
    restoreFn = restore;

    expect(logger.transports).toHaveLength(3);
    const names = logger.transports.map((t) => t.name);
    expect(names).toContain('console');

    const rotate = logger.transports.filter((t) => t.constructor.name === 'DailyRotateFile');
    expect(rotate).toHaveLength(2);

    // Filenames are rendered with the date pattern, so we match the prefix.
    const filenames = rotate.map((t) => t.filename);
    expect(filenames.some((f) => f.startsWith('backend-'))).toBe(true);
    expect(filenames.some((f) => f.startsWith('backend-error-'))).toBe(true);

    // Error-only stream is level-filtered.
    const errorStream = rotate.find((t) => t.filename.startsWith('backend-error-'));
    expect(errorStream.level).toBe('error');

    // Default retention 14d, gzip on.
    expect(rotate[0].options.maxFiles).toBe('14d');
    expect(rotate[0].options.zippedArchive).toBe(true);
  });

  it('honors LOG_RETENTION_DAYS and LOG_MAX_SIZE env overrides', () => {
    const { logger, restore } = FRESH_LOAD({
      LOG_FILE_ENABLED: 'true',
      LOG_DIR: path.join('/tmp', 'arasul-logger-test'),
      LOG_RETENTION_DAYS: '30',
      LOG_MAX_SIZE: '100m',
    });
    restoreFn = restore;

    const rotate = logger.transports.filter((t) => t.constructor.name === 'DailyRotateFile');
    expect(rotate[0].options.maxFiles).toBe('30d');
    expect(rotate[0].options.maxSize).toBe('100m');
  });

  it('respects LOG_FILE_ENABLED=false even outside NODE_ENV=test', () => {
    const { logger, restore } = FRESH_LOAD({
      LOG_FILE_ENABLED: 'false',
      NODE_ENV: 'production',
    });
    restoreFn = restore;

    expect(logger.transports).toHaveLength(1);
    expect(logger.transports[0].name).toBe('console');
  });
});
