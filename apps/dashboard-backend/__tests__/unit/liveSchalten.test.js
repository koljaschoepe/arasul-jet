/**
 * Live schalten mit Sicherung und Rueckfall (M5, Auftrag
 * live-schalten-mit-sicherung, 04.10.2026).
 *
 * Gemessen wird die Reihenfolge und was angefasst wird: erst anhalten, dann
 * sichern, dann schalten; ohne Sicherung kein Schalten; scheitert die neue
 * Fassung, kommen Daten UND Fassung von vorher zurueck -- und der Teststand
 * wird an keiner Stelle beruehrt. Dass ein Container wirklich stirbt und die
 * Datenbank wirklich zurueckkommt, misst `scripts/test/live-schalten-abnahme.sh`
 * am Geraet.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/app/appStore', () => ({
  staendeVon: jest.fn(),
  schalte: jest.fn(),
  spieleEin: jest.fn(),
}));
jest.mock('../../src/services/app/appContainer', () => ({
  halteAn: jest.fn(),
  starteWieder: jest.fn(),
  bleibtGesund: jest.fn(),
  letzteZeilen: jest.fn(),
  entferne: jest.fn(),
  zustand: jest.fn(),
}));
jest.mock('../../src/services/app/appDatenbank', () => ({
  namenFuer: (appId, stand) => `arasul_app_${appId}_${stand}`,
  datenbankDa: jest.fn(),
  entferneStand: jest.fn(),
}));
jest.mock('../../src/services/app/appFlows', () => ({ registriere: jest.fn() }));
jest.mock('../../src/services/betrieb/sicherungsdienst', () => ({
  sichereVorLive: jest.fn(),
  holeLiveDatenZurueck: jest.fn(),
}));

const db = require('../../src/database');
const appStore = require('../../src/services/app/appStore');
const appContainer = require('../../src/services/app/appContainer');
const appDatenbank = require('../../src/services/app/appDatenbank');
const sicherungsdienst = require('../../src/services/betrieb/sicherungsdienst');
const { schalteLive, schalteZurueck } = require('../../src/services/app/liveSchalten');

const MIT_BACKEND = { id: 'probe', name: 'Probe', backend: { image: 'probe:x' } };
const STAND_ID = 'a1b2c3d4e5f60718';

/** Teststand 1.1.0, Livestand 1.0.0 (davor 0.9.0), mit Aenderungstext je Stand. */
function zweiStaende() {
  appStore.staendeVon.mockResolvedValue({
    test: {
      version: '1.1.0',
      manifest: { ...MIT_BACKEND, version: '1.1.0' },
      aenderungstext: 'Neu: Spalte Kostenstelle.',
    },
    live: {
      version: '1.0.0',
      vorige_version: '0.9.0',
      manifest: { ...MIT_BACKEND, version: '1.0.0' },
      aenderungstext: 'Erste Fassung.',
    },
  });
}

/** `app_schaltungen`: INSERT gibt die Kennung, UPDATE gibt die Zeile zurueck. */
function schaltungenAntworten() {
  db.query.mockImplementation(async (sql, werte) => {
    if (/INSERT INTO public\.app_schaltungen/.test(sql)) {
      return { rows: [{ id: 5 }] };
    }
    if (/UPDATE public\.app_schaltungen/.test(sql)) {
      const [id, ergebnis, sicherung_id, satz, hilfe, technik] = werte;
      return {
        rows: [{ id, ergebnis, sicherung_id, satz, hilfe, technik: JSON.parse(technik ?? 'null') }],
      };
    }
    return { rows: [], rowCount: 0 };
  });
}

/** Wer wurde in welcher Reihenfolge gerufen? */
function reihenfolge() {
  return [
    ['halteAn', appContainer.halteAn],
    ['sichereVorLive', sicherungsdienst.sichereVorLive],
    ['schalte', appStore.schalte],
    ['bleibtGesund', appContainer.bleibtGesund],
    ['entferne', appContainer.entferne],
    ['holeLiveDatenZurueck', sicherungsdienst.holeLiveDatenZurueck],
    ['spieleEin', appStore.spieleEin],
  ]
    .flatMap(([name, fn]) => fn.mock.invocationCallOrder.map(n => [n, name]))
    .sort((a, b) => a[0] - b[0])
    .map(([, name]) => name);
}

beforeEach(() => {
  jest.clearAllMocks();
  schaltungenAntworten();
  zweiStaende();
  appDatenbank.datenbankDa.mockResolvedValue(true);
  appContainer.halteAn.mockResolvedValue(true);
  appContainer.starteWieder.mockResolvedValue(undefined);
  appContainer.letzteZeilen.mockResolvedValue('Error: column "kostenstelle" already exists');
  appContainer.entferne.mockResolvedValue(true);
  sicherungsdienst.sichereVorLive.mockResolvedValue({ erfolg: true, id: STAND_ID });
  sicherungsdienst.holeLiveDatenZurueck.mockResolvedValue({ erfolg: true, ausgabe: 'zurueck' });
  appStore.schalte.mockResolvedValue({ app_id: 'probe', stand: 'live', version: '1.1.0' });
  appStore.spieleEin.mockResolvedValue({ app_id: 'probe', stand: 'live', version: '1.0.0' });
});

describe('Live schalten mit Sicherung (M5)', () => {
  test('anhalten, sichern, schalten, zusehen -- in dieser Reihenfolge', async () => {
    appContainer.bleibtGesund.mockResolvedValue({ gesund: true, sekunden: 31 });

    const ergebnis = await schalteLive({ appId: 'probe', durch: 7 });

    expect(reihenfolge()).toEqual(['halteAn', 'sichereVorLive', 'schalte', 'bleibtGesund']);
    expect(appStore.schalte).toHaveBeenCalledWith({ appId: 'probe', ziel: 'live', durch: 7 });
    expect(ergebnis.schaltung.ergebnis).toBe('live');
    expect(ergebnis.schaltung.sicherung_id).toBe(STAND_ID);
    expect(ergebnis.schaltung.satz).toMatch(/Probe ist live mit Fassung 1\.1\.0/);
    // Kein Rueckfall, keine Daten zurueck.
    expect(sicherungsdienst.holeLiveDatenZurueck).not.toHaveBeenCalled();
    expect(appContainer.entferne).not.toHaveBeenCalled();
  });

  test('ohne Sicherung wird nicht geschaltet, der alte Livestand laeuft weiter', async () => {
    sicherungsdienst.sichereVorLive.mockResolvedValue({
      erfolg: false,
      id: null,
      ausgabe: 'restic klemmt',
    });

    await expect(schalteLive({ appId: 'probe', durch: 7 })).rejects.toMatchObject({
      statusCode: 409,
      code: 'LIVE_NICHT_GESICHERT',
      details: { hilfe: expect.stringMatching(/Sicherung/) },
    });
    expect(appStore.schalte).not.toHaveBeenCalled();
    expect(appContainer.starteWieder).toHaveBeenCalledWith('probe', 'live');
    const update = db.query.mock.calls.find(([sql]) => /UPDATE public\.app_schaltungen/.test(sql));
    expect(update[1][1]).toBe('nicht_gesichert');
  });

  test('scheitert die neue Fassung, kommen Daten UND Fassung von vorher zurueck', async () => {
    appContainer.bleibtGesund
      .mockResolvedValueOnce({
        gesund: false,
        grund: 'Der Container ist abgestürzt und neu gestartet.',
        exitCode: 1,
        neustarts: 1,
      })
      .mockResolvedValueOnce({ gesund: true });

    const fehler = await schalteLive({ appId: 'probe', durch: 7 }).catch(f => f);

    expect(fehler.code).toBe('LIVE_ZURUECKGESCHALTET');
    expect(fehler.statusCode).toBe(409);
    // Ein Satz, der beide Fassungen nennt; der zweite sagt, was zu tun ist.
    expect(fehler.message).toBe(
      'Die neue Fassung 1.1.0 ließ sich nicht starten, deshalb läuft Probe wieder mit Fassung 1.0.0 und den Daten von vorher.'
    );
    expect(fehler.details.hilfe).toMatch(/Entwickler/);
    expect(fehler.details.schaltung.ergebnis).toBe('zurueckgeschaltet');
    expect(fehler.details.schaltung.technik).toMatchObject({
      exit_code: 1,
      sicherung_id: STAND_ID,
      letzte_zeilen: expect.stringMatching(/kostenstelle/),
    });

    expect(reihenfolge()).toEqual([
      'halteAn',
      'sichereVorLive',
      'schalte',
      'bleibtGesund',
      'entferne',
      'holeLiveDatenZurueck',
      'spieleEin',
      'bleibtGesund',
    ]);
    expect(sicherungsdienst.holeLiveDatenZurueck).toHaveBeenCalledWith('probe', STAND_ID);
    expect(appStore.spieleEin).toHaveBeenCalledWith({
      appId: 'probe',
      version: '1.0.0',
      stand: 'live',
      durch: 7,
      aenderungstext: 'Erste Fassung.',
    });
    // „Zurück auf" zeigt wieder auf 0.9.0, nicht auf die Fassung, die nie lief.
    const vorige = db.query.mock.calls.find(([sql]) => /SET vorige_version/.test(sql));
    expect(vorige[1]).toEqual(['probe', '0.9.0']);
  });

  test('der Teststand wird an keiner Stelle angefasst', async () => {
    appContainer.bleibtGesund
      .mockResolvedValueOnce({ gesund: false, grund: 'beendet', exitCode: 1, neustarts: 0 })
      .mockResolvedValueOnce({ gesund: true });
    await schalteLive({ appId: 'probe', durch: 7 }).catch(() => {});

    for (const fn of [
      appContainer.halteAn,
      appContainer.starteWieder,
      appContainer.entferne,
      appContainer.bleibtGesund,
      appContainer.letzteZeilen,
      appDatenbank.entferneStand,
    ]) {
      for (const aufruf of fn.mock.calls) {
        expect(aufruf).not.toContain('test');
      }
    }
    for (const [{ stand }] of appStore.spieleEin.mock.calls) {
      expect(stand).toBe('live');
    }
  });

  test('misslingt auch der Weg zurueck, sagt der Satz das und nennt die Sicherung', async () => {
    appContainer.bleibtGesund.mockResolvedValueOnce({ gesund: false, grund: 'unhealthy' });
    sicherungsdienst.holeLiveDatenZurueck.mockResolvedValue({ erfolg: false, ausgabe: 'kaputt' });
    appContainer.bleibtGesund.mockResolvedValueOnce({ gesund: true });

    const fehler = await schalteLive({ appId: 'probe', durch: 7 }).catch(f => f);
    expect(fehler.details.schaltung.ergebnis).toBe('fehlgeschlagen');
    expect(fehler.message).toMatch(/gelang nicht vollständig/);
    expect(fehler.details.hilfe).toMatch(/vor dem Live-Schalten/);
  });

  test('ein erstes Live-Schalten, das scheitert, hinterlaesst keinen Livestand', async () => {
    appStore.staendeVon.mockResolvedValue({
      test: { version: '1.0.0', manifest: { ...MIT_BACKEND, version: '1.0.0' } },
      live: null,
    });
    appDatenbank.datenbankDa.mockResolvedValue(false);
    appContainer.bleibtGesund.mockResolvedValue({ gesund: false, grund: 'beendet' });

    const fehler = await schalteLive({ appId: 'probe', durch: 7 }).catch(f => f);

    expect(fehler.code).toBe('LIVE_ZURUECKGESCHALTET');
    expect(fehler.message).toMatch(/noch nicht live/);
    // Nichts zu sichern, nichts zurueckzuholen.
    expect(appContainer.halteAn).not.toHaveBeenCalled();
    expect(sicherungsdienst.sichereVorLive).not.toHaveBeenCalled();
    expect(sicherungsdienst.holeLiveDatenZurueck).not.toHaveBeenCalled();
    expect(appStore.spieleEin).not.toHaveBeenCalled();
    // Weg faellt, was nur dieser Versuch angelegt hat.
    expect(db.query.mock.calls.some(([sql]) => /DELETE FROM public\.app_staende/.test(sql))).toBe(
      true
    );
    expect(appDatenbank.entferneStand).toHaveBeenCalledWith('probe', 'live');
  });

  test('eine App ohne Server-Teil schaltet wie bisher, ohne Sicherung', async () => {
    appStore.staendeVon.mockResolvedValue({
      test: { version: '2.0.0', manifest: { id: 'probe', frontend: {} } },
      live: null,
    });
    await schalteLive({ appId: 'probe', durch: 7 });
    expect(sicherungsdienst.sichereVorLive).not.toHaveBeenCalled();
    expect(appStore.schalte).toHaveBeenCalledWith({ appId: 'probe', ziel: 'live', durch: 7 });
  });

  test('zweimal zugleich: der zweite Versuch ist 409', async () => {
    let weiter;
    sicherungsdienst.sichereVorLive.mockReturnValue(
      new Promise(auf => {
        weiter = auf;
      })
    );
    appContainer.bleibtGesund.mockResolvedValue({ gesund: true });
    const erster = schalteLive({ appId: 'probe', durch: 7 });
    await new Promise(r => setImmediate(r));
    await expect(schalteLive({ appId: 'probe', durch: 7 })).rejects.toMatchObject({
      statusCode: 409,
    });
    weiter({ erfolg: true, id: STAND_ID });
    await erster;
  });

  test('ein Fehler vor dem Umschalten (der alte Container steht noch) holt keine Daten zurueck', async () => {
    const { ConflictError } = require('../../src/utils/errors');
    appStore.schalte.mockRejectedValue(new ConflictError('Die Lizenz traegt 3 Apps.'));
    appContainer.zustand.mockResolvedValue({ laeuft: false, image: 'probe:x' });

    await expect(schalteLive({ appId: 'probe', durch: 7 })).rejects.toThrow(
      'Die Lizenz traegt 3 Apps.'
    );
    expect(appContainer.starteWieder).toHaveBeenCalledWith('probe', 'live');
    expect(sicherungsdienst.holeLiveDatenZurueck).not.toHaveBeenCalled();
    expect(appContainer.entferne).not.toHaveBeenCalled();
    expect(
      db.query.mock.calls.some(([sql]) => /DELETE FROM public\.app_schaltungen/.test(sql))
    ).toBe(true);
  });

  test('hatte der alte Livestand keine Datenbank, faellt die halb angelegte', async () => {
    appStore.staendeVon.mockResolvedValue({
      test: { version: '2.0.0', manifest: { ...MIT_BACKEND, version: '2.0.0' } },
      live: { version: '1.0.0', vorige_version: null, manifest: { id: 'probe', frontend: {} } },
    });
    appDatenbank.datenbankDa.mockResolvedValue(false);
    appContainer.bleibtGesund.mockResolvedValue({ gesund: false, grund: 'beendet' });

    const fehler = await schalteLive({ appId: 'probe', durch: 7 }).catch(f => f);
    expect(fehler.code).toBe('LIVE_ZURUECKGESCHALTET');
    expect(appDatenbank.entferneStand).toHaveBeenCalledWith('probe', 'live');
    expect(appStore.spieleEin).toHaveBeenCalledWith(expect.objectContaining({ version: '1.0.0' }));
  });

  test('ein unerwarteter Fehler nach dem Umschalten laesst den Versuch nicht auf laeuft haengen', async () => {
    appContainer.bleibtGesund.mockResolvedValue({ gesund: true });
    db.query.mockImplementation(async sql => {
      if (/INSERT INTO public\.app_schaltungen/.test(sql)) return { rows: [{ id: 5 }] };
      if (/UPDATE public\.app_schaltungen/.test(sql)) throw new Error('Verbindung weg');
      return { rows: [] };
    });
    await expect(schalteLive({ appId: 'probe', durch: 7 })).rejects.toThrow('Verbindung weg');
    // Der alte Container ist ersetzt; ihn wieder zu starten ginge ins Leere.
    expect(appContainer.starteWieder).not.toHaveBeenCalled();
    expect(
      db.query.mock.calls.some(([sql]) => /DELETE FROM public\.app_schaltungen.*laeuft/s.test(sql))
    ).toBe(true);
  });

  test('ein unerwarteter Fehler beim Sichern startet den angehaltenen Livestand wieder', async () => {
    db.query.mockImplementation(async sql => {
      if (/INSERT INTO public\.app_schaltungen/.test(sql)) return { rows: [{ id: 5 }] };
      if (/UPDATE public\.app_schaltungen/.test(sql)) throw new Error('Verbindung weg');
      return { rows: [] };
    });
    sicherungsdienst.sichereVorLive.mockResolvedValue({ erfolg: false, id: null, ausgabe: 'x' });
    await expect(schalteLive({ appId: 'probe', durch: 7 })).rejects.toThrow('Verbindung weg');
    expect(appContainer.starteWieder).toHaveBeenCalledTimes(1);
    expect(appStore.schalte).not.toHaveBeenCalled();
  });

  test('zurueck laeuft unter derselben Sperre', async () => {
    let weiter;
    sicherungsdienst.sichereVorLive.mockReturnValue(
      new Promise(auf => {
        weiter = auf;
      })
    );
    appContainer.bleibtGesund.mockResolvedValue({ gesund: true });
    const erster = schalteLive({ appId: 'probe', durch: 7 });
    await new Promise(r => setImmediate(r));
    await expect(schalteZurueck({ appId: 'probe', durch: 7 })).rejects.toMatchObject({
      statusCode: 409,
    });
    weiter({ erfolg: true, id: STAND_ID });
    await erster;
  });
});
