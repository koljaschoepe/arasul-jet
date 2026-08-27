/**
 * Die Empfehlung zeigt nur auf Modelle, die es gibt (Plan 023 D5, C8).
 *
 * `utils/hardware.js` traegt eine Karte von Geraeteprofil auf Modell. Am
 * 21.08.2026 gemessen: ACHT der siebzehn Kennungen darin gab es im Katalog
 * nicht. Auf einem Xavier NX empfahl der Einrichtungsassistent damit ein
 * Modell, das niemand laden kann.
 *
 * Seit Phase C8 ist die Karte die Kurzliste -- dieselben vier Modelle, die
 * Migration 175 in den Katalog schreibt. Damit kann die Karte nicht mehr aus
 * Nachlaessigkeit auseinanderlaufen, wohl aber, wenn Code und Datenbank
 * verschiedenen Stand haben: ein Geraet, dessen Migration haengengeblieben
 * ist, oder ein Katalog aus einer spaeteren Kurzliste. Genau diesen Fall
 * messen die Tests hier.
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

const STANDARD = 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS';
const SCHNELL = 'gemma4:e4b';
const SEHEN = 'llava-phi3';
const EINBETTUNG = 'nomic-embed-text';

/** Der Katalog, wie ihn ein Geraet nach Migration 175 hat. */
const KURZLISTE = [
  { id: STANDARD, task: 'text', is_task_default: true },
  { id: SCHNELL, task: 'text', is_task_default: false },
  { id: SEHEN, task: 'vision', is_task_default: true },
  { id: EINBETTUNG, task: 'embedding', is_task_default: true },
];

function katalog(...zeilen) {
  database.query.mockResolvedValue({ rows: zeilen });
}

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

  test('auf einem grossen Geraet steht der Standard der Kurzliste', async () => {
    process.env.JETSON_PROFILE = 'agx_orin_64gb';
    katalog(...KURZLISTE);

    const e = await getRecommendedModel();

    expect(e.model).toBe(STANDARD);
    expect(e.fast_model).toBe(SCHNELL);
    expect(e.vision_model).toBe(SEHEN);
    expect(e.embedding_model).toBe(EINBETTUNG);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  /**
   * Unter 64 GB reichen die 22 GB des Standardmodells nicht. Das ist die
   * einzige Unterscheidung, die ein Profil seit C8 noch trifft.
   */
  test('auf einem kleinen Geraet fuehrt das kleine schnelle Modell', async () => {
    process.env.JETSON_PROFILE = 'orin_nx_16gb';
    katalog(...KURZLISTE);

    const e = await getRecommendedModel();

    expect(e.model).toBe(SCHNELL);
    expect(e.models).not.toContain(STANDARD);
  });

  /**
   * Der Fall, fuer den es diese Pruefung ueberhaupt gibt: Code und Katalog
   * haben verschiedenen Stand. Hier kennt der Katalog den Standard nicht --
   * die Empfehlung faellt auf den Standard der Aufgabe `text`.
   */
  test('ersetzt eine Kennung, die es nicht gibt, durch den Standard der Aufgabe', async () => {
    process.env.JETSON_PROFILE = 'agx_orin_64gb';
    katalog(
      { id: SCHNELL, task: 'text', is_task_default: true },
      { id: SEHEN, task: 'vision', is_task_default: true },
      { id: EINBETTUNG, task: 'embedding', is_task_default: true }
    );

    const e = await getRecommendedModel();

    expect(e.model).toBe(SCHNELL);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(STANDARD));
  });

  test('schlaegt nur vor, was der Katalog kennt', async () => {
    process.env.JETSON_PROFILE = 'agx_orin_64gb';
    const ohneSehen = KURZLISTE.filter(m => m.id !== SEHEN);
    katalog(...ohneSehen);

    const e = await getRecommendedModel();

    expect(e.models).not.toContain(SEHEN);
    for (const id of e.models) {
      expect(ohneSehen.map(m => m.id)).toContain(id);
    }
  });

  test('ohne Ersatz bleibt die Rolle leer, statt ins Leere zu zeigen', async () => {
    process.env.JETSON_PROFILE = 'agx_orin_64gb';
    katalog(...KURZLISTE.filter(m => m.task !== 'vision'));

    const e = await getRecommendedModel();

    expect(e.vision_model).toBeNull();
  });

  /**
   * Wird die Hauptempfehlung ersetzt, gehoert sie in ihre eigene
   * Alternativliste. Sonst schlaegt der Assistent alles vor ausser dem, was
   * er empfiehlt.
   */
  test('die ersetzte Hauptempfehlung steht in ihrer eigenen Liste', async () => {
    process.env.JETSON_PROFILE = 'agx_orin_64gb';
    katalog(
      { id: SCHNELL, task: 'text', is_task_default: true },
      { id: SEHEN, task: 'vision', is_task_default: true },
      { id: EINBETTUNG, task: 'embedding', is_task_default: true }
    );

    const e = await getRecommendedModel();

    expect(e.model).toBe(SCHNELL);
    expect(e.models[0]).toBe(SCHNELL);
  });

  test('ohne lesbaren Katalog bleibt es bei der Karte, statt zu scheitern', async () => {
    process.env.JETSON_PROFILE = 'agx_orin_64gb';
    database.query.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const e = await getRecommendedModel();

    expect(e.model).toBe(STANDARD);
  });

  test('ein leerer Katalog aendert nichts, sonst waere jede Empfehlung leer', async () => {
    process.env.JETSON_PROFILE = 'agx_orin_64gb';
    katalog();

    const e = await getRecommendedModel();

    expect(e.model).toBe(STANDARD);
  });
});
