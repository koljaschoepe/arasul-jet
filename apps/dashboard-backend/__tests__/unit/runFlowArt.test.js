/**
 * Die Art eines Flows am Ende des Laufs (M5).
 *
 * `ergebnis_bestaetigen` haelt den Lauf nach dem Ergebnis an und legt eine
 * Freigabe an; `autonom` nicht. Gemessen wird auch, dass ein wartender Lauf
 * nach einem Neustart mit dem Ergebnis weitergeht, das der Mensch gesehen hat,
 * ohne dass die Schritte noch einmal laufen.
 */

jest.mock('axios');
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { runFlow } = require('../../src/services/flows/runFlow');
const { LaufBeendet } = require('../../src/services/flows/freigabeAnfragen');

const basis = {
  systemPrompt: 'Schreibe.',
  argumente: [],
  werkzeuge: [],
  ordner: [],
  grenzen: { werkzeug_runden: 5, zeitlimit_s: 300, max_aufrufe: 20 },
};

function makeDeps(flowDef, { freigabe } = {}) {
  const freigabeTool = {
    name: 'freigabe_anfordern',
    parameters: {},
    execute: jest.fn(freigabe || (async () => 'Freigabe erteilt.')),
  };
  const store = {
    createRun: jest.fn(async () => ({ id: 7 })),
    startStep: jest.fn(async () => ({ id: 99 })),
    finishStep: jest.fn(async () => ({})),
    bumpSteps: jest.fn(async () => 1),
    finishRun: jest.fn(async () => ({})),
    saveChanges: jest.fn(async () => {}),
    getRun: jest.fn(async () => ({
      id: 7,
      status: 'fertig',
      steps_used: 0,
      changes: [],
      steps: [],
    })),
  };
  return {
    freigabeTool,
    store,
    loadFlow: jest.fn(async () => ({ ...flowDef })),
    makeTools: jest.fn(names => names.map(() => freigabeTool)),
    runLoop: jest.fn(async () => ({ result: 'Das Ergebnis', runden: 1 })),
    tracker: {
      snapshot: jest.fn(async () => new Map()),
      berechneAenderungen: jest.fn(() => ({ aenderungen: [], abgeschnitten: false })),
    },
    resolveModel: jest.fn(async () => 'm'),
  };
}

const lauf = { flowName: 'brief', userId: 1, appId: 'urlaub', stand: 'live' };

describe('runFlow: Art am Ende', () => {
  it('ergebnis_bestaetigen legt am Ende eine Freigabe mit dem Ergebnis an', async () => {
    const deps = makeDeps({
      ...basis,
      art: 'ergebnis_bestaetigen',
      stufen: [{ name: 'pruefung' }],
    });
    await runFlow(lauf, deps);

    expect(deps.freigabeTool.execute).toHaveBeenCalledTimes(1);
    const [params] = deps.freigabeTool.execute.mock.calls[0];
    expect(params.titel).toBe('Ergebnis bestätigen: brief');
    expect(params.zusammenhang).toBe('Das Ergebnis');
    expect(params.stufe).toBe('pruefung');
    const kontext = deps.freigabeTool.execute.mock.calls[0][1];
    expect(kontext.fortsetzung).toEqual(
      expect.objectContaining({ ende: true, ergebnis: 'Das Ergebnis', schritt_id: 99 })
    );
    expect(deps.store.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'fertig', result: 'Das Ergebnis' })
    );
  });

  it('autonom legt keine Freigabe an', async () => {
    const deps = makeDeps({ ...basis, art: 'autonom' });
    await runFlow(lauf, deps);
    expect(deps.freigabeTool.execute).not.toHaveBeenCalled();
    expect(deps.store.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'fertig' })
    );
  });

  it('ein Flow ohne Art (Plattform, Paket ohne arten) bleibt, wie er war', async () => {
    const deps = makeDeps({ ...basis });
    await runFlow({ flowName: 'brief', userId: 1 }, deps);
    expect(deps.freigabeTool.execute).not.toHaveBeenCalled();
  });

  it('eine Ablehnung beendet den Lauf, ohne ihn als Fehler zu schreiben', async () => {
    const deps = makeDeps(
      { ...basis, art: 'ergebnis_bestaetigen' },
      {
        freigabe: async () => {
          throw new LaufBeendet('Freigabe abgelehnt', 'abgebrochen');
        },
      }
    );
    await runFlow(lauf, deps);
    expect(deps.store.finishRun).not.toHaveBeenCalled();
    expect(deps.store.finishStep).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'abgebrochen' })
    );
  });

  it('nach einem Neustart gilt das Ergebnis aus dem Pruefpunkt, die Schritte laufen nicht noch einmal', async () => {
    const deps = makeDeps({ ...basis, art: 'ergebnis_bestaetigen' });
    await runFlow(
      {
        ...lauf,
        existingRunId: 7,
        fortsetzenAb: {
          ende: true,
          ergebnis: 'Was der Mensch sah',
          schritt: 0,
          name: 'ergebnis_bestaetigen',
        },
      },
      deps
    );
    expect(deps.runLoop).not.toHaveBeenCalled();
    expect(deps.freigabeTool.execute).not.toHaveBeenCalled();
    expect(deps.store.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'fertig', result: 'Was der Mensch sah' })
    );
  });
});
