/**
 * Flow-Runner und Werkzeug-Schleife (Plan 011, Schritt 10).
 *
 * Drei Dinge stehen im Mittelpunkt:
 *  - Die Schleife führt genau die übergebenen Werkzeuge aus, hält die Grenzen
 *    (Runden, Zeitlimit) ein und lässt ein fehlgeschlagenes Werkzeug den Lauf
 *    NICHT abstürzen.
 *  - Jeder Modell-Aufruf geht durch die gemeinsame GPU-Sperre.
 *  - Der Runner prüft die Argumente, setzt sie ein, baut den richtigen Kontext
 *    und schreibt Lauf und Schritte mit.
 */

jest.mock('axios');
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const axios = require('axios');
const { runFlowLoop } = require('../../src/services/flows/toolLoop');
const { withGpuLock, _gpuMutex } = require('../../src/services/flows/gpuQueue');
const { runFlow, resolveArguments, buildUserInput } = require('../../src/services/flows/runFlow');

/** Ein Werkzeug-Doppel im BaseTool-Stil. */
function fakeTool(name, fn, parameters = {}) {
  return {
    name,
    parameters,
    toOllamaToolDefinition: () => ({ type: 'function', function: { name } }),
    execute: jest.fn(fn || (async () => `${name}-ok`)),
  };
}

/** Baut eine Ollama-Antwort mit optionalen tool_calls. */
function antwort({ content = '', toolCalls = null } = {}) {
  return { data: { message: { content, ...(toolCalls ? { tool_calls: toolCalls } : {}) } } };
}

beforeEach(() => jest.clearAllMocks());

describe('runFlowLoop — Ablauf', () => {
  it('gibt Text zurück, wenn das Modell kein Werkzeug aufruft', async () => {
    axios.post.mockResolvedValue(antwort({ content: 'Fertige Antwort.' }));
    const r = await runFlowLoop({ model: 'm', systemPrompt: 'sys', userInput: 'u', tools: [] });
    expect(r.result).toBe('Fertige Antwort.');
    expect(r.runden).toBe(1);
    expect(r.truncated).toBeUndefined();
  });

  it('ruft das Modell mit abgeschaltetem Denken auf (think:false)', async () => {
    // Flows führen aus statt zu plaudern; der Reasoning-Trace kostet auf dem
    // Jetson ein Vielfaches und sprengt das Aufruf-Zeitlimit.
    axios.post.mockResolvedValue(antwort({ content: 'ok' }));
    await runFlowLoop({ model: 'm', systemPrompt: 's', userInput: 'u', tools: [] });
    expect(axios.post.mock.calls[0][1]).toMatchObject({ think: false, stream: false });
  });

  it('führt einen Werkzeug-Aufruf aus und reicht das Ergebnis ans Modell zurück', async () => {
    const tool = fakeTool('dateien_suchen', async () => 'Treffer A');
    axios.post
      .mockResolvedValueOnce(
        antwort({ toolCalls: [{ function: { name: 'dateien_suchen', arguments: { q: 'x' } } }] })
      )
      .mockResolvedValueOnce(antwort({ content: 'Zusammengefasst.' }));

    const evts = [];
    const r = await runFlowLoop({
      model: 'm',
      systemPrompt: 'sys',
      userInput: 'u',
      tools: [tool],
      onEvent: e => evts.push(e.type),
    });

    expect(tool.execute).toHaveBeenCalledWith({ q: 'x' }, expect.any(Object));
    expect(r.result).toBe('Zusammengefasst.');
    // Der zweite Modell-Aufruf sah die tool-Antwort.
    const zweiteMessages = axios.post.mock.calls[1][1].messages;
    expect(zweiteMessages.some(m => m.role === 'tool' && m.content === 'Treffer A')).toBe(true);
    expect(evts).toEqual(['tool_start', 'tool_result', 'text', 'done']);
  });

  it('wartet auf den (asynchronen) Ereignis-Handler — start VOR result', async () => {
    // Der Handler schreibt Schritte in die DB (async). toolLoop muss ihn awaiten,
    // sonst kann ein schnelles Werkzeug das tool_result auslösen, bevor der
    // langsame tool_start-Schreibvorgang durch ist — der Schritt bliebe verwaist.
    const reihenfolge = [];
    const langsamerHandler = async evt => {
      if (evt.type === 'tool_start') {
        await new Promise(r => setTimeout(r, 20)); // langsame DB
        reihenfolge.push('start-fertig');
      } else if (evt.type === 'tool_result') {
        reihenfolge.push('result');
      }
    };
    const schnellesTool = fakeTool('flott', async () => 'sofort'); // schneller als der Handler
    axios.post
      .mockResolvedValueOnce(antwort({ toolCalls: [{ function: { name: 'flott', arguments: {} } }] }))
      .mockResolvedValueOnce(antwort({ content: 'ok' }));

    await runFlowLoop({
      model: 'm', systemPrompt: 's', userInput: 'u', tools: [schnellesTool], onEvent: langsamerHandler,
    });
    expect(reihenfolge).toEqual(['start-fertig', 'result']);
  });

  it('reicht den Kontext an das Werkzeug durch', async () => {
    const tool = fakeTool('dateien_lesen');
    axios.post
      .mockResolvedValueOnce(antwort({ toolCalls: [{ function: { name: 'dateien_lesen', arguments: {} } }] }))
      .mockResolvedValueOnce(antwort({ content: 'ok' }));
    await runFlowLoop({
      model: 'm', systemPrompt: 's', userInput: 'u', tools: [tool], context: { roots: ['/a'] },
    });
    expect(tool.execute.mock.calls[0][1]).toMatchObject({ roots: ['/a'] });
  });

  it('nennt in der Werkzeug-Antwort, zu welchem Aufruf sie gehoert', async () => {
    // Phase H7. Bis dahin stand da `{role:'tool', content}` und sonst nichts;
    // ein Modell mit mehreren Werkzeugen kann eine solche Antwort keinem
    // seiner Aufrufe zuordnen. Ollama nennt das Feld `tool_name`.
    const tool = fakeTool('dateien_lesen', async () => 'Inhalt');
    axios.post
      .mockResolvedValueOnce(
        antwort({ toolCalls: [{ function: { name: 'dateien_lesen', arguments: {} } }] })
      )
      .mockResolvedValueOnce(antwort({ content: 'ok' }));
    await runFlowLoop({ model: 'm', systemPrompt: 's', userInput: 'u', tools: [tool] });
    const zweiter = axios.post.mock.calls[1][1].messages;
    expect(zweiter[zweiter.length - 1]).toEqual({
      role: 'tool',
      tool_name: 'dateien_lesen',
      content: 'Inhalt',
    });
  });
});

/**
 * Ein Schema an der Stelle eines Aufrufs (Phase H7).
 *
 * Am Orin gemessen: das Standardmodell schickte achtmal in drei Laeufen die
 * Huelle statt der Werte, und ein ausdruecklicher Satz im Prompt hat daran
 * nichts geaendert. Die Notbremse packt EINMAL aus -- und nur dann, wenn unter
 * `properties` wirklich die Namen liegen, die das Werkzeug kennt.
 */
describe('runFlowLoop — ein Schema ist kein Aufruf', () => {
  const FREIGABE = { titel: { required: true }, zusammenhang: {} };

  function schickt(argumente) {
    const tool = fakeTool('freigabe_anfordern', async () => 'angefragt', FREIGABE);
    axios.post
      .mockResolvedValueOnce(
        antwort({ toolCalls: [{ function: { name: 'freigabe_anfordern', arguments: argumente } }] })
      )
      .mockResolvedValueOnce(antwort({ content: 'ok' }));
    return tool;
  }

  it('packt `properties` aus, wenn es als Objekt kommt', async () => {
    const tool = schickt({
      type: 'freigabe',
      required: ['titel'],
      properties: { titel: 'A-2026-0001', zusammenhang: 'Grund' },
    });
    await runFlowLoop({ model: 'm', systemPrompt: 's', userInput: 'u', tools: [tool] });
    expect(tool.execute).toHaveBeenCalledWith(
      { titel: 'A-2026-0001', zusammenhang: 'Grund' },
      expect.anything()
    );
  });

  it('packt `properties` auch aus einer Zeichenkette aus', async () => {
    // Genau die Form vom Orin: die Huelle traegt ihre Werte als Text.
    const tool = schickt({
      type: 'freigabe',
      required: '["titel", "zusammenhang"]',
      properties: '{"titel": "A-2026-0001", "zusammenhang": "Grund"}',
    });
    await runFlowLoop({ model: 'm', systemPrompt: 's', userInput: 'u', tools: [tool] });
    expect(tool.execute).toHaveBeenCalledWith(
      { titel: 'A-2026-0001', zusammenhang: 'Grund' },
      expect.anything()
    );
  });

  it('meldet trotzdem, was ankam', async () => {
    const tool = schickt({ properties: { titel: 'A-1' } });
    const gemeldet = [];
    await runFlowLoop({
      model: 'm',
      systemPrompt: 's',
      userInput: 'u',
      tools: [tool],
      onEvent: e => e.type === 'tool_start' && gemeldet.push(e.params),
    });
    expect(gemeldet[0]).toEqual({ properties: { titel: 'A-1' } });
  });

  it('laesst einen richtigen Aufruf in Ruhe, auch mit `properties` daneben', async () => {
    // Steht oben auch nur ein Name, den das Werkzeug kennt, ist der Aufruf
    // gemeint, wie er dasteht.
    const tool = schickt({ titel: 'A-1', properties: { titel: 'falsch' } });
    await runFlowLoop({ model: 'm', systemPrompt: 's', userInput: 'u', tools: [tool] });
    expect(tool.execute.mock.calls[0][0]).toEqual({ titel: 'A-1', properties: { titel: 'falsch' } });
  });

  it('packt nicht aus, wenn unter `properties` keiner der Namen steht', async () => {
    const tool = schickt({ properties: { irgendwas: 1 } });
    await runFlowLoop({ model: 'm', systemPrompt: 's', userInput: 'u', tools: [tool] });
    expect(tool.execute.mock.calls[0][0]).toEqual({ properties: { irgendwas: 1 } });
  });
});

describe('runFlowLoop — Grenzen', () => {
  it('bricht nach der Runden-Obergrenze ab (truncated)', async () => {
    const tool = fakeTool('dateien_suchen');
    // Immer ein Werkzeug-Aufruf → die Schleife läuft, bis die Runden aus sind.
    axios.post.mockResolvedValue(
      antwort({ toolCalls: [{ function: { name: 'dateien_suchen', arguments: {} } }] })
    );
    const r = await runFlowLoop({
      model: 'm', systemPrompt: 's', userInput: 'u', tools: [tool], maxRunden: 3,
    });
    expect(r.truncated).toBe(true);
    expect(r.runden).toBe(3);
    expect(axios.post).toHaveBeenCalledTimes(3);
  });

  it('bricht ab, sobald das Abbruch-Signal gesetzt ist — ohne einen Modell-Aufruf', async () => {
    const controller = new AbortController();
    controller.abort(); // schon vor dem ersten Aufruf abgebrochen
    const r = await runFlowLoop({
      model: 'm', systemPrompt: 's', userInput: 'u', tools: [], signal: controller.signal,
    });
    expect(r.aborted).toBe(true);
    expect(r.truncated).toBe(true);
    expect(axios.post).not.toHaveBeenCalled(); // gar kein Modell-Aufruf
  });

  it('bricht ab, wenn das Zeitlimit vor der nächsten Runde überschritten ist', async () => {
    const tool = fakeTool('dateien_suchen');
    axios.post.mockResolvedValue(
      antwort({ toolCalls: [{ function: { name: 'dateien_suchen', arguments: {} } }] })
    );
    // Zeit springt nach dem ersten Aufruf über die Frist.
    let t = 1000;
    const now = jest.fn(() => t);
    const r = await runFlowLoop({
      model: 'm', systemPrompt: 's', userInput: 'u', tools: [tool],
      maxRunden: 50, zeitlimitS: 10,
      now: () => { const v = t; t += 6000; return v; }, // +6s je Abfrage → nach 2 Abfragen > 10s
    });
    void now;
    expect(r.truncated).toBe(true);
    expect(r.result).toMatch(/Zeitlimit von 10s/);
  });
});

describe('runFlowLoop — Fehlertoleranz', () => {
  it('macht aus einem werfenden Werkzeug eine Fehler-Nachricht, kein Abbruch', async () => {
    const tool = fakeTool('kaputt', async () => {
      throw new Error('intern geplatzt');
    });
    axios.post
      .mockResolvedValueOnce(antwort({ toolCalls: [{ function: { name: 'kaputt', arguments: {} } }] }))
      .mockResolvedValueOnce(antwort({ content: 'trotzdem weiter' }));
    const r = await runFlowLoop({ model: 'm', systemPrompt: 's', userInput: 'u', tools: [tool] });
    expect(r.result).toBe('trotzdem weiter');
    const toolMsg = axios.post.mock.calls[1][1].messages.find(m => m.role === 'tool');
    expect(toolMsg.content).toMatch(/Fehler bei "kaputt": intern geplatzt/);
  });

  it('meldet ein vom Modell erfundenes Werkzeug als Text zurück', async () => {
    axios.post
      .mockResolvedValueOnce(antwort({ toolCalls: [{ function: { name: 'gibtsnicht', arguments: {} } }] }))
      .mockResolvedValueOnce(antwort({ content: 'ok' }));
    await runFlowLoop({ model: 'm', systemPrompt: 's', userInput: 'u', tools: [] });
    const toolMsg = axios.post.mock.calls[1][1].messages.find(m => m.role === 'tool');
    expect(toolMsg.content).toMatch(/steht diesem Flow nicht zur Verfügung/);
  });

  it('gibt einen Netzwerkfehler als error zurück, ohne zu werfen', async () => {
    axios.post.mockRejectedValue(new Error('ECONNREFUSED'));
    const r = await runFlowLoop({ model: 'm', systemPrompt: 's', userInput: 'u', tools: [] });
    expect(r.error).toMatch(/ECONNREFUSED/);
    expect(r.result).toBe('');
  });
});

describe('GPU-Sperre', () => {
  it('serialisiert die Modell-Aufrufe — der zweite wartet auf den ersten', async () => {
    // Zwei gleichzeitige withGpuLock-Aufrufe dürfen sich nicht überlappen.
    const ereignisse = [];
    const langsam = withGpuLock(async () => {
      ereignisse.push('A-start');
      await new Promise(r => setTimeout(r, 30));
      ereignisse.push('A-end');
    });
    const schnell = withGpuLock(async () => {
      ereignisse.push('B-start');
      ereignisse.push('B-end');
    });
    await Promise.all([langsam, schnell]);
    // B darf erst starten, wenn A fertig ist.
    expect(ereignisse).toEqual(['A-start', 'A-end', 'B-start', 'B-end']);
  });

  it('gibt die Sperre auch bei einem Fehler wieder frei', async () => {
    await expect(withGpuLock(async () => { throw new Error('x'); })).rejects.toThrow('x');
    // Danach ist der Mutex wieder frei.
    let lief = false;
    await withGpuLock(async () => { lief = true; });
    expect(lief).toBe(true);
    expect(_gpuMutex._locked).toBe(false);
  });
});

describe('resolveArguments', () => {
  const decl = [
    { name: 'thema', typ: 'freitext', pflicht: true },
    { name: 'raum', typ: 'freitext', pflicht: false },
    { name: 'stil', typ: 'auswahl', optionen: ['kurz', 'lang'], pflicht: false, standard: 'kurz' },
  ];

  it('wirft, wenn ein Pflicht-Argument fehlt', () => {
    expect(() => resolveArguments(decl, {})).toThrow(/Pflicht-Argument "thema"/);
  });

  it('nimmt den Standard, wenn ein optionales Argument fehlt', () => {
    const { werte } = resolveArguments(decl, { thema: 'x' });
    expect(werte.stil).toBe('kurz');
  });

  it('weist eine ungültige Auswahl ab', () => {
    expect(() => resolveArguments(decl, { thema: 'x', stil: 'mittel' })).toThrow(/erlaubten Auswahlen/);
  });

  it('lässt einen fehlenden optionalen Platzhalter unersetzt', () => {
    const { werte } = resolveArguments(decl, { thema: 'x' });
    expect(werte.raum).toBeUndefined();
  });
});

describe('runFlow — Orchestrierung', () => {
  const baseFlow = {
    systemPrompt: 'Fasse {{thema}} zusammen.',
    argumente: [{ name: 'thema', typ: 'freitext', pflicht: true }],
    werkzeuge: ['dateien_suchen'],
    ordner: [],
    grenzen: { werkzeug_runden: 5, zeitlimit_s: 300, max_aufrufe: 20 },
  };

  function makeDeps(overrides = {}) {
    const store = {
      createRun: jest.fn(async () => ({ id: 42, status: 'laeuft' })),
      startStep: jest.fn(async () => ({ id: 7 })),
      finishStep: jest.fn(async () => ({})),
      bumpSteps: jest.fn(async () => 1),
      finishRun: jest.fn(async () => ({ id: 42, status: 'fertig' })),
      saveChanges: jest.fn(async () => {}),
      getRun: jest.fn(async () => ({ id: 42, status: 'fertig', result: 'R', steps: [] })),
    };
    return {
      store,
      loadFlow: jest.fn(async () => ({ ...baseFlow })),
      makeTools: jest.fn(() => [fakeTool('dateien_suchen')]),
      runLoop: jest.fn(async () => ({ result: 'R', runden: 1 })),
      // Änderungs-Verfolgung standardmäßig gemockt — kein echter Ordner-Abzug im
      // Unit-Test. Einzeltests überschreiben `berechneAenderungen` bei Bedarf.
      tracker: {
        snapshot: jest.fn(async () => new Map()),
        berechneAenderungen: jest.fn(() => ({ aenderungen: [], abgeschnitten: false })),
      },
      resolveModel: jest.fn(async () => 'default-model'),
      ...overrides,
    };
  }

  it('lädt, füllt den Prompt, treibt die Schleife und schließt den Lauf ab', async () => {
    const deps = makeDeps();
    const run = await runFlow({ flowName: 'notiz', args: { thema: 'KI' }, userId: 1 }, deps);

    // Prompt wurde mit dem Argument gefüllt.
    expect(deps.runLoop.mock.calls[0][0].systemPrompt).toBe('Fasse KI zusammen.');
    // Grenzen kamen aus dem Flow.
    expect(deps.runLoop.mock.calls[0][0].maxRunden).toBe(5);
    expect(deps.runLoop.mock.calls[0][0].zeitlimitS).toBe(300);
    // Lauf angelegt und als 'fertig' abgeschlossen.
    expect(deps.store.createRun).toHaveBeenCalled();
    expect(deps.store.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 42, status: 'fertig', result: 'R' })
    );
    expect(run.status).toBe('fertig');
  });

  it('nimmt das Modell des Flows, sonst das Standardmodell', async () => {
    const deps = makeDeps();
    await runFlow({ flowName: 'notiz', args: { thema: 'x' }, userId: 1 }, deps);
    expect(deps.runLoop.mock.calls[0][0].model).toBe('default-model');

    const deps2 = makeDeps({ loadFlow: jest.fn(async () => ({ ...baseFlow, modell: 'llama-spezial' })) });
    await runFlow({ flowName: 'notiz', args: { thema: 'x' }, userId: 1 }, deps2);
    expect(deps2.runLoop.mock.calls[0][0].model).toBe('llama-spezial');
    expect(deps2.resolveModel).not.toHaveBeenCalled();
  });

  it('schreibt zwei gleichnamige Werkzeug-Aufrufe in EINER Runde korrekt mit', async () => {
    // Der Schritt-Speicher schlüsselt offene Schritte nach Werkzeugnamen. Das ist
    // nur richtig, weil die Schleife die Aufrufe strikt nacheinander abarbeitet
    // (start→execute→result, dann der nächste). Dieser Test hält genau das fest:
    // zwei `dateien_suchen` in einer Runde ergeben zwei sauber abgeschlossene Schritte.
    const echterStore = {
      createRun: jest.fn(async () => ({ id: 1 })),
      startStep: jest.fn(async () => ({ id: Math.floor(Math.random() * 1e6) })),
      finishStep: jest.fn(async () => ({})),
      bumpSteps: jest.fn(async () => 1),
      finishRun: jest.fn(async () => ({})),
      getRun: jest.fn(async () => ({ id: 1, steps: [] })),
    };
    // Echte Schleife: erst zwei gleichnamige tool_calls, dann Text.
    const realLoop = require('../../src/services/flows/toolLoop').runFlowLoop;
    axios.post
      .mockResolvedValueOnce(
        antwort({
          toolCalls: [
            { function: { name: 'dateien_suchen', arguments: { q: 'a' } } },
            { function: { name: 'dateien_suchen', arguments: { q: 'b' } } },
          ],
        })
      )
      .mockResolvedValueOnce(antwort({ content: 'fertig' }));

    const deps = makeDeps({
      store: echterStore,
      makeTools: () => [fakeTool('dateien_suchen', async () => 'treffer')],
      runLoop: realLoop, // die ECHTE Schleife, nicht das Mock
    });
    await runFlow({ flowName: 'wissen', args: { thema: 'x' }, userId: 1 }, deps);

    // Zwei Schritte begonnen UND zwei abgeschlossen — keiner verwaist.
    expect(echterStore.startStep).toHaveBeenCalledTimes(2);
    expect(echterStore.finishStep).toHaveBeenCalledTimes(2);
  });

  it('verdrahtet den Subagent-Kontext: Rollen, Grenzen, Tiefe 0, Basis-Ordner', async () => {
    const deps = makeDeps({
      loadFlow: jest.fn(async () => ({
        ...baseFlow,
        werkzeuge: ['subagent'],
        ordner: ['/vertraege'],
        rollen: [{ name: 'leser', prompt: 'p', werkzeuge: [], ergebnis: { felder: ['x'], max_zeichen: 2000 } }],
      })),
    });
    await runFlow({ flowName: 'recherche', args: { thema: 'x' }, userId: 1 }, deps);
    const ctx = deps.runLoop.mock.calls[0][0].context;
    expect(ctx.rollen).toHaveLength(1);
    expect(ctx.depth).toBe(0);
    expect(ctx.limits).toBeDefined();
    expect(ctx.limits.maxAufrufe).toBe(20);
    expect(ctx.roleContextBase).toMatchObject({ roots: ['/vertraege'] });
    expect(typeof ctx.stepRecorder?.beginnen).toBe('function');
    expect(typeof ctx.stepRecorder?.abschliessen).toBe('function');
  });

  it('schreibt einen echten Subagent-Aufruf mit Rohdaten mit — und der Orchestrator sieht nur das Verdichtete', async () => {
    // Echte Schleife + echtes Subagent-Werkzeug; die Rolle liefert JSON plus
    // ein verbotenes Rohfeld. Der Orchestrator darf das Rohfeld nie sehen; im
    // Protokoll (recordSubagent → startStep/finishStep) muss es aber auftauchen.
    const echterStore = {
      createRun: jest.fn(async () => ({ id: 1 })),
      startStep: jest.fn(async () => ({ id: 55 })),
      finishStep: jest.fn(async () => ({})),
      bumpSteps: jest.fn(async () => 1),
      finishRun: jest.fn(async () => ({})),
      getRun: jest.fn(async () => ({ id: 1, steps: [] })),
    };
    const realLoop = require('../../src/services/flows/toolLoop').runFlowLoop;
    const SubagentTool = require('../../src/services/flows/subagent');

    // Orchestrator-Runde: ruft subagent auf. Danach: Text.
    // Rollen-Runde (der zweite Modell-Aufruf): liefert das JSON der Rolle.
    axios.post
      .mockResolvedValueOnce(
        antwort({ toolCalls: [{ function: { name: 'subagent', arguments: { rolle: 'leser', auftrag: 'lies' } } }] })
      )
      .mockResolvedValueOnce(
        antwort({ content: JSON.stringify({ fazit: 'kurz', roh: 'GEHEIMER SEITENINHALT' }) })
      )
      .mockResolvedValueOnce(antwort({ content: 'Orchestrator-Schlusswort.' }));

    const deps = makeDeps({
      store: echterStore,
      makeTools: () => [new SubagentTool()],
      runLoop: realLoop,
      loadFlow: jest.fn(async () => ({
        ...baseFlow,
        werkzeuge: ['subagent'],
        rollen: [{ name: 'leser', prompt: 'Lies.', werkzeuge: [], ergebnis: { felder: ['fazit'], max_zeichen: 2000 } }],
      })),
    });
    await runFlow({ flowName: 'recherche', args: { thema: 'x' }, userId: 1 }, deps);

    // Der Subagent-Schritt wurde als kind='subagent' mit Rohdaten gespeichert.
    const subStart = echterStore.startStep.mock.calls.find(c => c[0].kind === 'subagent');
    expect(subStart).toBeDefined();
    const subFinish = echterStore.finishStep.mock.calls.find(c => /GEHEIMER SEITENINHALT/.test(c[0].rawOutput || ''));
    expect(subFinish).toBeDefined(); // Rohdaten IM Protokoll
    // Aber der Orchestrator-Modellaufruf (der dritte) sah das Rohfeld NICHT.
    const orchestratorMessages = JSON.stringify(axios.post.mock.calls[2][1].messages);
    expect(orchestratorMessages).not.toMatch(/GEHEIMER SEITENINHALT/);
    expect(orchestratorMessages).toMatch(/fazit: kurz/);
  });

  it('verfolgt KEINE Datei-Änderungen für einen Flow ohne Schreib-Werkzeug', async () => {
    // baseFlow hat nur dateien_suchen — kein Abzug, kein saveChanges.
    const deps = makeDeps();
    await runFlow({ flowName: 'notiz', args: { thema: 'x' }, userId: 1 }, deps);
    expect(deps.tracker.snapshot).not.toHaveBeenCalled();
    expect(deps.store.saveChanges).not.toHaveBeenCalled();
  });

  it('zieht Abzüge vor/nach dem Lauf und speichert die Änderungen (Schreib-Werkzeug)', async () => {
    const aenderungen = [{ pfad: 'a.txt', art: 'neu', vorher: null, nachher: 'hi', gekuerzt: false }];
    const deps = makeDeps({
      loadFlow: jest.fn(async () => ({
        ...baseFlow,
        werkzeuge: ['dateien_schreiben'],
        ordner: ['/arbeit'],
      })),
    });
    deps.tracker.berechneAenderungen.mockReturnValue({ aenderungen, abgeschnitten: false });
    const evts = [];
    await runFlow(
      { flowName: 'schreiber', args: { thema: 'x' }, userId: 1, onEvent: e => evts.push(e) },
      deps
    );

    // Zwei Abzüge (vorher/nachher) desselben Ordners.
    expect(deps.tracker.snapshot).toHaveBeenCalledTimes(2);
    expect(deps.tracker.snapshot).toHaveBeenCalledWith(['/arbeit']);
    // Die Differenz landet am Lauf.
    expect(deps.store.saveChanges).toHaveBeenCalledWith({ runId: 42, changes: aenderungen });
    // Und wird live gemeldet, damit die offene Karte sie ohne Nachladen zeigt.
    expect(evts).toContainEqual({ type: 'aenderungen', changes: aenderungen });
  });

  it('meldet keine leere Änderungs-Liste live, speichert sie aber (leer)', async () => {
    const deps = makeDeps({
      loadFlow: jest.fn(async () => ({ ...baseFlow, werkzeuge: ['dateien_schreiben'], ordner: ['/a'] })),
    });
    const evts = [];
    await runFlow(
      { flowName: 't', args: { thema: 'x' }, userId: 1, onEvent: e => evts.push(e) },
      deps
    );
    expect(deps.store.saveChanges).toHaveBeenCalledWith({ runId: 42, changes: [] });
    expect(evts.some(e => e.type === 'aenderungen')).toBe(false);
  });

  it('speichert die Änderungen auch, wenn der Lauf mit Fehler endet', async () => {
    const aenderungen = [{ pfad: 'x', art: 'geloescht', vorher: 'alt', nachher: null }];
    const deps = makeDeps({
      loadFlow: jest.fn(async () => ({ ...baseFlow, werkzeuge: ['dateien_schreiben'], ordner: ['/a'] })),
      runLoop: jest.fn(async () => {
        throw new Error('Modell weg');
      }),
    });
    deps.tracker.berechneAenderungen.mockReturnValue({ aenderungen, abgeschnitten: false });
    await runFlow({ flowName: 't', args: { thema: 'x' }, userId: 1 }, deps);
    expect(deps.store.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'fehler' })
    );
    expect(deps.store.saveChanges).toHaveBeenCalledWith({ runId: 42, changes: aenderungen });
  });

  it('lässt den Lauf nicht scheitern, wenn die Änderungs-Übersicht wirft', async () => {
    const deps = makeDeps({
      loadFlow: jest.fn(async () => ({ ...baseFlow, werkzeuge: ['dateien_schreiben'], ordner: ['/a'] })),
    });
    // Zweiter Abzug (Ende) wirft — der Lauf ist trotzdem 'fertig'.
    deps.tracker.snapshot
      .mockResolvedValueOnce(new Map())
      .mockRejectedValueOnce(new Error('Platte weg'));
    const run = await runFlow({ flowName: 't', args: { thema: 'x' }, userId: 1 }, deps);
    expect(run.status).toBe('fertig');
    expect(deps.store.saveChanges).not.toHaveBeenCalled();
  });

  it('schließt den Lauf als "fehler" ab, wenn die Schleife einen error liefert', async () => {
    const deps = makeDeps({ runLoop: jest.fn(async () => ({ result: '', error: 'kaputt' })) });
    await runFlow({ flowName: 'notiz', args: { thema: 'x' }, userId: 1 }, deps);
    expect(deps.store.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'fehler', error: 'kaputt' })
    );
  });

  it('meldet ein fehlendes Pflicht-Argument, bevor überhaupt ein Lauf entsteht', async () => {
    const deps = makeDeps();
    await expect(runFlow({ flowName: 'notiz', args: {}, userId: 1 }, deps)).rejects.toThrow(
      /Pflicht-Argument/
    );
    expect(deps.store.createRun).not.toHaveBeenCalled();
  });
});

/**
 * Der Gedankengang (Phase D4).
 *
 * Bis D4 fiel der Zwischentext des Modells lautlos weg: gemeldet wurde nur die
 * letzte Runde, die ohne Werkzeug-Aufruf. In der Lauf-Ansicht stand damit eine
 * Kette von Werkzeugen ohne einen Satz dazu, und die Frage „warum hat der Flow
 * das getan" liess sich nicht beantworten.
 */
describe('Gedankengang (Phase D4)', () => {
  it('meldet den Zwischentext neben einem Werkzeug-Aufruf als eigenes Ereignis', async () => {
    axios.post
      .mockResolvedValueOnce(
        antwort({
          content: 'Ich hole zuerst den Bericht.',
          toolCalls: [{ function: { name: 'dateien_suchen', arguments: {} } }],
        })
      )
      .mockResolvedValueOnce(antwort({ content: 'Fertig.' }));

    const ereignisse = [];
    await runFlowLoop({
      model: 'm',
      systemPrompt: 's',
      userInput: 'u',
      tools: [fakeTool('dateien_suchen')],
      onEvent: e => ereignisse.push(e),
    });

    const gedanke = ereignisse.find(e => e.type === 'gedanke');
    expect(gedanke).toMatchObject({ content: 'Ich hole zuerst den Bericht.', modell: 'm' });
    // Die letzte Runde bleibt `text` — sie ist die ANTWORT, nicht der Weg dahin.
    expect(ereignisse.filter(e => e.type === 'text')).toHaveLength(1);
  });

  it('schweigt, wenn das Modell nur das Werkzeug ruft', async () => {
    axios.post
      .mockResolvedValueOnce(
        antwort({ toolCalls: [{ function: { name: 'dateien_suchen', arguments: {} } }] })
      )
      .mockResolvedValueOnce(antwort({ content: 'Fertig.' }));

    const ereignisse = [];
    await runFlowLoop({
      model: 'm',
      systemPrompt: 's',
      userInput: 'u',
      tools: [fakeTool('dateien_suchen')],
      onEvent: e => ereignisse.push(e),
    });
    expect(ereignisse.some(e => e.type === 'gedanke')).toBe(false);
  });

  it('der Runner schreibt ihn als Schritt der Art `modell` mit', async () => {
    const store = {
      createRun: jest.fn(async () => ({ id: 5 })),
      startStep: jest.fn(async () => ({ id: 11 })),
      finishStep: jest.fn(async () => ({})),
      bumpSteps: jest.fn(async () => 1),
      finishRun: jest.fn(async () => ({})),
      getRun: jest.fn(async () => ({ id: 5, steps: [] })),
    };
    axios.post
      .mockResolvedValueOnce(
        antwort({
          content: 'Erst nachfragen.',
          toolCalls: [{ function: { name: 'dateien_suchen', arguments: {} } }],
        })
      )
      .mockResolvedValueOnce(antwort({ content: 'Fertig.' }));

    await runFlow(
      { flowName: 'notiz', args: { thema: 'x' }, userId: 1 },
      {
        store,
        loadFlow: jest.fn(async () => ({
          systemPrompt: 'Fasse {{thema}} zusammen.',
          argumente: [{ name: 'thema', typ: 'freitext', pflicht: true }],
          werkzeuge: ['dateien_suchen'],
          ordner: [],
          grenzen: { werkzeug_runden: 5, zeitlimit_s: 300, max_aufrufe: 20 },
        })),
        makeTools: jest.fn(() => [fakeTool('dateien_suchen')]),
        tracker: {
          snapshot: jest.fn(async () => new Map()),
          berechneAenderungen: jest.fn(() => ({ aenderungen: [], abgeschnitten: false })),
        },
        resolveModel: jest.fn(async () => 'default-model'),
      }
    );

    const gedanke = store.startStep.mock.calls.find(([p]) => p.kind === 'modell');
    expect(gedanke[0]).toMatchObject({ kind: 'modell', name: 'Gedankengang', modell: 'default-model' });
    expect(store.finishStep).toHaveBeenCalledWith(
      expect.objectContaining({ output: 'Erst nachfragen.' })
    );
  });
});

/**
 * Das externe Modell eines Flows (Phase D4).
 *
 * Ein Flow, den der Administrator umgestellt hat, rechnet woanders — und zwar
 * VOLLSTAENDIG: derselbe Zugang gilt fuer jede Runde der Schleife. Ein Lauf,
 * der halb draussen und halb hier rechnet, waere das Gegenteil einer
 * Entscheidung.
 */
describe('Ein Flow rechnet extern (Phase D4)', () => {
  const ZUGANG = {
    anbieter: 'OpenAI',
    modell: 'gpt-4o',
    basisUrl: 'https://api.example.test/v1',
    schluessel: 'sk-geheim',
  };

  /** Eine Antwort im OpenAI-Format (`choices`, nicht `message`). */
  function openaiAntwort({ content = '', toolCalls = null } = {}) {
    return {
      data: {
        choices: [{ message: { content, ...(toolCalls ? { tool_calls: toolCalls } : {}) } }],
      },
    };
  }

  it('waehlt die hinterlegte Adresse an, mit Schluessel und ohne GPU-Sperre', async () => {
    axios.post.mockResolvedValue(openaiAntwort({ content: 'Von draussen.' }));

    const r = await runFlowLoop({
      model: 'egal',
      extern: ZUGANG,
      systemPrompt: 's',
      userInput: 'u',
      tools: [],
    });

    expect(r.result).toBe('Von draussen.');
    const [url, body, optionen] = axios.post.mock.calls[0];
    expect(url).toBe('https://api.example.test/v1/chat/completions');
    expect(body.model).toBe('gpt-4o');
    expect(optionen.headers.authorization).toBe('Bearer sk-geheim');
    // Kein `think` — das ist eine Eigenheit von Ollama.
    expect(body.think).toBeUndefined();
  });

  it('uebersetzt Werkzeug-Argumente aus der JSON-Zeichenkette', async () => {
    // Der einzige echte Protokollunterschied an dieser Stelle: OpenAI liefert
    // die Argumente als Text, Ollama als Objekt, und die Schleife erwartet ein
    // Objekt.
    const tool = fakeTool('dateien_suchen', async () => 'Treffer');
    axios.post
      .mockResolvedValueOnce(
        openaiAntwort({
          toolCalls: [{ function: { name: 'dateien_suchen', arguments: '{"q":"x"}' } }],
        })
      )
      .mockResolvedValueOnce(openaiAntwort({ content: 'Fertig.' }));

    await runFlowLoop({
      model: 'egal',
      extern: ZUGANG,
      systemPrompt: 's',
      userInput: 'u',
      tools: [tool],
    });

    expect(tool.execute).toHaveBeenCalledWith({ q: 'x' }, expect.anything());
  });

  it('schickt die Werkzeug-Antwort mit id und Namen zurueck, und den Zug wortgleich', async () => {
    // Phase H7. OpenAI verlangt an einem `tool_calls` eine `id`, `type` und
    // Argumente als Zeichenkette; die uebersetzte Ollama-Form hat nichts
    // davon. Und die Antwort eines Werkzeugs braucht `tool_call_id`, sonst
    // kann das Modell sie keinem seiner Aufrufe zuordnen.
    const tool = fakeTool('dateien_suchen', async () => 'Treffer');
    const zug = {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_abc',
          type: 'function',
          function: { name: 'dateien_suchen', arguments: '{"q":"x"}' },
        },
      ],
    };
    axios.post
      .mockResolvedValueOnce({ data: { choices: [{ message: zug }] } })
      .mockResolvedValueOnce(openaiAntwort({ content: 'Fertig.' }));

    await runFlowLoop({
      model: 'egal',
      extern: ZUGANG,
      systemPrompt: 's',
      userInput: 'u',
      tools: [tool],
    });

    const zweiter = axios.post.mock.calls[1][1].messages;
    expect(zweiter[2]).toEqual(zug);
    expect(zweiter[3]).toEqual({
      role: 'tool',
      tool_call_id: 'call_abc',
      name: 'dateien_suchen',
      content: 'Treffer',
    });
  });

  it('haelt den Schluessel aus der Fehlermeldung heraus', async () => {
    // axios haengt die Anfrage samt Koepfen an seinen Fehler, und der geht als
    // Lauf-Fehler in die Datenbank und in die Oberflaeche.
    const fehler = new Error('Request failed');
    fehler.response = { status: 401 };
    fehler.config = { headers: { authorization: 'Bearer sk-geheim' } };
    axios.post.mockRejectedValue(fehler);

    const r = await runFlowLoop({
      model: 'egal',
      extern: ZUGANG,
      systemPrompt: 's',
      userInput: 'u',
      tools: [],
    });

    expect(r.error).toContain('OpenAI/gpt-4o');
    expect(JSON.stringify(r)).not.toContain('sk-geheim');
  });

  it('der Runner reicht den Zugang aus dem Flow bis in die Schleife durch', async () => {
    const deps = {
      store: {
        createRun: jest.fn(async () => ({ id: 3 })),
        startStep: jest.fn(async () => ({ id: 1 })),
        finishStep: jest.fn(async () => ({})),
        bumpSteps: jest.fn(async () => 1),
        finishRun: jest.fn(async () => ({})),
        getRun: jest.fn(async () => ({ id: 3, steps: [] })),
      },
      loadFlow: jest.fn(async () => ({
        systemPrompt: 'p',
        argumente: [],
        werkzeuge: [],
        ordner: [],
        grenzen: { werkzeug_runden: 3, zeitlimit_s: 60, max_aufrufe: 10 },
        modell: 'gpt-4o',
        extern: ZUGANG,
      })),
      makeTools: jest.fn(() => []),
      runLoop: jest.fn(async () => ({ result: 'R', runden: 1 })),
      tracker: {
        snapshot: jest.fn(async () => new Map()),
        berechneAenderungen: jest.fn(() => ({ aenderungen: [], abgeschnitten: false })),
      },
      resolveModel: jest.fn(async () => 'default-model'),
    };

    await runFlow({ flowName: 'f', args: {}, userId: 1, appId: 'urlaub', stand: 'live' }, deps);

    expect(deps.runLoop.mock.calls[0][0].extern).toEqual(ZUGANG);
    // Auch die Rollen erben ihn — sonst rechnete eine Delegation wieder hier.
    expect(deps.runLoop.mock.calls[0][0].context.extern).toEqual(ZUGANG);
  });
});

describe('buildUserInput', () => {
  it('fasst die gesetzten Argumente zusammen', () => {
    const decl = [{ name: 'thema', beschreibung: 'Das Thema' }];
    expect(buildUserInput(decl, { thema: 'KI' })).toBe('Angaben:\nDas Thema: KI');
  });
  it('gibt einen Standard-Auslöser, wenn keine Argumente gesetzt sind', () => {
    expect(buildUserInput([], {})).toMatch(/Bitte die beschriebene Aufgabe/);
  });
});
