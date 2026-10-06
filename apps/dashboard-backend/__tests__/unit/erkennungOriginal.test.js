/**
 * Die Erkennung liest das Original (M5, 06.10.2026, Kontrakt 14).
 *
 * Fremdtest vom 06.10.2026: das Modell eines erkennenden Schritts bekam nur den
 * Auftrag als Text und antwortete „Fehlt Beleg". Jede Pruefung hier ist ein
 * Satz des Auftrags:
 *  - das Original kommt ueber die Adresse der App, im Stand des Laufs, im
 *    Namen seines Menschen, und geht als Bild an ein Modell, das Bilder liest;
 *  - ein PDF wird zu seinen ersten Seiten;
 *  - fehlt es oder ist es zu gross, haelt der Lauf mit einem Grund an, statt
 *    ohne Bild zu raten;
 *  - in `ergebnis_bestaetigen` kommt die Freigabe der Erkennung immer, mit den
 *    Feldern, und traegt einen Titel aus den erkannten Feldern.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const db = require('../../src/database');
const original = require('../../src/services/flows/original');
const {
  executeSteps,
  istErkennend,
  titelAusFeldern,
} = require('../../src/services/flows/stepExecutor');
const { felderText } = require('../../src/services/flows/resultContract');
const { ForbiddenError } = require('../../src/utils/errors');
const { ersteNachricht } = require('../../src/services/flows/toolLoop');
const { FlowDefinition } = require('../../src/schemas/flows');

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('bild')]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = Buffer.from('%PDF-1.7\n...');

const KONTEXT = { appId: 'belege', stand: 'test', runId: 42, einreicherId: 5, userId: 1 };

beforeEach(() => {
  db.query.mockReset();
});

/** Eine Antwort des App-Containers, wie `http.request` sie liefert. */
function fakeAnfrage({ code = 200, koerper = PNG, typ = 'image/png' } = {}) {
  const gesehen = {};
  const anfrage = jest.fn((optionen, beiAntwort) => {
    Object.assign(gesehen, optionen);
    const req = new EventEmitter();
    req.destroy = jest.fn();
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = code;
      res.headers = { 'content-type': typ };
      res.destroy = jest.fn();
      beiAntwort(res);
      res.emit('data', koerper);
      res.emit('end');
    };
    return req;
  });
  return { anfrage, gesehen };
}

const person = { id: 5, username: 'anna', role: 'user', is_active: true };

function backendDeps(extra = {}) {
  return {
    datenbank: { query: jest.fn().mockResolvedValue({ rows: [person] }) },
    zugang: jest.fn().mockResolvedValue(undefined),
    port: jest.fn().mockResolvedValue(8080),
    ...extra,
  };
}

describe('original.artVon', () => {
  it('liest PNG, JPEG und PDF an den ersten Bytes, sonst null', () => {
    expect(original.artVon(PNG)).toBe('png');
    expect(original.artVon(JPEG)).toBe('jpeg');
    expect(original.artVon(PDF)).toBe('pdf');
    expect(original.artVon(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });
});

describe('original.hole aus dem Backend der App', () => {
  it('ruft den Container im Stand des Laufs, im Namen seines Menschen, ohne api/', async () => {
    const { anfrage, gesehen } = fakeAnfrage();
    const deps = backendDeps({ anfrage });
    const r = await original.hole({ pfad: 'api/belege/7.png', context: KONTEXT }, deps);

    expect(r).toEqual(
      expect.objectContaining({
        art: 'png',
        seiten: 1,
        bytes: PNG.length,
        pfad: 'api/belege/7.png',
      })
    );
    expect(r.bilder).toEqual([PNG.toString('base64')]);
    expect(gesehen.host).toBe('arasul-app-belege-test');
    expect(gesehen.port).toBe(8080);
    expect(gesehen.path).toBe('/belege/7.png');
    expect(gesehen.method).toBe('GET');
    expect(gesehen.headers['X-Arasul-User']).toBe('anna');
    expect(gesehen.headers['X-Arasul-Role']).toBe('user');
    expect(gesehen.headers['X-Arasul-Lauf']).toBe('42');
    // Kein Geheimnis geht mit.
    expect(gesehen.headers.Authorization).toBeUndefined();
    expect(deps.zugang).toHaveBeenCalledWith({ benutzerId: 5, appId: 'belege', stand: 'test' });
  });

  it('404 der App ist „fehlt" mit einem Satz', async () => {
    const { anfrage } = fakeAnfrage({ code: 404, koerper: Buffer.from('nicht da') });
    await expect(
      original.hole({ pfad: 'api/belege/7.png', context: KONTEXT }, backendDeps({ anfrage }))
    ).rejects.toMatchObject({ originalGrund: 'fehlt', message: expect.stringMatching(/404/) });
  });

  it('ohne Zugang des Menschen zur App holt das Gerät nichts', async () => {
    const { anfrage } = fakeAnfrage();
    const zugang = jest.fn().mockRejectedValue(new ForbiddenError('Keine Freigabe'));
    await expect(
      original.hole({ pfad: 'api/x.png', context: KONTEXT }, backendDeps({ anfrage, zugang }))
    ).rejects.toMatchObject({ originalGrund: 'zugang' });
    expect(anfrage).not.toHaveBeenCalled();
  });

  it('eine Störung der Datenbank ist kein fehlender Zugang, sondern ein Fehler', async () => {
    const { anfrage } = fakeAnfrage();
    const datenbank = { query: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const fehler = await original
      .hole({ pfad: 'api/x.png', context: KONTEXT }, backendDeps({ anfrage, datenbank }))
      .catch(e => e);
    expect(fehler.message).toBe('ECONNREFUSED');
    expect(fehler.originalGrund).toBeUndefined();
  });

  it('ein SVG ist kein Bild für das Modell', async () => {
    const { anfrage } = fakeAnfrage({ koerper: Buffer.from('<svg/>'), typ: 'image/svg+xml' });
    await expect(
      original.hole({ pfad: 'api/b.svg', context: KONTEXT }, backendDeps({ anfrage }))
    ).rejects.toMatchObject({
      originalGrund: 'format',
      message: expect.stringContaining('image/svg+xml'),
    });
  });

  it('mehr als die Obergrenze bricht ab: „zu groß"', async () => {
    const { anfrage } = fakeAnfrage({ koerper: Buffer.alloc(original.MAX_BYTES + 1, 1) });
    await expect(
      original.hole({ pfad: 'api/gross.png', context: KONTEXT }, backendDeps({ anfrage }))
    ).rejects.toMatchObject({ originalGrund: 'zu_gross' });
  });

  it('ein PDF geht an den Indexer und kommt als seine ersten Seiten zurück', async () => {
    const { anfrage } = fakeAnfrage({ koerper: PDF, typ: 'application/pdf' });
    const post = jest.fn().mockResolvedValue({ data: { seiten: ['A', 'B', 'C'], gesamt: 7 } });
    const r = await original.hole(
      { pfad: 'api/belege/7.pdf', context: KONTEXT },
      backendDeps({ anfrage, post })
    );
    expect(r).toEqual(expect.objectContaining({ art: 'pdf', seiten: 3, gesamt: 7 }));
    expect(r.bilder).toEqual(['A', 'B', 'C']);
    expect(post.mock.calls[0][0]).toMatch(/\/pdf-seiten$/);
    const form = post.mock.calls[0][1];
    expect(form.get('seiten')).toBe(String(original.MAX_SEITEN));
    expect(original.hinweisFuerModell(r)).toMatch(/die ersten 3 von 7 Seiten/);
  });

  it('ein PDF, das der Indexer nicht öffnet, ist ein Grund', async () => {
    const { anfrage } = fakeAnfrage({ koerper: PDF });
    const post = jest.fn().mockRejectedValue({ response: { status: 400 } });
    await expect(
      original.hole({ pfad: 'api/x.pdf', context: KONTEXT }, backendDeps({ anfrage, post }))
    ).rejects.toMatchObject({
      originalGrund: 'pdf',
      message: expect.stringContaining('beschädigt oder verschlüsselt'),
    });
  });

  it.each([
    ['zu_gross', 'zu groß'],
    ['zu_langsam', 'zu lange'],
  ])(
    'ein gültiges PDF über einer Grenze des Indexers (%s) heißt nicht kaputt',
    async (grund, satz) => {
      const { anfrage } = fakeAnfrage({ koerper: PDF });
      const post = jest.fn().mockRejectedValue({ response: { status: 400, data: { grund } } });
      await expect(
        original.hole({ pfad: 'api/x.pdf', context: KONTEXT }, backendDeps({ anfrage, post }))
      ).rejects.toMatchObject({ originalGrund: 'pdf', message: expect.stringContaining(satz) });
    }
  );
});

describe('original.hole aus dem Frontend der App', () => {
  let ordner;
  beforeAll(() => {
    ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'original-'));
    fs.mkdirSync(path.join(ordner, 'beispiele'));
    fs.writeFileSync(path.join(ordner, 'beispiele', 'beleg.jpg'), JPEG);
  });
  afterAll(() => fs.rmSync(ordner, { recursive: true, force: true }));

  const deps = () => ({ ausliefern: jest.fn().mockResolvedValue({ verzeichnis: ordner }) });

  it('liest die Datei aus dem Ordner, den Arasul für diesen Stand ausliefert', async () => {
    const d = deps();
    const r = await original.hole({ pfad: 'beispiele/beleg.jpg', context: KONTEXT }, d);
    expect(r.art).toBe('jpeg');
    expect(r.bilder).toEqual([JPEG.toString('base64')]);
    expect(d.ausliefern).toHaveBeenCalledWith('belege', 'test');
  });

  it('ein Ordner statt einer Datei ist „fehlt", kein Absturz', async () => {
    await expect(
      original.hole({ pfad: 'beispiele', context: KONTEXT }, deps())
    ).rejects.toMatchObject({ originalGrund: 'fehlt' });
  });

  it('eine Datei, die es nicht gibt, ist „fehlt"', async () => {
    await expect(
      original.hole({ pfad: 'beispiele/nein.png', context: KONTEXT }, deps())
    ).rejects.toMatchObject({ originalGrund: 'fehlt' });
  });
});

describe('original.modellMitBild', () => {
  it('nimmt das Modell des Schritts, wenn es Bilder liest', async () => {
    const datenbank = { query: jest.fn().mockResolvedValue({ rows: [{}] }) };
    const bildmodelle = jest.fn();
    expect(await original.modellMitBild('qwen2.5vl:7b', { datenbank, bildmodelle })).toEqual({
      modell: 'qwen2.5vl:7b',
      gewechselt: false,
    });
    expect(bildmodelle).not.toHaveBeenCalled();
  });

  it('ein Textmodell bekommt nie ein Bild: dann das Bildmodell des Geräts', async () => {
    const datenbank = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const bildmodelle = jest.fn().mockResolvedValue(['gemma4:e4b', 'llava-phi3']);
    expect(await original.modellMitBild('qwen3:8b', { datenbank, bildmodelle })).toEqual({
      modell: 'gemma4:e4b',
      gewechselt: true,
    });
  });

  it('ohne Bildmodell am Gerät ist das ein Grund', async () => {
    const datenbank = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const bildmodelle = jest.fn().mockResolvedValue([]);
    await expect(
      original.modellMitBild('qwen3:8b', { datenbank, bildmodelle })
    ).rejects.toMatchObject({ originalGrund: 'kein_bildmodell' });
  });
});

describe('titelAusFeldern und istErkennend', () => {
  it('die ersten drei Werte in der Reihenfolge der Rolle, je höchstens 40 Zeichen', () => {
    expect(
      titelAusFeldern(
        { betrag: '4,95', lieferant: 'Deutsche Post', datum: '01.10.2026', konto: '4910' },
        ['lieferant', 'betrag', 'datum', 'konto']
      )
    ).toBe('Deutsche Post, 4,95, 01.10.2026');
    expect(titelAusFeldern({ a: 'x'.repeat(60) }, ['a'])).toHaveLength(40);
    expect(titelAusFeldern({ a: '', b: ' ' }, ['a', 'b'])).toBeNull();
  });

  it('erkennend ist ein Flow mit einem subagent-Schritt, der ein Bild liest', () => {
    expect(istErkennend({ schritte: [{ typ: 'subagent', faehigkeiten: { bild: true } }] })).toBe(
      true
    );
    expect(istErkennend({ schritte: [{ typ: 'subagent' }] })).toBe(false);
    expect(istErkennend({})).toBe(false);
  });
});

describe('executeSteps mit Original', () => {
  const definition = {
    name: 'beleg',
    systemPrompt: 'Fasse zusammen.',
    werkzeuge: ['subagent'],
    rollen: [
      {
        name: 'leser',
        ergebnis: { felder: ['lieferant', 'betrag', 'datum'], aenderbar: ['betrag'] },
        prompt: 'Lies den Beleg.',
      },
    ],
    schritte: [
      {
        name: 'lesen',
        typ: 'subagent',
        rolle: 'leser',
        auftrag: 'Lies den Beleg {{beleg}}.',
        faehigkeiten: { bild: true },
        original: 'api/belege/{{beleg}}.pdf',
      },
    ],
    grenzen: { zeitlimit_s: 900 },
  };

  async function lauf({
    flow = FlowDefinition.parse(definition),
    art,
    erkannt = {
      felder: { lieferant: 'Deutsche Post', betrag: '4,95', datum: '01.10.2026' },
      json: true,
      unsicher: [],
    },
    holeOriginal = jest.fn().mockResolvedValue({
      bilder: ['S1', 'S2'],
      art: 'pdf',
      seiten: 2,
      gesamt: 2,
      bytes: 999,
      pfad: 'api/belege/7.pdf',
    }),
    modellMitBild = jest.fn().mockResolvedValue({ modell: 'gemma4:e4b', gewechselt: true }),
    felderNachFreigabe = jest.fn().mockResolvedValue(null),
    extern = null,
  } = {}) {
    const aufrufe = [];
    class FakeSubagent {
      async execute(params, context) {
        aufrufe.push({ params, context });
        context.onErgebnis?.(erkannt);
        return felderText(erkannt.felder, { felder: Object.keys(erkannt.felder) }).text;
      }
    }
    const recordWerkzeug = jest.fn().mockResolvedValue('Freigabe erteilt');
    const recorder = {
      beginnen: jest.fn().mockResolvedValue({ id: 11 }),
      abschliessen: jest.fn().mockResolvedValue({}),
    };
    const titelSetzen = jest.fn().mockResolvedValue('x');
    await executeSteps({
      flow: { ...flow, ...(art ? { art } : {}) },
      werte: { beleg: '7' },
      userInput: 'UI',
      model: 'qwen3:8b',
      context: {
        ...KONTEXT,
        slug: 'beleg',
        model: 'qwen3:8b',
        ...(extern ? { extern } : {}),
        stepRecorder: recorder,
      },
      makeTools: () => [],
      runLoop: jest.fn().mockResolvedValue({ result: 'Fertig' }),
      recordWerkzeug,
      SubagentToolClass: FakeSubagent,
      felderNachFreigabe,
      holeOriginal,
      modellMitBild,
      titelSetzen,
    });
    return { aufrufe, recordWerkzeug, recorder, titelSetzen, holeOriginal, modellMitBild };
  }

  it('das Modell bekommt das Original als Bilder, auf einem Bildmodell, nur am Gerät', async () => {
    const { aufrufe, holeOriginal, modellMitBild, recordWerkzeug } = await lauf();
    expect(holeOriginal).toHaveBeenCalledWith({
      pfad: 'api/belege/7.pdf',
      context: expect.objectContaining({ appId: 'belege', stand: 'test', runId: 42 }),
    });
    expect(modellMitBild).toHaveBeenCalledWith('qwen3:8b');
    const { params, context } = aufrufe[0];
    expect(context.bilder).toEqual(['S1', 'S2']);
    expect(context.model).toBe('gemma4:e4b');
    expect(context.modellErzwungen).toBe(true);
    expect(context.extern).toBeNull();
    expect(context.originalInfo).toEqual(
      expect.objectContaining({ pfad: 'api/belege/7.pdf', art: 'pdf', seiten: 2 })
    );
    expect(params.auftrag).toMatch(/^Lies den Beleg 7\.\n\nDas Original ist ein PDF/);
    // autonom und alles sicher: keine Freigabe, wie bisher
    expect(recordWerkzeug).not.toHaveBeenCalled();
  });

  it('steht der Flow auf einem externen Modell, geht das Bild dorthin mit', async () => {
    const extern = { anbieter: 'probe', modell: 'fest', basisUrl: 'http://x', schluessel: null };
    const { aufrufe, modellMitBild } = await lauf({ extern });
    expect(modellMitBild).not.toHaveBeenCalled();
    const { context } = aufrufe[0];
    expect(context.extern).toBe(extern);
    expect(context.bilder).toEqual(['S1', 'S2']);
    expect(context.modellErzwungen).toBeUndefined();
    expect(context.originalInfo.modell).toBe('extern');
  });

  it('fehlt das Original, ruft das Gerät kein Modell und hält mit dem Grund an', async () => {
    const holeOriginal = jest
      .fn()
      .mockRejectedValue(
        original.originalFehler('fehlt', 'Die App kennt das Original nicht (404).')
      );
    const { aufrufe, recordWerkzeug, recorder } = await lauf({ holeOriginal });

    expect(aufrufe).toHaveLength(0);
    expect(recordWerkzeug).toHaveBeenCalledTimes(1);
    const arg = recordWerkzeug.mock.calls[0][0];
    expect(arg.werkzeug).toBe('freigabe_anfordern');
    expect(arg.params.titel).toBe('Original fehlt');
    expect(arg.params.zusammenhang).toMatch(/Die App kennt das Original nicht \(404\)/);
    expect(arg.fortsetzung).toEqual({ schritt: 0, name: 'lesen' });
    expect(arg.erkennung.original).toBeNull();
    expect(arg.erkennung.felder.map(f => [f.name, f.fehlend, f.aenderbar])).toEqual([
      ['lieferant', true, false],
      ['betrag', true, true],
      ['datum', true, false],
    ]);
    // Der Schritt steht trotzdem im Protokoll (Wiederaufnahme nach Neustart).
    expect(recorder.beginnen).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'subagent', name: 'leser' })
    );
  });

  it('ein zu großes Original zeigt die Freigabe trotzdem an', async () => {
    const holeOriginal = jest
      .fn()
      .mockRejectedValue(original.originalFehler('zu_gross', 'Größer als 10 MB.'));
    const { recordWerkzeug } = await lauf({ holeOriginal });
    const arg = recordWerkzeug.mock.calls[0][0];
    expect(arg.params.titel).toBe('Original zu groß');
    expect(arg.erkennung.original).toBe('api/belege/7.pdf');
  });

  it('ein unerwarteter Fehler beim Holen ist kein Grund, sondern ein Fehler', async () => {
    const holeOriginal = jest.fn().mockRejectedValue(new TypeError('kaputt'));
    const recordWerkzeug = jest.fn();
    const ergebnis = await executeSteps({
      flow: FlowDefinition.parse(definition),
      werte: { beleg: '7' },
      userInput: 'UI',
      model: 'm',
      context: KONTEXT,
      makeTools: () => [],
      runLoop: jest.fn(),
      recordWerkzeug,
      holeOriginal,
    });
    expect(ergebnis.error).toMatch(/kaputt/);
    expect(recordWerkzeug).not.toHaveBeenCalled();
  });

  it('ergebnis_bestaetigen: die Freigabe kommt immer, mit Feldern und Titel aus den Feldern', async () => {
    const { recordWerkzeug, titelSetzen } = await lauf({ art: 'ergebnis_bestaetigen' });
    expect(recordWerkzeug).toHaveBeenCalledTimes(1);
    const arg = recordWerkzeug.mock.calls[0][0];
    expect(arg.params.titel).toBe('Ergebnis bestätigen: beleg');
    expect(arg.erkennung.felder.map(f => f.name)).toEqual(['lieferant', 'betrag', 'datum']);
    expect(arg.erkennung.felder.every(f => !f.unsicher && !f.fehlend)).toBe(true);
    expect(arg.erkennung.original).toBe('api/belege/7.pdf');
    expect(titelSetzen).toHaveBeenCalledWith({
      runId: 42,
      titel: 'Deutsche Post, 4,95, 01.10.2026',
    });
  });

  it('ein altes Paket ohne original läuft wie bisher, ohne Bild', async () => {
    const ohne = FlowDefinition.parse({
      ...definition,
      schritte: [{ ...definition.schritte[0], original: undefined }],
    });
    const { aufrufe, holeOriginal } = await lauf({ flow: ohne });
    expect(holeOriginal).not.toHaveBeenCalled();
    expect(aufrufe[0].context.bilder).toBeUndefined();
    expect(aufrufe[0].params.auftrag).toBe('Lies den Beleg 7.');
  });
});

describe('toolLoop.ersteNachricht', () => {
  it('Ollama bekommt images neben dem Text', () => {
    expect(ersteNachricht('Lies.', ['iVBORw0KGgo'], null)).toEqual({
      role: 'user',
      content: 'Lies.',
      images: ['iVBORw0KGgo'],
    });
  });

  it('ein externes Modell bekommt Bildteile mit data:-Adresse', () => {
    const n = ersteNachricht('Lies.', ['iVBORw0KGgo', '/9j/4AAQ'], { anbieter: 'x' });
    expect(n.content[0]).toEqual({ type: 'text', text: 'Lies.' });
    expect(n.content[1].image_url.url).toBe('data:image/png;base64,iVBORw0KGgo');
    expect(n.content[2].image_url.url).toBe('data:image/jpeg;base64,/9j/4AAQ');
  });

  it('ohne Bilder bleibt die Nachricht, wie sie war', () => {
    expect(ersteNachricht('Lies.', null, null)).toEqual({ role: 'user', content: 'Lies.' });
  });
});

describe('SubagentTool reicht das Original durch', () => {
  it('bilder gehen an die Schleife, im Protokoll steht nur, was es war', async () => {
    const SubagentTool = require('../../src/services/flows/subagent');
    const runLoop = jest.fn().mockResolvedValue({ result: '{"betrag": "4,95"}' });
    const recorder = {
      beginnen: jest.fn().mockResolvedValue({ id: 3 }),
      abschliessen: jest.fn().mockResolvedValue({}),
    };
    const limits = { subagentErlaubt: () => null, restSekunden: () => 100 };
    await new SubagentTool().execute(
      { rolle: 'leser', auftrag: 'Lies.' },
      {
        rollen: [
          {
            name: 'leser',
            prompt: 'P',
            werkzeuge: [],
            ergebnis: { felder: ['betrag'], max_zeichen: 500 },
          },
        ],
        limits,
        model: 'gemma4:e4b',
        makeTools: () => [],
        runLoop,
        stepRecorder: recorder,
        bilder: ['S1'],
        originalInfo: { pfad: 'api/b.png', art: 'png', seiten: 1 },
      }
    );
    expect(runLoop.mock.calls[0][0].bilder).toEqual(['S1']);
    expect(recorder.beginnen.mock.calls[0][0].input).toEqual({
      auftrag: 'Lies.',
      original: { pfad: 'api/b.png', art: 'png', seiten: 1 },
    });
  });
});
