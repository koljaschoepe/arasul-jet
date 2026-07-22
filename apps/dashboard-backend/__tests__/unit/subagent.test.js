/**
 * Subagenten mit hartem Ergebnis-Vertrag (Plan 011, Schritt 11).
 *
 * Die eine Zusage, die hier zählt: Rohdaten einer Rolle erreichen den
 * Orchestrator NIE — er sieht ausschließlich die deklarierten Felder, hart
 * gedeckelt. Dazu die Notbremsen (Gesamtzahl, Tiefe, Zeit) über alle Ebenen.
 */

jest.mock('axios');
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const axios = require('axios');
const { enforceContract, extractJsonObject } = require('../../src/services/skills/resultContract');
const { RunLimits } = require('../../src/services/skills/limits');
const SubagentTool = require('../../src/services/skills/subagent');
const { runSkillLoop } = require('../../src/services/skills/toolLoop');

/* ------------------------------------------------------------- Ergebnis-Vertrag */

describe('enforceContract', () => {
  const vertrag = { felder: ['fakten', 'quelle'], max_zeichen: 2000 };

  it('übernimmt nur die deklarierten Felder — Fremdes wird verworfen', () => {
    const { felder, json } = enforceContract(
      JSON.stringify({ fakten: 'A', quelle: 'x.de', geheim: 'DARF NICHT DURCH' }),
      vertrag
    );
    expect(json).toBe(true);
    expect(felder).toEqual({ fakten: 'A', quelle: 'x.de' });
    expect(JSON.stringify(felder)).not.toMatch(/DARF NICHT DURCH/);
  });

  it('füllt ein fehlendes Feld mit Leerstring', () => {
    const { felder } = enforceContract(JSON.stringify({ fakten: 'nur das' }), vertrag);
    expect(felder).toEqual({ fakten: 'nur das', quelle: '' });
  });

  it('findet das JSON auch in Prosa und einem ```json-Zaun', () => {
    const raw = 'Hier mein Ergebnis:\n```json\n{"fakten":"F","quelle":"q"}\n```\nDanke!';
    const { felder, json } = enforceContract(raw, vertrag);
    expect(json).toBe(true);
    expect(felder.fakten).toBe('F');
  });

  it('serialisiert einen Objekt-Feldwert, statt [object Object] zu liefern', () => {
    const { felder } = enforceContract(
      JSON.stringify({ fakten: { a: 1, b: 2 }, quelle: 'q' }),
      vertrag
    );
    expect(felder.fakten).toBe('{"a":1,"b":2}');
  });

  it('Rückfall bei fehlendem JSON: roher Text ins ERSTE Feld, Rest leer', () => {
    const { felder, json } = enforceContract('Ich habe keinen JSON geliefert, nur Prosa.', vertrag);
    expect(json).toBe(false);
    expect(felder.fakten).toMatch(/nur Prosa/);
    expect(felder.quelle).toBe('');
  });

  it('deckelt das GANZE Ergebnis hart bei max_zeichen', () => {
    const riesig = 'x'.repeat(5000);
    const { text, gekuerzt } = enforceContract(JSON.stringify({ fakten: riesig, quelle: 'q' }), {
      felder: ['fakten', 'quelle'],
      max_zeichen: 500,
    });
    expect(gekuerzt).toBe(true);
    expect(text).toMatch(/gekuerzt bei 500 Zeichen/);
    expect(text.length).toBeLessThan(600);
  });
});

describe('extractJsonObject', () => {
  it('zählt Klammern, statt am ersten "}" abzuschneiden', () => {
    expect(extractJsonObject('vorn {"a":{"b":1}} hinten')).toEqual({ a: { b: 1 } });
  });
  it('lässt sich von "}" in Strings nicht täuschen', () => {
    expect(extractJsonObject('{"t":"ein } im Text"}')).toEqual({ t: 'ein } im Text' });
  });
  it('gibt null bei ungültigem JSON', () => {
    expect(extractJsonObject('{kaputt')).toBeNull();
    expect(extractJsonObject('gar kein json')).toBeNull();
  });
});

/* ------------------------------------------------------------------ Notbremsen */

describe('RunLimits', () => {
  it('zählt erlaubte Aufrufe und blockt bei der Obergrenze', () => {
    const l = new RunLimits({ maxAufrufe: 2, zeitlimitS: 100 });
    expect(l.subagentErlaubt(0)).toBeNull();
    expect(l.subagentErlaubt(0)).toBeNull();
    expect(l.subagentErlaubt(0)).toMatch(/Gesamtzahl/);
    expect(l.aufrufe).toBe(2); // der abgewiesene zählt NICHT mit
  });

  it('blockt zu tiefe Verschachtelung', () => {
    const l = new RunLimits({ maxAufrufe: 100, zeitlimitS: 100, maxTiefe: 2 });
    expect(l.subagentErlaubt(0)).toBeNull(); // Orchestrator → Ebene 1
    expect(l.subagentErlaubt(1)).toBeNull(); // Ebene 1 → Ebene 2
    expect(l.subagentErlaubt(2)).toMatch(/zu tief/); // Ebene 2 → Ebene 3: nein
  });

  it('blockt nach Ablauf der Frist und zählt dann nicht mehr', () => {
    let t = 1000;
    const l = new RunLimits({ maxAufrufe: 100, zeitlimitS: 10, now: () => t });
    expect(l.subagentErlaubt(0)).toBeNull();
    t += 20000; // Frist überschritten
    expect(l.subagentErlaubt(0)).toMatch(/Zeitlimit/);
    expect(l.aufrufe).toBe(1);
  });
});

/* ------------------------------------------------------------- Subagent-Werkzeug */

describe('SubagentTool', () => {
  const tool = new SubagentTool();

  const rolle = {
    name: 'leser',
    prompt: 'Du liest Seiten.',
    modell: undefined,
    werkzeuge: ['web_lesen'],
    ergebnis: { felder: ['fakten', 'quelle'], max_zeichen: 2000 },
  };

  function baseCtx(overrides = {}) {
    return {
      rollen: [rolle],
      limits: new RunLimits({ maxAufrufe: 20, zeitlimitS: 900 }),
      depth: 0,
      model: 'default-model',
      werkzeugRunden: 5,
      roleContextBase: { roots: ['/a'], spaceIds: null, userId: 1 },
      recordSubagent: jest.fn(async () => {}),
      makeTools: jest.fn(() => [{ name: 'web_lesen' }]),
      // Die Rolle liefert brav JSON zurück.
      runLoop: jest.fn(async () => ({
        result: JSON.stringify({ fakten: 'Paris ist die Hauptstadt.', quelle: 'wiki' }),
      })),
      ...overrides,
    };
  }

  it('weist eine unbekannte Rolle als Text zurück (kein Wurf)', async () => {
    const out = await tool.execute({ rolle: 'gibtsnicht', auftrag: 'x' }, baseCtx());
    expect(out).toMatch(/nicht deklariert/i);
  });

  it('weist leere rolle/auftrag ab', async () => {
    expect(await tool.execute({ rolle: '', auftrag: 'x' }, baseCtx())).toMatch(/"rolle".*leer/i);
    expect(await tool.execute({ rolle: 'leser', auftrag: '' }, baseCtx())).toMatch(/"auftrag".*leer/i);
  });

  it('gibt an den Orchestrator NUR die Vertragsfelder zurück — nie die Rohdaten', async () => {
    const ctx = baseCtx({
      // Die Rolle liest etwas Großes/Geheimes und packt es in ein Nicht-Vertragsfeld.
      runLoop: jest.fn(async () => ({
        result: JSON.stringify({
          fakten: 'Kurzfazit.',
          quelle: 'q',
          rohtext: 'HIER STEHEN 5000 ZEICHEN SEITENINHALT die niemand sehen soll',
        }),
      })),
    });
    const out = await tool.execute({ rolle: 'leser', auftrag: 'Lies x' }, ctx);
    expect(out).toContain('Kurzfazit.');
    expect(out).not.toMatch(/SEITENINHALT/); // Rohdaten erreichen den Orchestrator NICHT
  });

  it('protokolliert Rohdaten UND das Verdichtete über recordSubagent', async () => {
    const ctx = baseCtx({
      runLoop: jest.fn(async () => ({ result: 'Nur Prosa, kein JSON — das ist der Rohtext.' })),
    });
    await tool.execute({ rolle: 'leser', auftrag: 'Lies x' }, ctx);
    expect(ctx.recordSubagent).toHaveBeenCalledTimes(1);
    const arg = ctx.recordSubagent.mock.calls[0][0];
    expect(arg.raw).toMatch(/das ist der Rohtext/); // roh im Protokoll
    expect(arg.rolle).toBe('leser');
    expect(arg.text).toMatch(/fakten:/); // verdichtet
  });

  it('führt die Rolle mit IHREN Werkzeugen und dem Vertrags-Hinweis aus', async () => {
    const ctx = baseCtx();
    await tool.execute({ rolle: 'leser', auftrag: 'Lies example.org' }, ctx);
    expect(ctx.makeTools).toHaveBeenCalledWith(['web_lesen']);
    const loopArg = ctx.runLoop.mock.calls[0][0];
    expect(loopArg.systemPrompt).toMatch(/Du liest Seiten/);
    expect(loopArg.systemPrompt).toMatch(/JSON-Objekt mit genau diesen Feldern: fakten, quelle/);
    expect(loopArg.userInput).toBe('Lies example.org');
    // Die Rolle läuft eine Ebene TIEFER.
    expect(loopArg.context.depth).toBe(1);
  });

  it('erbt das Skill-Modell, nutzt aber das Rollen-Modell wenn gesetzt', async () => {
    const geerbt = baseCtx();
    await tool.execute({ rolle: 'leser', auftrag: 'x' }, geerbt);
    expect(geerbt.runLoop.mock.calls[0][0].model).toBe('default-model');

    const eigen = baseCtx({ rollen: [{ ...rolle, modell: 'spezial-modell' }] });
    await tool.execute({ rolle: 'leser', auftrag: 'x' }, eigen);
    expect(eigen.runLoop.mock.calls[0][0].model).toBe('spezial-modell');
  });

  it('reicht die Werkzeug-Basis (Ordner) an die Rolle durch', async () => {
    const ctx = baseCtx();
    await tool.execute({ rolle: 'leser', auftrag: 'x' }, ctx);
    expect(ctx.runLoop.mock.calls[0][0].context).toMatchObject({ roots: ['/a'], userId: 1 });
  });

  it('bricht bei erreichter Notbremse ab, OHNE die Rolle zu starten', async () => {
    const ctx = baseCtx({ limits: new RunLimits({ maxAufrufe: 0, zeitlimitS: 900 }) });
    const out = await tool.execute({ rolle: 'leser', auftrag: 'x' }, ctx);
    expect(out).toMatch(/Abgebrochen.*Gesamtzahl/i);
    expect(ctx.runLoop).not.toHaveBeenCalled();
  });

  it('teilt die Notbremse über die Ebenen: der Gesamtzähler zählt weiter', async () => {
    const limits = new RunLimits({ maxAufrufe: 3, zeitlimitS: 900, maxTiefe: 2 });
    const ctx = baseCtx({ limits });
    await tool.execute({ rolle: 'leser', auftrag: 'a' }, ctx);
    await tool.execute({ rolle: 'leser', auftrag: 'b' }, ctx);
    await tool.execute({ rolle: 'leser', auftrag: 'c' }, ctx);
    // Vier Aufrufe, drei erlaubt.
    const vierter = await tool.execute({ rolle: 'leser', auftrag: 'd' }, ctx);
    expect(vierter).toMatch(/Gesamtzahl/);
    expect(limits.aufrufe).toBe(3);
  });

  it('blockt die dritte Ebene (Verschachtelung zu tief)', async () => {
    // Ein Aufruf, dessen Aufrufer bereits auf Ebene 2 sitzt.
    const ctx = baseCtx({ depth: 2, limits: new RunLimits({ maxAufrufe: 20, zeitlimitS: 900, maxTiefe: 2 }) });
    const out = await tool.execute({ rolle: 'leser', auftrag: 'x' }, ctx);
    expect(out).toMatch(/zu tief/i);
    expect(ctx.runLoop).not.toHaveBeenCalled();
  });

  it('protokolliert, WAS die Rolle liest (Werkzeug-Verlauf), nicht nur ihr Schlusswort', async () => {
    // Echte Rollen-Schleife: Die Rolle ruft ein Werkzeug, das Rohmaterial
    // zurückgibt, und liefert dann Vertrags-JSON. Das Rohmaterial darf NICHT
    // an den Orchestrator, MUSS aber im raw des Protokolls landen (§6).
    const roheSeite = 'GANZER SEITENINHALT den nur die Rolle sehen darf';
    const werkzeug = {
      name: 'web_lesen',
      toOllamaToolDefinition: () => ({ type: 'function', function: { name: 'web_lesen' } }),
      execute: jest.fn(async () => roheSeite),
    };
    axios.post
      .mockResolvedValueOnce({
        data: { message: { tool_calls: [{ function: { name: 'web_lesen', arguments: { adresse: 'x' } } }] } },
      })
      .mockResolvedValueOnce({
        data: { message: { content: JSON.stringify({ fakten: 'Kurzfazit', quelle: 'x' }) } },
      });

    const recordSubagent = jest.fn(async () => {});
    const ctx = baseCtx({
      recordSubagent,
      makeTools: () => [werkzeug], // die Rolle bekommt das echte Werkzeug-Doppel
      runLoop: runSkillLoop, // die ECHTE Schleife
    });
    const out = await tool.execute({ rolle: 'leser', auftrag: 'Lies x' }, ctx);

    // Orchestrator sieht NUR den Vertrag, nicht das Rohmaterial.
    expect(out).toContain('Kurzfazit');
    expect(out).not.toMatch(/GANZER SEITENINHALT/);
    // Im Protokoll steht das Rohmaterial sehr wohl.
    const raw = recordSubagent.mock.calls[0][0].raw;
    expect(raw).toMatch(/GANZER SEITENINHALT/);
    expect(raw).toMatch(/Werkzeug-Verlauf der Rolle/);
  });
});
