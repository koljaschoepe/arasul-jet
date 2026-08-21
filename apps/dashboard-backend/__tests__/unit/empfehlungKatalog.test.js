/**
 * Die Empfehlung zeigt nur auf Modelle, die es gibt (Plan 023 D5).
 *
 * `utils/hardware.js` traegt eine fest verdrahtete Karte von Geraetetyp auf
 * Modell. Am 21.08.2026 gemessen: ACHT der siebzehn Kennungen darin gibt es im
 * Katalog nicht. Auf einem Xavier NX empfahl der Einrichtungsassistent damit
 * `phi3:mini`, ein Modell, das niemand laden kann.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/database', () => ({ query: jest.fn() }));

const database = require('../../src/database');
const logger = require('../../src/utils/logger');
const { getRecommendedModel } = require('../../src/utils/hardware');

/** Ein Katalog, wie ihn ein frisches Geraet nach Migration 151 hat. */
function katalog(...zeilen) {
  database.query.mockResolvedValue({ rows: zeilen });
}

const STANDARDS = [
  { id: 'gemma4:26b-q4', task: 'text', is_task_default: true },
  { id: 'gemma4:e4b-q4', task: 'text', is_task_default: false },
  { id: 'gemma3:1b', task: 'text', is_task_default: false },
  { id: 'gemma3:4b', task: 'text', is_task_default: false },
  { id: 'deepseek-coder:6.7b', task: 'coding', is_task_default: true },
  { id: 'minicpm-v:8b', task: 'vision', is_task_default: true },
  { id: 'nomic-embed-text', task: 'embedding', is_task_default: true },
];

describe('getRecommendedModel gegen den Katalog', () => {
  const alteUmgebung = process.env.JETSON_PROFILE;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (alteUmgebung === undefined) {
      delete process.env.JETSON_PROFILE;
    } else {
      process.env.JETSON_PROFILE = alteUmgebung;
    }
  });

  /**
   * Der Fall, der auf einem kleinen Geraet auftritt: `phi3:mini` steht in der
   * Karte, aber nicht im Katalog.
   */
  test('ersetzt eine Kennung, die es nicht gibt, durch den Standard der Aufgabe', async () => {
    process.env.JETSON_PROFILE = 'xavier_nx_8gb';
    katalog(...STANDARDS);

    const e = await getRecommendedModel();

    expect(e.model).toBe('gemma4:26b-q4');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('phi3:mini'));
  });

  test('bge-m3 gibt es seit dem Ende des Vektor-RAG nicht mehr im Katalog', async () => {
    process.env.JETSON_PROFILE = 'agx_orin_64gb';
    katalog(...STANDARDS);

    const e = await getRecommendedModel();

    expect(e.embedding_model).toBe('nomic-embed-text');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('bge-m3'));
  });

  test('laesst eine Kennung, die im Katalog steht, unangetastet', async () => {
    process.env.JETSON_PROFILE = 'agx_orin_64gb';
    katalog(...STANDARDS);

    const e = await getRecommendedModel();

    // Beide stehen im Katalog und bleiben, wie die Karte sie nennt.
    expect(e.model).toBe('gemma4:26b-q4');
    expect(e.fast_model).toBe('gemma3:4b');
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('gemma3:4b'));
  });

  test('schlaegt nur vor, was der Katalog kennt', async () => {
    process.env.JETSON_PROFILE = 'agx_orin_32gb';
    katalog(...STANDARDS);

    const e = await getRecommendedModel();

    // qwen3:8b-q8 steht in der Karte, aber nicht im Katalog.
    expect(e.models).not.toContain('qwen3:8b-q8');
    for (const id of e.models) {
      expect(STANDARDS.map(m => m.id)).toContain(id);
    }
  });

  test('ohne Ersatz bleibt die Rolle leer, statt ins Leere zu zeigen', async () => {
    process.env.JETSON_PROFILE = 'agx_orin_32gb';
    // Ein Katalog ohne Vision-Standard.
    katalog(...STANDARDS.filter(m => m.task !== 'vision'));

    const e = await getRecommendedModel();

    expect(e.vision_model).toBeNull();
  });

  /**
   * Wird die Hauptempfehlung ersetzt, gehoert sie in ihre eigene
   * Alternativliste. Sonst schlaegt der Assistent alles vor ausser dem, was
   * er empfiehlt.
   */
  test('die ersetzte Hauptempfehlung steht in ihrer eigenen Liste', async () => {
    process.env.JETSON_PROFILE = 'xavier_nx_8gb';
    katalog(...STANDARDS, { id: 'gemma:2b', task: 'text', is_task_default: false });

    const e = await getRecommendedModel();

    // phi3:mini gibt es nicht, ersetzt durch den Text-Standard.
    expect(e.model).toBe('gemma4:26b-q4');
    expect(e.models[0]).toBe('gemma4:26b-q4');
  });

  test('ohne lesbaren Katalog bleibt es bei der Karte, statt zu scheitern', async () => {
    process.env.JETSON_PROFILE = 'xavier_nx_8gb';
    database.query.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const e = await getRecommendedModel();

    expect(e.model).toBe('phi3:mini');
  });

  test('ein leerer Katalog aendert nichts, sonst waere jede Empfehlung leer', async () => {
    process.env.JETSON_PROFILE = 'xavier_nx_8gb';
    katalog();

    const e = await getRecommendedModel();

    expect(e.model).toBe('phi3:mini');
  });
});
