/**
 * Lauf-Verwalter für Flows (Plan 011, Schritt 12).
 *
 * Die zwei Zusagen, auf die es ankommt:
 *  - Ein Lauf startet LOSGELÖST: die Startfunktion kehrt sofort zurück, ohne auf
 *    das Ende des Laufs zu warten.
 *  - Ein Abbruch setzt das Signal (der Lauf hört wirklich auf), nicht nur die DB.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
// runFlow/runStore werden über deps injiziert; das echte Modul ziehen wir aber
// nicht mit (es hängt an der DB). Deshalb hier mocken.
jest.mock('../../src/services/flows/runFlow', () => ({ runFlow: jest.fn() }));
jest.mock('../../src/services/flows/runStore', () => ({
  createRun: jest.fn(),
  finishRun: jest.fn(),
  cancelRun: jest.fn(),
}));

jest.mock('../../src/services/flows/flowSettings', () => ({
  istAktiv: jest.fn(async () => true),
}));

const flowRunner = require('../../src/services/flows/flowRunner');

beforeEach(() => {
  jest.clearAllMocks();
  flowRunner._reset();
});

describe('starten', () => {
  it('kehrt SOFORT mit der Lauf-ID zurück, ohne auf das Ende zu warten', async () => {
    const store = { createRun: jest.fn(async () => ({ id: 7 })), finishRun: jest.fn() };
    // Ein Lauf, der NIE fertig wird — starten muss trotzdem zurückkehren.
    const run = jest.fn(() => new Promise(() => {}));

    const t0 = Date.now();
    const { runId } = await flowRunner.starten(
      { flowName: 'notiz', args: { a: '1' }, userId: 1 },
      { run, store }
    );
    expect(runId).toBe(7);
    expect(Date.now() - t0).toBeLessThan(500); // nicht blockiert
    // runFlow wurde mit der bestehenden ID und einem Signal gestartet.
    const arg = run.mock.calls[0][0];
    expect(arg.existingRunId).toBe(7);
    expect(arg.signal).toBeInstanceOf(AbortSignal);
  });

  it('reicht den Einreicher an den Lauf weiter (Protokoll der Modellaufrufe, J35)', async () => {
    const store = { createRun: jest.fn(async () => ({ id: 9 })), finishRun: jest.fn() };
    const run = jest.fn(() => new Promise(() => {}));
    await flowRunner.starten(
      { flowName: 'bescheid', userId: 1, appId: 'abschluss', stand: 'live', einreicherId: 5 },
      { run, store }
    );
    expect(run.mock.calls[0][0]).toMatchObject({ appId: 'abschluss', einreicherId: 5 });
  });

  it('startet einen ausgeschalteten Flow einer App nicht: 409 FLOW_INAKTIV, kein Lauf (M5)', async () => {
    const store = { createRun: jest.fn(async () => ({ id: 10 })), finishRun: jest.fn() };
    const run = jest.fn(() => new Promise(() => {}));
    const flowAn = jest.fn(async () => false);
    await expect(
      flowRunner.starten(
        { flowName: 'bescheid', userId: 1, appId: 'abschluss', stand: 'live' },
        { run, store, flowAn }
      )
    ).rejects.toMatchObject({ statusCode: 409, code: 'FLOW_INAKTIV' });
    expect(flowAn).toHaveBeenCalledWith({ appId: 'abschluss', flowName: 'bescheid' });
    expect(store.createRun).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('fragt bei einem Flow der Plattform nicht nach dem Schalter', async () => {
    const store = { createRun: jest.fn(async () => ({ id: 11 })), finishRun: jest.fn() };
    const run = jest.fn(() => new Promise(() => {}));
    const flowAn = jest.fn(async () => false);
    await flowRunner.starten({ flowName: 'notiz', userId: 1 }, { run, store, flowAn });
    expect(flowAn).not.toHaveBeenCalled();
    expect(store.createRun).toHaveBeenCalled();
  });

  it('findet den Lauf, auch wenn Postgres die ID als STRING liefert und die Route eine ZAHL nutzt', async () => {
    // Der Fehler, der nur auf dem Gerät auftrat: createRun gibt "8" (String,
    // BIGSERIAL), die Route wandelt ihren Pfad-Parameter in die Zahl 8.
    // Ohne Normalisierung fände abbrechen(8) den unter "8" abgelegten Lauf nie.
    const store = {
      createRun: jest.fn(async () => ({ id: '8' })),
      finishRun: jest.fn(),
      cancelRun: jest.fn(async () => ({ id: 8, status: 'abgebrochen' })),
    };
    let signal;
    const run = jest.fn(async p => {
      signal = p.signal;
      return new Promise(() => {}); // läuft weiter
    });
    const { runId } = await flowRunner.starten({ flowName: 'notiz', userId: 1 }, { run, store });
    expect(runId).toBe(8); // als ZAHL zurückgegeben, nicht als String
    expect(typeof runId).toBe('number');

    // Wie die Route: mit der ZAHL abbrechen.
    await flowRunner.abbrechen({ runId: 8 }, { store });
    expect(signal.aborted).toBe(true);
  });

  it('setzt den Lauf bei einem Hintergrund-Fehler auf "fehler"', async () => {
    const store = {
      createRun: jest.fn(async () => ({ id: 10 })),
      finishRun: jest.fn(async () => ({})),
    };
    const run = jest.fn(async () => {
      throw new Error('geplatzt');
    });
    await flowRunner.starten({ flowName: 'notiz', userId: 1 }, { run, store });
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    expect(store.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 10, status: 'fehler' })
    );
  });
});

describe('abbrechen', () => {
  it('setzt DB-Status UND das Abbruch-Signal des laufenden Laufs', async () => {
    const store = {
      createRun: jest.fn(async () => ({ id: 11 })),
      finishRun: jest.fn(),
      cancelRun: jest.fn(async () => ({ id: 11, status: 'abgebrochen' })),
    };
    let signal;
    const run = jest.fn(async p => {
      signal = p.signal;
      return new Promise(() => {}); // läuft weiter, bis abgebrochen
    });
    await flowRunner.starten({ flowName: 'notiz', userId: 1 }, { run, store });

    expect(signal.aborted).toBe(false);
    const res = await flowRunner.abbrechen({ runId: 11, userId: 1 }, { store });
    expect(res).toMatchObject({ status: 'abgebrochen' });
    expect(store.cancelRun).toHaveBeenCalledWith({ runId: 11, userId: 1 });
    expect(signal.aborted).toBe(true); // der Lauf bekommt den Abbruch WIRKLICH mit
  });

  it('gibt null zurück (und signalisiert nichts), wenn nichts abzubrechen war', async () => {
    const store = { cancelRun: jest.fn(async () => null) };
    const res = await flowRunner.abbrechen({ runId: 12, userId: 1 }, { store });
    expect(res).toBeNull();
  });
});

describe('verwaisteAufraeumen', () => {
  it('setzt beim Start alle noch laufenden Läufe auf "fehler"', async () => {
    const db = { query: jest.fn(async () => ({ rowCount: 2, rows: [{ id: 1 }, { id: 2 }] })) };
    const n = await flowRunner.verwaisteAufraeumen({ db });
    expect(n).toBe(2);
    // Zuerst die Laeufe mit begonnener Uebergabe (M5): sie werden
    // `nicht_uebergeben`, danach erst trifft der Rest `fehler`.
    const uebergabe = db.query.mock.calls[0][0];
    expect(uebergabe).toMatch(/SET status = 'nicht_uebergeben'/);
    expect(uebergabe).toMatch(/status = 'laeuft' AND abschluss IS NOT NULL/);
    const sql = db.query.mock.calls[1][0];
    expect(sql).toMatch(/UPDATE flow_runs/);
    // `wartend` gehoert dazu (Phase C7), aber nur OHNE Pruefpunkt (M5): ein
    // Lauf der Werkzeug-Schleife haengt an einem Versprechen in DIESEM Prozess
    // und wartet nach einem Neustart auf etwas, das ihn nie mehr fortsetzt. Einer
    // mit `fortsetzung` bleibt stehen und wird fortgesetzt.
    expect(sql).toMatch(/status = 'laeuft'\s+OR \(status = 'wartend' AND fortsetzung IS NULL\)/);
    expect(sql).toMatch(/SET status = 'fehler'/);
  });

  it('laesst Laeufe in Ruhe, die dieser Prozess schon fuehrt (Bestaetigung waehrend des Hochfahrens)', async () => {
    const store = { createRun: jest.fn(async () => ({ id: 12 })), finishRun: jest.fn() };
    await flowRunner.starten(
      { flowName: 'n', userId: 1 },
      { run: jest.fn(() => new Promise(() => {})), store }
    );
    const db = { query: jest.fn(async () => ({ rowCount: 0, rows: [] })) };
    await flowRunner.verwaisteAufraeumen({ db });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/NOT \(id = ANY\(\$1::bigint\[\]\)\)/);
    expect(params).toEqual([[12]]);
  });
});
