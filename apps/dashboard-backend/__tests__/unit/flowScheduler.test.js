/**
 * Unit-Tests für den Flow-Scheduler (Plan 013, B8).
 *
 * Store und Runner werden injiziert — getestet wird die Logik: fällige
 * Zeitpläne starten und neu terminieren, Ereignis-Auslöser feuern, Fehler je
 * Auslöser isolieren (einer bricht die anderen nicht), nächsten Zeitpunkt auch
 * im Fehlerfall setzen.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';

const scheduler = require('../../src/services/flows/scheduler');
const registry = require('../../src/services/flows/flowRegistry');
const runFlow = require('../../src/services/flows/runFlow');

// Flow-Prüfung neutralisieren: der Scheduler ruft loadFlow + resolveArguments.
jest.spyOn(registry, 'loadFlow').mockImplementation(async name => ({
  name,
  argumente: [],
}));
jest.spyOn(runFlow, 'resolveArguments').mockReturnValue({});

function fakeRunner(starteMock) {
  return { starten: starteMock };
}

describe('tick', () => {
  test('startet jeden fälligen Zeitplan und terminiert neu', async () => {
    const gefeuert = [];
    const store = {
      faelligeZeitplaene: jest.fn().mockResolvedValue([
        { id: 1, flow_name: 'recherche', cron: '0 8 * * *', args: {}, user_id: 3 },
        { id: 2, flow_name: 'bericht', cron: '0 * * * *', args: {}, user_id: 3 },
      ]),
      markiereGefeuert: jest.fn().mockImplementation(async p => gefeuert.push(p)),
    };
    const starten = jest.fn().mockResolvedValue({ runId: 42 });

    const anzahl = await scheduler.tick({
      store,
      runner: fakeRunner(starten),
      reg: registry,
      jetzt: new Date(2026, 6, 27, 8, 0),
    });

    expect(anzahl).toBe(2);
    expect(starten).toHaveBeenCalledTimes(2);
    expect(gefeuert).toHaveLength(2);
    // Jeder bekam einen neuen next_run_at (Date) und keine Fehlerursache.
    for (const g of gefeuert) {
      expect(g.error).toBeNull();
      expect(g.nextRunAt).toBeInstanceOf(Date);
      expect(g.runId).toBe(42);
    }
  });

  test('ein fehlerhafter Auslöser kippt die anderen nicht, next_run_at wird trotzdem gesetzt', async () => {
    const gefeuert = [];
    const store = {
      faelligeZeitplaene: jest.fn().mockResolvedValue([
        { id: 1, flow_name: 'kaputt', cron: '0 8 * * *', args: {}, user_id: 3 },
        { id: 2, flow_name: 'ok', cron: '0 8 * * *', args: {}, user_id: 3 },
      ]),
      markiereGefeuert: jest.fn().mockImplementation(async p => gefeuert.push(p)),
    };
    const starten = jest
      .fn()
      .mockRejectedValueOnce(new Error('Flow weg'))
      .mockResolvedValueOnce({ runId: 7 });

    await scheduler.tick({
      store,
      runner: fakeRunner(starten),
      reg: registry,
      jetzt: new Date(2026, 6, 27, 8, 0),
    });

    expect(gefeuert).toHaveLength(2);
    expect(gefeuert[0].error).toBe('Flow weg');
    expect(gefeuert[0].nextRunAt).toBeInstanceOf(Date); // trotzdem neu terminiert
    expect(gefeuert[0].runId).toBeNull();
    expect(gefeuert[1].error).toBeNull();
    expect(gefeuert[1].runId).toBe(7);
  });
});

describe('feuerEreignis', () => {
  test('startet alle Auslöser mit passendem Namen und meldet die Läufe', async () => {
    const store = {
      ereignisAusloeser: jest.fn().mockResolvedValue([
        { id: 5, flow_name: 'import', args: {}, user_id: 2 },
        { id: 6, flow_name: 'melden', args: {}, user_id: 2 },
      ]),
      markiereGefeuert: jest.fn().mockResolvedValue(undefined),
    };
    const starten = jest
      .fn()
      .mockResolvedValueOnce({ runId: 11 })
      .mockResolvedValueOnce({ runId: 12 });

    const res = await scheduler.feuerEreignis('neue-rechnung', {
      store,
      runner: fakeRunner(starten),
      reg: registry,
    });

    expect(store.ereignisAusloeser).toHaveBeenCalledWith({ eventName: 'neue-rechnung' });
    expect(res.ausgeloest).toBe(2);
    expect(res.laeufe).toEqual([
      { scheduleId: 5, runId: 11 },
      { scheduleId: 6, runId: 12 },
    ]);
  });

  test('kein passender Auslöser → nichts gestartet', async () => {
    const store = {
      ereignisAusloeser: jest.fn().mockResolvedValue([]),
      markiereGefeuert: jest.fn(),
    };
    const starten = jest.fn();
    const res = await scheduler.feuerEreignis('unbekannt', {
      store,
      runner: fakeRunner(starten),
      reg: registry,
    });
    expect(res.ausgeloest).toBe(0);
    expect(starten).not.toHaveBeenCalled();
  });
});
