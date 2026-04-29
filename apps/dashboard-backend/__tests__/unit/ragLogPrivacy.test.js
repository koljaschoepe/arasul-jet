/**
 * Phase 5.2 — DSGVO-konformes RAG-Query-Logging.
 *
 * ragMetrics.logRagQuery() darf per Default keinen Plaintext (query_text)
 * persistieren — query_hash + query_length + query_language ersetzen ihn
 * für Aggregat-Stats. Plaintext nur über RAG_LOG_QUERY_TEXT_PLAINTEXT=true
 * (Debug-Override).
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

const db = require('../../src/database');
const { logRagQuery } = require('../../src/services/rag/ragMetrics');

function flushSetImmediate() {
  return new Promise(resolve => setImmediate(resolve));
}

const SAMPLE_QUERY = 'Wie hoch war der Umsatz im vierten Quartal?';

// Param-Reihenfolge im INSERT:
// [0]conversationId, [1]userId, [2]query_text, [3]query_hash,
// [4]query_length, [5]query_language, ...
const IDX_QUERY_TEXT = 2;
const IDX_QUERY_HASH = 3;
const IDX_QUERY_LENGTH = 4;
const IDX_QUERY_LANGUAGE = 5;

describe('ragMetrics.logRagQuery — DSGVO defaults', () => {
  beforeEach(() => {
    db.query.mockClear();
    delete process.env.RAG_LOG_QUERY_TEXT_PLAINTEXT;
  });

  test('persistiert query_text=NULL und SHA-256-hash by default', async () => {
    logRagQuery({
      conversationId: 1,
      userId: 2,
      queryText: SAMPLE_QUERY,
      sources: [],
      latencyMs: 42,
    });
    await flushSetImmediate();

    expect(db.query).toHaveBeenCalledTimes(1);
    const params = db.query.mock.calls[0][1];
    expect(params[IDX_QUERY_TEXT]).toBeNull();
    expect(params[IDX_QUERY_HASH]).toMatch(/^[0-9a-f]{64}$/);
    expect(params[IDX_QUERY_LENGTH]).toBe(SAMPLE_QUERY.length);
    expect(params[IDX_QUERY_LANGUAGE]).toBe('de');
  });

  test('Plaintext-Override speichert query_text wenn RAG_LOG_QUERY_TEXT_PLAINTEXT=true', async () => {
    process.env.RAG_LOG_QUERY_TEXT_PLAINTEXT = 'true';
    logRagQuery({
      conversationId: null,
      userId: null,
      queryText: SAMPLE_QUERY,
      sources: [],
      latencyMs: 1,
    });
    await flushSetImmediate();

    const params = db.query.mock.calls[0][1];
    expect(params[IDX_QUERY_TEXT]).toBe(SAMPLE_QUERY);
    expect(params[IDX_QUERY_HASH]).toMatch(/^[0-9a-f]{64}$/);
  });

  test('akzeptiert leeren queryText ohne zu werfen', async () => {
    logRagQuery({ queryText: '', sources: [], latencyMs: 0 });
    await flushSetImmediate();

    const params = db.query.mock.calls[0][1];
    expect(params[IDX_QUERY_TEXT]).toBeNull();
    expect(params[IDX_QUERY_HASH]).toBeNull();
    expect(params[IDX_QUERY_LENGTH]).toBe(0);
    expect(params[IDX_QUERY_LANGUAGE]).toBeNull();
  });

  test('Sprach-Heuristik erkennt Englisch', async () => {
    logRagQuery({
      queryText: 'What is the total revenue for the fourth quarter?',
      sources: [],
      latencyMs: 0,
    });
    await flushSetImmediate();

    const params = db.query.mock.calls[0][1];
    expect(params[IDX_QUERY_LANGUAGE]).toBe('en');
  });

  test('Sprach-Heuristik fällt auf "other" zurück', async () => {
    logRagQuery({
      queryText: 'xyzqq foobar',
      sources: [],
      latencyMs: 0,
    });
    await flushSetImmediate();

    const params = db.query.mock.calls[0][1];
    expect(params[IDX_QUERY_LANGUAGE]).toBe('other');
  });

  test('SHA-256 ist deterministisch — gleicher Text → gleicher Hash', async () => {
    logRagQuery({ queryText: SAMPLE_QUERY, sources: [], latencyMs: 0 });
    await flushSetImmediate();
    logRagQuery({ queryText: SAMPLE_QUERY, sources: [], latencyMs: 0 });
    await flushSetImmediate();

    const hash1 = db.query.mock.calls[0][1][IDX_QUERY_HASH];
    const hash2 = db.query.mock.calls[1][1][IDX_QUERY_HASH];
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  test('verschiedener Plaintext → verschiedene Hashes', async () => {
    logRagQuery({ queryText: SAMPLE_QUERY, sources: [], latencyMs: 0 });
    await flushSetImmediate();
    logRagQuery({ queryText: SAMPLE_QUERY + ' anders', sources: [], latencyMs: 0 });
    await flushSetImmediate();

    expect(db.query.mock.calls[0][1][IDX_QUERY_HASH]).not.toBe(
      db.query.mock.calls[1][1][IDX_QUERY_HASH]
    );
  });
});
