/**
 * Die Haltezeit richtet sich auch nach dem, was gerade laeuft (Plan 023 D6).
 *
 * Das Nutzungsprofil stuft nach STUNDEN der Vergangenheit ein. Auf einem
 * frischen Geraet gibt es keine Vergangenheit: jede Stunde ist `idle`, die
 * Haltezeit sind zwei Minuten, und vor jeder zweiten Frage steht ein
 * Kaltstart. Beim 27B-Modell sind das gemessen 11,2 Sekunden, und zwar genau
 * am Anfang einer Vorfuehrung.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/database', () => ({ query: jest.fn() }));

const database = require('../../src/database');
const modelLifecycleService = require('../../src/services/llm/modelLifecycleService');

/** Ein Geraet ohne Vergangenheit: jede Stunde ist idle. */
function ohneGeschichte() {
  database.query.mockResolvedValue({ rows: [] });
}

describe('Haltezeit nach kurzfristiger Aktivitaet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    modelLifecycleService._aktivitaetZuruecksetzen();
    // Der Profil-Zwischenspeicher lebt fuenfzehn Minuten und ist Modulzustand.
    // Ohne dieses Verwerfen liest jeder Test das Profil des ersten, und ein
    // Test, der ein anderes vorgibt, prueft nichts.
    modelLifecycleService.invalidateCache();
    ohneGeschichte();
  });

  test('ohne Vergangenheit und ohne Aktivitaet bleibt es bei zwei Minuten', async () => {
    const lage = await modelLifecycleService.getCurrentKeepAlive();
    expect(lage.keepAliveMinutes).toBe(2);
    expect(lage.recentRequests).toBe(0);
  });

  test('eine Anfrage hebt die Haltezeit auf zehn Minuten', async () => {
    modelLifecycleService.anfrageGesehen();

    const lage = await modelLifecycleService.getCurrentKeepAlive();
    expect(lage.keepAliveMinutes).toBe(10);
    expect(lage.phase).toBe('normal');
  });

  test('anhaltende Arbeit hebt sie auf dreissig', async () => {
    modelLifecycleService.anfrageGesehen();
    modelLifecycleService.anfrageGesehen();
    modelLifecycleService.anfrageGesehen();

    const lage = await modelLifecycleService.getCurrentKeepAlive();
    expect(lage.keepAliveMinutes).toBe(30);
    expect(lage.phase).toBe('peak');
  });

  /**
   * Gezaehlt wird je AUFTRAG, nicht je Werkzeugrunde. Eine gewoehnliche
   * agentische Antwort (suchen, lesen, schreiben) braucht drei Runden; wuerde
   * jede zaehlen, riesse eine einzige Frage schon die Schwelle, und die Stufe
   * dazwischen waere vom Agentenpfad aus nie erreichbar. Waehrend ein Auftrag
   * laeuft, schuetzt ohnehin `activeRequests` vor dem Entladen.
   */
  test('eine Frage ist eine Anfrage, egal wie viele Runden sie braucht', async () => {
    modelLifecycleService.anfrageGesehen();

    const lage = await modelLifecycleService.getCurrentKeepAlive();
    expect(lage.recentRequests).toBe(1);
    expect(lage.keepAliveMinutes).toBe(10);
  });

  test('was aus dem Fenster faellt, zaehlt nicht mehr', async () => {
    const langeHer = Date.now() - 60 * 60 * 1000;
    modelLifecycleService.anfrageGesehen(langeHer);
    modelLifecycleService.anfrageGesehen(langeHer);
    modelLifecycleService.anfrageGesehen(langeHer);

    const lage = await modelLifecycleService.getCurrentKeepAlive();
    expect(lage.recentRequests).toBe(0);
    expect(lage.keepAliveMinutes).toBe(2);
  });

  /**
   * Die Gegenwart darf nur nach oben wirken. Wer gerade nicht arbeitet, soll
   * in einer historisch belebten Stunde nicht ploetzlich zwei Minuten
   * bekommen.
   *
   * Dieser Test war beim ersten Anlauf wertlos, und die Review hat beides
   * gefunden: das Nutzungsprofil liegt fuenfzehn Minuten im Zwischenspeicher,
   * also las er den leeren Verlauf des ersten Tests statt der belebten Stunde;
   * und `toBeGreaterThanOrEqual(2)` ist immer wahr, weil zwei die Untergrenze
   * ist. Er haette auch dann bestanden, wenn die Regel, die er im Namen
   * traegt, ersatzlos entfiele.
   */
  test('sie verkuerzt nie, was das Profil vorsieht', async () => {
    modelLifecycleService.invalidateCache();
    database.query.mockResolvedValue({
      rows: [
        { hour: new Date().getHours(), avg_requests: '9', peak_requests: '20', active_days: '7' },
      ],
    });

    // Keine Anfrage im Fenster: allein das Profil entscheidet.
    const lage = await modelLifecycleService.getCurrentKeepAlive();
    expect(lage.recentRequests).toBe(0);
    expect(lage.phase).toBe('peak');
    expect(lage.keepAliveMinutes).toBe(30);
  });

  /**
   * Der Fall, auf den die Regel wirklich zielt, und den auch die zweite
   * Fassung dieses Tests noch nicht traf: das Profil sagt dreissig Minuten,
   * und es liegt GENAU EINE Anfrage im Fenster. Ohne die Bedingung
   * `keepAliveMinutes < NORMAL_KEEP_ALIVE_MIN` wuerde die Gegenwart die
   * Haltezeit hier von dreissig auf zehn Minuten HERUNTERsetzen, also genau
   * das Gegenteil dessen tun, wofuer sie da ist.
   *
   * Gefunden durch die Gegenprobe: ohne die Bedingung faellt dieser Test,
   * die beiden davor nicht.
   */
  test('eine einzelne Anfrage druckt eine belebte Stunde nicht herunter', async () => {
    modelLifecycleService.invalidateCache();
    database.query.mockResolvedValue({
      rows: [
        { hour: new Date().getHours(), avg_requests: '9', peak_requests: '20', active_days: '7' },
      ],
    });

    modelLifecycleService.anfrageGesehen();

    const lage = await modelLifecycleService.getCurrentKeepAlive();
    expect(lage.recentRequests).toBe(1);
    expect(lage.keepAliveMinutes).toBe(30);
    expect(lage.phase).toBe('peak');
  });
});
