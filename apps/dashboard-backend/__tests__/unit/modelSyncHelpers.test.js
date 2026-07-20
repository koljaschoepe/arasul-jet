/**
 * modelSyncHelpers — Plan 009: unterbrochene Modell-Downloads werden 'paused'
 * (wiederaufnehmbar) statt 'error' (verworfen). Deckt den Kern der Download-
 * Härtung ab: ein Backend-Neustart mitten im Download darf 30h Arbeit nicht
 * wegwerfen.
 */
const { createSyncHelpers } = require('../../src/services/llm/modelSyncHelpers');

function makeDeps(downloadingRows) {
  const queries = [];
  const database = {
    query: jest.fn(async (sql, params) => {
      queries.push({ sql, params });
      // Nur der SELECT der laufenden Downloads liefert Zeilen zurück.
      if (/WHERE i\.status = 'downloading'/i.test(sql)) {
        return { rows: downloadingRows };
      }
      return { rows: [] };
    }),
  };
  const logger = { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };
  const activeDownloadIds = new Set();
  const modelAvailabilityCache = new Map();
  return { database, logger, activeDownloadIds, modelAvailabilityCache, queries };
}

describe('cleanupStaleDownloads — unterbrochene Downloads pausieren (Plan 009)', () => {
  test("stuck download, nicht in Ollama → status 'paused' (NICHT 'error')", async () => {
    const deps = makeDeps([{ id: 'qwen', effective_ollama_name: 'qwen:latest' }]);
    const helpers = createSyncHelpers(deps);

    const count = await helpers.cleanupStaleDownloads([]); // Ollama hat nichts

    expect(count).toBe(1);
    const pausedUpdate = deps.queries.find(
      q => /UPDATE llm_installed_models/i.test(q.sql) && /status = 'paused'/i.test(q.sql)
    );
    expect(pausedUpdate).toBeTruthy();
    // Es darf KEIN 'error'-Update abgesetzt worden sein.
    expect(deps.queries.some(q => /SET\s+status = 'error'/i.test(q.sql))).toBe(false);
  });

  test('aktiver Download im selben Prozess wird nicht angetastet', async () => {
    const deps = makeDeps([{ id: 'qwen', effective_ollama_name: 'qwen:latest' }]);
    deps.activeDownloadIds.add('qwen');
    const helpers = createSyncHelpers(deps);

    const count = await helpers.cleanupStaleDownloads([]);

    expect(count).toBe(0);
    expect(deps.queries.some(q => /UPDATE llm_installed_models/i.test(q.sql))).toBe(false);
  });

  test("Modell doch in Ollama vorhanden → 'available', kein 'paused'", async () => {
    const deps = makeDeps([{ id: 'qwen', effective_ollama_name: 'qwen:latest' }]);
    const helpers = createSyncHelpers(deps);

    const count = await helpers.cleanupStaleDownloads(['qwen:latest']);

    expect(count).toBe(0);
    expect(deps.queries.some(q => /status = 'available'/i.test(q.sql))).toBe(true);
    expect(deps.queries.some(q => /status = 'paused'/i.test(q.sql))).toBe(false);
  });
});
