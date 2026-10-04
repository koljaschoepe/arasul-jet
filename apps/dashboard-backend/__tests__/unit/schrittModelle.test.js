/**
 * Modell und Faehigkeiten je Schritt (M5, Migration 205).
 *
 * Gemessen wird die Entscheidung, nicht die Datenbank: welches Modell gilt, wann
 * ein Vermerk entsteht, welche Modelle zur Wahl stehen und dass das Backend ein
 * unpassendes abweist. Die SQL prueft die Abnahme am Geraet.
 */
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/llm/modelService', () => ({
  getDefaultModel: jest.fn().mockResolvedValue('qwen3.8:27b-q4_K_M'),
}));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../../src/database');
const sm = require('../../src/services/flows/schrittModelle');
const { executeSteps } = require('../../src/services/flows/stepExecutor');

// So liegen die vier Modelle des Orin im Katalog (Migration 175/205).
const ZEILEN = [
  {
    id: 'qwen3.8:27b-q4_K_M',
    name: 'Qwen',
    ollama_name: 'qwen3.8:27b-q4_K_M',
    model_type: 'llm',
    task: 'text',
    bild: false,
    werkzeuge: true,
    context_window: 262144,
    is_default: true,
  },
  {
    id: 'gemma4:e4b',
    name: 'Gemma',
    ollama_name: 'gemma4:e4b',
    model_type: 'llm',
    task: 'text',
    bild: true,
    werkzeuge: true,
    context_window: 131072,
    is_default: false,
  },
  {
    id: 'llava-phi3',
    name: 'LLaVA',
    ollama_name: 'llava-phi3',
    model_type: 'vision',
    task: 'vision',
    bild: true,
    werkzeuge: false,
    context_window: 4096,
    is_default: false,
  },
  {
    id: 'nomic-embed-text',
    name: 'Nomic',
    ollama_name: 'nomic-embed-text',
    model_type: 'embedding',
    task: 'embedding',
    bild: false,
    werkzeuge: false,
    context_window: 2048,
    is_default: false,
  },
];

beforeEach(() => {
  db.query.mockReset();
});

function modelle() {
  return ZEILEN.map(z => ({
    id: z.id,
    name: z.name,
    ollama_name: z.ollama_name,
    ist_standard: z.is_default,
    faehigkeiten: sm.faehigkeitenVon(z),
  }));
}

describe('fehlendes', () => {
  const m = Object.fromEntries(modelle().map(x => [x.id, x.faehigkeiten]));

  it('ein Modell erfuellt nur, was ALLE Faehigkeiten zugleich verlangen', () => {
    const f = { text: true, bild: true, werkzeuge: true, mindestkontext: 8192 };
    expect(sm.fehlendes(f, m['gemma4:e4b'])).toEqual([]);
    expect(sm.fehlendes(f, m['qwen3.8:27b-q4_K_M'])).toEqual(['Bild']);
    expect(sm.fehlendes(f, m['llava-phi3'])).toEqual(['Text', 'Werkzeuge', 'Kontext ab 8192']);
    expect(sm.fehlendes(f, m['nomic-embed-text'])).toEqual([
      'Text',
      'Bild',
      'Werkzeuge',
      'Kontext ab 8192',
    ]);
  });

  it('false und fehlen sind dasselbe', () => {
    expect(sm.fehlendes({ bild: false }, m['qwen3.8:27b-q4_K_M'])).toEqual([]);
    expect(sm.fehlendes(undefined, m['nomic-embed-text'])).toEqual([]);
  });

  it('ein unbekannter Kontext erfuellt keinen Mindestkontext', () => {
    const unbekannt = { text: true, bild: false, werkzeuge: false, kontext: null };
    expect(sm.fehlendes({ mindestkontext: 512 }, unbekannt)).toEqual(['Kontext ab 512']);
  });
});

describe('entscheide', () => {
  const basis = { modelle: modelle(), standardId: 'qwen3.8:27b-q4_K_M', forderung: { bild: true } };

  it('das Modell des Entwicklers gilt, wenn es am Geraet liegt', () => {
    expect(sm.entscheide({ ...basis, original: 'gemma4:e4b', wahl: null })).toEqual({
      gilt: 'gemma4:e4b',
      herkunft: 'paket',
    });
  });

  it('fehlt es, gilt das Standardmodell, und der Grund sagt es', () => {
    expect(sm.entscheide({ ...basis, original: 'llama9:70b', wahl: null })).toEqual({
      gilt: 'qwen3.8:27b-q4_K_M',
      herkunft: 'standard_weil_fehlt',
    });
  });

  it('die Wahl des Admins sticht das Paket, wenn sie alle Faehigkeiten erfuellt', () => {
    expect(sm.entscheide({ ...basis, original: 'llama9:70b', wahl: 'gemma4:e4b' })).toEqual({
      gilt: 'gemma4:e4b',
      herkunft: 'gewaehlt',
    });
  });

  it('eine Wahl, die nicht mehr passt, faellt zurueck und merkt es', () => {
    const e = sm.entscheide({ ...basis, original: 'gemma4:e4b', wahl: 'qwen3.8:27b-q4_K_M' });
    expect(e).toMatchObject({ gilt: 'gemma4:e4b', wahl_ungueltig: true });
    const geloescht = sm.entscheide({ ...basis, original: null, wahl: 'weg:1b' });
    expect(geloescht).toMatchObject({ herkunft: 'standard_wahl_ungueltig', wahl_ungueltig: true });
  });

  it('nennt der Entwickler kein Modell, folgt der Schritt dem Flow', () => {
    expect(sm.entscheide({ ...basis, original: null, wahl: null })).toEqual({
      gilt: null,
      herkunft: 'standard',
    });
  });
});

describe('setze', () => {
  beforeEach(() => {
    db.query.mockImplementation(async sql => {
      if (/FROM llm_installed_models/.test(sql)) return { rows: ZEILEN };
      return { rows: [], rowCount: 1 };
    });
  });

  it('weist ein Modell ab, das nicht am Geraet liegt', async () => {
    await expect(
      sm.setze({ appId: 'a', flowName: 'f', schritt: 's', modell: 'llama9:70b', forderung: {} })
    ).rejects.toThrow(/liegt nicht an diesem Gerät/);
  });

  it('weist ein installiertes Modell ab, dem eine Faehigkeit fehlt', async () => {
    await expect(
      sm.setze({
        appId: 'a',
        flowName: 'f',
        schritt: 's',
        modell: 'qwen3.8:27b-q4_K_M',
        forderung: { bild: true },
      })
    ).rejects.toThrow(/es fehlt Bild/);
    expect(
      db.query.mock.calls.some(([sql]) => /INSERT INTO public\.flow_schritt_modelle/.test(sql))
    ).toBe(false);
  });

  it('speichert ein passendes Modell und loescht bei null die Zeile', async () => {
    const r = await sm.setze({
      appId: 'a',
      flowName: 'f',
      schritt: 's',
      modell: 'gemma4:e4b',
      forderung: { bild: true, werkzeuge: true },
      durch: 3,
    });
    expect(r).toEqual({ modell: 'gemma4:e4b' });
    const insert = db.query.mock.calls.find(([sql]) =>
      /INSERT INTO public\.flow_schritt_modelle/.test(sql)
    );
    expect(insert[1]).toEqual(['a', 'f', 's', 'gemma4:e4b', 3]);
    await sm.setze({ appId: 'a', flowName: 'f', schritt: 's', modell: null, forderung: {} });
    expect(db.query.mock.calls.at(-1)[0]).toMatch(/DELETE FROM public\.flow_schritt_modelle/);
  });
});

describe('schritteVon', () => {
  it('bietet nur installierte Modelle an, die alle Faehigkeiten erfuellen', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const definition = {
      rollen: [{ name: 'leser' }],
      schritte: [
        {
          name: 'erkennen',
          typ: 'subagent',
          rolle: 'leser',
          modell: 'llama9:70b',
          faehigkeiten: { bild: true, werkzeuge: true },
        },
        { name: 'speichern', typ: 'werkzeug', werkzeug: 'dateien_schreiben' },
      ],
    };
    const [s, ...rest] = await sm.schritteVon(
      { appId: 'a', flowName: 'f', definitionen: [{ stand: 'test', definition }] },
      { modelle: modelle(), standardId: 'qwen3.8:27b-q4_K_M' }
    );
    expect(rest).toEqual([]);
    expect(s.original).toBe('llama9:70b');
    expect(s.original_vorhanden).toBe(false);
    expect(s.gilt).toBe('qwen3.8:27b-q4_K_M');
    expect(s.gilt_ist_standard).toBe(true);
    expect(s.herkunft).toBe('standard_weil_fehlt');
    expect(s.hinweis).toMatch(/llama9:70b.*nicht am Gerät/);
    expect(s.moegliche).toEqual(['gemma4:e4b']);
  });
});

describe('planFuerLauf und Executor', () => {
  it('der Plan vermerkt ein fehlendes Modell, und der Executor schreibt es als Hinweis in den Lauf', async () => {
    db.query.mockImplementation(async sql => {
      if (/FROM llm_installed_models/.test(sql)) return { rows: ZEILEN };
      return { rows: [] };
    });
    const definition = {
      rollen: [{ name: 'r', modell: 'llama9:70b' }],
      schritte: [{ name: 'a', typ: 'subagent', rolle: 'r', auftrag: 'tu', iterationen: 1 }],
      systemPrompt: 'x',
      grenzen: { zeitlimit_s: 60 },
    };
    const plan = await sm.planFuerLauf({ appId: 'app', flowName: 'f', definition });
    expect(plan.get('a')).toMatchObject({
      modell: 'qwen3.8:27b-q4_K_M',
      herkunft: 'standard_weil_fehlt',
    });

    const beginnen = jest.fn().mockResolvedValue({ id: 9 });
    const abschliessen = jest.fn().mockResolvedValue({});
    const sub = jest.fn().mockResolvedValue('OUT');
    class Fake {
      async execute(p, c) {
        return sub(p, c);
      }
    }
    await executeSteps({
      flow: definition,
      werte: {},
      userInput: '',
      model: 'flow-modell',
      context: { rollen: definition.rollen, stepRecorder: { beginnen, abschliessen } },
      makeTools: () => [],
      runLoop: jest.fn().mockResolvedValue({ result: 'F' }),
      recordWerkzeug: jest.fn(),
      schrittPlan: plan,
      SubagentToolClass: Fake,
    });
    expect(beginnen).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'hinweis', name: 'modell' })
    );
    // Das Modell des Plans sticht Flow und Rolle.
    expect(sub.mock.calls[0][1]).toMatchObject({
      model: 'qwen3.8:27b-q4_K_M',
      modellErzwungen: true,
    });
  });

  it('ohne Abweichung kein Vermerk', async () => {
    db.query.mockImplementation(async sql =>
      /FROM llm_installed_models/.test(sql) ? { rows: ZEILEN } : { rows: [] }
    );
    const definition = {
      rollen: [{ name: 'r', modell: 'gemma4:e4b' }],
      schritte: [{ name: 'a', typ: 'subagent', rolle: 'r', auftrag: 'tu' }],
    };
    const plan = await sm.planFuerLauf({ appId: 'app', flowName: 'f', definition });
    expect(plan.get('a')).toMatchObject({ modell: 'gemma4:e4b', herkunft: 'paket', vermerk: null });
  });
});
