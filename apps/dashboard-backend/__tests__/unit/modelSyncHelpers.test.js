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

describe('Der Abgleich traegt Modelle nach, die nur bei Ollama liegen (M5)', () => {
  const steckbrief = {
    parameterLabel: '25.2B',
    quantization: 'Q4_K_M',
    license: 'Apache License 2.0',
    contextLength: 262144,
    supportsTools: true,
    supportsVision: true,
    capabilities: ['completion', 'vision', 'tools', 'thinking'],
  };

  function bauen(katalogZeilen, sb = steckbrief) {
    const deps = makeDeps();
    deps.database.query = jest.fn(async (sql, params) => {
      deps.queries.push({ sql, params });
      if (/SELECT id FROM llm_model_catalog/i.test(sql)) {
        return { rows: katalogZeilen.filter(z => params[0].includes(z)).map(id => ({ id })) };
      }
      return { rows: [], rowCount: 1 };
    });
    deps.leseSteckbrief = jest.fn(async () => sb);
    return deps;
  }

  test('unbekanntes Modell wird mit Groesse und Faehigkeiten angelegt', async () => {
    const deps = bauen([]);
    const helpers = createSyncHelpers(deps);

    const neu = await helpers.traegNachModelle([{ name: 'gemma4:26b', size: 18e9 }]);

    expect(neu).toEqual(['gemma4:26b']);
    const insert = deps.queries.find(q => /INSERT INTO llm_model_catalog/i.test(q.sql));
    expect(insert.sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
    expect(insert.params[0]).toBe('gemma4:26b');
    expect(insert.params[3]).toBe(18e9);
    expect(insert.params).toEqual(expect.arrayContaining([true, 262144, 'Q4_K_M']));
  });

  test('ein Modell mit Bild UND completion wird ein Textmodell, das Bilder liest', async () => {
    const deps = bauen([]);
    const helpers = createSyncHelpers(deps);

    await helpers.traegNachModelle([{ name: 'gemma4:26b', size: 18e9 }]);

    const insert = deps.queries.find(q => /INSERT INTO llm_model_catalog/i.test(q.sql));
    // $8 model_type, $9 task, $12 supports_vision_input
    expect(insert.params[7]).toBe('llm');
    expect(insert.params[8]).toBe('text');
    expect(insert.params[11]).toBe(true);
  });

  test('nur wenn Ollama kein completion meldet, wird es ein Bildmodell', async () => {
    const deps = bauen([], { ...steckbrief, capabilities: ['vision'] });
    const helpers = createSyncHelpers(deps);

    await helpers.traegNachModelle([{ name: 'nur-bild:1b', size: 1e9 }]);

    const insert = deps.queries.find(q => /INSERT INTO llm_model_catalog/i.test(q.sql));
    expect(insert.params[7]).toBe('vision');
    expect(insert.params[8]).toBe('vision');
  });

  test('bekannte Zeile (auch als :latest) wird nicht angefasst', async () => {
    const deps = bauen(['nomic-embed-text']);
    const helpers = createSyncHelpers(deps);

    const neu = await helpers.traegNachModelle([{ name: 'nomic-embed-text:latest', size: 274e6 }]);

    expect(neu).toEqual([]);
    expect(deps.leseSteckbrief).not.toHaveBeenCalled();
    expect(deps.queries.some(q => /INSERT|UPDATE/i.test(q.sql))).toBe(false);
  });

  test('ohne lesbaren Steckbrief wird nichts geraten', async () => {
    const deps = bauen([], null);
    const helpers = createSyncHelpers(deps);

    expect(await helpers.traegNachModelle([{ name: 'x:1b', size: 1 }])).toEqual([]);
    expect(deps.queries.some(q => /INSERT/i.test(q.sql))).toBe(false);
  });

  test('createSyncHelpers bietet importUnknownModels weiter nicht an', () => {
    expect(createSyncHelpers(makeDeps()).importUnknownModels).toBeUndefined();
  });
});
