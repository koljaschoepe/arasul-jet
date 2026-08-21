/**
 * Die Detailseite zeigt die AUSGABEgeschwindigkeit, nicht Ende zu Ende
 * (Plan 023 D2, korrigiert am 21.08.2026).
 *
 * `model_performance_metrics.tokens_per_second` ist eine erzeugte Spalte:
 * tokens_generated / total_duration_ms. Und `total_duration_ms` ist die
 * Wanduhrzeit des ganzen Stroms, also Warten auf die GPU, Kaltstart,
 * Vorverarbeitung und Erzeugung zusammen. Auf der Detailseite steht daneben
 * "Gemessen auf diesem Geraet", und das las sich als Modelleigenschaft.
 *
 * Am Orin gemessen, was das ausmacht:
 *
 *   Modell             heute angezeigt   richtig
 *   qwen3-coder:30b            6,6         28,8
 *   qwen3:14b-q8               2,1         12,1
 *   qwen3:7b-q8               16,9         23,7
 *
 * Die Katalogbeschreibung von qwen3-coder nennt "~35 tok/s auf dem Orin";
 * warm gemessen sind es 41,9. Die Beschreibung hatte also recht, die Anzeige
 * nicht.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { createModelService } = require('../../src/services/llm/modelService');

function dienstMit(query) {
  return createModelService({
    database: { query },
    logger: require('../../src/utils/logger'),
    axios: { get: jest.fn(), post: jest.fn() },
  });
}

describe('getCatalog, gemessene Geschwindigkeit', () => {
  test('rechnet die Zeit NACH dem ersten Token, nicht die ganze Dauer', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await dienstMit(query).getCatalog();

    const [sql] = query.mock.calls[0];
    expect(sql).toContain('m.total_duration_ms');
    expect(sql).toContain('COALESCE(m.time_to_first_token_ms, 0)');
    // Die erzeugte Spalte darf NICHT mehr die Grundlage sein.
    expect(sql).not.toMatch(/ORDER BY m\.tokens_per_second/);
  });

  test('nimmt nur Laeufe, aus denen sich eine Rate rechnen laesst', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await dienstMit(query).getCatalog();

    const [sql] = query.mock.calls[0];
    expect(sql).toContain('m.tokens_generated > 0');
    // Ohne diese Bedingung teilte die Rechnung durch null, sobald ein Lauf
    // schneller war als seine eigene Zeitmessung.
    expect(sql).toContain('- COALESCE(m.time_to_first_token_ms, 0) > 0');
  });

  test('bleibt beim Median und nennt die Zahl der Messungen', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await dienstMit(query).getCatalog();

    const [sql] = query.mock.calls[0];
    expect(sql).toContain('percentile_cont(0.5)');
    expect(sql).toContain('count(*) AS messungen');
  });
});
