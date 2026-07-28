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

describe('importUnknownModels — Ollama-Modelle ohne Katalog-Eintrag übernehmen', () => {
  function makeImportDeps({ katalogTreffer = [], insertKlappt = true } = {}) {
    const queries = [];
    const database = {
      query: jest.fn(async (sql, params) => {
        queries.push({ sql, params });
        if (/SELECT id FROM llm_model_catalog/i.test(sql)) {
          return { rows: katalogTreffer };
        }
        if (/INSERT INTO llm_model_catalog/i.test(sql)) {
          return { rows: insertKlappt ? [{ id: params[0] }] : [] };
        }
        return { rows: [] };
      }),
    };
    const logger = { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };
    return { database, logger, activeDownloadIds: new Set(), modelAvailabilityCache: new Map(), queries };
  }

  test('legt für ein unbekanntes Modell Katalog- UND Installations-Zeile an', async () => {
    const deps = makeImportDeps();
    const helpers = createSyncHelpers(deps);

    const n = await helpers.importUnknownModels([
      { name: 'llava-phi3:latest', size: 2_900_000_000, details: { families: ['clip'], parameter_size: '3.8B' } },
    ]);

    expect(n).toBe(1);
    const katalogInsert = deps.queries.find(q => /INSERT INTO llm_model_catalog/i.test(q.sql));
    expect(katalogInsert).toBeTruthy();
    // id = tag-lose Form, Vision-Heuristik greift, Kategorie aus der Größe.
    expect(katalogInsert.params[0]).toBe('llava-phi3');
    expect(katalogInsert.params[6]).toBe('vision');
    expect(katalogInsert.params[5]).toBe('small');
    expect(deps.queries.some(q => /INSERT INTO llm_installed_models/i.test(q.sql))).toBe(true);
  });

  test('überspringt Modelle, die der Katalog schon kennt (ollama_name ODER id)', async () => {
    const deps = makeImportDeps({ katalogTreffer: [{ id: 'qwen3:7b-q8' }] });
    const helpers = createSyncHelpers(deps);

    const n = await helpers.importUnknownModels([{ name: 'qwen3:8b', size: 5_000_000_000 }]);

    expect(n).toBe(0);
    expect(deps.queries.some(q => /INSERT INTO/i.test(q.sql))).toBe(false);
  });

  test('verliert im Wettlauf (ON CONFLICT DO NOTHING) keine Installations-Zeile an Fremde', async () => {
    const deps = makeImportDeps({ insertKlappt: false });
    const helpers = createSyncHelpers(deps);

    const n = await helpers.importUnknownModels([{ name: 'neues-modell', size: 1_000_000_000 }]);

    expect(n).toBe(0);
    expect(deps.queries.some(q => /INSERT INTO llm_installed_models/i.test(q.sql))).toBe(false);
  });

  test('ohne Namen/leere Liste passiert nichts', async () => {
    const deps = makeImportDeps();
    const helpers = createSyncHelpers(deps);
    expect(await helpers.importUnknownModels([])).toBe(0);
    expect(await helpers.importUnknownModels([{}])).toBe(0);
    expect(deps.database.query).not.toHaveBeenCalled();
  });
});
