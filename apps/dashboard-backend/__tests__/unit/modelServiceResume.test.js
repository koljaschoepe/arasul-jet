/**
 * resumePausedDownloads (Plan 009) — Wiederaufnahme pausierter Modell-Downloads.
 * Prüft: genau ein Download zur Zeit, Versuchszähler, hartes Budget-Limit
 * (kein Endlos-Retry), No-op ohne pausierte Einträge.
 */
jest.mock('../../src/services/core/cacheService', () => ({
  invalidate: jest.fn(),
  invalidatePattern: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
}));

const { createModelService } = require('../../src/services/llm/modelService');

function makeService(pausedRows) {
  const queries = [];
  const database = {
    query: jest.fn(async (sql, params) => {
      queries.push({ sql, params });
      // Der SELECT der pausierten Downloads liefert die Testzeilen.
      if (/SELECT/i.test(sql) && /i\.status = 'paused'/i.test(sql)) {
        return { rows: pausedRows };
      }
      return { rows: [] };
    }),
  };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const service = createModelService({ database, logger, axios: {} });
  // downloadModel läuft real Stunden — für den Test stubben.
  service.downloadModel = jest.fn().mockResolvedValue({ success: true });
  return { service, database, queries };
}

describe('resumePausedDownloads (Plan 009)', () => {
  test('nimmt genau einen pausierten Download wieder auf und zählt den Versuch', async () => {
    const { service, queries } = makeService([{ id: 'qwen', attempt_count: 1 }]);

    const n = await service.resumePausedDownloads();

    expect(n).toBe(1);
    expect(service.downloadModel).toHaveBeenCalledTimes(1);
    expect(service.downloadModel).toHaveBeenCalledWith('qwen');
    // Versuchszähler erhöht, kein 'error'.
    expect(queries.some(q => /attempt_count = COALESCE\(attempt_count, 0\) \+ 1/i.test(q.sql))).toBe(
      true
    );
    expect(queries.some(q => /SET\s+status = 'error'/i.test(q.sql))).toBe(false);
  });

  test('gibt bei erschöpftem Budget auf → status error, kein Download', async () => {
    const { service, queries } = makeService([{ id: 'qwen', attempt_count: 5 }]);

    const n = await service.resumePausedDownloads();

    expect(n).toBe(0);
    expect(service.downloadModel).not.toHaveBeenCalled();
    expect(queries.some(q => /status = 'error'/i.test(q.sql))).toBe(true);
  });

  test('ohne pausierte Downloads passiert nichts', async () => {
    const { service } = makeService([]);

    const n = await service.resumePausedDownloads();

    expect(n).toBe(0);
    expect(service.downloadModel).not.toHaveBeenCalled();
  });
});
