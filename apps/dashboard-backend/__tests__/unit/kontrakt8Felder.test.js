/**
 * Kontrakt 8 (M5): symbol, arten, ausloeser, stufen, faehigkeiten und
 * aenderungstext. Zwei Zusagen werden geprueft: Falsches wird mit einem
 * lesbaren Grund abgewiesen, und was es vorher nicht gab, bleibt gueltig.
 */
const { AppManifest, Aenderungstext } = require('../../src/schemas/apps');
const { FlowDefinition } = require('../../src/schemas/flows');
const { parseFlowFile, serializeFlowFile } = require('../../src/services/flows/flowFile');
const appKontrakt = require('../../src/services/app/appKontrakt');

const MANIFEST = {
  schema: 1,
  id: 'belege',
  name: 'Belege',
  version: '1.0.0',
  frontend: { verzeichnis: 'frontend' },
};

const FLOW = { name: 'beleg', systemPrompt: 'Lies den Beleg.' };

function grund(ergebnis) {
  expect(ergebnis.success).toBe(false);
  return ergebnis.error.issues.map(i => i.message).join(' | ');
}

describe('symbol im Manifest', () => {
  it.each(['file-text', 'receipt', 'a-arrow-down', 'BE', 'K', '42'])('nimmt %s', symbol => {
    expect(AppManifest.safeParse({ ...MANIFEST, symbol }).success).toBe(true);
  });

  it('ist freiwillig', () => {
    const r = AppManifest.parse(MANIFEST);
    expect(r.symbol).toBeUndefined();
  });

  it.each(['File Text', 'file_text', 'ABCD', '-x', 'x-', '', '📄'])(
    'weist %j mit lesbarem Grund ab',
    symbol => {
      expect(grund(AppManifest.safeParse({ ...MANIFEST, symbol }))).toMatch(/Lucide-Name|Kuerzel/);
    }
  );
});

describe('arten, ausloeser, stufen je Flow', () => {
  it('nimmt alle drei', () => {
    const r = FlowDefinition.safeParse({
      ...FLOW,
      arten: ['autonom', 'ergebnis_bestaetigen'],
      ausloeser: [
        { typ: 'hand' },
        { typ: 'zeitplan', zeitplan: '0 6 * * 1-5' },
        { typ: 'ereignis', ereignis: 'beleg.hochgeladen' },
      ],
      stufen: [
        { name: 'pruefung', frist_minuten: 60 },
        { name: 'leitung', bezeichnung: 'Leitung' },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('bleibt ohne die Felder, was es war', () => {
    const r = FlowDefinition.parse(FLOW);
    expect(r.arten).toBeUndefined();
    expect(r.ausloeser).toBeUndefined();
    expect(r.stufen).toBeUndefined();
  });

  it.each([
    [{ arten: ['manuell'] }, /Art ist eine von/],
    [{ arten: [] }, /mindestens eine Art/],
    [{ arten: ['autonom', 'autonom'] }, /zweimal/],
    [{ ausloeser: [{ typ: 'zuruf' }] }, /Ausloeser-Typ/],
    [{ ausloeser: [{ typ: 'zeitplan' }] }, /braucht "zeitplan"/],
    [{ ausloeser: [{ typ: 'zeitplan', zeitplan: 'jeden Tag' }] }, /fuenf Felder/],
    [{ ausloeser: [{ typ: 'zeitplan', zeitplan: '0 6 * *' }] }, /fuenf Felder/],
    [{ ausloeser: [{ typ: 'ereignis' }] }, /braucht "ereignis"/],
    [{ ausloeser: [{ typ: 'ereignis', ereignis: 'Beleg Neu' }] }, /ereignis:/],
    [{ ausloeser: [{ typ: 'hand' }, { typ: 'hand' }] }, /zweimal/],
    [{ ausloeser: [{ typ: 'hand', zeitplan: '* * * * *' }] }, /Unrecognized key/],
    [{ stufen: [{ name: 'Pruefung' }] }, /Stufenname/],
    [{ stufen: [{ name: 'a' }, { name: 'a' }] }, /zweimal/],
    [{ stufen: [{ name: 'a', frist_minuten: 0 }] }, /frist_minuten/],
    [{ stufen: [{ name: 'a', person: 'kolja' }] }, /Unrecognized key/],
  ])('weist %j ab', (felder, muster) => {
    expect(grund(FlowDefinition.safeParse({ ...FLOW, ...felder }))).toMatch(muster);
  });

  it('verlangt fuer eine genannte Stufe eine deklarierte', () => {
    const schritt = {
      name: 'frei',
      typ: 'werkzeug',
      werkzeug: 'freigabe_anfordern',
      parameter: { stufe: 'leitung' },
    };
    const basis = { ...FLOW, werkzeuge: ['freigabe_anfordern'], schritte: [schritt] };
    expect(
      FlowDefinition.safeParse({ ...basis, stufen: [{ name: 'pruefung' }, { name: 'leitung' }] })
        .success
    ).toBe(true);
    expect(grund(FlowDefinition.safeParse({ ...basis, stufen: [{ name: 'pruefung' }] }))).toMatch(
      /Stufe "leitung", die der Flow nicht deklariert/
    );
  });

  it('geht durch die Flow-Datei hin und zurueck', () => {
    const flow = FlowDefinition.parse({
      ...FLOW,
      arten: ['autonom'],
      ausloeser: [{ typ: 'hand' }],
      stufen: [{ name: 'pruefung' }],
    });
    const zurueck = parseFlowFile(serializeFlowFile(flow), { name: 'beleg' });
    expect(zurueck.arten).toEqual(['autonom']);
    expect(zurueck.ausloeser).toEqual([{ typ: 'hand' }]);
    expect(zurueck.stufen).toEqual([{ name: 'pruefung' }]);
  });
});

describe('faehigkeiten je Schritt', () => {
  const schritt = {
    name: 'lesen',
    typ: 'subagent',
    rolle: 'leser',
    auftrag: 'Lies.',
  };
  const flow = faehigkeiten => ({
    ...FLOW,
    werkzeuge: ['subagent'],
    rollen: [{ name: 'leser', ergebnis: { felder: ['text'] }, prompt: 'Lies.' }],
    schritte: [{ ...schritt, faehigkeiten }],
  });

  it('nimmt Text, Bild, Werkzeuge und Mindestkontext', () => {
    const r = FlowDefinition.safeParse(
      flow({ text: true, bild: true, werkzeuge: false, mindestkontext: 8192 })
    );
    expect(r.success).toBe(true);
  });

  it.each([
    [{ ton: true }, /Unrecognized key/],
    [{ bild: 'ja' }, /bild ist true oder false/],
    [{ mindestkontext: 10 }, /mindestens 512/],
    [{ mindestkontext: 99999999 }, /hoechstens 1048576/],
  ])('weist %j ab', (faehigkeiten, muster) => {
    expect(grund(FlowDefinition.safeParse(flow(faehigkeiten)))).toMatch(muster);
  });

  it('weist einen Werkzeug-Schritt mit Faehigkeiten ab: er ruft kein Modell', () => {
    const r = FlowDefinition.safeParse({
      ...FLOW,
      werkzeuge: ['freigabe_anfordern'],
      schritte: [
        {
          name: 'frei',
          typ: 'werkzeug',
          werkzeug: 'freigabe_anfordern',
          faehigkeiten: { bild: true },
        },
      ],
    });
    expect(grund(r)).toMatch(/Werkzeug-Schritt ohne Modell/);
  });
});

describe('aenderungstext', () => {
  it('nimmt ein paar Saetze', () => {
    expect(Aenderungstext.parse('  Neu: Belege lassen sich drucken.  ')).toBe(
      'Neu: Belege lassen sich drucken.'
    );
  });

  it('weist leer und zu lang ab', () => {
    expect(grund(Aenderungstext.safeParse('   '))).toMatch(/leer/);
    expect(grund(Aenderungstext.safeParse('x'.repeat(1001)))).toMatch(/zu lang/);
  });
});

describe('Kontrakt 8 im Kontrakt', () => {
  const k = appKontrakt.kontrakt();

  it('geht auf 8 oder hoeher (9 brachte die Bibliothek zur Laufzeit)', () => {
    expect(k.kontrakt).toBeGreaterThanOrEqual(8);
  });

  it('nennt die Felder im Schema', () => {
    expect(k.app_json.schema.properties).toHaveProperty('symbol');
    expect(k.flow_frontmatter.schema.properties).toEqual(
      expect.objectContaining({
        arten: expect.anything(),
        ausloeser: expect.anything(),
        stufen: expect.anything(),
      })
    );
    expect(k.flow_frontmatter.schema.properties.schritte.items.properties).toHaveProperty(
      'faehigkeiten'
    );
  });

  it('haelt alle Felder freiwillig', () => {
    const verlangt = [...k.app_json.schema.required, ...k.flow_frontmatter.schema.required];
    for (const feld of ['symbol', 'arten', 'ausloeser', 'stufen']) {
      expect(verlangt).not.toContain(feld);
    }
  });

  it('sagt den aenderungstext beim Paket', () => {
    expect(k.paket.regeln.join(' ')).toMatch(/aenderungstext/);
  });
});
