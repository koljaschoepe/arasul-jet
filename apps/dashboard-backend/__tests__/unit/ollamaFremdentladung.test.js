/**
 * Wenn Ollama selbst entlaedt (Plan 023 D3, Nachtrag).
 *
 * Am 21.08.2026 am Geraet gemessen: `gemma3:1b` geladen, das Protokoll sagte
 * `keep_alive: 120s`, danach war `/api/ps` leer, `llm_model_switches` hatte
 * KEINE Zeile und das Protokoll keine Meldung. Ollama hatte das Modell selbst
 * entladen, und Arasul hat davon nichts gemerkt.
 *
 * D3 versprach: "Wechselt das System das Modell selbst, steht dabei, warum."
 * Ollama ist das System.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));

jest.mock('../../src/services/llm/modelLifecycleService', () => ({
  checkAndUnload: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));

const axios = require('axios');
const database = require('../../src/database');
const modelLifecycleService = require('../../src/services/llm/modelLifecycleService');
const ollamaReadiness = require('../../src/services/llm/ollamaReadiness');
const unloadRegistry = require('../../src/services/llm/unloadRegistry');

/** Was `/api/ps` beim naechsten Durchgang meldet. */
function geladen(...namen) {
  axios.get.mockResolvedValue({ data: { models: namen.map(name => ({ name })) } });
}

/** Ollama antwortet nicht. Sieht ohne Sorgfalt aus wie "nichts geladen". */
function nichtErreichbar() {
  axios.get.mockRejectedValue(new Error('timeout of 5000ms exceeded'));
}

const buchungen = () =>
  database.query.mock.calls.filter(
    ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO llm_model_switches')
  );

describe('Ollama entlaedt selbst', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    database.query.mockResolvedValue({ rows: [] });
    modelLifecycleService.checkAndUnload.mockResolvedValue(undefined);
    ollamaReadiness._vergleichsstandZuruecksetzen();
    unloadRegistry.zuruecksetzen();
    // `unloadModelWithTracking` ruft den ModelService. Ohne ihn wirft es, und
    // die Buchung faende nie statt.
    ollamaReadiness.modelService = { unloadModel: jest.fn().mockResolvedValue(undefined) };
  });

  test('der erste Durchgang bucht nichts, es gibt noch keinen Vergleich', async () => {
    geladen();
    await ollamaReadiness.checkSmartUnload();
    expect(buchungen()).toHaveLength(0);
  });

  test('ein Modell, das zwischen zwei Durchgaengen verschwindet, wird gebucht', async () => {
    geladen('gemma3:1b');
    await ollamaReadiness.checkSmartUnload();
    expect(buchungen()).toHaveLength(0);

    geladen();
    await ollamaReadiness.checkSmartUnload();

    const gebucht = buchungen();
    expect(gebucht).toHaveLength(1);
    expect(gebucht[0][0]).toContain('auto_unload_ollama_keepalive');
    expect(gebucht[0][1]).toEqual(['gemma3:1b']);
  });

  test('ein Modell, das liegen bleibt, wird nicht gebucht', async () => {
    geladen('gemma3:1b');
    await ollamaReadiness.checkSmartUnload();
    geladen('gemma3:1b');
    await ollamaReadiness.checkSmartUnload();
    expect(buchungen()).toHaveLength(0);
  });

  /**
   * `unloadModelWithTracking` schreibt selbst eine Zeile. Wuerde der Vergleich
   * dieselbe Entladung noch einmal buchen, staenden zwei Gruende fuer einen
   * Vorgang im Protokoll, und die Anzeige naehme den falschen.
   */
  test('was Arasul selbst entlaedt, wird nicht doppelt gebucht', async () => {
    geladen('gemma3:1b');
    await ollamaReadiness.checkSmartUnload();

    // Zweiter Durchgang: die Automatik entlaedt es, /api/ps meldet es noch.
    geladen('gemma3:1b');
    modelLifecycleService.checkAndUnload.mockImplementationOnce(async ({ unloadModel }) => {
      await unloadModel('gemma3:1b', 'adaptive_idle');
    });
    await ollamaReadiness.checkSmartUnload();

    // Genau eine Buchung, und zwar die von unloadModelWithTracking.
    let gebucht = buchungen();
    expect(gebucht).toHaveLength(1);
    expect(gebucht[0][0]).toContain('llm_model_switches');
    expect(gebucht[0][1]).toEqual(['gemma3:1b', 'unloaded', 'auto_unload_adaptive_idle']);

    // Dritter Durchgang: jetzt ist es weg. Es darf nicht erneut gebucht werden.
    geladen();
    await ollamaReadiness.checkSmartUnload();
    gebucht = buchungen();
    expect(gebucht).toHaveLength(1);
  });

  test('die Automatik bekommt denselben Stand, der auch verglichen wird', async () => {
    // Sonst zwei Abfragen an /api/ps je Durchgang, und die zweite koennte
    // etwas anderes melden als die erste.
    geladen('gemma3:1b');
    await ollamaReadiness.checkSmartUnload();
    expect(axios.get).toHaveBeenCalledTimes(1);

    const uebergeben = await modelLifecycleService.checkAndUnload.mock.calls[0][0].getLoadedModels();
    expect(uebergeben).toEqual([{ name: 'gemma3:1b' }]);
  });
});

/**
 * Die zwei Faelle, in denen der Vergleich das Falsche schliessen wuerde. Beide
 * kommen aus der Review von #448 und beide sind echt.
 */
describe('was NICHT als Ollama-Entladung gilt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    database.query.mockResolvedValue({ rows: [] });
    modelLifecycleService.checkAndUnload.mockResolvedValue(undefined);
    ollamaReadiness._vergleichsstandZuruecksetzen();
    unloadRegistry.zuruecksetzen();
    ollamaReadiness.modelService = { unloadModel: jest.fn().mockResolvedValue(undefined) };
  });

  /**
   * Eine gescheiterte Abfrage sieht aus wie eine leere. Ohne Unterscheidung
   * buchte EIN Zeitueberschreiten gegen /api/ps jedes geladene Modell als
   * "wegen Ruhe entladen". Auf einem Geraet, das gerade rechnet, ist das kein
   * Gedankenspiel.
   */
  test('eine gescheiterte Abfrage bucht nichts', async () => {
    geladen('gemma3:1b', 'qwen3:8b');
    await ollamaReadiness.checkSmartUnload();

    nichtErreichbar();
    await ollamaReadiness.checkSmartUnload();

    expect(buchungen()).toHaveLength(0);
  });

  test('nach einer gescheiterten Abfrage gilt weiter der letzte gute Stand', async () => {
    geladen('gemma3:1b');
    await ollamaReadiness.checkSmartUnload();

    nichtErreichbar();
    await ollamaReadiness.checkSmartUnload();

    // Jetzt antwortet Ollama wieder, und das Modell ist wirklich weg.
    geladen();
    await ollamaReadiness.checkSmartUnload();

    const gebucht = buchungen();
    expect(gebucht).toHaveLength(1);
    expect(gebucht[0][0]).toContain('auto_unload_ollama_keepalive');
  });

  /**
   * Vier Wege fuehren zu einer eigenen Entladung, und nur einer laeuft ueber
   * checkAndUnload: der Knopf im Dashboard, das Loeschen und das Verdraengen
   * gehen direkt an modelService.unloadModel. Ohne die Ablage haette der
   * Nutzer gelesen, sein Modell sei ungenutzt gewesen, waehrend er selbst auf
   * Entladen geklickt hat.
   */
  test('ein Entladen per Knopf gilt nicht als Ollama-Entladung', async () => {
    geladen('gemma3:1b');
    await ollamaReadiness.checkSmartUnload();

    // So, wie es POST /models/:id/unload tut: direkt, an checkAndUnload vorbei.
    unloadRegistry.merkeEntladung('gemma3:1b');

    geladen();
    await ollamaReadiness.checkSmartUnload();

    expect(buchungen()).toHaveLength(0);
  });

  test('nach der Karenz gilt dieselbe Kennung wieder als fremd entladen', async () => {
    geladen('gemma3:1b');
    await ollamaReadiness.checkSmartUnload();
    unloadRegistry.merkeEntladung('gemma3:1b');

    // Das Modell kommt zurueck und laeuft spaeter wirklich aus.
    geladen('gemma3:1b');
    await ollamaReadiness.checkSmartUnload();
    expect(unloadRegistry.warUnsereEntladung('gemma3:1b', Date.now() + unloadRegistry.KARENZ_MS + 1)).toBe(false);
  });

  /**
   * Der Wecker feuert alle 30 Sekunden, ohne zu fragen, ob der vorige
   * Durchgang fertig ist.
   */
  test('zwei Durchgaenge ueberholen sich nicht', async () => {
    geladen('gemma3:1b');
    let freigeben;
    modelLifecycleService.checkAndUnload.mockImplementationOnce(
      () => new Promise(res => (freigeben = res))
    );

    const erster = ollamaReadiness.checkSmartUnload();
    // Einen Takt warten, damit der erste Durchgang wirklich in checkAndUnload
    // haengt und nicht noch bei der Abfrage steht.
    await new Promise(res => setImmediate(res));

    await ollamaReadiness.checkSmartUnload();
    // Der zweite ist sofort zurueck, ohne /api/ps ein zweites Mal zu fragen.
    expect(axios.get).toHaveBeenCalledTimes(1);

    freigeben();
    await erster;
  });
});
