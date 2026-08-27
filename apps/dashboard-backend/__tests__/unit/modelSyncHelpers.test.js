/**
 * modelSyncHelpers — Plan 009: unterbrochene Modell-Downloads werden 'paused'
 * (wiederaufnehmbar) statt 'error' (verworfen). Deckt den Kern der Download-
 * Härtung ab: ein Backend-Neustart mitten im Download darf 30h Arbeit nicht
 * wegwerfen.
 */
const {
  createSyncHelpers,
  tagVarianten,
  inOllama,
} = require('../../src/services/llm/modelSyncHelpers');

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

describe(':latest-Tag-Normalisierung (Live-Bug 2026-07-27)', () => {
  // Ollama listet `nomic-embed-text:latest`, der Katalog speichert
  // `nomic-embed-text` — beides ist DASSELBE Modell und darf nicht als
  // „nicht in Ollama gefunden" enden.
  test('tagVarianten liefert beide Schreibweisen', () => {
    expect(tagVarianten('nomic-embed-text')).toEqual([
      'nomic-embed-text',
      'nomic-embed-text:latest',
    ]);
    expect(tagVarianten('nomic-embed-text:latest')).toEqual([
      'nomic-embed-text:latest',
      'nomic-embed-text',
    ]);
    // Ein expliziter anderer Tag bleibt exakt — qwen3:14b ist NICHT qwen3:14b-q8.
    expect(tagVarianten('qwen3:14b')).toEqual(['qwen3:14b']);
  });

  test('inOllama matcht über die :latest-Grenze in beide Richtungen', () => {
    expect(inOllama(['nomic-embed-text:latest'], 'nomic-embed-text')).toBe(true);
    expect(inOllama(['nomic-embed-text'], 'nomic-embed-text:latest')).toBe(true);
    expect(inOllama(['qwen3:14b'], 'qwen3:14b-q8')).toBe(false);
  });

  test('markMissingModels markiert ein :latest-installiertes Modell NICHT als fehlend', async () => {
    const deps = makeDeps([]);
    deps.database.query = jest.fn(async sql => {
      deps.queries.push({ sql });
      if (/JOIN llm_installed_models/i.test(sql)) {
        return { rows: [{ id: 'nomic-embed-text', effective_ollama_name: 'nomic-embed-text' }] };
      }
      return { rows: [] };
    });
    const helpers = createSyncHelpers(deps);

    await helpers.markMissingModels(['nomic-embed-text:latest']);

    expect(deps.queries.some(q => /status = 'error'/i.test(q.sql))).toBe(false);
  });

  test('cleanupStaleDownloads erkennt einen :latest-Pull als vorhanden', async () => {
    const deps = makeDeps([{ id: 'nomic-embed-text', effective_ollama_name: 'nomic-embed-text' }]);
    const helpers = createSyncHelpers(deps);

    const count = await helpers.cleanupStaleDownloads(['nomic-embed-text:latest']);

    expect(count).toBe(0);
    expect(deps.queries.some(q => /status = 'available'/i.test(q.sql))).toBe(true);
  });
});

describe('Der Abgleich traegt nichts nach (Phase C8)', () => {
  test('createSyncHelpers bietet importUnknownModels nicht mehr an', () => {
    // Der Katalog ist die Kurzliste und kommt aus Migration 175. Ein Abgleich,
    // der jedes Modell aus `ollama list` nachtraegt, haette ihn nach dem
    // naechsten Start wieder aufgefuellt -- genau der Weg, ueber den
    // qwen3:8b/14b/32b und die gemma3-Reste in den Katalog gekommen sind.
    const helpers = createSyncHelpers(makeDeps());
    expect(helpers.importUnknownModels).toBeUndefined();
    expect(Object.keys(helpers).sort()).toEqual([
      'cleanupStaleDownloads',
      'markAvailableModels',
      'markMissingModels',
    ]);
  });
});
