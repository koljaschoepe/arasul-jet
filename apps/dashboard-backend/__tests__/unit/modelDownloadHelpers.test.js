/**
 * modelDownloadHelpers — verifyDownloadComplete retry logic (T03/T16).
 *
 * Regression guard for the false-error race: a genuinely-pulled model that is
 * not yet listed in Ollama's /api/tags on the first check must NOT be flagged
 * as `error`. The verify polls with retries and only errors once Ollama is
 * reachable but the model stays absent through every attempt.
 */

const { createDownloadHelpers } = require('../../src/services/llm/modelDownloadHelpers');

function makeDeps() {
  const database = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const axios = { get: jest.fn() };
  const modelAvailabilityCache = new Map();
  return { database, logger, axios, modelAvailabilityCache };
}

const tags = names => ({ data: { models: names.map(name => ({ name })) } });

describe('verifyDownloadComplete', () => {
  it('does NOT flag error when the model appears after an initially-empty tags list', async () => {
    const deps = makeDeps();
    // First check: model absent (Ollama not caught up). Second check: present.
    deps.axios.get
      .mockResolvedValueOnce(tags([]))
      .mockResolvedValueOnce(tags(['qwen3:7b']));

    const { verifyDownloadComplete } = createDownloadHelpers(deps);
    const ok = await verifyDownloadComplete('qwen3-7b', 'qwen3:7b', { retries: 3, delayMs: 0 });

    expect(ok).toBe(true);
    expect(deps.axios.get).toHaveBeenCalledTimes(2);
    // No error write to the DB — the pull really succeeded.
    expect(deps.database.query).not.toHaveBeenCalled();
  });

  it('returns true immediately when the model is present on the first check', async () => {
    const deps = makeDeps();
    deps.axios.get.mockResolvedValue(tags(['qwen3:7b']));

    const { verifyDownloadComplete } = createDownloadHelpers(deps);
    const ok = await verifyDownloadComplete('qwen3-7b', 'qwen3:7b', { retries: 5, delayMs: 0 });

    expect(ok).toBe(true);
    expect(deps.axios.get).toHaveBeenCalledTimes(1);
    expect(deps.database.query).not.toHaveBeenCalled();
  });

  it('flags error only after Ollama stays reachable-but-empty through every retry', async () => {
    const deps = makeDeps();
    deps.axios.get.mockResolvedValue(tags([])); // never lists the model

    const { verifyDownloadComplete } = createDownloadHelpers(deps);
    const ok = await verifyDownloadComplete('ghost', 'ghost:1b', { retries: 3, delayMs: 0 });

    expect(ok).toBe(false);
    expect(deps.axios.get).toHaveBeenCalledTimes(3);
    expect(deps.database.query).toHaveBeenCalledTimes(1);
    const [sql, params] = deps.database.query.mock.calls[0];
    expect(sql).toMatch(/status = 'error'/);
    expect(params[1]).toBe('ghost');
  });

  it('assumes success (no error) when Ollama itself is unreachable', async () => {
    const deps = makeDeps();
    deps.axios.get.mockRejectedValue(new Error('ECONNREFUSED'));

    const { verifyDownloadComplete } = createDownloadHelpers(deps);
    const ok = await verifyDownloadComplete('qwen3-7b', 'qwen3:7b', { retries: 3, delayMs: 0 });

    expect(ok).toBe(true);
    expect(deps.database.query).not.toHaveBeenCalled();
  });
});
