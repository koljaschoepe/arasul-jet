/**
 * Korrekturfelder in der Freigabe (M5, 04.10.2026, Kontrakt 10).
 *
 * Das Zielbild in vier Saetzen, und jeder ist hier eine Pruefung: die App
 * erklaert in der Rolle, welche Felder aenderbar sind; wer bestaetigt, aendert
 * nur diese, alles andere weist das Backend ab; gespeichert wird je Feld der
 * Vorschlag der KI und die Aenderung, wer und wann; der weitere Lauf arbeitet
 * mit dem geaenderten Wert.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../../src/database');
const freigabeAnfragen = require('../../src/services/flows/freigabeAnfragen');
const {
  executeSteps,
  korrigierteAusgabe,
  korrigiereVorab,
  originalPfad,
} = require('../../src/services/flows/stepExecutor');
const { felderText } = require('../../src/services/flows/resultContract');
const { FlowDefinition } = require('../../src/schemas/flows');
const { BestaetigenBody } = require('../../src/schemas/freigabeAnfragen');
const { ValidationError, ForbiddenError } = require('../../src/utils/errors');

beforeEach(() => {
  db.query.mockReset();
  freigabeAnfragen._reset();
});

const grenzen = { zeitlimit_s: 900 };

/** Ein erkennender Flow mit einer Rolle, die `aenderbar` nennt. */
const FLOW = {
  name: 'beleg',
  systemPrompt: 'Nenne Betrag und Datum.',
  werkzeuge: ['subagent'],
  rollen: [
    {
      name: 'leser',
      ergebnis: { felder: ['betrag', 'datum'], aenderbar: ['datum'] },
      prompt: 'Lies.',
    },
  ],
  schritte: [
    {
      name: 'lesen',
      typ: 'subagent',
      rolle: 'leser',
      auftrag: 'Lies {{beleg}}.',
      faehigkeiten: { bild: true },
      original: 'api/belege/{{beleg}}.png',
    },
  ],
};

function grund(ergebnis) {
  expect(ergebnis.success).toBe(false);
  return ergebnis.error.issues.map(i => i.message).join(' | ');
}

describe('Kontrakt 10: aenderbar und original im Flow-Kopf', () => {
  it('nimmt beides an einem erkennenden Schritt', () => {
    const r = FlowDefinition.parse(FLOW);
    expect(r.rollen[0].ergebnis.aenderbar).toEqual(['datum']);
    expect(r.schritte[0].original).toBe('api/belege/{{beleg}}.png');
  });

  it('ist freiwillig: ohne beides bleibt ein Flow von Kontrakt 9 gueltig', () => {
    const rollen = [{ ...FLOW.rollen[0], ergebnis: { felder: ['betrag', 'datum'] } }];
    const schritte = [{ ...FLOW.schritte[0], original: undefined }];
    expect(FlowDefinition.safeParse({ ...FLOW, rollen, schritte }).success).toBe(true);
  });

  it('aenderbar nennt nur Felder des Ergebnisses', () => {
    const rollen = [
      { ...FLOW.rollen[0], ergebnis: { felder: ['betrag'], aenderbar: ['konto'] } },
    ];
    expect(grund(FlowDefinition.safeParse({ ...FLOW, rollen }))).toMatch(
      /"aenderbar" nennt "konto"/
    );
  });

  it.each(['/apps/x/bild.png', '../geheim', 'https://anderswo/bild.png', 'a\\b', '%2e%2e/x'])(
    'original %j ist kein Pfad relativ zur App',
    original => {
      const schritte = [{ ...FLOW.schritte[0], original }];
      expect(grund(FlowDefinition.safeParse({ ...FLOW, schritte }))).toMatch(/relativ zur Adresse/);
    }
  );

  it('original gibt es nur an einem erkennenden Schritt', () => {
    const schritte = [{ ...FLOW.schritte[0], faehigkeiten: { text: true } }];
    expect(grund(FlowDefinition.safeParse({ ...FLOW, schritte }))).toMatch(
      /nur an einem erkennenden Schritt/
    );
  });

  it('Bestaetigen nimmt Felder, sonst nichts', () => {
    expect(BestaetigenBody.safeParse({}).success).toBe(true);
    expect(BestaetigenBody.safeParse({ felder: { datum: '01.10.2026' } }).success).toBe(true);
    expect(BestaetigenBody.safeParse({ felder: { datum: 3 } }).success).toBe(false);
    expect(BestaetigenBody.safeParse({ notiz: 'x' }).success).toBe(false);
  });
});

describe('Felder einer Erkennung', () => {
  it('unsichere und fehlende stehen oben, mit aenderbar aus der Rolle', () => {
    const felder = freigabeAnfragen.felderDerErkennung({
      felder: { betrag: '12,50', datum: '', konto: '4711' },
      fehlend: ['datum'],
      unsicher: ['konto'],
      aenderbar: ['datum'],
    });
    expect(felder.map(f => f.name)).toEqual(['datum', 'konto', 'betrag']);
    expect(felder[0]).toEqual({
      name: 'datum',
      vorschlag: '',
      fehlend: true,
      unsicher: false,
      aenderbar: true,
    });
    expect(felder[2].aenderbar).toBe(false);
  });

  it('eine Korrektur nur an einem aenderbaren Feld, ein gleicher Wert ist keine', () => {
    const vorlage = freigabeAnfragen.felderDerErkennung({
      felder: { betrag: '12,50', datum: '' },
      fehlend: ['datum'],
      aenderbar: ['datum', 'betrag'],
    });
    expect(
      freigabeAnfragen.pruefeKorrekturen(vorlage, { datum: '01.10.2026', betrag: '12,50' })
    ).toEqual({
      korrekturen: [{ feld: 'datum', vorschlag: '', wert: '01.10.2026' }],
      abgewiesen: [],
    });
    const ohne = vorlage.map(f => ({ ...f, aenderbar: false }));
    expect(freigabeAnfragen.pruefeKorrekturen(ohne, { datum: 'x', gibts: 'y' }).abgewiesen).toEqual(
      ['datum', 'gibts']
    );
  });

  it('der Text des Schritts nennt Vorschlag und Aenderung', () => {
    const text = freigabeAnfragen.erteiltText('bernd', '2026-10-04T10:00:00Z', [
      { feld: 'datum', vorschlag: '', wert: '01.10.2026', von: 'bernd' },
    ]);
    expect(text).toMatch(/^Freigabe erteilt von bernd/);
    expect(text).toMatch(/datum: „" \(Vorschlag\) → „01\.10\.2026" \(bernd\)/);
    expect(freigabeAnfragen.erteiltText('bernd', '2026-10-04T10:00:00Z')).not.toMatch(/Geändert/);
  });
});

describe('entscheide mit Feldern', () => {
  const FELDER = freigabeAnfragen.felderDerErkennung({
    felder: { betrag: '12,50', datum: '' },
    fehlend: ['datum'],
    aenderbar: ['datum'],
  });

  /** Eine Datenbank, die die Anfrage 42 fuehrt und `bernd` (Nummer 2) entscheiden laesst. */
  function datenbank({ darf = true } = {}) {
    const calls = [];
    db.query.mockImplementation(async (sql, params = []) => {
      calls.push({ sql, params });
      if (/SELECT a\.felder FROM public\.approvals/.test(sql)) {
        return { rows: [{ felder: FELDER }] };
      }
      if (/^\s*SELECT 1 FROM public\.approvals a/.test(sql)) {
        return { rows: darf ? [{ '?column?': 1 }] : [] };
      }
      if (/UPDATE public\.approvals a\s+SET status = \$3/.test(sql)) {
        const korrekturen = JSON.parse(params[4]).map(k => ({
          ...k,
          von: 'bernd',
          von_id: 2,
          am: '2026-10-04T10:00:00Z',
        }));
        return {
          rows: [
            {
              id: 42,
              run_id: 7,
              app_id: 'belege',
              stand: 'live',
              titel: 'Erkennung unsicher: Feld datum',
              status: params[2],
              entschieden_am: '2026-10-04T10:00:00Z',
              korrekturen: korrekturen.length ? korrekturen : null,
            },
          ],
        };
      }
      if (/SELECT a\.status, a\.app_id/.test(sql)) {
        return {
          rows: [
            {
              status: 'offen',
              app_id: 'belege',
              abgelaufen: false,
              darf: false,
              eingereicht: false,
              im_kreis: false,
              bei_ihm: false,
              liegt_bei: null,
            },
          ],
        };
      }
      if (/SELECT username FROM public\.admin_users/.test(sql)) {
        return { rows: [{ username: 'bernd' }] };
      }
      if (/fortsetzung IS NOT NULL AS fortsetzbar/.test(sql)) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });
    return calls;
  }

  it('speichert das geaenderte Feld in derselben Anweisung wie die Entscheidung', async () => {
    const calls = datenbank();
    const ergebnis = await freigabeAnfragen.entscheide({
      id: 42,
      benutzerId: 2,
      status: 'bestaetigt',
      felder: { datum: '01.10.2026' },
    });
    const update = calls.find(c => /SET status = \$3/.test(c.sql));
    expect(update.sql).toMatch(/korrekturen = CASE/);
    expect(JSON.parse(update.params[4])).toEqual([
      { feld: 'datum', vorschlag: '', wert: '01.10.2026' },
    ]);
    expect(ergebnis.korrekturen).toEqual([
      expect.objectContaining({ feld: 'datum', vorschlag: '', wert: '01.10.2026', von: 'bernd' }),
    ]);
  });

  it('ein nicht freigegebenes Feld weist es mit 400 ab, ohne zu entscheiden', async () => {
    const calls = datenbank();
    await expect(
      freigabeAnfragen.entscheide({
        id: 42,
        benutzerId: 2,
        status: 'bestaetigt',
        felder: { betrag: '99,00' },
      })
    ).rejects.toThrow(ValidationError);
    await expect(
      freigabeAnfragen.entscheide({
        id: 42,
        benutzerId: 2,
        status: 'bestaetigt',
        felder: { betrag: '99,00' },
      })
    ).rejects.toThrow(/"betrag" ist in dieser Freigabe nicht änderbar/);
    expect(calls.some(c => /SET status = \$3/.test(c.sql))).toBe(false);
  });

  it('wer nicht entscheiden darf, erfaehrt nicht, welche Felder es gibt', async () => {
    datenbank({ darf: false });
    await expect(
      freigabeAnfragen.entscheide({
        id: 42,
        benutzerId: 9,
        status: 'bestaetigt',
        felder: { gibts: 'x' },
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it('eine Ablehnung traegt keine Felder', async () => {
    datenbank();
    await expect(
      freigabeAnfragen.entscheide({
        id: 42,
        benutzerId: 2,
        status: 'abgelehnt',
        begruendung: 'nein',
        felder: { datum: 'x' },
      })
    ).rejects.toThrow(/Eine Ablehnung trägt keine/);
  });

  it('ohne Felder schreibt es keine Korrektur', async () => {
    const calls = datenbank();
    const ergebnis = await freigabeAnfragen.entscheide({
      id: 42,
      benutzerId: 2,
      status: 'bestaetigt',
    });
    const update = calls.find(c => /SET status = \$3/.test(c.sql));
    expect(JSON.parse(update.params[4])).toEqual([]);
    expect(ergebnis.korrekturen).toBeNull();
  });
});

describe('felderNachFreigabe', () => {
  it('nimmt den Vorschlag und ueberschreibt, was der Mensch aenderte', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          felder: [
            { name: 'datum', vorschlag: '' },
            { name: 'betrag', vorschlag: '12,50' },
          ],
          korrekturen: [{ feld: 'datum', vorschlag: '', wert: '01.10.2026' }],
        },
      ],
    });
    const r = await freigabeAnfragen.felderNachFreigabe({ runId: 7, schritt: 'lesen' });
    expect(r.felder).toEqual({ datum: '01.10.2026', betrag: '12,50' });
    expect(db.query.mock.calls[0][1]).toEqual([7, 'lesen']);
  });

  it('ohne bestaetigte Freigabe: null', async () => {
    db.query.mockResolvedValue({ rows: [] });
    expect(await freigabeAnfragen.felderNachFreigabe({ runId: 7, schritt: 'lesen' })).toBeNull();
  });
});

describe('der Lauf arbeitet mit dem geaenderten Wert', () => {
  const flow = FlowDefinition.parse({
    ...FLOW,
    schritte: [
      ...FLOW.schritte,
      { name: 'buchen', typ: 'subagent', rolle: 'leser', auftrag: 'Buche: {{lesen}}' },
    ],
  });

  async function lauf({ erkannt, felderNachFreigabe }) {
    const recordWerkzeug = jest.fn().mockResolvedValue('Freigabe erteilt');
    const auftraege = [];
    class FakeSubagent {
      async execute(params, context) {
        auftraege.push(params.auftrag);
        if (params.rolle === 'leser' && context.onErgebnis && auftraege.length === 1) {
          context.onErgebnis(erkannt);
          return felderText(erkannt.felder, { felder: ['betrag', 'datum'] }).text;
        }
        return 'gebucht';
      }
    }
    await executeSteps({
      flow,
      werte: { beleg: '4711' },
      userInput: 'UI',
      model: 'm',
      context: { runId: 7 },
      makeTools: () => [],
      runLoop: jest.fn().mockResolvedValue({ result: 'F' }),
      recordWerkzeug,
      SubagentToolClass: FakeSubagent,
      felderNachFreigabe,
    });
    return { recordWerkzeug, auftraege };
  }

  it('die Freigabe traegt Felder, aenderbar und Original; der naechste Schritt liest die Korrektur', async () => {
    const felderNachFreigabe = jest.fn().mockResolvedValue({
      felder: { betrag: '12,50', datum: '01.10.2026' },
      korrekturen: [{ feld: 'datum', vorschlag: '', wert: '01.10.2026' }],
    });
    const { recordWerkzeug, auftraege } = await lauf({
      erkannt: { felder: { betrag: '12,50', datum: '' }, json: true, unsicher: [] },
      felderNachFreigabe,
    });
    const arg = recordWerkzeug.mock.calls[0][0];
    expect(arg.erkennung.schritt).toBe('lesen');
    expect(arg.erkennung.original).toBe('api/belege/4711.png');
    expect(arg.erkennung.felder[0]).toEqual({
      name: 'datum',
      vorschlag: '',
      fehlend: true,
      unsicher: false,
      aenderbar: true,
    });
    // Nie ueber `params`: das Modell soll keine Felder fuer aenderbar erklaeren.
    expect(arg.params.felder).toBeUndefined();
    expect(felderNachFreigabe).toHaveBeenCalledWith({ runId: 7, schritt: 'lesen' });
    expect(auftraege[1]).toBe('Buche: betrag: 12,50\ndatum: 01.10.2026');
  });

  it('ohne Freigabe (alles erkannt) bleibt die Ausgabe der Rolle', async () => {
    const felderNachFreigabe = jest.fn();
    const { recordWerkzeug, auftraege } = await lauf({
      erkannt: { felder: { betrag: '12,50', datum: '02.10.2026' }, json: true, unsicher: [] },
      felderNachFreigabe,
    });
    expect(recordWerkzeug).not.toHaveBeenCalled();
    expect(felderNachFreigabe).not.toHaveBeenCalled();
    expect(auftraege[1]).toBe('Buche: betrag: 12,50\ndatum: 02.10.2026');
  });

  it('korrigierteAusgabe fasst nur erkennende Schritte an', async () => {
    const lesen = jest.fn().mockResolvedValue({ felder: { betrag: '1', datum: '2' } });
    expect(
      await korrigierteAusgabe({ flow, schritt: flow.schritte[1], runId: 7, lesen })
    ).toBeNull();
    expect(await korrigierteAusgabe({ flow, schritt: flow.schritte[0], runId: 7, lesen })).toBe(
      'betrag: 1\ndatum: 2'
    );
  });

  it.each([
    ['api/belege/4711.png', { beleg: '4711' }, 'api/belege/4711.png'],
    ['api/belege/{{beleg}}', { beleg: '../admin' }, null],
    ['api/belege/{{beleg}}', { beleg: 'https://anderswo' }, null],
    ['api/belege/{{beleg}}', { beleg: 'mit leer' }, null],
    ['api/belege/{{beleg}}', { beleg: '%2e%2e/%2e%2e/api' }, null],
    ['api/belege/{{beleg}}', { beleg: 'x?y=1' }, null],
  ])('originalPfad(%j, %j) = %j', (vorlage, scope, erwartet) => {
    expect(originalPfad(vorlage, scope)).toBe(erwartet);
  });

  it('korrigiereVorab: übernommene Ausgaben bekommen die Korrektur des Laufs', async () => {
    const vorab = new Map([
      [0, 'betrag: 12,50\ndatum: '],
      [1, 'gebucht'],
    ]);
    const lesen = jest.fn(async ({ runId, schritt }) =>
      runId === 99 && schritt === 'lesen'
        ? { felder: { betrag: '12,50', datum: '01.10.2026' } }
        : null
    );
    await korrigiereVorab({ flow, vorab, runId: 99, lesen });
    expect(vorab.get(0)).toBe('betrag: 12,50\ndatum: 01.10.2026');
    expect(vorab.get(1)).toBe('gebucht');
  });
});
