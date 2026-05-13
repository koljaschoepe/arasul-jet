/**
 * Unit tests for systemSettingsService (P3).
 *
 * Covers:
 *  - load() populates the cache from a single row
 *  - load() falls back gracefully when migration 094 has not run (column missing)
 *  - get / getNumber / getBool return cached values
 *  - get / getNumber / getBool fall back to the provided default for NULL / unknown keys
 *  - _setForTest seeds the cache without hitting the DB
 */

// Mock database BEFORE requiring the service
jest.mock('../../src/database', () => ({
  query: jest.fn(),
}));

// Silence logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../../src/database');
const systemSettings = require('../../src/services/system-settings/systemSettingsService');

beforeEach(() => {
  jest.clearAllMocks();
  // Reset the in-memory cache between tests via the test helper
  systemSettings._setForTest({});
});

describe('systemSettingsService.load', () => {
  test('populates cache from system_settings row', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          rag_top_k: 12,
          rag_final_k: 5,
          rag_score_threshold: 0.4,
          rag_relevance_threshold: 0.6,
          rag_rerank_enabled: true,
          rag_timeout_rerank_ms: 6000,
          llm_num_ctx_default: 4096,
          llm_keep_alive_seconds: 1800,
          llm_num_predict_default: 1024,
        },
      ],
    });

    await systemSettings.load();

    expect(systemSettings.get('rag_top_k')).toBe(12);
    expect(systemSettings.getNumber('rag_score_threshold', 99)).toBe(0.4);
    expect(systemSettings.getBool('rag_rerank_enabled', false)).toBe(true);
    expect(systemSettings.getNumber('llm_keep_alive_seconds', -1)).toBe(1800);
  });

  test('treats NULL columns as absent and returns the fallback', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          rag_top_k: 10,
          rag_final_k: 4,
          rag_score_threshold: null,
          rag_relevance_threshold: null,
          rag_rerank_enabled: null,
          rag_timeout_rerank_ms: null,
          llm_num_ctx_default: null,
          llm_keep_alive_seconds: null,
          llm_num_predict_default: null,
        },
      ],
    });

    await systemSettings.load();

    expect(systemSettings.getNumber('llm_num_ctx_default', 8192)).toBe(8192);
    expect(systemSettings.getBool('rag_rerank_enabled', false)).toBe(false);
    expect(systemSettings.getNumber('llm_keep_alive_seconds', 3600)).toBe(3600);
  });

  test('survives pre-migration boot (column does not exist)', async () => {
    const err = new Error('column "rag_top_k" does not exist');
    err.code = '42703';
    db.query.mockRejectedValueOnce(err);

    await expect(systemSettings.load()).resolves.toBeUndefined();
    expect(systemSettings.getNumber('rag_top_k', 10)).toBe(10);
  });

  test('survives empty system_settings table', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await systemSettings.load();
    expect(systemSettings.getNumber('rag_top_k', 10)).toBe(10);
  });
});

describe('systemSettingsService getters', () => {
  test('get returns the cached value', () => {
    systemSettings._setForTest({ rag_top_k: 7 });
    expect(systemSettings.get('rag_top_k')).toBe(7);
  });

  test('get returns the fallback for unknown keys', () => {
    systemSettings._setForTest({});
    expect(systemSettings.get('does_not_exist', 'default-value')).toBe('default-value');
  });

  test('getNumber coerces strings', () => {
    systemSettings._setForTest({ rag_score_threshold: '0.42' });
    expect(systemSettings.getNumber('rag_score_threshold', 1)).toBeCloseTo(0.42);
  });

  test('getNumber falls back for non-numeric values', () => {
    systemSettings._setForTest({ rag_top_k: 'not-a-number' });
    expect(systemSettings.getNumber('rag_top_k', 10)).toBe(10);
  });

  test('getBool coerces string booleans', () => {
    systemSettings._setForTest({ rag_rerank_enabled: 'false' });
    expect(systemSettings.getBool('rag_rerank_enabled', true)).toBe(false);
  });
});
