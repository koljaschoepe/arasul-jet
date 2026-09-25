/**
 * Freigabe-Anfragen aus einem Flow (Phase C7).
 *
 * Die Zusage der Phase in vier Saetzen, und jeder ist hier eine Pruefung:
 * der Lauf haelt an, eine Bestaetigung setzt ihn fort, eine Ablehnung beendet
 * ihn mit Begruendung, und nach der Frist endet er als `abgelaufen`.
 *
 * Der zweite Teil sind die Faelle, in denen jemand etwas darf oder nicht:
 * entscheiden darf, wem die App freigegeben ist -- und nur, solange die
 * Anfrage offen und die Frist nicht vorbei ist.
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
const FreigabeAnfordernTool = require('../../src/services/flows/tools/freigabe');
const {
  ValidationError,
  ForbiddenError,
  ConflictError,
  NotFoundError,
} = require('../../src/utils/errors');

/**
 * Eine Datenbank, die auf das ANTWORTET, was gefragt wird.
 *
 * Ein Zaehler ueber die Aufrufe waere hier die falsche Form: die Reihenfolge
 * der Abfragen ist ein Detail dieser Datei, und ein Test, der daran haengt,
 * faellt beim naechsten Umbau um, ohne dass etwas kaputt ist.
 */
function fakeDb({ darf = true, zeileOffen = true, abgelaufen = false } = {}) {
  const calls = [];
  db.query.mockImplementation(async (sql, params = []) => {
    calls.push({ sql, params });
    if (/INSERT INTO public\.approvals/.test(sql)) {
      return {
        rows: [{ id: 42, titel: params[4], frist: '2026-08-28T10:00:00Z', angefragt_am: 'jetzt' }],
      };
    }
    if (/UPDATE public\.approvals a\s+SET status/.test(sql)) {
      // Die Entscheidung. Wer nicht darf oder zu spaet kommt, trifft nichts.
      const treffer = darf && zeileOffen && !abgelaufen;
      return {
        rows: treffer
          ? [
              {
                id: 42,
                run_id: 7,
                app_id: 'beispielapp',
                stand: 'live',
                flow_name: 'freigabe',
                titel: 'Darf das raus?',
                status: params[2],
                frist: '2026-08-28T10:00:00Z',
                entschieden_am: '2026-08-27T20:00:00Z',
              },
            ]
          : [],
        rowCount: treffer ? 1 : 0,
      };
    }
    if (/FROM public\.approvals a\s+WHERE a\.id/.test(sql)) {
      return {
        rows: [
          {
            status: zeileOffen ? 'offen' : 'bestaetigt',
            app_id: 'beispielapp',
            abgelaufen,
            darf,
          },
        ],
      };
    }
    if (/SELECT username FROM public\.admin_users/.test(sql)) {
      return { rows: [{ username: 'chefin' }] };
    }
    return { rows: [], rowCount: 1 };
  });
  return calls;
}

beforeEach(() => {
  db.query.mockReset();
  freigabeAnfragen._reset();
});

describe('anfordern', () => {
  it('legt die Anfrage an und haelt den Lauf an', async () => {
    const calls = fakeDb();
    const gesehen = [];
    const wartet = freigabeAnfragen.anfordern(
      {
        runId: 7,
        appId: 'beispielapp',
        stand: 'live',
        flowName: 'freigabe',
        titel: 'Darf das raus?',
        zusammenhang: 'Der Entwurf.',
        frist_minuten: 60,
      },
      { onEvent: e => gesehen.push(e) }
    );
    // Ein Tick, damit die beiden Anweisungen durch sind.
    await new Promise(setImmediate);

    expect(calls[0].sql).toMatch(/INSERT INTO public\.approvals/);
    expect(calls[0].params.slice(0, 5)).toEqual([
      7,
      'beispielapp',
      'live',
      'freigabe',
      'Darf das raus?',
    ]);
    // Die Frist geht als Minuten in ein Intervall — eine Zeit, keine Dauer.
    expect(calls[0].params[6]).toBe('60');
    expect(calls[1].sql).toMatch(/UPDATE flow_runs SET status = 'wartend'/);
    expect(gesehen[0]).toMatchObject({ type: 'freigabe', runId: 7, freigabe: 42 });

    // Aufraeumen: sonst haelt der Zeitgeber den Test.
    freigabeAnfragen._reset();
    wartet.catch(() => {});
  });

  it('weist einen Flow der Plattform ab: ohne App gibt es keinen Entscheider', async () => {
    fakeDb();
    await expect(freigabeAnfragen.anfordern({ runId: 7, titel: 'Darf das raus?' })).rejects.toThrow(
      ValidationError
    );
    expect(db.query).not.toHaveBeenCalled();
  });

  it('braucht einen Titel', async () => {
    fakeDb();
    await expect(
      freigabeAnfragen.anfordern({ runId: 7, appId: 'a', stand: 'live', titel: '  ' })
    ).rejects.toThrow(ValidationError);
  });

  it('deckelt eine unsinnig lange Frist statt sie zu nehmen', async () => {
    const calls = fakeDb();
    const wartet = freigabeAnfragen.anfordern({
      runId: 7,
      appId: 'a',
      stand: 'live',
      titel: 'x',
      frist_minuten: 999999,
    });
    await new Promise(setImmediate);
    expect(calls[0].params[6]).toBe(String(freigabeAnfragen.MAX_FRIST_MINUTEN));
    freigabeAnfragen._reset();
    wartet.catch(() => {});
  });
});

describe('entscheide', () => {
  it('bestaetigt, setzt den Lauf fort und weckt ihn', async () => {
    const calls = fakeDb();
    const wartet = freigabeAnfragen.anfordern({
      runId: 7,
      appId: 'beispielapp',
      stand: 'live',
      flowName: 'freigabe',
      titel: 'Darf das raus?',
      frist_minuten: 60,
    });
    await new Promise(setImmediate);

    const ergebnis = await freigabeAnfragen.entscheide({
      id: 42,
      benutzerId: 3,
      status: 'bestaetigt',
    });
    expect(ergebnis.status).toBe('bestaetigt');
    expect(ergebnis.benutzer).toBe('chefin');
    expect(ergebnis.fortgesetzt).toBe(true);

    // Der Lauf steht wieder auf `laeuft` — er geht ab dem angehaltenen
    // Schritt weiter, es ist derselbe Lauf.
    expect(calls.some(c => /UPDATE flow_runs SET status = 'laeuft'/.test(c.sql))).toBe(true);

    await expect(wartet).resolves.toMatchObject({ status: 'bestaetigt', benutzer: 'chefin' });
  });

  it('lehnt ab: der Lauf endet als abgebrochen, mit der Begruendung als Grund', async () => {
    const calls = fakeDb();
    const wartet = freigabeAnfragen.anfordern({
      runId: 7,
      appId: 'beispielapp',
      stand: 'live',
      titel: 'Darf das raus?',
      frist_minuten: 60,
    });
    await new Promise(setImmediate);

    await freigabeAnfragen.entscheide({
      id: 42,
      benutzerId: 3,
      status: 'abgelehnt',
      begruendung: 'Zahlen stimmen nicht',
    });

    await expect(wartet).rejects.toMatchObject({
      laufBeendet: true,
      laufStatus: 'abgebrochen',
    });
    const ende = calls.find(c => /SET status = \$2, error = \$3/.test(c.sql));
    expect(ende.params[1]).toBe('abgebrochen');
    expect(ende.params[2]).toMatch(/abgelehnt von chefin: Zahlen stimmen nicht/);
  });

  it('weist ab, wem die App nicht freigegeben ist', async () => {
    fakeDb({ darf: false });
    await expect(
      freigabeAnfragen.entscheide({ id: 42, benutzerId: 99, status: 'bestaetigt' })
    ).rejects.toThrow(ForbiddenError);
  });

  it('sagt, wenn die Anfrage nicht mehr offen ist', async () => {
    fakeDb({ zeileOffen: false });
    await expect(
      freigabeAnfragen.entscheide({ id: 42, benutzerId: 3, status: 'bestaetigt' })
    ).rejects.toThrow(ConflictError);
  });

  it('sagt, wenn die Frist vorbei ist', async () => {
    fakeDb({ abgelaufen: true });
    await expect(
      freigabeAnfragen.entscheide({ id: 42, benutzerId: 3, status: 'bestaetigt' })
    ).rejects.toThrow(ConflictError);
  });

  it('kennt eine Anfrage nicht, die es nicht gibt', async () => {
    fakeDb();
    db.query.mockImplementation(async sql => {
      if (/UPDATE public\.approvals/.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [] };
    });
    await expect(
      freigabeAnfragen.entscheide({ id: 4711, benutzerId: 3, status: 'bestaetigt' })
    ).rejects.toThrow(NotFoundError);
  });

  it('nimmt nur „bestaetigt" und „abgelehnt" als Entscheidung', async () => {
    fakeDb();
    await expect(
      freigabeAnfragen.entscheide({ id: 42, benutzerId: 3, status: 'vielleicht' })
    ).rejects.toThrow(ValidationError);
  });
});

describe('die Frist', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('beendet den Lauf als `abgelaufen`, wenn niemand entscheidet', async () => {
    const calls = fakeDb();
    const wartet = freigabeAnfragen.anfordern({
      runId: 7,
      appId: 'beispielapp',
      stand: 'live',
      titel: 'Darf das raus?',
      frist_minuten: 1,
    });
    // Der Fehler wird SOFORT aufgefangen, nicht erst nach dem Vorspulen: eine
    // Ablehnung, an der in dem Moment niemand haengt, ist fuer Jest eine
    // unbehandelte Zurueckweisung und damit ein roter Test ueber den
    // Messaufbau statt ueber die Sache.
    const gefangen = wartet.then(
      () => null,
      err => err
    );
    // Erst die beiden Anweisungen durchlassen (INSERT, dann `wartend`), dann
    // die Frist vorspulen.
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(61_000);

    expect(await gefangen).toMatchObject({
      laufBeendet: true,
      laufStatus: 'abgelaufen',
    });
    // Die Zeile wird geschlossen UND der Lauf beendet. Nur eins von beidem
    // hiesse: ein Lauf, der fuer immer auf `wartend` steht.
    expect(calls.some(c => /UPDATE public\.approvals\s+SET status = \$2/.test(c.sql))).toBe(true);
    const ende = calls.find(c => /SET status = \$2, error = \$3/.test(c.sql));
    expect(ende.params[1]).toBe('abgelaufen');
  });
});

describe('der Abbruch des Laufs', () => {
  it('macht die Anfrage gegenstandslos (`verfallen`)', async () => {
    const calls = fakeDb();
    const abbruch = new AbortController();
    const wartet = freigabeAnfragen.anfordern(
      { runId: 7, appId: 'beispielapp', stand: 'live', titel: 'x', frist_minuten: 60 },
      { signal: abbruch.signal }
    );
    await new Promise(setImmediate);

    abbruch.abort();
    await expect(wartet).rejects.toMatchObject({ laufBeendet: true });
    const zu = calls.find(c => /UPDATE public\.approvals\s+SET status = \$2/.test(c.sql));
    expect(zu.params[1]).toBe('verfallen');
  });
});

describe('das Werkzeug', () => {
  it('gibt nach der Bestaetigung zurueck, WER freigegeben hat', async () => {
    fakeDb();
    const werkzeug = new FreigabeAnfordernTool();
    const lauf = werkzeug.execute(
      { titel: 'Darf das raus?', frist_minuten: 60 },
      { runId: 7, appId: 'beispielapp', stand: 'live', slug: 'freigabe' }
    );
    await new Promise(setImmediate);
    await freigabeAnfragen.entscheide({ id: 42, benutzerId: 3, status: 'bestaetigt' });
    await expect(lauf).resolves.toMatch(/Freigabe erteilt von chefin/);
  });

  it('gibt bei einer Ablehnung NICHTS zurueck, sondern beendet den Lauf', async () => {
    // Der Kern der Sache: ein Text zurueck an das Modell waere die eine
    // Antwort, die es nicht bekommen darf -- es suchte sich sonst einen
    // anderen Weg zum selben Ziel.
    fakeDb();
    const werkzeug = new FreigabeAnfordernTool();
    const lauf = werkzeug.execute(
      { titel: 'Darf das raus?', frist_minuten: 60 },
      { runId: 7, appId: 'beispielapp', stand: 'live', slug: 'freigabe' }
    );
    await new Promise(setImmediate);
    await freigabeAnfragen.entscheide({
      id: 42,
      benutzerId: 3,
      status: 'abgelehnt',
      begruendung: 'nein',
    });
    await expect(lauf).rejects.toMatchObject({ laufBeendet: true, laufStatus: 'abgebrochen' });
  });

  it('schiebt das Zeitlimit des Flows um die Wartezeit nach hinten', async () => {
    // Sonst bekaeme der erste Subagent NACH der Bestaetigung „Zeitlimit
    // erreicht": der Lauf liefe bis genau zu der Stelle weiter, an der er
    // wieder etwas tun soll. Warten ist keine Rechenzeit.
    fakeDb();
    const { RunLimits } = require('../../src/services/flows/limits');
    const limits = new RunLimits({ maxAufrufe: 5, zeitlimitS: 300 });
    const vorher = limits.deadline;
    const werkzeug = new FreigabeAnfordernTool();
    const lauf = werkzeug.execute(
      { titel: 'x' },
      { runId: 7, appId: 'beispielapp', stand: 'live', limits }
    );
    await new Promise(setImmediate);
    await freigabeAnfragen.entscheide({ id: 42, benutzerId: 3, status: 'bestaetigt' });
    await lauf;
    expect(limits.deadline).toBeGreaterThanOrEqual(vorher);
  });

  it('steht in jeder Betriebsart im Kasten (anders als die Rueckfrage)', () => {
    const { buildTools } = require('../../src/services/flows/toolRegistry');
    for (const betriebsart of ['autonom', 'rueckfragen']) {
      const namen = buildTools(['freigabe_anfordern', 'frage_nutzer'], { betriebsart }).map(
        t => t.name
      );
      expect(namen).toContain('freigabe_anfordern');
    }
    expect(buildTools(['frage_nutzer'], { betriebsart: 'autonom' }).map(t => t.name)).not.toContain(
      'frage_nutzer'
    );
  });
});

describe('verwaisteSchliessen', () => {
  it('schliesst offene Anfragen, deren Lauf niemand mehr fortsetzt', async () => {
    const calls = fakeDb();
    db.query.mockResolvedValue({ rowCount: 3 });
    const n = await freigabeAnfragen.verwaisteSchliessen();
    expect(n).toBe(3);
    void calls;
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/SET status = 'verfallen'/);
    // `verfallen` und nicht `abgelaufen`: die Frist war es nicht, der Neustart
    // war es. Wer die zwei zusammenwirft, sucht einen Menschen, der nicht
    // geantwortet hat, und es war die Maschine.
    expect(sql).toMatch(/status IN \('laeuft', 'wartend'\)/);
  });
});

/**
 * Vier Augen (J35). Der Kreis steht an EINER Stelle im SQL; hier wird
 * gemessen, dass alle drei Leser ihn benutzen und dass der Start eine Regel
 * abweist, nach der niemand entscheiden koennte. Ob Postgres die Bedingung so
 * auswertet, wie sie dasteht, misst die Abnahme am Orin -- eine Attrappe kann
 * das nicht.
 */
describe('der Kreis der Entscheider (J35)', () => {
  const mitglieder = [
    { id: 3, username: 'anna', role: 'mitarbeiter' },
    { id: 4, username: 'bernd', role: 'mitarbeiter' },
    { id: 1, username: 'admin', role: 'admin' },
  ];
  const mitDb = () => db.query.mockResolvedValue({ rows: mitglieder });

  it('laesst einen Lauf ohne Regel ohne Regel und fragt nichts', async () => {
    expect(await freigabeAnfragen.pruefeRegel({ appId: 'kanzlei' })).toEqual({
      einreicherId: null,
      regel: null,
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('kennt den Einreicher nur, wenn ihm die App freigegeben ist', async () => {
    mitDb();
    await expect(
      freigabeAnfragen.pruefeRegel({ appId: 'kanzlei', einreicher: 'fremd' })
    ).rejects.toThrow(ValidationError);
    expect(await freigabeAnfragen.pruefeRegel({ appId: 'kanzlei', einreicher: 'anna' })).toEqual({
      einreicherId: 3,
      regel: null,
    });
  });

  it('verlangt fuer „ohne Einreicher" einen Einreicher', async () => {
    mitDb();
    await expect(
      freigabeAnfragen.pruefeRegel({ appId: 'kanzlei', freigabe: { ohne_einreicher: true } })
    ).rejects.toThrow(/braucht `einreicher`/);
  });

  it('nimmt Rolle ODER Konten, nie beides', async () => {
    mitDb();
    await expect(
      freigabeAnfragen.pruefeRegel({
        appId: 'kanzlei',
        freigabe: { entscheider: { rolle: 'admin', konten: ['anna'] } },
      })
    ).rejects.toThrow(/ENTWEDER/);
  });

  it('weist Konten ab, denen die App nicht freigegeben ist', async () => {
    mitDb();
    await expect(
      freigabeAnfragen.pruefeRegel({
        appId: 'kanzlei',
        freigabe: { entscheider: { konten: ['bernd', 'zoe'] } },
      })
    ).rejects.toThrow(/zoe/);
  });

  it('weist eine Regel ab, nach der der Kreis leer ist', async () => {
    mitDb();
    await expect(
      freigabeAnfragen.pruefeRegel({
        appId: 'kanzlei',
        einreicher: 'bernd',
        freigabe: { ohne_einreicher: true, entscheider: { konten: ['bernd'] } },
      })
    ).rejects.toThrow(/Kreis ist leer/);
  });

  it('bringt Rolle und Konten in die Form, die am Lauf steht', async () => {
    mitDb();
    expect(
      await freigabeAnfragen.pruefeRegel({
        appId: 'kanzlei',
        einreicher: 'anna',
        freigabe: { ohne_einreicher: true, entscheider: { rolle: 'admin' } },
      })
    ).toEqual({
      einreicherId: 3,
      regel: { ohne_einreicher: true, entscheider_rolle: 'admin', entscheider_ids: null },
    });
    mitDb();
    expect(
      (
        await freigabeAnfragen.pruefeRegel({
          appId: 'kanzlei',
          freigabe: { entscheider: { konten: ['bernd', 'bernd', 'admin'] } },
        })
      ).regel
    ).toEqual({ ohne_einreicher: false, entscheider_rolle: null, entscheider_ids: [4, 1] });
  });

  it('schreibt die Regel des Laufs in derselben Anweisung an die Anfrage', async () => {
    const calls = fakeDb();
    const wartet = freigabeAnfragen.anfordern({
      runId: 7,
      appId: 'kanzlei',
      stand: 'live',
      titel: 'Beleg buchen?',
    });
    await new Promise(setImmediate);
    expect(calls[0].sql).toMatch(/einreicher_id, ohne_einreicher, entscheider_rolle/);
    expect(calls[0].sql).toMatch(/LEFT JOIN flow_runs r ON r\.id = \$1/);
    freigabeAnfragen._reset();
    wartet.catch(() => {});
  });

  it('liest den Kreis in Liste und Entscheidung aus derselben Bedingung', async () => {
    const calls = fakeDb();
    await freigabeAnfragen.listeOffeneFuer(3);
    await freigabeAnfragen.entscheide({ id: 42, benutzerId: 3, status: 'bestaetigt' });
    const kreisSql = /a\.ohne_einreicher AND a\.einreicher_id IS NOT DISTINCT FROM/;
    expect(calls[0].sql).toMatch(kreisSql);
    expect(calls[0].sql).toMatch(/ANY \(a\.entscheider_ids\)/);
    expect(calls.find(c => /UPDATE public\.approvals a/.test(c.sql)).sql).toMatch(kreisSql);
  });

  it('sagt dem Einreicher, warum er nicht darf -- 403 mit Grund', async () => {
    db.query.mockImplementation(async sql => {
      if (/UPDATE public\.approvals a/.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/FROM public\.approvals a\s+WHERE a\.id/.test(sql)) {
        return {
          rows: [
            {
              status: 'offen',
              app_id: 'kanzlei',
              abgelaufen: false,
              darf: true,
              eingereicht: true,
              im_kreis: false,
            },
          ],
        };
      }
      return { rows: [] };
    });
    await expect(
      freigabeAnfragen.entscheide({ id: 42, benutzerId: 3, status: 'bestaetigt' })
    ).rejects.toThrow(/selbst eingereicht/);
  });

  it('sagt einem, der nicht benannt ist, dass er nicht darf -- 403', async () => {
    db.query.mockImplementation(async sql => {
      if (/UPDATE public\.approvals a/.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/FROM public\.approvals a\s+WHERE a\.id/.test(sql)) {
        return {
          rows: [
            {
              status: 'offen',
              app_id: 'kanzlei',
              abgelaufen: false,
              darf: true,
              eingereicht: false,
              im_kreis: false,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const fehler = await freigabeAnfragen
      .entscheide({ id: 42, benutzerId: 4, status: 'bestaetigt' })
      .catch(e => e);
    expect(fehler).toBeInstanceOf(ForbiddenError);
    expect(fehler.message).toMatch(/benannten Entscheidern/);
  });
});
