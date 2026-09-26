/**
 * Ist ein Modell fuer die Warteschlange da? (J35, 26.09.2026)
 *
 * Der Katalog fuehrt `llava-phi3`, `/api/tags` meldet `llava-phi3:latest`.
 * Der Abgleich kannte das seit dem 27.07.2026, `validateModelAvailability`
 * nicht: das erste Bild an ein Bildmodell ueber `llm/chat` war am Orin ein
 * 503 „ist nicht in Ollama verfuegbar", obwohl `ollama list` es zeigte.
 */
jest.mock('../../src/services/core/cacheService', () => ({
  invalidate: jest.fn(),
  invalidatePattern: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
}));

const { createModelService } = require('../../src/services/llm/modelService');

function dienst(ollamaNamen) {
  const database = {
    query: jest.fn(async (_sql, params) => ({
      rows: [{ effective_ollama_name: params[0] }],
    })),
  };
  const axios = {
    get: jest.fn(async () => ({ data: { models: ollamaNamen.map(name => ({ name })) } })),
  };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return createModelService({ database, logger, axios });
}

describe('validateModelAvailability', () => {
  test('ein Modell ohne Tag ist da, wenn Ollama es als :latest fuehrt', async () => {
    const service = dienst(['llava-phi3:latest', 'qwen3.8:27b-q4_K_M']);
    await expect(service.validateModelAvailability('llava-phi3')).resolves.toEqual({
      available: true,
    });
  });

  test('ein Modell mit Tag bleibt genau', async () => {
    const service = dienst(['qwen3.8:27b-q4_K_M']);
    await expect(service.validateModelAvailability('qwen3.8:27b-q4_K_M')).resolves.toEqual({
      available: true,
    });
    const anderer = await service.validateModelAvailability('qwen3.8:8b');
    expect(anderer.available).toBe(false);
  });

  test('was Ollama nicht hat, ist nicht da', async () => {
    const service = dienst(['gemma4:e4b']);
    const ergebnis = await service.validateModelAvailability('llava-phi3');
    expect(ergebnis.available).toBe(false);
  });
});
