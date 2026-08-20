/**
 * Der Steckbrief eines Modells (Plan 023 D2).
 *
 * Geprueft wird, was am 20.08.2026 an elf installierten Modellen auf dem Orin
 * tatsaechlich zurueckkam. Die Faelle sind nicht ausgedacht:
 *   - qwen3:8b liefert general.license = "apache-2.0"
 *   - gemma3:1b liefert KEIN Kuerzel, aber einen Lizenztext "Gemma Terms of Use"
 *   - llava-phi3 liefert weder das eine noch das andere
 *   - die Kontextlaenge steht je nach Architektur unter einem anderen Schluessel
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const {
  lizenzBezeichnung,
  kontextLaenge,
  leseSteckbrief,
  steckbriefeNachtragen,
  steckbriefeAnstossen,
} = require('../../src/services/llm/modelProfile');
const logger = require('../../src/utils/logger');

describe('lizenzBezeichnung', () => {
  test('nimmt das Kuerzel, wenn Ollama eines liefert', () => {
    expect(lizenzBezeichnung('apache-2.0', 'irgendein langer Text')).toBe('apache-2.0');
  });

  test('faellt auf die erste Zeile des Lizenztextes zurueck', () => {
    expect(lizenzBezeichnung(null, 'Gemma Terms of Use \n\nLast modified: February 21, 2024')).toBe(
      'Gemma Terms of Use'
    );
  });

  test('haengt bei Apache die Version an, weil sie in Zeile zwei steht', () => {
    const text = '                                 Apache License\n   Version 2.0, January 2004\n';
    expect(lizenzBezeichnung(null, text)).toBe('Apache License 2.0');
  });

  test('gibt null, wenn es weder Kuerzel noch Text gibt', () => {
    expect(lizenzBezeichnung(null, null)).toBeNull();
    expect(lizenzBezeichnung(undefined, '   \n  ')).toBeNull();
  });
});

describe('kontextLaenge', () => {
  test('findet den Schluessel unabhaengig von der Architektur', () => {
    expect(kontextLaenge({ 'qwen3.context_length': 40960 })).toBe(40960);
    expect(kontextLaenge({ 'gemma3.context_length': 131072 })).toBe(131072);
    expect(kontextLaenge({ context_length: 4096 })).toBe(4096);
  });

  test('ignoriert Unsinn statt ihn weiterzureichen', () => {
    expect(kontextLaenge({ 'qwen3.context_length': 0 })).toBeNull();
    expect(kontextLaenge({ 'qwen3.context_length': 'viel' })).toBeNull();
    expect(kontextLaenge(null)).toBeNull();
    expect(kontextLaenge({ 'general.parameter_count': 8190735360 })).toBeNull();
  });
});

describe('leseSteckbrief', () => {
  const echteAntwort = {
    license: 'Apache License\n   Version 2.0, January 2004\n',
    details: { parameter_size: '8.2B', quantization_level: 'Q4_K_M' },
    model_info: { 'general.license': 'apache-2.0', 'qwen3.context_length': 40960 },
  };

  afterEach(() => {
    delete global.fetch;
  });

  test('liest alle vier Angaben aus der Antwort', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => echteAntwort });

    await expect(leseSteckbrief('qwen3:8b')).resolves.toEqual({
      parameterLabel: '8.2B',
      quantization: 'Q4_K_M',
      license: 'apache-2.0',
      contextLength: 40960,
    });
  });

  test('gibt null, wenn Ollama das Modell nicht kennt', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(leseSteckbrief('gibtsnicht')).resolves.toBeNull();
  });

  test('gibt null, wenn Ollama gar nicht antwortet', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(leseSteckbrief('qwen3:8b')).resolves.toBeNull();
  });

  test('ohne Namen wird nicht einmal gefragt', async () => {
    global.fetch = jest.fn();
    await expect(leseSteckbrief('')).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('steckbriefeNachtragen', () => {
  afterEach(() => {
    delete global.fetch;
  });

  test('schreibt je Modell einmal und merkt sich den Zeitpunkt', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { id: 'qwen3:7b-q8', ollama_name: 'qwen3:8b' },
          { id: 'gemma3:1b', ollama_name: 'gemma3:1b' },
        ],
      })
      .mockResolvedValue({ rows: [] });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        details: { parameter_size: '8.2B', quantization_level: 'Q4_K_M' },
        model_info: { 'qwen3.context_length': 40960 },
      }),
    });

    await expect(steckbriefeNachtragen({ query })).resolves.toBe(2);

    const schreibend = query.mock.calls.filter(([sql]) => sql.includes('UPDATE llm_model_catalog'));
    expect(schreibend).toHaveLength(2);
    expect(schreibend[0][0]).toContain('profile_read_at = NOW()');
    expect(schreibend[0][1]).toEqual(['qwen3:7b-q8', '8.2B', 'Q4_K_M', null, 40960]);
  });

  test('ueberspringt ein Modell, das Ollama nicht ausliefert, statt Leeres zu schreiben', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'llava-phi3', ollama_name: 'llava-phi3' }] })
      .mockResolvedValue({ rows: [] });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    await expect(steckbriefeNachtragen({ query })).resolves.toBe(0);
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE'))).toBe(false);
  });

  test('fragt nur nach Modellen, die installiert sind', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await steckbriefeNachtragen({ query });
    expect(query.mock.calls[0][0]).toContain("i.status = 'available'");
    expect(query.mock.calls[0][0]).toContain('profile_read_at IS NULL');
  });

  // Ein Durchgang soll eine bekannte Obergrenze haben, auch wenn er niemanden
  // mehr aufhaelt.
  test('fasst je Lauf hoechstens fuenf Modelle an', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await steckbriefeNachtragen({ query });
    expect(query.mock.calls[0][0]).toContain('LIMIT $2');
    expect(query.mock.calls[0][1]).toEqual(['30', 5]);
  });
});

/**
 * Die Route POST /api/models/sync wird im Anfragefaden abgewartet. Fuenf
 * Modelle mal zehn Sekunden Zeitgrenze waeren im schlechtesten Fall fuenfzig
 * Sekunden; das Frontend bricht nach dreissig ab. Deshalb wird der Nachtrag
 * angestossen, nicht abgewartet.
 */
describe('steckbriefeAnstossen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('kehrt sofort zurueck, ohne auf die Datenbank zu warten', () => {
    let aufloesen;
    const query = jest.fn(() => new Promise(res => (aufloesen = res)));

    // Kein await: was hier zurueckkommt, ist nichts.
    expect(steckbriefeAnstossen({ query })).toBeUndefined();
    aufloesen({ rows: [] });
  });

  test('ein zweiter Anstoss waehrend des ersten laeuft ins Leere', async () => {
    let aufloesen;
    const query = jest.fn(() => new Promise(res => (aufloesen = res)));

    steckbriefeAnstossen({ query });
    steckbriefeAnstossen({ query });
    expect(query).toHaveBeenCalledTimes(1);

    aufloesen({ rows: [] });
    await new Promise(res => setImmediate(res));

    // Nach dem Ende ist der Weg wieder frei.
    steckbriefeAnstossen({ query: jest.fn().mockResolvedValue({ rows: [] }) });
  });

  test('ein Fehler landet im Protokoll, nicht als unbehandelte Ablehnung', async () => {
    const query = jest.fn().mockRejectedValue(new Error('keine Verbindung'));

    steckbriefeAnstossen({ query });
    await new Promise(res => setImmediate(res));

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('keine Verbindung'));
  });
});
