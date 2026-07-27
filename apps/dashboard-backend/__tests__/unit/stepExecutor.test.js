/**
 * Unit-Tests für den deterministischen Schritt-Executor (Plan 013, B7).
 *
 * Alle schweren Abhängigkeiten (Rollen-Delegation, Modell-Schleife, Werkzeug-
 * Ausführung) werden injiziert — getestet wird ausschließlich die Logik des
 * Executors: Reihenfolge, Vorlagen-Einsetzung, Threading der Ausgaben,
 * Iteration, Synthese, Abbruch und Fehlerbehandlung.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';

const { executeSteps, resolveParams, buildSynthesisInput } = require('../../src/services/flows/stepExecutor');

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
