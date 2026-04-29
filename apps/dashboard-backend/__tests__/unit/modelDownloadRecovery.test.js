/**
 * Phase 0 — Download Persistence & Crash-Recovery
 *
 * Plan reference: docs/plans/LLM_RAG_N8N_HARDENING.md (Phase 0)
 *
 * Targets the new behaviour added by Phase 0:
 *   - cleanupStaleDownloads decides paused-vs-error from bytes_completed
 *   - markPausedOrError applies the same rule from the streaming path
 *   - listResumableDownloads surfaces only 'paused' rows
 *   - DELETE /api/models/:modelId/download semantics
 *
 * The full downloadModel path (axios stream + Ollama) is exercised by the
 * existing models.test.js + integration suite; this file is intentionally
 * narrow so a regression in the recovery rules fails loudly.
 */

const { createSyncHelpers } = require('../../src/services/llm/modelSyncHelpers');
const { createDownloadHelpers } = require('../../src/services/llm/modelDownloadHelpers');

function makeMockDb() {
  return {
    query: jest.fn(),
    transaction: jest.fn(async fn => fn({ query: jest.fn().mockResolvedValue({ rows: [] }) })),
  };
}

function makeMockLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

describe('Phase 0 — cleanupStaleDownloads', () => {
  let database;
  let logger;
  let helpers;
  let activeDownloadIds;
  let modelAvailabilityCache;

  beforeEach(() => {
    database = makeMockDb();
    logger = makeMockLogger();
    activeDownloadIds = new Set();
    modelAvailabilityCache = new Map();
    helpers = createSyncHelpers({
      database,
      logger,
      activeDownloadIds,
      modelAvailabilityCache,
    });
  });

  test('orphaned downloading row WITH bytes → paused (recoverable)', async () => {
    database.query.mockResolvedValueOnce({
      rows: [
        { id: 'qwen3:7b-q8', bytes_completed: 12345678, effective_ollama_name: 'qwen3:7b-q8' },
      ],
    });
    database.query.mockResolvedValueOnce({ rowCount: 1 });

    const res = await helpers.cleanupStaleDownloads([]); // Ollama empty

    expect(res).toEqual({ paused: 1, errored: 0 });
    const updateCall = database.query.mock.calls[1];
    expect(updateCall[0]).toMatch(/status = 'paused'/);
    expect(updateCall[1]).toEqual(['qwen3:7b-q8']);
  });

  test('orphaned downloading row WITHOUT bytes → error', async () => {
    database.query.mockResolvedValueOnce({
      rows: [{ id: 'llama3.1:8b', bytes_completed: 0, effective_ollama_name: 'llama3.1:8b' }],
    });
    database.query.mockResolvedValueOnce({ rowCount: 1 });

    const res = await helpers.cleanupStaleDownloads([]);

    expect(res).toEqual({ paused: 0, errored: 1 });
    const updateCall = database.query.mock.calls[1];
    expect(updateCall[0]).toMatch(/status = 'error'/);
  });

  test('row already present in Ollama → available (success path)', async () => {
    database.query.mockResolvedValueOnce({
      rows: [
        { id: 'gemma2:9b-q8', bytes_completed: 999, effective_ollama_name: 'gemma2:9b-q8' },
      ],
    });
    database.query.mockResolvedValueOnce({ rowCount: 1 });

    const res = await helpers.cleanupStaleDownloads(['gemma2:9b-q8']);

    expect(res).toEqual({ paused: 0, errored: 0 });
    const updateCall = database.query.mock.calls[1];
    expect(updateCall[0]).toMatch(/status = 'available'/);
  });

  test('row owned by THIS process → skipped (no DB write)', async () => {
    activeDownloadIds.add('mistral:7b-q8');
    database.query.mockResolvedValueOnce({
      rows: [
        { id: 'mistral:7b-q8', bytes_completed: 5000, effective_ollama_name: 'mistral:7b-q8' },
      ],
    });

    const res = await helpers.cleanupStaleDownloads([]);

    expect(res).toEqual({ paused: 0, errored: 0 });
    expect(database.query).toHaveBeenCalledTimes(1); // only the SELECT
  });

  test('mixed batch: paused + errored counters are correct', async () => {
    database.query.mockResolvedValueOnce({
      rows: [
        { id: 'a:7b', bytes_completed: 100, effective_ollama_name: 'a:7b' },
        { id: 'b:7b', bytes_completed: 0, effective_ollama_name: 'b:7b' },
        { id: 'c:7b', bytes_completed: 200, effective_ollama_name: 'c:7b' },
      ],
    });
    database.query.mockResolvedValue({ rowCount: 1 });

    const res = await helpers.cleanupStaleDownloads([]); // none in Ollama

    expect(res).toEqual({ paused: 2, errored: 1 });
  });
});

describe('Phase 0 — listResumableDownloads', () => {
  test('returns only paused rows ordered by activity', async () => {
    const database = makeMockDb();
    database.query.mockResolvedValue({
      rows: [
        { id: 'a:7b', bytes_completed: 100, attempt_count: 1, last_error_code: 'STALL' },
        { id: 'b:7b', bytes_completed: 200, attempt_count: 2, last_error_code: 'ECONNRESET' },
      ],
    });
    const helpers = createSyncHelpers({
      database,
      logger: makeMockLogger(),
      activeDownloadIds: new Set(),
      modelAvailabilityCache: new Map(),
    });

    const rows = await helpers.listResumableDownloads();

    expect(rows).toHaveLength(2);
    expect(database.query.mock.calls[0][0]).toMatch(/status = 'paused'/);
  });
});

describe('Phase 0 — markPausedOrError', () => {
  let database;
  let helpers;

  beforeEach(() => {
    database = makeMockDb();
    helpers = createDownloadHelpers({
      database,
      logger: makeMockLogger(),
      axios: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
      modelAvailabilityCache: new Map(),
    });
  });

  test('bytesCompleted > 0 sets status="paused"', async () => {
    await helpers.markPausedOrError('qwen3:7b-q8', {
      bytesCompleted: 1024,
      errorMessage: 'Connection reset',
      errorCode: 'ECONNRESET',
    });
    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(/status = 'paused'/),
      ['Connection reset', 'ECONNRESET', 'qwen3:7b-q8']
    );
  });

  test('bytesCompleted === 0 sets status="error"', async () => {
    await helpers.markPausedOrError('qwen3:7b-q8', {
      bytesCompleted: 0,
      errorMessage: 'Manifest fetch failed',
      errorCode: 'NOT_FOUND',
    });
    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(/status = 'error'/),
      ['Manifest fetch failed', 'NOT_FOUND', 'qwen3:7b-q8']
    );
  });
});

describe('Phase 0 — validateDiskSpace honours resume bytes', () => {
  let database;
  let helpers;
  let mockService;

  beforeEach(() => {
    database = makeMockDb();
    helpers = createDownloadHelpers({
      database,
      logger: makeMockLogger(),
      axios: { get: jest.fn(), post: jest.fn() },
      modelAvailabilityCache: new Map(),
    });
    mockService = {
      getDiskSpace: jest.fn(),
      formatBytes: bytes => `${Math.round(bytes / 1e9)} GB`,
    };
  });

  test('passes when free disk covers ONLY the remaining bytes', async () => {
    // Model is 80GB total, 60GB already on disk → only 20GB still needed.
    // Free disk is 35GB → fits even at 1.5x = 30GB.
    mockService.getDiskSpace.mockResolvedValue({ free: 35 * 1e9, total: 100 * 1e9 });
    await expect(
      helpers.validateDiskSpace(mockService, 80 * 1e9, 60 * 1e9)
    ).resolves.not.toThrow();
  });

  test('fails when remaining bytes do not fit', async () => {
    mockService.getDiskSpace.mockResolvedValue({ free: 5 * 1e9, total: 100 * 1e9 });
    await expect(helpers.validateDiskSpace(mockService, 80 * 1e9, 0)).rejects.toThrow(/Speicherplatz/);
  });
});
