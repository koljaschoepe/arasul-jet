/**
 * J4: jedes offene Modell laesst sich laden -- die Vorpruefung davor.
 *
 * Geprueft wird, was der Auftrag abnimmt: eine Kennung ausserhalb der
 * Kurzliste wird angenommen und als ungemessen gekennzeichnet, ein zu grosses
 * Modell wird mit Grund (Groesse, Budget) abgewiesen, eine Kennung, die es
 * nicht gibt, ist ein 404, und die Kurzliste bleibt gemessen.
 */

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/services/llm/modelService', () => ({ getDiskSpace: jest.fn() }));

const axios = require('axios');
const modelService = require('../../src/services/llm/modelService');
const database = require('../../src/database');
const freiesModell = require('../../src/services/llm/freiesModell');

const GB = 1000 * 1000 * 1000;

function manifest(bytes) {
  return {
    data: {
      config: { size: 500 },
      layers: [{ size: bytes - 500 }],
    },
    headers: { 'docker-content-digest': 'sha256:abc' },
  };
}

describe('freiesModell', () => {
  const vorher = process.env.RAM_LIMIT_LLM;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAM_LIMIT_LLM = '32G';
    delete process.env.MODEL_MEMORY_SAFETY_BUFFER_MB;
    modelService.getDiskSpace.mockResolvedValue({ free: 500 * GB, total: 900 * GB });
  });
  afterAll(() => {
    if (vorher === undefined) delete process.env.RAM_LIMIT_LLM;
    else process.env.RAM_LIMIT_LLM = vorher;
  });

  describe('kennungLesen', () => {
    test('Ollama-Bibliothek, mit und ohne Tag und Namensraum', () => {
      expect(freiesModell.kennungLesen('mistral:7b').manifestUrl).toBe(
        'https://registry.ollama.ai/v2/library/mistral/manifests/7b'
      );
      expect(freiesModell.kennungLesen('llama3').manifestUrl).toMatch(
        /library\/llama3\/manifests\/latest$/
      );
      expect(freiesModell.kennungLesen('nutzer/modell:q4').manifestUrl).toMatch(
        /v2\/nutzer\/modell\/manifests\/q4$/
      );
    });

    test('Hugging Face', () => {
      const l = freiesModell.kennungLesen('hf.co/unsloth/Qwen3-8B-GGUF:Q4_K_M');
      expect(l.quelle).toBe('huggingface');
      expect(l.manifestUrl).toBe('https://hf.co/v2/unsloth/Qwen3-8B-GGUF/manifests/Q4_K_M');
    });

    test('Unsinn wird abgewiesen', () => {
      expect(() => freiesModell.kennungLesen('hf.co/nurnutzer')).toThrow(/Hugging-Face/);
      expect(() => freiesModell.kennungLesen('a b')).toThrow(/Kennung/);
    });
  });

  describe('budgetPruefen', () => {
    test('passt: kein Fehler', () => {
      expect(() => freiesModell.budgetPruefen('klein:1b', 2 * GB)).not.toThrow();
    });

    test('zu gross: Fehler mit Grund, Groesse und Budget', () => {
      let fehler;
      try {
        freiesModell.budgetPruefen('gross:70b', 40 * GB);
      } catch (e) {
        fehler = e;
      }
      expect(fehler).toBeDefined();
      expect(fehler.statusCode).toBe(400);
      expect(fehler.message).toMatch(/zu groß/);
      expect(fehler.details).toMatchObject({
        grund: 'ZU_GROSS',
        groesse_gb: 40,
        memory_budget_gb: 32,
      });
    });
  });

  describe('plattePruefen', () => {
    test('reicht die Platte, kein Fehler', async () => {
      await expect(freiesModell.plattePruefen('a:1b', 10 * GB)).resolves.toBeUndefined();
    });

    test('reicht sie nicht: zwei Saetze mit Bedarf und freiem Platz', async () => {
      modelService.getDiskSpace.mockResolvedValue({ free: 5 * GB, total: 900 * GB });
      const fehler = await freiesModell.plattePruefen('a:30b', 10 * GB).catch(e => e);
      expect(fehler.statusCode).toBe(400);
      expect(fehler.details).toMatchObject({ grund: 'PLATTE_VOLL', benoetigt_gb: 15, frei_gb: 5 });
      expect(fehler.message.match(/\. /g)).toHaveLength(1); // genau zwei Saetze
    });
  });

  describe('pruefe', () => {
    test('unbekannte Kennung, die passt: passt, ohne etwas anzulegen', async () => {
      database.query.mockResolvedValueOnce({ rows: [] });
      axios.get.mockResolvedValueOnce(manifest(4 * GB));
      await expect(freiesModell.pruefe('mistral:7b')).resolves.toMatchObject({ passt: true });
      expect(database.query).toHaveBeenCalledTimes(1);
    });

    test('zu gross fuer den Speicher: passt nicht, mit Grund', async () => {
      database.query.mockResolvedValueOnce({ rows: [] });
      axios.get.mockResolvedValueOnce(manifest(80 * GB));
      const r = await freiesModell.pruefe('riese:405b');
      expect(r.passt).toBe(false);
      expect(r.grund).toMatch(/zu groß/);
    });

    test('zu gross fuer die Platte: passt nicht, mit Grund', async () => {
      modelService.getDiskSpace.mockResolvedValue({ free: 2 * GB, total: 900 * GB });
      database.query.mockResolvedValueOnce({ rows: [] });
      axios.get.mockResolvedValueOnce(manifest(4 * GB));
      const r = await freiesModell.pruefe('mistral:7b');
      expect(r).toMatchObject({ passt: false, details: { grund: 'PLATTE_VOLL' } });
    });

    test('bekannte Kennung: Groesse aus dem Katalog, kein Netz', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [{ id: 'gemma4:e4b' }] })
        .mockResolvedValueOnce({ rows: [{ size_bytes: String(9 * GB) }] });
      await expect(freiesModell.pruefe('gemma4:e4b')).resolves.toMatchObject({ passt: true });
      expect(axios.get).not.toHaveBeenCalled();
    });
  });

  describe('vorbereiten', () => {
    test('bekannte Kennung (Kurzliste): kein Netz, gemessen', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [{ id: 'gemma4:e4b' }] })
        .mockResolvedValueOnce({ rows: [{ jetson_tested: true, frei_geladen: false }] });

      const r = await freiesModell.vorbereiten('gemma4:e4b');

      expect(r).toMatchObject({
        modelId: 'gemma4:e4b',
        neu: false,
        gemessen: true,
        digestVorab: true,
      });
      expect(axios.get).not.toHaveBeenCalled();
    });

    test('unbekannte Kennung: Katalogzeile ungemessen angelegt', async () => {
      database.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rowCount: 1 });
      axios.get.mockResolvedValueOnce(manifest(4 * GB));

      const r = await freiesModell.vorbereiten('mistral:7b');

      expect(r).toMatchObject({
        modelId: 'mistral:7b',
        neu: true,
        gemessen: false,
        digestVorab: false,
      });
      const insert = database.query.mock.calls[1];
      expect(insert[0]).toMatch(/INSERT INTO llm_model_catalog/);
      expect(insert[0]).toMatch(/false, 2, \$12, true/); // jetson_tested false, frei_geladen true
      expect(insert[1][0]).toBe('mistral:7b');
    });

    test('zu gross: keine Katalogzeile', async () => {
      database.query.mockResolvedValueOnce({ rows: [] });
      axios.get.mockResolvedValueOnce(manifest(80 * GB));

      await expect(freiesModell.vorbereiten('riese:405b')).rejects.toMatchObject({
        statusCode: 400,
        details: expect.objectContaining({ grund: 'ZU_GROSS' }),
      });
      expect(database.query).toHaveBeenCalledTimes(1); // nur die Suche
    });

    test('bekanntes Modell, noch nicht am Geraet: wird gegen die Platte gehalten', async () => {
      modelService.getDiskSpace.mockResolvedValue({ free: 2 * GB, total: 900 * GB });
      database.query.mockResolvedValueOnce({ rows: [{ id: 'gemma4:e4b' }] }).mockResolvedValueOnce({
        rows: [
          { jetson_tested: true, frei_geladen: false, size_bytes: String(9 * GB), status: '' },
        ],
      });
      await expect(freiesModell.vorbereiten('gemma4:e4b')).rejects.toMatchObject({
        details: expect.objectContaining({ grund: 'PLATTE_VOLL' }),
      });
    });

    test('gibt es nicht: 404', async () => {
      database.query.mockResolvedValueOnce({ rows: [] });
      axios.get.mockRejectedValueOnce({ response: { status: 404 }, message: 'nope' });

      await expect(freiesModell.vorbereiten('gibtsnicht:1b')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    test('Registry nicht erreichbar: 503 statt Raten', async () => {
      database.query.mockResolvedValueOnce({ rows: [] });
      axios.get.mockRejectedValueOnce(new Error('getaddrinfo EAI_AGAIN'));

      await expect(freiesModell.vorbereiten('irgendwas:1b')).rejects.toMatchObject({
        statusCode: 503,
      });
    });
  });

  describe('aufgabeAusName', () => {
    test('liest nur das Sichere ab', () => {
      expect(freiesModell.aufgabeAusName('nomic-embed-text')).toBe('embedding');
      expect(freiesModell.aufgabeAusName('llava:13b')).toBe('vision');
      expect(freiesModell.aufgabeAusName('mistral:7b')).toBe('text');
    });
  });
});
