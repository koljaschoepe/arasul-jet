/**
 * Ein wartender Lauf ueberlebt Neustart und Update (M5).
 *
 * Gemessen wird, was NACH dem Neustart passiert, wenn der Faden im Speicher
 * fehlt: die Uhr steht neu, eine Bestaetigung setzt den Lauf fort, eine
 * verstrichene Frist beendet ihn -- und die Frist je Stufe gilt.
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
jest.mock('../../src/services/flows/runFlow', () => ({ runFlow: jest.fn() }));

const db = require('../../src/database');
const freigabeAnfragen = require('../../src/services/flows/freigabeAnfragen');
const flowRunner = require('../../src/services/flows/flowRunner');
const { ValidationError } = require('../../src/utils/errors');

const TAG_MIN = 24 * 60;

beforeEach(() => {
  jest.clearAllMocks();
  freigabeAnfragen._reset();
  flowRunner._reset();
});
afterEach(() => {
  freigabeAnfragen._reset();
  jest.useRealTimers();
});

/** Eine Datenbank, die die Anweisungen mitschreibt und auf Stichworte antwortet. */
function fakeDb(antworten = []) {
  const calls = [];
  db.query.mockImplementation(async (sql, params = []) => {
    calls.push({ sql, params });
    for (const [muster, antwort] of antworten) {
      if (muster.test(sql)) {
        return typeof antwort === 'function' ? antwort(sql, params) : antwort;
      }
    }
    if (/INSERT INTO public\.approvals/.test(sql)) {
      return {
        rows: [
          {
            id: 42,
            titel: params[4],
            frist: new Date(Date.now() + Number(params[6]) * 60_000).toISOString(),
            angefragt_am: 'jetzt',
          },
        ],
      };
    }
    return { rows: [], rowCount: 0 };
  });
  return calls;
}

async function anfordernUndAbstellen(was) {
  const calls = fakeDb();
  const wartet = freigabeAnfragen.anfordern({
    runId: 7,
    appId: 'a',
    stand: 'live',
    titel: 'x',
    ...was,
  });
  wartet.catch(() => {});
  await new Promise(setImmediate);
  freigabeAnfragen._reset();
  return calls;
}

describe('Frist je Stufe', () => {
  it('die Vorgabe des Geraets sind sieben Tage', () => {
    expect(freigabeAnfragen.VORGABE_FRIST_MINUTEN).toBe(7 * TAG_MIN);
  });

  it('ohne Angabe gilt die Vorgabe', async () => {
    const calls = await anfordernUndAbstellen({});
    expect(calls[0].params[6]).toBe(String(7 * TAG_MIN));
  });

  it('die Frist der Stufe gilt vor der Vorgabe, und der Name steht an der Anfrage', async () => {
    const calls = await anfordernUndAbstellen({
      stufe: 'leitung',
      stufen: [{ name: 'pruefung' }, { name: 'leitung', frist_minuten: 120 }],
    });
    expect(calls[0].params[6]).toBe('120');
    expect(calls[0].params[7]).toBe('leitung');
  });

  it('eine Stufe ohne eigene Frist faellt auf die Vorgabe zurueck', async () => {
    const calls = await anfordernUndAbstellen({
      stufe: 'pruefung',
      stufen: [{ name: 'pruefung' }],
    });
    expect(calls[0].params[6]).toBe(String(7 * TAG_MIN));
  });

  it('was der Schritt selbst nennt, gilt vor der Frist seiner Stufe', async () => {
    const calls = await anfordernUndAbstellen({
      frist_minuten: 30,
      stufe: 'leitung',
      stufen: [{ name: 'leitung', frist_minuten: 120 }],
    });
    expect(calls[0].params[6]).toBe('30');
  });

  it('weist eine Stufe ab, die der Flow nicht fuehrt', async () => {
    fakeDb();
    await expect(
      freigabeAnfragen.anfordern({
        runId: 7,
        appId: 'a',
        stand: 'live',
        titel: 'x',
        stufe: 'chef',
        stufen: [{ name: 'leitung' }],
      })
    ).rejects.toThrow(ValidationError);
  });

  it('haelt eine Frist von einem Jahr, statt sie auf zwei Wochen zu kuerzen', async () => {
    const calls = await anfordernUndAbstellen({ frist_minuten: 525600 });
    expect(calls[0].params[6]).toBe('525600');
  });
});

describe('der Pruefpunkt', () => {
  it('steht in derselben Anweisung wie der Wechsel auf wartend', async () => {
    const calls = await anfordernUndAbstellen({
      fortsetzung: { schritt: 1, name: 'freigeben', schritt_id: 9 },
    });
    const update = calls.find(c => /UPDATE flow_runs SET status = 'wartend'/.test(c.sql));
    expect(update.sql).toMatch(/fortsetzung = \$2::jsonb/);
    expect(JSON.parse(update.params[1])).toEqual({ schritt: 1, name: 'freigeben', schritt_id: 9 });
  });

  it('ohne Pruefpunkt wird NULL geschrieben: der Lauf ist nicht fortsetzbar', async () => {
    const calls = await anfordernUndAbstellen({});
    const update = calls.find(c => /UPDATE flow_runs SET status = 'wartend'/.test(c.sql));
    expect(update.params[1]).toBeNull();
  });
});

describe('fristUhr', () => {
  it('feuert auch bei einer Frist ueber dem Maximum von setTimeout (24,8 Tage) erst zur Zeit', () => {
    jest.useFakeTimers();
    const ablauf = jest.fn();
    freigabeAnfragen.fristUhr(Date.now() + 40 * TAG_MIN * 60_000, ablauf);
    jest.advanceTimersByTime(39 * TAG_MIN * 60_000);
    expect(ablauf).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2 * TAG_MIN * 60_000);
    expect(ablauf).toHaveBeenCalledTimes(1);
  });

  it('abstellen haelt sie an', () => {
    jest.useFakeTimers();
    const ablauf = jest.fn();
    const uhr = freigabeAnfragen.fristUhr(Date.now() + 1000, ablauf);
    uhr.abstellen();
    jest.advanceTimersByTime(5000);
    expect(ablauf).not.toHaveBeenCalled();
  });
});

describe('wiederaufnehmen (nach dem Neustart)', () => {
  const lauf = { id: 3, run_id: 7, titel: 'Darf das raus?', benutzer: 'chefin', begruendung: null };
  const inEinerStunde = () => new Date(Date.now() + 3600_000).toISOString();

  it('stellt fuer eine offene Anfrage die Uhr neu', async () => {
    fakeDb([
      [
        /FROM public\.approvals a\s+JOIN flow_runs/,
        { rows: [{ ...lauf, status: 'offen', frist: inEinerStunde() }] },
      ],
    ]);
    const bilanz = await freigabeAnfragen.wiederaufnehmen();
    expect(bilanz).toEqual({ uhren: 1, fortgesetzt: 0, beendet: 0 });
    expect(freigabeAnfragen._wartende.get('3')).toEqual(
      expect.objectContaining({ runId: 7, uhr: expect.any(Object) })
    );
  });

  it('wartet nur Laeufe MIT Pruefpunkt wieder an', async () => {
    const calls = fakeDb();
    await freigabeAnfragen.wiederaufnehmen();
    expect(calls[0].sql).toMatch(/r\.status = 'wartend'\s+AND r\.fortsetzung IS NOT NULL/);
  });

  it('beendet einen Lauf, dessen Frist waehrend des Stillstands verstrich, als abgelaufen', async () => {
    const calls = fakeDb([
      [
        /FROM public\.approvals a\s+JOIN flow_runs/,
        { rows: [{ ...lauf, status: 'offen', frist: new Date(Date.now() - 1000).toISOString() }] },
      ],
    ]);
    const bilanz = await freigabeAnfragen.wiederaufnehmen();
    expect(bilanz.beendet).toBe(1);
    expect(
      calls.some(c => /UPDATE public\.approvals/.test(c.sql) && c.params[1] === 'abgelaufen')
    ).toBe(true);
    const ende = calls.find(c => /UPDATE flow_runs\s+SET status = \$2/.test(c.sql));
    expect(ende.params).toEqual([
      7,
      'abgelaufen',
      expect.stringContaining('nicht innerhalb der Frist'),
    ]);
    expect(calls.some(c => /UPDATE flow_run_steps/.test(c.sql))).toBe(true);
  });

  it('setzt einen bereits bestaetigten Lauf fort, dessen Prozess davor starb', async () => {
    fakeDb([
      [
        /FROM public\.approvals a\s+JOIN flow_runs/,
        { rows: [{ ...lauf, status: 'bestaetigt', frist: inEinerStunde() }] },
      ],
    ]);
    const fortsetzen = jest.spyOn(flowRunner, 'fortsetzen').mockResolvedValue(true);
    const bilanz = await freigabeAnfragen.wiederaufnehmen();
    expect(fortsetzen).toHaveBeenCalledWith({ runId: 7 });
    expect(bilanz.fortgesetzt).toBe(1);
    fortsetzen.mockRestore();
  });

  it('laesst die Anfrage eines Laufs nicht liegen, wenn einer scheitert', async () => {
    fakeDb([
      [
        /FROM public\.approvals a\s+JOIN flow_runs/,
        {
          rows: [
            { ...lauf, id: 1, run_id: 5, status: 'bestaetigt', frist: inEinerStunde() },
            { ...lauf, id: 2, run_id: 6, status: 'offen', frist: inEinerStunde() },
          ],
        },
      ],
    ]);
    jest.spyOn(flowRunner, 'fortsetzen').mockRejectedValue(new Error('kaputt'));
    const bilanz = await freigabeAnfragen.wiederaufnehmen();
    expect(bilanz.uhren).toBe(1);
    flowRunner.fortsetzen.mockRestore();
  });
});

describe('entscheide ohne Faden im Speicher', () => {
  const zeile = {
    id: 42,
    run_id: 7,
    app_id: 'beispielapp',
    stand: 'live',
    flow_name: 'brief',
    titel: 'Darf das raus?',
    frist: '2099-01-01T00:00:00Z',
    entschieden_am: '2026-10-04T08:00:00Z',
  };
  const antworten = (status, fortsetzbar) => [
    [/UPDATE public\.approvals a\s+SET status/, { rows: [{ ...zeile, status }], rowCount: 1 }],
    [/SELECT username FROM public\.admin_users/, { rows: [{ username: 'chefin' }] }],
    [/SELECT fortsetzung IS NOT NULL/, { rows: fortsetzbar ? [{ fortsetzbar: true }] : [] }],
  ];

  it('setzt den Lauf bei der Bestaetigung ab dem angehaltenen Schritt fort', async () => {
    fakeDb(antworten('bestaetigt', true));
    const fortsetzen = jest.spyOn(flowRunner, 'fortsetzen').mockResolvedValue(true);
    const erg = await freigabeAnfragen.entscheide({ id: 42, benutzerId: 1, status: 'bestaetigt' });
    expect(fortsetzen).toHaveBeenCalledWith({ runId: 7 });
    expect(erg.fortgesetzt).toBe(true);
    fortsetzen.mockRestore();
  });

  it('haelt eine nach dem Neustart gestellte Uhr nicht fuer einen Faden', async () => {
    // `wiederaufnehmen` legt einen Eintrag ohne `aufloesen` an. `entscheide`
    // muss ihn wie „kein Faden" behandeln und den Lauf neu aufsetzen.
    fakeDb([
      ...antworten('bestaetigt', true),
      [
        /FROM public\.approvals a\s+JOIN flow_runs/,
        {
          rows: [{ id: 42, run_id: 7, titel: 'x', status: 'offen', frist: '2099-01-01T00:00:00Z' }],
        },
      ],
    ]);
    await freigabeAnfragen.wiederaufnehmen();
    expect(freigabeAnfragen._wartende.get('42').aufloesen).toBeUndefined();
    const fortsetzen = jest.spyOn(flowRunner, 'fortsetzen').mockResolvedValue(true);
    const erg = await freigabeAnfragen.entscheide({ id: 42, benutzerId: 1, status: 'bestaetigt' });
    expect(fortsetzen).toHaveBeenCalledWith({ runId: 7 });
    expect(erg.fortgesetzt).toBe(true);
    // Die Uhr ist abgestellt und der Eintrag weg.
    expect(freigabeAnfragen._wartende.has('42')).toBe(false);
    fortsetzen.mockRestore();
  });

  it('beendet den Lauf bei einer Ablehnung als abgebrochen, mit der Begruendung', async () => {
    const calls = fakeDb(antworten('abgelehnt', true));
    const erg = await freigabeAnfragen.entscheide({
      id: 42,
      benutzerId: 1,
      status: 'abgelehnt',
      begruendung: 'zu teuer',
    });
    const ende = calls.find(c => /UPDATE flow_runs\s+SET status = \$2/.test(c.sql));
    expect(ende.params).toEqual([7, 'abgebrochen', 'Freigabe abgelehnt von chefin: zu teuer']);
    expect(erg.fortgesetzt).toBe(true);
  });

  it('meldet fortgesetzt: false, wenn der Lauf keinen Pruefpunkt hat', async () => {
    fakeDb(antworten('bestaetigt', false));
    const fortsetzen = jest.spyOn(flowRunner, 'fortsetzen').mockResolvedValue(true);
    const erg = await freigabeAnfragen.entscheide({ id: 42, benutzerId: 1, status: 'bestaetigt' });
    expect(fortsetzen).not.toHaveBeenCalled();
    expect(erg.fortgesetzt).toBe(false);
    fortsetzen.mockRestore();
  });
});

describe('flowRunner.fortsetzen', () => {
  const laufZeile = {
    user_id: 1,
    flow_name: 'brief',
    app_id: 'beispielapp',
    stand: 'live',
    arguments: { kunde: 'Muster' },
    einreicher_id: 5,
    fortsetzung: { schritt: 1, name: 'freigeben', schritt_id: 9 },
  };

  function deps({ uebernommen = true, entscheidung = true } = {}) {
    return {
      db: {
        query: jest.fn(async sql => {
          if (/UPDATE flow_runs/.test(sql)) {
            return { rows: uebernommen ? [laufZeile] : [] };
          }
          return {
            rows: entscheidung
              ? [{ entschieden_am: '2026-10-04T08:00:00Z', benutzer: 'chefin' }]
              : [],
          };
        }),
      },
      store: { finishStep: jest.fn(async () => ({})), finishRun: jest.fn(async () => ({})) },
      run: jest.fn(() => new Promise(() => {})),
    };
  }

  it('uebernimmt den wartenden Lauf atomar, schliesst den Freigabe-Schritt und macht in DERSELBEN Zeile weiter', async () => {
    const d = deps();
    expect(await flowRunner.fortsetzen({ runId: 7 }, d)).toBe(true);
    expect(d.db.query.mock.calls[0][0]).toMatch(
      /SET status = 'laeuft'\s+WHERE id = \$1 AND status = 'wartend' AND fortsetzung IS NOT NULL/
    );
    expect(d.store.finishStep).toHaveBeenCalledWith({
      stepId: 9,
      output: expect.stringMatching(/^Freigabe erteilt von chefin am 2026-10-04T08:00:00\.000Z\.$/),
    });
    const arg = d.run.mock.calls[0][0];
    expect(arg).toMatchObject({
      existingRunId: 7,
      flowName: 'brief',
      args: { kunde: 'Muster' },
      appId: 'beispielapp',
      stand: 'live',
      einreicherId: 5,
      fortsetzenAb: { schritt: 1, name: 'freigeben' },
    });
    expect(flowRunner.istAktiv(7)).toBe(true);
  });

  it('tut nichts, wenn der Lauf schon uebernommen ist (Entscheidung und Hochfahren zugleich)', async () => {
    const d = deps({ uebernommen: false });
    expect(await flowRunner.fortsetzen({ runId: 7 }, d)).toBe(false);
    expect(d.run).not.toHaveBeenCalled();
  });

  it('beendet den Lauf mit Grund, wenn die Bestaetigung nicht zu finden ist', async () => {
    const d = deps({ entscheidung: false });
    await flowRunner.fortsetzen({ runId: 7 }, d);
    expect(d.store.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 7, status: 'fehler' })
    );
    expect(d.run).not.toHaveBeenCalled();
  });
});
