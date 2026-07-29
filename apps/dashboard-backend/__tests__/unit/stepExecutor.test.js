/**
 * Unit-Tests für den deterministischen Schritt-Executor (Plan 013, B7).
 *
 * Alle schweren Abhängigkeiten (Rollen-Delegation, Modell-Schleife, Werkzeug-
 * Ausführung) werden injiziert — getestet wird ausschließlich die Logik des
 * Executors: Reihenfolge, Vorlagen-Einsetzung, Threading der Ausgaben,
 * Iteration, Synthese, Abbruch und Fehlerbehandlung.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';

const {
  executeSteps,
  resolveParams,
  buildSynthesisInput,
  berechneVorabErgebnisse,
} = require('../../src/services/flows/stepExecutor');

/** Eine austauschbare SubagentTool-Klasse, die einen injizierten Mock ruft. */
function makeFakeSubagent(mock) {
  return class FakeSubagent {
    async execute(params, context) {
      return mock(params, context);
    }
  };
}

const grenzen = { zeitlimit_s: 900 };

describe('resolveParams', () => {
  test('ersetzt nur String-Vorlagen, lässt Zahlen/Booleans unangetastet', () => {
    const out = resolveParams({ q: '{{thema}}', n: 5, b: true }, { thema: 'Katzen' });
    expect(out).toEqual({ q: 'Katzen', n: 5, b: true });
  });
});

describe('buildSynthesisInput', () => {
  test('hängt die Schritt-Ausgaben in Reihenfolge an', () => {
    const text = buildSynthesisInput('UI', [{ name: 'a' }, { name: 'b' }], { a: 'A', b: 'B' });
    expect(text).toContain('UI');
    expect(text.indexOf('Schritt „a"')).toBeLessThan(text.indexOf('Schritt „b"'));
    expect(text).toContain('A');
    expect(text).toContain('B');
  });
});

describe('executeSteps', () => {
  test('führt subagent-Schritte in Reihenfolge aus und threadet Ausgaben', async () => {
    const subMock = jest
      .fn()
      .mockResolvedValueOnce('OUT1')
      .mockResolvedValueOnce('OUT2');
    const runLoop = jest.fn().mockResolvedValue({ result: 'FINAL' });

    const flow = {
      schritte: [
        { name: 'a', typ: 'subagent', rolle: 'r1', auftrag: 'do {{thema}}', iterationen: 1 },
        { name: 'b', typ: 'subagent', rolle: 'r2', auftrag: 'use {{a}}', iterationen: 1 },
      ],
      systemPrompt: 'Body {{thema}}',
      grenzen,
    };

    const res = await executeSteps({
      flow,
      werte: { thema: 'X' },
      userInput: 'UI',
      model: 'm',
      context: { rollen: [] },
      makeTools: () => [],
      runLoop,
      recordWerkzeug: jest.fn(),
      SubagentToolClass: makeFakeSubagent(subMock),
    });

    expect(res.result).toBe('FINAL');
    // Reihenfolge + Vorlagen: Schritt b sieht die Ausgabe von a als {{a}}.
    expect(subMock).toHaveBeenNthCalledWith(1, { rolle: 'r1', auftrag: 'do X' }, expect.any(Object));
    expect(subMock).toHaveBeenNthCalledWith(
      2,
      { rolle: 'r2', auftrag: 'use OUT1' },
      expect.any(Object)
    );
    // Synthese bekommt beide Ausgaben, den gefüllten Rumpf-Prompt und genau 1 Runde.
    const synth = runLoop.mock.calls[0][0];
    expect(synth.systemPrompt).toBe('Body X');
    expect(synth.userInput).toContain('OUT1');
    expect(synth.userInput).toContain('OUT2');
    expect(synth.maxRunden).toBe(1);
  });

  test('werkzeug-Schritt löst recordWerkzeug mit eingesetzten Parametern aus', async () => {
    const recordWerkzeug = jest.fn().mockResolvedValue('RES');
    const runLoop = jest.fn().mockResolvedValue({ result: 'F' });

    const flow = {
      schritte: [
        {
          name: 'w',
          typ: 'werkzeug',
          werkzeug: 'web_suche',
          parameter: { q: '{{thema}}' },
          iterationen: 1,
        },
      ],
      systemPrompt: 'B',
      grenzen,
    };

    await executeSteps({
      flow,
      werte: { thema: 'Y' },
      userInput: 'UI',
      model: 'm',
      context: {},
      makeTools: () => [],
      runLoop,
      recordWerkzeug,
      SubagentToolClass: makeFakeSubagent(jest.fn()),
    });

    expect(recordWerkzeug).toHaveBeenCalledWith({ werkzeug: 'web_suche', params: { q: 'Y' } });
  });

  test('Iteration wiederholt den Schritt und reicht {{vorher}} weiter', async () => {
    const subMock = jest.fn().mockResolvedValueOnce('A').mockResolvedValueOnce('B');
    const runLoop = jest.fn().mockResolvedValue({ result: 'F' });

    const flow = {
      schritte: [{ name: 's', typ: 'subagent', rolle: 'r', auftrag: 'refine {{vorher}}', iterationen: 2 }],
      systemPrompt: 'B',
      grenzen,
    };

    await executeSteps({
      flow,
      werte: {},
      userInput: 'UI',
      model: 'm',
      context: {},
      makeTools: () => [],
      runLoop,
      recordWerkzeug: jest.fn(),
      SubagentToolClass: makeFakeSubagent(subMock),
    });

    expect(subMock).toHaveBeenNthCalledWith(1, { rolle: 'r', auftrag: 'refine ' }, expect.any(Object));
    expect(subMock).toHaveBeenNthCalledWith(2, { rolle: 'r', auftrag: 'refine A' }, expect.any(Object));
  });

  test('bricht bei gesetztem Abbruch-Signal ab, ohne zu synthetisieren', async () => {
    const runLoop = jest.fn().mockResolvedValue({ result: 'F' });
    const flow = {
      schritte: [{ name: 'a', typ: 'subagent', rolle: 'r', auftrag: 'x', iterationen: 1 }],
      systemPrompt: 'B',
      grenzen,
    };

    const res = await executeSteps({
      flow,
      werte: {},
      userInput: 'UI',
      model: 'm',
      context: {},
      makeTools: () => [],
      runLoop,
      recordWerkzeug: jest.fn(),
      signal: { aborted: true },
      SubagentToolClass: makeFakeSubagent(jest.fn()),
    });

    expect(res.aborted).toBe(true);
    expect(runLoop).not.toHaveBeenCalled();
  });

  test('vorabErgebnisse überspringt übernommene Schritte und threadet ihre Ausgabe', async () => {
    const subMock = jest.fn().mockResolvedValueOnce('NEU2');
    const runLoop = jest.fn().mockResolvedValue({ result: 'FINAL' });
    const beginnen = jest.fn().mockResolvedValue({ id: 41 });
    const abschliessen = jest.fn().mockResolvedValue({});

    const flow = {
      schritte: [
        { name: 'a', typ: 'subagent', rolle: 'r1', auftrag: 'do {{thema}}', iterationen: 1 },
        { name: 'b', typ: 'subagent', rolle: 'r2', auftrag: 'use {{a}}', iterationen: 1 },
      ],
      systemPrompt: 'Body',
      grenzen,
    };

    const res = await executeSteps({
      flow,
      werte: { thema: 'X' },
      userInput: 'UI',
      model: 'm',
      context: { stepRecorder: { beginnen, abschliessen } },
      makeTools: () => [],
      runLoop,
      recordWerkzeug: jest.fn(),
      vorabErgebnisse: new Map([[0, 'ALT1']]),
      vorabQuelleLaufId: 12,
      SubagentToolClass: makeFakeSubagent(subMock),
    });

    expect(res.result).toBe('FINAL');
    // Schritt a wurde NICHT ausgeführt — nur b, und der sieht die ALTE Ausgabe als {{a}}.
    expect(subMock).toHaveBeenCalledTimes(1);
    expect(subMock).toHaveBeenCalledWith(
      { rolle: 'r2', auftrag: 'use ALT1' },
      expect.any(Object)
    );
    // Der übersprungene Schritt steht im Protokoll: gleiche Art/Name wie eine
    // echte Ausführung, Vermerk mit Quell-Lauf, Ausgabe aus dem Altlauf.
    expect(beginnen).toHaveBeenCalledWith({
      kind: 'subagent',
      name: 'r1',
      input: { hinweis: '(übernommen aus Lauf 12)', uebernommen: true },
    });
    expect(abschliessen).toHaveBeenCalledWith({ stepId: 41, output: 'ALT1' });
    // Die Synthese bekommt BEIDE Ausgaben — die alte und die neue.
    const synth = runLoop.mock.calls[0][0];
    expect(synth.userInput).toContain('ALT1');
    expect(synth.userInput).toContain('NEU2');
  });

  test('vorabErgebnisse: ein übernommener werkzeug-Schritt ruft recordWerkzeug nicht', async () => {
    const recordWerkzeug = jest.fn();
    const runLoop = jest.fn().mockResolvedValue({ result: 'F' });

    const flow = {
      schritte: [
        { name: 'w', typ: 'werkzeug', werkzeug: 'web_suche', parameter: { q: 'x' }, iterationen: 1 },
      ],
      systemPrompt: 'B',
      grenzen,
    };

    const res = await executeSteps({
      flow,
      werte: {},
      userInput: 'UI',
      model: 'm',
      context: {},
      makeTools: () => [],
      runLoop,
      recordWerkzeug,
      vorabErgebnisse: new Map([[0, 'ALT']]),
      SubagentToolClass: makeFakeSubagent(jest.fn()),
    });

    expect(res.result).toBe('F');
    expect(recordWerkzeug).not.toHaveBeenCalled();
    expect(runLoop.mock.calls[0][0].userInput).toContain('ALT');
  });

  test('ein fehlgeschlagener Schritt liefert einen Fehler statt zu synthetisieren', async () => {
    const subMock = jest.fn().mockRejectedValue(new Error('kaputt'));
    const runLoop = jest.fn().mockResolvedValue({ result: 'F' });
    const flow = {
      schritte: [{ name: 'a', typ: 'subagent', rolle: 'r', auftrag: 'x', iterationen: 1 }],
      systemPrompt: 'B',
      grenzen,
    };

    const res = await executeSteps({
      flow,
      werte: {},
      userInput: 'UI',
      model: 'm',
      context: {},
      makeTools: () => [],
      runLoop,
      recordWerkzeug: jest.fn(),
      SubagentToolClass: makeFakeSubagent(subMock),
    });

    expect(res.error).toMatch(/Schritt .+a.+ fehlgeschlagen: kaputt/);
    expect(runLoop).not.toHaveBeenCalled();
  });
});

describe('berechneVorabErgebnisse', () => {
  const schritte = [
    { name: 'a', typ: 'subagent', rolle: 'sucher', auftrag: 'x', iterationen: 1 },
    { name: 'b', typ: 'werkzeug', werkzeug: 'web_suche', parameter: {}, iterationen: 1 },
    { name: 'c', typ: 'subagent', rolle: 'leser', auftrag: 'y', iterationen: 1 },
  ];

  const alt = (kind, name, status, output, extra = {}) => ({
    kind,
    name,
    status,
    output,
    parent_step_id: null,
    input: {},
    ...extra,
  });

  test('übernimmt nur die Schritte VOR dem ersten Fehler, mit ihren Ausgaben', () => {
    const vorab = berechneVorabErgebnisse(schritte, [
      alt('subagent', 'sucher', 'fertig', 'F1'),
      alt('werkzeug', 'web_suche', 'fehler', 'Fehler: kaputt'),
    ]);
    expect([...vorab.entries()]).toEqual([[0, 'F1']]);
  });

  test('Kind-Schritte (parent_step_id) zählen nicht als Ketten-Schritte', () => {
    const vorab = berechneVorabErgebnisse(schritte, [
      alt('subagent', 'sucher', 'fertig', 'F1'),
      alt('werkzeug', 'web_lesen', 'fertig', 'roh', { parent_step_id: 1 }),
      alt('werkzeug', 'web_suche', 'fertig', 'F2'),
    ]);
    expect([...vorab.entries()]).toEqual([
      [0, 'F1'],
      [1, 'F2'],
    ]);
  });

  test('bricht bei Art-/Namensabweichung ab (Flow wurde seit dem Altlauf geändert)', () => {
    const vorab = berechneVorabErgebnisse(schritte, [
      alt('subagent', 'andere_rolle', 'fertig', 'F1'),
    ]);
    expect(vorab.size).toBe(0);
  });

  test('Iterationen: verlangt ALLE Durchläufe fertig und nimmt die letzte Ausgabe', () => {
    const mitIter = [{ name: 'a', typ: 'subagent', rolle: 'r', auftrag: 'x', iterationen: 2 }];
    // Vollständig: zwei fertige Einträge → letzte Ausgabe zählt.
    expect(
      berechneVorabErgebnisse(mitIter, [
        alt('subagent', 'r', 'fertig', 'I1'),
        alt('subagent', 'r', 'fertig', 'I2'),
      ]).get(0)
    ).toBe('I2');
    // Unvollständig: nur ein Eintrag → nichts übernehmen.
    expect(
      berechneVorabErgebnisse(mitIter, [alt('subagent', 'r', 'fertig', 'I1')]).size
    ).toBe(0);
  });

  test('ein im Altlauf bereits übernommener Schritt zählt als EIN Eintrag', () => {
    const mitIter = [
      { name: 'a', typ: 'subagent', rolle: 'r', auftrag: 'x', iterationen: 3 },
      { name: 'b', typ: 'werkzeug', werkzeug: 'web_suche', parameter: {}, iterationen: 1 },
    ];
    const vorab = berechneVorabErgebnisse(mitIter, [
      alt('subagent', 'r', 'fertig', 'ALT', { input: { uebernommen: true, hinweis: 'x' } }),
      alt('werkzeug', 'web_suche', 'fertig', 'F2'),
    ]);
    expect([...vorab.entries()]).toEqual([
      [0, 'ALT'],
      [1, 'F2'],
    ]);
  });

  test('ein leerer Altlauf übernimmt nichts', () => {
    expect(berechneVorabErgebnisse(schritte, []).size).toBe(0);
  });
});
