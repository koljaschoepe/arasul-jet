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
    // Der Profil-Zwischenspeicher lebt 15 Minuten; die Tests hier haengen
    // nicht daran, weil alle denselben leeren Verlauf sehen.
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
   */
  test('sie verkuerzt nie, was das Profil vorsieht', async () => {
    database.query.mockResolvedValue({
      rows: [{ hour: new Date().getHours(), avg_requests: '9', peak_requests: '20', active_days: '7' }],
    });
    // Zwischenspeicher umgehen: dieselbe Instanz hat oben schon geladen.
    modelLifecycleService._aktivitaetZuruecksetzen();

    const lage = await modelLifecycleService.getCurrentKeepAlive();
    expect(lage.keepAliveMinutes).toBeGreaterThanOrEqual(2);
  });
});
