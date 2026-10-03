/**
 * Ein wartender Lauf setzt sich nach einem Neustart fort (M5).
 *
 * Der Runner bekommt `fortsetzenAb` und die Lauf-Zeile mit ihren Schritten, wie
 * `flowRunner.fortsetzen` sie nach der Bestaetigung hinterlaesst: der Schritt
 * der Freigabe ist geschlossen, die davor stehen mit ihren Ausgaben im
 * Protokoll. Gemessen wird, was nach dem Halt passiert -- und was NICHT noch
 * einmal.
 */

jest.mock('axios');
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { runFlow } = require('../../src/services/flows/runFlow');
const { ValidationError } = require('../../src/utils/errors');

function fakeTool(name, fn) {
  return {
    name,
    parameters: {},
    toOllamaToolDefinition: () => ({ type: 'function', function: { name } }),
    execute: jest.fn(fn || (async () => `${name}-ok`)),
  };
}

const flow = {
  systemPrompt: 'Schreibe das Ergebnis.',
  argumente: [],
  werkzeuge: ['dateien_suchen', 'freigabe_anfordern'],
  ordner: [],
  grenzen: { werkzeug_runden: 5, zeitlimit_s: 300, max_aufrufe: 20 },
  schritte: [
    { name: 'sammeln', typ: 'werkzeug', werkzeug: 'dateien_suchen', parameter: {}, iterationen: 1 },
    {
      name: 'freigeben',
      typ: 'werkzeug',
      werkzeug: 'freigabe_anfordern',
      parameter: { titel: 'Darf das raus?' },
      iterationen: 1,
    },
    { name: 'senden', typ: 'werkzeug', werkzeug: 'dateien_suchen', parameter: {}, iterationen: 1 },
  ],
};

/** Das Protokoll eines Laufs, der am zweiten Schritt gehalten hat und bestaetigt wurde. */
const SCHRITTE_BIS_ZUR_FREIGABE = [
  {
    id: 1,
    parent_step_id: null,
    kind: 'werkzeug',
    name: 'dateien_suchen',
    status: 'fertig',
    output: 'Treffer A',
  },
  {
    id: 2,
    parent_step_id: null,
    kind: 'werkzeug',
    name: 'freigabe_anfordern',
    status: 'fertig',
    output: 'Freigabe erteilt von chefin am 2026-10-04.',
  },
];

function makeDeps({ steps = SCHRITTE_BIS_ZUR_FREIGABE, geladen = flow } = {}) {
  const tools = [];
  const store = {
    createRun: jest.fn(),
    startStep: jest.fn(async () => ({ id: 99 })),
    finishStep: jest.fn(async () => ({})),
    bumpSteps: jest.fn(async () => 1),
    finishRun: jest.fn(async () => ({})),
    saveChanges: jest.fn(async () => {}),
    getRun: jest.fn(async () => ({ id: 42, status: 'laeuft', steps_used: 2, changes: [], steps })),
  };
  return {
    tools,
    store,
    loadFlow: jest.fn(async () => ({ ...geladen })),
    makeTools: jest.fn(names =>
      names.map(n => {
        const t = fakeTool(n);
        tools.push(t);
        return t;
      })
    ),
    runLoop: jest.fn(async () => ({ result: 'Synthese', runden: 1 })),
    tracker: {
      snapshot: jest.fn(async () => new Map()),
      berechneAenderungen: jest.fn(() => ({ aenderungen: [], abgeschnitten: false })),
    },
    resolveModel: jest.fn(async () => 'm'),
  };
}

describe('runFlow mit fortsetzenAb', () => {
  it('fuehrt nur die Schritte NACH der Freigabe aus und gibt die Ausgaben davor weiter', async () => {
    const deps = makeDeps();
    await runFlow(
      {
        flowName: 'brief',
        userId: 1,
        existingRunId: 42,
        fortsetzenAb: { schritt: 1, name: 'freigeben' },
      },
      deps
    );

    // `senden` lief, `sammeln` und `freigeben` NICHT noch einmal.
    expect(deps.store.startStep).toHaveBeenCalledTimes(1);
    expect(deps.store.startStep).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 42, kind: 'werkzeug', name: 'dateien_suchen' })
    );
    // Und keine „uebernommen"-Vermerke: die Schritte stehen schon in diesem Lauf.
    expect(deps.store.startStep).not.toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ uebernommen: true }) })
    );
    // Die Synthese sieht die Ausgaben VOR dem Halt.
    const eingabe = deps.runLoop.mock.calls[0][0].userInput;
    expect(eingabe).toContain('Treffer A');
    expect(eingabe).toContain('Freigabe erteilt von chefin');
    expect(deps.store.createRun).not.toHaveBeenCalled();
  });

  it('zaehlt die Schritte vor dem Halt mit', async () => {
    const deps = makeDeps();
    await runFlow(
      {
        flowName: 'brief',
        userId: 1,
        existingRunId: 42,
        fortsetzenAb: { schritt: 1, name: 'freigeben' },
      },
      deps
    );
    expect(deps.store.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 42, status: 'fertig', stepsUsed: 3 })
    );
  });

  it('weist ab, wenn der Flow sich waehrend des Wartens geaendert hat', async () => {
    const deps = makeDeps({
      geladen: {
        ...flow,
        schritte: [flow.schritte[0], { ...flow.schritte[1], name: 'anders' }, flow.schritte[2]],
      },
    });
    await expect(
      runFlow(
        {
          flowName: 'brief',
          userId: 1,
          existingRunId: 42,
          fortsetzenAb: { schritt: 1, name: 'freigeben' },
        },
        deps
      )
    ).rejects.toThrow(ValidationError);
    expect(deps.store.startStep).not.toHaveBeenCalled();
  });

  it('raet nicht, wenn die Ausgabe eines frueheren Schritts fehlt', async () => {
    const deps = makeDeps({ steps: [SCHRITTE_BIS_ZUR_FREIGABE[1]] });
    await expect(
      runFlow(
        {
          flowName: 'brief',
          userId: 1,
          existingRunId: 42,
          fortsetzenAb: { schritt: 1, name: 'freigeben' },
        },
        deps
      )
    ).rejects.toThrow(/nicht vollständig/);
    expect(deps.store.startStep).not.toHaveBeenCalled();
  });

  it('reicht dem Werkzeug den Pruefpunkt mit dem Protokoll-Schritt mit', async () => {
    const deps = makeDeps({ steps: [] });
    const flowMitHalt = { ...flow, schritte: [flow.schritte[1]] };
    deps.loadFlow = jest.fn(async () => ({ ...flowMitHalt }));
    await runFlow(
      { flowName: 'brief', userId: 1, args: {} },
      { ...deps, store: { ...deps.store, createRun: jest.fn(async () => ({ id: 5 })) } }
    );
    const ausgefuehrt = deps.tools.find(t => t.execute.mock.calls.length > 0);
    const kontext = ausgefuehrt.execute.mock.calls[0][1];
    expect(kontext.fortsetzung).toEqual({ schritt: 0, name: 'freigeben', schritt_id: 99 });
    expect(kontext.stufen).toBeNull();
  });
});
