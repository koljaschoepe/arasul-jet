/**
 * Der Weg zurueck (Phase C9, 27.08.2026).
 *
 * Gemessen wird hier der Schritt, den man vergisst: eine Wiederherstellung
 * holt Datenbank und Dateien zurueck, und danach laeuft trotzdem kein einziger
 * App-Container. Auf einem leeren Geraet gibt es nicht einmal mehr ein Image.
 * Erst `spieleEin` je Stand macht aus den zurueckgeholten Paketen wieder eine
 * laufende App -- und genau danach fragt Abnahme A6.
 */

const { PassThrough } = require('stream');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/app/appStore', () => ({ spieleEin: jest.fn() }));

const mockExec = jest.fn();
const mockInspect = jest.fn();
jest.mock('../../src/services/core/docker', () => ({
  docker: { getContainer: jest.fn(() => ({ inspect: mockInspect, exec: mockExec })) },
  getAllServicesStatus: jest.fn(),
}));

const db = require('../../src/database');
const appStore = require('../../src/services/app/appStore');
const sicherungsdienst = require('../../src/services/betrieb/sicherungsdienst');

/** Ein Skriptlauf im Container, der `code` zurueckgibt und `text` ausgibt. */
function containerLauf(code, text = '') {
  mockInspect.mockResolvedValue({ State: { Running: true } });
  mockExec.mockResolvedValue({
    start: async () => {
      const strom = new PassThrough();
      // Erst zurueckgeben, dann schreiben und schliessen: der Aufrufer haengt
      // seine Zuhoerer an, nachdem `start` aufgeloest hat.
      setImmediate(() => {
        if (text) strom.write(text);
        strom.end();
      });
      return strom;
    },
    inspect: async () => ({ ExitCode: code }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('stelleWiederHer', () => {
  it('spielt danach jeden App-Stand aus seinem Paket neu ein', async () => {
    containerLauf(0, 'Fertig in 42s.');
    db.query.mockResolvedValue({
      rows: [
        { app_id: 'beispielapp', stand: 'live', version: '1.0.0' },
        { app_id: 'beispielapp', stand: 'test', version: '1.1.0' },
      ],
    });
    appStore.spieleEin.mockResolvedValue({});

    const ergebnis = await sicherungsdienst.stelleWiederHer({ durch: 1 });

    expect(ergebnis.erfolg).toBe(true);
    expect(appStore.spieleEin).toHaveBeenCalledTimes(2);
    expect(appStore.spieleEin).toHaveBeenCalledWith({
      appId: 'beispielapp',
      stand: 'live',
      version: '1.0.0',
      durch: 1,
    });
  });

  it('haelt bei einer App, die nicht hochkommt, die anderen nicht auf', async () => {
    // Wer neun von zehn Apps zurueckbekommt, muss wissen, welche die zehnte
    // ist. Ein Abbruch beim ersten Fehler verschweigt die restlichen.
    containerLauf(0);
    db.query.mockResolvedValue({
      rows: [
        { app_id: 'kaputt', stand: 'live', version: '1.0.0' },
        { app_id: 'heil', stand: 'live', version: '2.0.0' },
      ],
    });
    appStore.spieleEin
      .mockRejectedValueOnce(new Error('Image liess sich nicht bauen'))
      .mockResolvedValueOnce({});

    const ergebnis = await sicherungsdienst.stelleWiederHer({});

    expect(ergebnis.erfolg).toBe(false);
    expect(appStore.spieleEin).toHaveBeenCalledTimes(2);
    expect(ergebnis.apps).toEqual([
      expect.objectContaining({ app_id: 'kaputt', erfolg: false, grund: expect.any(String) }),
      expect.objectContaining({ app_id: 'heil', erfolg: true }),
    ]);
  });

  it('baut nichts neu, wenn das Zurueckspielen selbst gescheitert ist', async () => {
    // Sonst liefe `spieleEin` gegen eine Datenbank, die halb zurueckgespielt
    // ist, und ersetzte laufende Container durch das Ergebnis eines Abbruchs.
    containerLauf(1, 'FEHLER: die Sicherung laesst sich nicht lesen');

    const ergebnis = await sicherungsdienst.stelleWiederHer({});

    expect(ergebnis.erfolg).toBe(false);
    expect(appStore.spieleEin).not.toHaveBeenCalled();
    expect(ergebnis.ausgabe).toMatch(/nicht lesen/);
  });

  it('gibt die Ausgabe als Text zurueck, ohne den Vorspann des Docker-Stroms (J35)', async () => {
    // So kommt es am Geraet an: ohne Terminal stellt Docker jedem Block acht
    // Byte voran, und das letzte davon (die Laenge) ist fast immer druckbar.
    const block = text => {
      const kopf = Buffer.alloc(8);
      kopf[0] = 1;
      kopf.writeUInt32BE(Buffer.byteLength(text), 4);
      return Buffer.concat([kopf, Buffer.from(text)]);
    };
    // Laengen von 32 Byte an: darunter waere das Laengenbyte ein
    // Steuerzeichen, und der Fehler zeigte sich nicht.
    const zeilen = [
      '[2026-09-25 12:00:00] Sicherung 20260925_110000 gelesen\n',
      '[2026-09-25 12:00:04] Datenbank arasul_db zurueckgespielt\n',
      '[2026-09-25 12:00:09] Fertig in 9s.\n',
    ];
    containerLauf(1, Buffer.concat(zeilen.map(block)));

    const ergebnis = await sicherungsdienst.stelleWiederHer({});

    expect(ergebnis.ausgabe).toBe(zeilen.join('').trim());
  });

  it('nimmt einen Pfad als Namen der Sicherung nicht an', async () => {
    containerLauf(0);
    await expect(sicherungsdienst.stelleWiederHer({ datei: '../../etc/passwd' })).rejects.toThrow(
      /nur Buchstaben, Ziffern/
    );
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('sagt es, wenn der Sicherungsdienst gar nicht laeuft', async () => {
    mockInspect.mockResolvedValue({ State: { Running: false } });
    await expect(sicherungsdienst.stelleWiederHer({})).rejects.toThrow(/läuft nicht/);
  });
});

describe('nur eines zur Zeit', () => {
  it('weist einen zweiten Lauf ab, statt sich selbst die Grundlage wegzuziehen', async () => {
    mockInspect.mockResolvedValue({ State: { Running: true } });
    let freigeben;
    mockExec.mockResolvedValue({
      start: async () => {
        const strom = new PassThrough();
        freigeben = () => strom.end();
        return strom;
      },
      inspect: async () => ({ ExitCode: 0 }),
    });
    db.query.mockResolvedValue({ rows: [] });

    const erster = sicherungsdienst.sichereJetzt();
    // Kurz warten, damit der erste Lauf den Merker gesetzt hat.
    await new Promise(fertig => setImmediate(fertig));

    await expect(sicherungsdienst.stelleWiederHer({})).rejects.toThrow(/läuft gerade: sicherung/);

    freigeben();
    await erster;
  });
});
