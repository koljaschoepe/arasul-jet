/**
 * Der Agentenpfad schreibt seinen Vorlauf auf (Plan 023 D7).
 *
 * Am 21.08.2026 auf dem Orin gemessen: `llm_jobs` hatte neun Zeilen, keine
 * einzige mit `prompt_tokens`, die juengste vom 30.07. `v_llm_usage_profile`
 * war leer, und `model_performance_metrics` hatte in sieben Tagen keinen
 * Eintrag. Der Pfad, der das Produkt traegt, war der einzige ohne Messung.
 *
 * Das hatte zwei Folgen: D7 konnte seine eigene Abnahme nicht belegen, und die
 * Haltezeit-Automatik stufte jede Stunde als `idle` ein, weil ihr Profil aus
 * genau dieser leeren Sicht kommt.
 */

const { vorlaufFesthalten } = require('../../src/services/llm/chatAgentRunner');

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function datenbank() {
  return { query: jest.fn().mockResolvedValue({ rows: [] }) };
}

const grundfall = {
  jobId: 'job-1',
  modelId: 'qwen3-coder:30b',
  vorlaufTokens: 5200,
  vorlaufDauerNs: 20_000_000_000,
  evalTokens: 300,
  evalDauerNs: 4_000_000_000,
  vorlaufZeichen: 18_400,
};

describe('vorlaufFesthalten', () => {
  beforeEach(() => jest.clearAllMocks());

  test('schreibt den Vorlauf in llm_jobs', async () => {
    const database = datenbank();
    await vorlaufFesthalten({ database, log, ...grundfall });

    const [sql, werte] = database.query.mock.calls[0];
    expect(sql).toContain('UPDATE llm_jobs');
    expect(werte).toEqual([5200, 300, 'job-1']);
  });

  test('benutzt dieselbe Funktion wie der andere Pfad, keinen zweiten Schreibweg', async () => {
    const database = datenbank();
    await vorlaufFesthalten({ database, log, ...grundfall });

    const [sql] = database.query.mock.calls[1];
    expect(sql).toContain('record_model_performance');
    expect(sql).not.toContain('INSERT INTO model_performance_metrics');
  });

  test('die Zeit bis zum ersten Wort ist die reine Vorverarbeitung', async () => {
    const database = datenbank();
    await vorlaufFesthalten({ database, log, ...grundfall });

    const werte = database.query.mock.calls[1][1];
    // 20 Sekunden Vorverarbeitung, 24 Sekunden insgesamt.
    expect(werte[5]).toBe(20000);
    expect(werte[4]).toBe(24000);
  });

  /**
   * Aus der Review von #451. Der achte Parameter ist `context_length`, und der
   * ist in `030_model_performance_metrics.sql` als Zeichenzahl dokumentiert.
   * `llmOllamaStream` schreibt dort `prompt.length`. Stuende hier die
   * Tokenzahl, haette dieselbe Spalte je nach Pfad zwei Bedeutungen, um den
   * Faktor drei bis vier auseinander, und jede spaetere Auswertung waere
   * vergiftet, ohne dass etwas sichtbar kaputtgeht.
   */
  test('context_length bekommt Zeichen, nicht Tokens', async () => {
    const database = datenbank();
    await vorlaufFesthalten({ database, log, ...grundfall });

    const werte = database.query.mock.calls[1][1];
    expect(werte[7]).toBe(18400);
    expect(werte[7]).not.toBe(grundfall.vorlaufTokens);
  });

  /**
   * Die Tokenzahl geht nicht verloren, sie steht nur woanders: in
   * `llm_jobs.prompt_tokens`, geschrieben vom ersten der beiden Aufrufe.
   */
  test('die Tokenzahl steht weiterhin in llm_jobs', async () => {
    const database = datenbank();
    await vorlaufFesthalten({ database, log, ...grundfall });

    const [sql, werte] = database.query.mock.calls[0];
    expect(sql).toContain('prompt_tokens');
    expect(werte[0]).toBe(5200);
  });

  /**
   * Ohne gemessene Zeichen bleibt die Spalte leer, statt eine Null zu
   * behaupten, die niemand gemessen hat.
   */
  test('ohne Zeichenzahl bleibt context_length leer', async () => {
    const database = datenbank();
    await vorlaufFesthalten({ database, log, ...grundfall, vorlaufZeichen: 0 });

    expect(database.query.mock.calls[1][1][7]).toBeNull();
  });

  test('ohne Zahlen wird nichts geschrieben', async () => {
    const database = datenbank();
    await vorlaufFesthalten({
      database,
      log,
      jobId: 'job-2',
      modelId: 'x',
      vorlaufTokens: 0,
      vorlaufDauerNs: 0,
      evalTokens: 0,
      evalDauerNs: 0,
    });

    expect(database.query).not.toHaveBeenCalled();
  });

  /**
   * Eine Antwort, die beim Nutzer angekommen ist, darf nicht daran scheitern,
   * dass die Messung nicht gespeichert werden konnte.
   */
  test('ein Datenbankfehler bricht den Lauf nicht ab', async () => {
    const database = { query: jest.fn().mockRejectedValue(new Error('keine Verbindung')) };

    await expect(vorlaufFesthalten({ database, log, ...grundfall })).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('keine Verbindung'));
  });

  test('ein Fehler beim ersten Schreiben haelt das zweite nicht auf', async () => {
    const database = {
      query: jest
        .fn()
        .mockRejectedValueOnce(new Error('Spalte fehlt'))
        .mockResolvedValue({ rows: [] }),
    };

    await vorlaufFesthalten({ database, log, ...grundfall });

    expect(database.query).toHaveBeenCalledTimes(2);
    expect(database.query.mock.calls[1][0]).toContain('record_model_performance');
  });
});
