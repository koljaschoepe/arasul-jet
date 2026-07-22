/**
 * Skill-Runner und Werkzeug-Schleife (Plan 011, Schritt 10).
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
const { runSkillLoop } = require('../../src/services/skills/toolLoop');
const { withGpuLock, _gpuMutex } = require('../../src/services/skills/gpuQueue');
const { runSkill, resolveArguments, buildUserInput } = require('../../src/services/skills/runSkill');

/** Ein Werkzeug-Doppel im BaseTool-Stil. */
function fakeTool(name, fn) {
  return {
    name,
    toOllamaToolDefinition: () => ({ type: 'function', function: { name } }),
    execute: jest.fn(fn || (async () => `${name}-ok`)),
  };
}

/** Baut eine Ollama-Antwort mit optionalen tool_calls. */
function antwort({ content = '', toolCalls = null } = {}) {
  return { data: { message: { content, ...(toolCalls ? { tool_calls: toolCalls } : {}) } } };
}

beforeEach(() => jest.clearAllMocks());

describe('runSkillLoop — Ablauf', () => {
  it('gibt Text zurück, wenn das Modell kein Werkzeug aufruft', async () => {
    axios.post.mockResolvedValue(antwort({ content: 'Fertige Antwort.' }));
    const r = await runSkillLoop({ model: 'm', systemPrompt: 'sys', userInput: 'u', tools: [] });
    expect(r.result).toBe('Fertige Antwort.');
    expect(r.runden).toBe(1);
    expect(r.truncated).toBeUndefined();
  });

  it('führt einen Werkzeug-Aufruf aus und reicht das Ergebnis ans Modell zurück', async () => {
    const tool = fakeTool('web_suche', async () => 'Treffer A');
    axios.post
      .mockResolvedValueOnce(
        antwort({ toolCalls: [{ function: { name: 'web_suche', arguments: { q: 'x' } } }] })
      )
      .mockResolvedValueOnce(antwort({ content: 'Zusammengefasst.' }));

    const evts = [];
    const r = await runSkillLoop({
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

    await runSkillLoop({
      model: 'm', systemPrompt: 's', userInput: 'u', tools: [schnellesTool], onEvent: langsamerHandler,
    });
    expect(reihenfolge).toEqual(['start-fertig', 'result']);
  });

  it('reicht den Kontext an das Werkzeug durch', async () => {
    const tool = fakeTool('dateien_lesen');
    axios.post
      .mockResolvedValueOnce(antwort({ toolCalls: [{ function: { name: 'dateien_lesen', arguments: {} } }] }))
      .mockResolvedValueOnce(antwort({ content: 'ok' }));
    await runSkillLoop({
      model: 'm', systemPrompt: 's', userInput: 'u', tools: [tool], context: { roots: ['/a'] },
    });
    expect(tool.execute.mock.calls[0][1]).toMatchObject({ roots: ['/a'] });
  });
});

describe('runSkillLoop — Grenzen', () => {
  it('bricht nach der Runden-Obergrenze ab (truncated)', async () => {
    const tool = fakeTool('web_suche');
    // Immer ein Werkzeug-Aufruf → die Schleife läuft, bis die Runden aus sind.
    axios.post.mockResolvedValue(
      antwort({ toolCalls: [{ function: { name: 'web_suche', arguments: {} } }] })
    );
    const r = await runSkillLoop({
      model: 'm', systemPrompt: 's', userInput: 'u', tools: [tool], maxRunden: 3,
    });
    expect(r.truncated).toBe(true);
    expect(r.runden).toBe(3);
    expect(axios.post).toHaveBeenCalledTimes(3);
  });

  it('bricht ab, wenn das Zeitlimit vor der nächsten Runde überschritten ist', async () => {
    const tool = fakeTool('web_suche');
    axios.post.mockResolvedValue(
      antwort({ toolCalls: [{ function: { name: 'web_suche', arguments: {} } }] })
    );
    // Zeit springt nach dem ersten Aufruf über die Frist.
    let t = 1000;
    const now = jest.fn(() => t);
    const r = await runSkillLoop({
      model: 'm', systemPrompt: 's', userInput: 'u', tools: [tool],
      maxRunden: 50, zeitlimitS: 10,
      now: () => { const v = t; t += 6000; return v; }, // +6s je Abfrage → nach 2 Abfragen > 10s
    });
    void now;
    expect(r.truncated).toBe(true);
    expect(r.result).toMatch(/Zeitlimit von 10s/);
  });
});

describe('runSkillLoop — Fehlertoleranz', () => {
  it('macht aus einem werfenden Werkzeug eine Fehler-Nachricht, kein Abbruch', async () => {
    const tool = fakeTool('kaputt', async () => {
      throw new Error('intern geplatzt');
    });
    axios.post
      .mockResolvedValueOnce(antwort({ toolCalls: [{ function: { name: 'kaputt', arguments: {} } }] }))
      .mockResolvedValueOnce(antwort({ content: 'trotzdem weiter' }));
    const r = await runSkillLoop({ model: 'm', systemPrompt: 's', userInput: 'u', tools: [tool] });
    expect(r.result).toBe('trotzdem weiter');
    const toolMsg = axios.post.mock.calls[1][1].messages.find(m => m.role === 'tool');
    expect(toolMsg.content).toMatch(/Fehler bei "kaputt": intern geplatzt/);
  });

  it('meldet ein vom Modell erfundenes Werkzeug als Text zurück', async () => {
    axios.post
      .mockResolvedValueOnce(antwort({ toolCalls: [{ function: { name: 'gibtsnicht', arguments: {} } }] }))
      .mockResolvedValueOnce(antwort({ content: 'ok' }));
    await runSkillLoop({ model: 'm', systemPrompt: 's', userInput: 'u', tools: [] });
    const toolMsg = axios.post.mock.calls[1][1].messages.find(m => m.role === 'tool');
    expect(toolMsg.content).toMatch(/steht diesem Skill nicht zur Verfügung/);
  });

  it('gibt einen Netzwerkfehler als error zurück, ohne zu werfen', async () => {
    axios.post.mockRejectedValue(new Error('ECONNREFUSED'));
    const r = await runSkillLoop({ model: 'm', systemPrompt: 's', userInput: 'u', tools: [] });
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
    { name: 'raum', typ: 'wissensbasis', pflicht: false },
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

  it('sammelt Wissensbasis-Argumente in spaceIds', () => {
    const { spaceIds } = resolveArguments(decl, { thema: 'x', raum: 'vertraege' });
    expect(spaceIds).toEqual(['vertraege']);
  });

  it('lässt einen fehlenden optionalen Platzhalter unersetzt', () => {
    const { werte } = resolveArguments(decl, { thema: 'x' });
    expect(werte.raum).toBeUndefined();
  });
});

describe('runSkill — Orchestrierung', () => {
  const baseSkill = {
    systemPrompt: 'Fasse {{thema}} zusammen.',
    argumente: [{ name: 'thema', typ: 'freitext', pflicht: true }],
    werkzeuge: ['web_suche'],
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
      getRun: jest.fn(async () => ({ id: 42, status: 'fertig', result: 'R', steps: [] })),
    };
    return {
      store,
      loadSkill: jest.fn(async () => ({ ...baseSkill })),
      makeTools: jest.fn(() => [fakeTool('web_suche')]),
      runLoop: jest.fn(async () => ({ result: 'R', runden: 1 })),
      ensureSandbox: jest.fn(async () => ({ containerId: 'c1', cwd: '/w' })),
      resolveModel: jest.fn(async () => 'default-model'),
      ...overrides,
    };
  }

  it('lädt, füllt den Prompt, treibt die Schleife und schließt den Lauf ab', async () => {
    const deps = makeDeps();
    const run = await runSkill({ skillName: 'notiz', args: { thema: 'KI' }, userId: 1 }, deps);

    // Prompt wurde mit dem Argument gefüllt.
    expect(deps.runLoop.mock.calls[0][0].systemPrompt).toBe('Fasse KI zusammen.');
    // Grenzen kamen aus dem Skill.
    expect(deps.runLoop.mock.calls[0][0].maxRunden).toBe(5);
    expect(deps.runLoop.mock.calls[0][0].zeitlimitS).toBe(300);
    // Lauf angelegt und als 'fertig' abgeschlossen.
    expect(deps.store.createRun).toHaveBeenCalled();
    expect(deps.store.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 42, status: 'fertig', result: 'R' })
    );
    expect(run.status).toBe('fertig');
  });

  it('nimmt das Modell des Skills, sonst das Standardmodell', async () => {
    const deps = makeDeps();
    await runSkill({ skillName: 'notiz', args: { thema: 'x' }, userId: 1 }, deps);
    expect(deps.runLoop.mock.calls[0][0].model).toBe('default-model');

    const deps2 = makeDeps({ loadSkill: jest.fn(async () => ({ ...baseSkill, modell: 'llama-spezial' })) });
    await runSkill({ skillName: 'notiz', args: { thema: 'x' }, userId: 1 }, deps2);
    expect(deps2.runLoop.mock.calls[0][0].model).toBe('llama-spezial');
    expect(deps2.resolveModel).not.toHaveBeenCalled();
  });

  it('baut den Sandbox-Container NUR, wenn der Skill Terminal deklariert', async () => {
    const ohne = makeDeps();
    await runSkill({ skillName: 'notiz', args: { thema: 'x' }, userId: 1 }, ohne);
    expect(ohne.ensureSandbox).not.toHaveBeenCalled();

    const mit = makeDeps({
      loadSkill: jest.fn(async () => ({ ...baseSkill, werkzeuge: ['terminal'], ordner: ['/arbeit'] })),
    });
    await runSkill({ skillName: 'notiz', args: { thema: 'x' }, userId: 1 }, mit);
    expect(mit.ensureSandbox).toHaveBeenCalledWith(['/arbeit']);
    // containerId/cwd landen im Kontext für die Schleife.
    expect(mit.runLoop.mock.calls[0][0].context).toMatchObject({ containerId: 'c1', cwd: '/w' });
  });

  it('startet trotzdem, wenn die Sandbox nicht verfügbar ist (kein harter Abbruch)', async () => {
    const deps = makeDeps({
      loadSkill: jest.fn(async () => ({ ...baseSkill, werkzeuge: ['terminal'], ordner: ['/a'] })),
      ensureSandbox: jest.fn(async () => { throw new Error('Image fehlt'); }),
    });
    const run = await runSkill({ skillName: 'notiz', args: { thema: 'x' }, userId: 1 }, deps);
    expect(deps.runLoop).toHaveBeenCalled(); // Lauf lief
    expect(run.status).toBe('fertig');
    // Ohne Container kein containerId im Kontext.
    expect(deps.runLoop.mock.calls[0][0].context.containerId).toBeUndefined();
  });

  it('schreibt zwei gleichnamige Werkzeug-Aufrufe in EINER Runde korrekt mit', async () => {
    // Der Schritt-Speicher schlüsselt offene Schritte nach Werkzeugnamen. Das ist
    // nur richtig, weil die Schleife die Aufrufe strikt nacheinander abarbeitet
    // (start→execute→result, dann der nächste). Dieser Test hält genau das fest:
    // zwei `web_suche` in einer Runde ergeben zwei sauber abgeschlossene Schritte.
    const echterStore = {
      createRun: jest.fn(async () => ({ id: 1 })),
      startStep: jest.fn(async () => ({ id: Math.floor(Math.random() * 1e6) })),
      finishStep: jest.fn(async () => ({})),
      bumpSteps: jest.fn(async () => 1),
      finishRun: jest.fn(async () => ({})),
      getRun: jest.fn(async () => ({ id: 1, steps: [] })),
    };
    // Echte Schleife: erst zwei gleichnamige tool_calls, dann Text.
    const realLoop = require('../../src/services/skills/toolLoop').runSkillLoop;
    axios.post
      .mockResolvedValueOnce(
        antwort({
          toolCalls: [
            { function: { name: 'web_suche', arguments: { q: 'a' } } },
            { function: { name: 'web_suche', arguments: { q: 'b' } } },
          ],
        })
      )
      .mockResolvedValueOnce(antwort({ content: 'fertig' }));

    const deps = makeDeps({
      store: echterStore,
      makeTools: () => [fakeTool('web_suche', async () => 'treffer')],
      runLoop: realLoop, // die ECHTE Schleife, nicht das Mock
    });
    await runSkill({ skillName: 'wissen', args: { thema: 'x' }, userId: 1 }, deps);

    // Zwei Schritte begonnen UND zwei abgeschlossen — keiner verwaist.
    expect(echterStore.startStep).toHaveBeenCalledTimes(2);
    expect(echterStore.finishStep).toHaveBeenCalledTimes(2);
  });

  it('scopet die RAG-Suche auf das Wissensbasis-Argument', async () => {
    const deps = makeDeps({
      loadSkill: jest.fn(async () => ({
        ...baseSkill,
        argumente: [{ name: 'raum', typ: 'wissensbasis', pflicht: true }],
        systemPrompt: 'Suche in {{raum}}.',
      })),
    });
    await runSkill({ skillName: 'wissen', args: { raum: 'handbuch' }, userId: 1 }, deps);
    expect(deps.runLoop.mock.calls[0][0].context.spaceIds).toEqual(['handbuch']);
  });

  it('schließt den Lauf als "fehler" ab, wenn die Schleife einen error liefert', async () => {
    const deps = makeDeps({ runLoop: jest.fn(async () => ({ result: '', error: 'kaputt' })) });
    await runSkill({ skillName: 'notiz', args: { thema: 'x' }, userId: 1 }, deps);
    expect(deps.store.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'fehler', error: 'kaputt' })
    );
  });

  it('meldet ein fehlendes Pflicht-Argument, bevor überhaupt ein Lauf entsteht', async () => {
    const deps = makeDeps();
    await expect(runSkill({ skillName: 'notiz', args: {}, userId: 1 }, deps)).rejects.toThrow(
      /Pflicht-Argument/
    );
    expect(deps.store.createRun).not.toHaveBeenCalled();
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
