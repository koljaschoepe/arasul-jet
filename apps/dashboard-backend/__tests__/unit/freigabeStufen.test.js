/**
 * Freigaben in Stufen mit Standardperson (M5, 04.10.2026).
 *
 * Das Zielbild in fuenf Saetzen, und jeder ist hier eine Pruefung: jede neue
 * Freigabe liegt bei der Standardperson ihrer Stufe; ohne sie bei allen mit
 * Zugang; jeder mit Zugang kann sie uebernehmen oder weitergeben; entscheiden
 * kann nur, bei dem sie liegt; wer eingereicht hat, entscheidet nie.
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
const appStufen = require('../../src/services/app/appStufen');
const {
  ValidationError,
  ForbiddenError,
  ConflictError,
  NotFoundError,
} = require('../../src/utils/errors');

beforeEach(() => {
  db.query.mockReset();
  freigabeAnfragen._reset();
});

/** Die Zeile, mit der `erklaereFehlschlag` antwortet. */
function erklaerung(felder) {
  return {
    status: 'offen',
    app_id: 'kanzlei',
    abgelaufen: false,
    darf: true,
    eingereicht: false,
    im_kreis: true,
    bei_ihm: true,
    liegt_bei: null,
    ...felder,
  };
}

describe('anfordern legt die Freigabe zur Standardperson', () => {
  it('fragt nach der Person der Stufe, nur wenn sie im Kreis steht', async () => {
    const calls = [];
    db.query.mockImplementation(async (sql, params = []) => {
      calls.push({ sql, params });
      if (/INSERT INTO public\.approvals/.test(sql)) {
        return {
          rows: [
            {
              id: 42,
              titel: params[4],
              frist: new Date(Date.now() + 60_000).toISOString(),
              angefragt_am: 'jetzt',
            },
          ],
        };
      }
      if (/SET liegt_bei = sp\.user_id/.test(sql)) {
        return { rows: [{ username: 'bernd' }] };
      }
      return { rows: [], rowCount: 1 };
    });
    const gesehen = [];
    const wartet = freigabeAnfragen.anfordern(
      {
        runId: 7,
        appId: 'kanzlei',
        stand: 'live',
        flowName: 'zwei-stufen',
        titel: 'Pruefen?',
        stufe: 'pruefung',
        stufen: [{ name: 'pruefung' }, { name: 'leitung' }],
      },
      { onEvent: e => gesehen.push(e) }
    );
    await new Promise(setImmediate);

    // Die Stufe geht an die Zeile, und die Standardperson kommt aus
    // `app_stufen_personen` -- gefiltert durch denselben Kreis wie alles andere.
    expect(calls[0].params[7]).toBe('pruefung');
    const legen = calls.find(c => /SET liegt_bei = sp\.user_id/.test(c.sql));
    expect(legen.params).toEqual([42]);
    expect(legen.sql).toMatch(/sp\.stufe = a\.stufe/);
    expect(legen.sql).toMatch(/su\.is_active = TRUE/);
    expect(legen.sql).toMatch(/a\.einreicher_id IS DISTINCT FROM sp\.user_id/);
    freigabeAnfragen._reset();
    wartet.catch(() => {});
  });

  it('nimmt mit einem Einreicher immer ohne_einreicher an (M5)', async () => {
    const calls = [];
    db.query.mockImplementation(async (sql, params = []) => {
      calls.push({ sql, params });
      if (/INSERT INTO public\.approvals/.test(sql)) {
        return { rows: [{ id: 1, titel: 'x', frist: new Date(Date.now() + 60_000) }] };
      }
      return { rows: [], rowCount: 1 };
    });
    const wartet = freigabeAnfragen.anfordern({
      runId: 7,
      appId: 'kanzlei',
      stand: 'live',
      titel: 'x',
    });
    await new Promise(setImmediate);
    expect(calls[0].sql).toMatch(/OR r\.einreicher_id IS NOT NULL/);
    freigabeAnfragen._reset();
    wartet.catch(() => {});
  });
});

describe('die Liste „bei mir" und die Liste „bei anderen"', () => {
  it('zeigt nur, was bei mir oder bei allen liegt', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await freigabeAnfragen.listeOffeneFuer(3);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/OR a\.liegt_bei = \$1::bigint\)/);
    expect(sql).toMatch(/AS liegt_bei/);
    expect(sql).toMatch(/AS stufe_bezeichnung/);
  });

  it('zeigt bei anderen genau das Gegenteil, im selben Kreis', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await freigabeAnfragen.listeBeiAnderen(3);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/AND NOT \(NOT/);
    expect(sql).toMatch(/a\.einreicher_id IS DISTINCT FROM \$1::bigint/);
  });

  it('laesst eine Zustaendigkeit fallen, wenn die Person den Zugang verlor', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await freigabeAnfragen.listeOffeneFuer(3);
    const sql = db.query.mock.calls[0][0];
    // Die Person muss aktiv und im Kreis sein, sonst gilt "bei allen".
    expect(sql).toMatch(/lu\.is_active = TRUE/);
    expect(sql).toMatch(/m\.user_id = a\.liegt_bei/);
  });
});

describe('entscheiden', () => {
  it('nur, bei dem sie liegt: sonst 409 mit dem Namen', async () => {
    db.query.mockImplementation(async sql => {
      if (/UPDATE public\.approvals a/.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM public\.approvals a\s+WHERE a\.id/.test(sql)) {
        return { rows: [erklaerung({ bei_ihm: false, liegt_bei: 'bernd' })] };
      }
      return { rows: [] };
    });
    const fehler = freigabeAnfragen.entscheide({ id: 42, benutzerId: 3, status: 'bestaetigt' });
    await expect(fehler).rejects.toThrow(ConflictError);
    await expect(
      freigabeAnfragen.entscheide({ id: 42, benutzerId: 3, status: 'bestaetigt' })
    ).rejects.toThrow(/liegt bei bernd/);
  });

  it('prueft "bei ihm" in derselben Anweisung wie den Kreis', async () => {
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await freigabeAnfragen
      .entscheide({ id: 42, benutzerId: 3, status: 'bestaetigt' })
      .catch(() => {});
    const update = db.query.mock.calls.find(c => /UPDATE public\.approvals a/.test(c[0]))[0];
    expect(update).toMatch(/OR a\.liegt_bei = \$2::bigint\)/);
  });

  it('der Einreicher bekommt 403, auch ohne ohne_einreicher', async () => {
    db.query.mockImplementation(async sql => {
      if (/UPDATE public\.approvals a/.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM public\.approvals a\s+WHERE a\.id/.test(sql)) {
        return { rows: [erklaerung({ eingereicht: true, im_kreis: false })] };
      }
      return { rows: [] };
    });
    await expect(
      freigabeAnfragen.entscheide({ id: 42, benutzerId: 3, status: 'bestaetigt' })
    ).rejects.toThrow(ForbiddenError);
    const sql = db.query.mock.calls.find(c => /AS eingereicht/.test(c[0]))[0];
    expect(sql).not.toMatch(/a\.ohne_einreicher AND/);
  });
});

describe('uebernehmen', () => {
  it('legt die Anfrage zu mir und nennt meinen Namen', async () => {
    db.query.mockImplementation(async (sql, params) => {
      if (/SET liegt_bei = \$2/.test(sql)) {
        expect(params).toEqual([42, 3]);
        return { rows: [{ id: 42, run_id: 7, app_id: 'kanzlei', stand: 'live', titel: 't' }] };
      }
      if (/SELECT username FROM public\.admin_users/.test(sql)) {
        return { rows: [{ username: 'anna' }] };
      }
      return { rows: [] };
    });
    const r = await freigabeAnfragen.uebernehmen({ id: 42, benutzerId: 3 });
    expect(r).toMatchObject({ id: 42, liegt_bei: 'anna' });
  });

  it('wer keinen Zugang hat, bekommt 403', async () => {
    db.query.mockImplementation(async sql => {
      if (/UPDATE public\.approvals a/.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM public\.approvals a\s+WHERE a\.id/.test(sql)) {
        return { rows: [erklaerung({ darf: false, im_kreis: false })] };
      }
      return { rows: [] };
    });
    await expect(freigabeAnfragen.uebernehmen({ id: 42, benutzerId: 9 })).rejects.toThrow(
      ForbiddenError
    );
  });

  it('der Einreicher kann sie nicht an sich ziehen', async () => {
    db.query.mockImplementation(async sql => {
      if (/UPDATE public\.approvals a/.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM public\.approvals a\s+WHERE a\.id/.test(sql)) {
        return { rows: [erklaerung({ eingereicht: true, im_kreis: false })] };
      }
      return { rows: [] };
    });
    await expect(freigabeAnfragen.uebernehmen({ id: 42, benutzerId: 3 })).rejects.toThrow(
      /selbst eingereicht/
    );
  });
});

describe('weitergeben', () => {
  /** Eine Datenbank fuer das Weitergeben: `treffer` sagt, ob das UPDATE greift. */
  function weitergebenDb({ ziel = { id: 4, username: 'bernd' }, treffer = true, grund = {} }) {
    db.query.mockImplementation(async (sql, params) => {
      if (/WHERE username = \$1 AND is_active = TRUE/.test(sql)) {
        return { rows: ziel ? [ziel] : [] };
      }
      if (/SET liegt_bei = \$3/.test(sql)) {
        return treffer
          ? { rows: [{ id: params[0], run_id: 7, app_id: 'kanzlei', stand: 'live', titel: 't' }] }
          : { rows: [], rowCount: 0 };
      }
      if (/AS ich_im_kreis/.test(sql)) {
        return {
          rows: [
            { ich_im_kreis: true, ziel_darf: true, ziel_eingereicht: false, ...grund },
          ],
        };
      }
      if (/SELECT username FROM public\.admin_users/.test(sql)) {
        return { rows: [{ username: 'anna' }] };
      }
      return { rows: [] };
    });
  }

  it('legt sie zu dem, der sie entscheiden darf', async () => {
    weitergebenDb({});
    const r = await freigabeAnfragen.weitergeben({ id: 42, benutzerId: 3, an: 'bernd' });
    expect(r).toMatchObject({ id: 42, liegt_bei: 'bernd' });
    const update = db.query.mock.calls.find(c => /SET liegt_bei = \$3/.test(c[0]));
    expect(update[1]).toEqual([42, 3, 4]);
  });

  it('nicht an ein unbekanntes Konto', async () => {
    weitergebenDb({ ziel: null });
    await expect(
      freigabeAnfragen.weitergeben({ id: 42, benutzerId: 3, an: 'zoe' })
    ).rejects.toThrow(ValidationError);
  });

  it('nicht an jemanden ohne Zugang zur App', async () => {
    weitergebenDb({ treffer: false, grund: { ziel_darf: false } });
    await expect(
      freigabeAnfragen.weitergeben({ id: 42, benutzerId: 3, an: 'bernd' })
    ).rejects.toThrow(/keinen Zugang/);
  });

  it('nicht an den Einreicher', async () => {
    weitergebenDb({ treffer: false, grund: { ziel_eingereicht: true } });
    await expect(
      freigabeAnfragen.weitergeben({ id: 42, benutzerId: 3, an: 'bernd' })
    ).rejects.toThrow(/eingereicht/);
  });

  it('wer selbst nicht im Kreis steht, gibt nichts weiter (403)', async () => {
    db.query.mockImplementation(async sql => {
      if (/WHERE username = \$1 AND is_active = TRUE/.test(sql)) {
        return { rows: [{ id: 4, username: 'bernd' }] };
      }
      if (/UPDATE public\.approvals a/.test(sql)) return { rows: [], rowCount: 0 };
      if (/AS ich_im_kreis/.test(sql)) {
        return { rows: [{ ich_im_kreis: false, ziel_darf: true, ziel_eingereicht: false }] };
      }
      if (/FROM public\.approvals a\s+WHERE a\.id/.test(sql)) {
        return { rows: [erklaerung({ darf: false, im_kreis: false })] };
      }
      return { rows: [] };
    });
    await expect(
      freigabeAnfragen.weitergeben({ id: 42, benutzerId: 9, an: 'bernd' })
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('freigabeZumLauf sagt, bei wem es liegt', () => {
  it('nennt die Person statt des ganzen Kreises', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 12,
          titel: 'Pruefen?',
          frist: 'morgen',
          angefragt_am: 'eben',
          ohne_einreicher: true,
          entscheider_rolle: null,
          stufe: 'pruefung',
          einreicher: 'anna',
          entscheider: null,
          kreis: ['bernd', 'chefin'],
          liegt_bei: 'bernd',
        },
      ],
    });
    const f = await freigabeAnfragen.freigabeZumLauf({ id: 7, app_id: 'kanzlei' });
    expect(f.liegt_bei).toBe('bernd');
    expect(f.offen.stufe).toBe('pruefung');
    expect(f.satz).toMatch(/^Liegt bei bernd,/);
    expect(f.satz).toMatch(/anna hat eingereicht/);
  });

  it('schliesst den Einreicher vor der ersten Anfrage aus, auch ohne Regel', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { id: 3, username: 'anna', role: 'mitarbeiter' },
          { id: 4, username: 'bernd', role: 'mitarbeiter' },
        ],
      });
    const f = await freigabeAnfragen.freigabeZumLauf({
      id: 7,
      app_id: 'kanzlei',
      einreicher_id: 3,
      freigabe_regel: null,
    });
    expect(f.kreis).toEqual(['bernd']);
    expect(f.ohne_einreicher).toBe(true);
  });
});

describe('appStufen: die Standardperson je App und Stufe', () => {
  function stufenDb({ stufen, personen }) {
    db.query.mockImplementation(async sql => {
      if (/SELECT 1 FROM public\.apps/.test(sql)) return { rows: [{}] };
      if (/WITH s AS/.test(sql)) return { rows: stufen };
      if (/FROM public\.app_members m\s+JOIN public\.admin_users u/.test(sql)) {
        return { rows: personen };
      }
      return { rows: [], rowCount: 1 };
    });
  }
  const personen = [
    { id: 3, username: 'anna' },
    { id: 4, username: 'bernd' },
  ];

  it('sagt je Stufe ohne Person, dass sie bei allen mit Zugang liegt', async () => {
    stufenDb({
      stufen: [
        {
          stufe: 'pruefung',
          bezeichnung: 'Prüfung',
          flows: ['zwei-stufen'],
          person_id: 4,
          person: 'bernd',
          person_hat_zugang: true,
        },
        {
          stufe: 'leitung',
          bezeichnung: null,
          flows: ['zwei-stufen'],
          person_id: null,
          person: null,
          person_hat_zugang: null,
        },
        {
          stufe: 'archiv',
          bezeichnung: null,
          flows: ['x'],
          person_id: 9,
          person: 'weg',
          person_hat_zugang: false,
        },
      ],
      personen,
    });
    const { stufen, personen: p } = await appStufen.liste('kanzlei');
    expect(p).toEqual(personen);
    expect(stufen[0]).toMatchObject({ stufe: 'pruefung', gilt: true, hinweis: null });
    expect(stufen[0].person).toEqual({ id: 4, username: 'bernd' });
    expect(stufen[1]).toMatchObject({ stufe: 'leitung', person: null, gilt: false });
    expect(stufen[1].hinweis).toMatch(/bei allen mit Zugang/);
    expect(stufen[2].hinweis).toMatch(/weg hat keinen Zugang mehr/);
  });

  it('kennt eine App nicht, die es nicht gibt', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(appStufen.liste('gibtsnicht')).rejects.toThrow(NotFoundError);
  });

  const eineStufe = [
    { stufe: 'pruefung', flows: ['f'], person_id: null, person: null, person_hat_zugang: null },
  ];

  it('setzt nur eine Stufe, die ein Flow nennt', async () => {
    stufenDb({ stufen: eineStufe, personen });
    await expect(
      appStufen.setze({ appId: 'kanzlei', stufe: 'erfunden', benutzerId: 4, durch: 1 })
    ).rejects.toThrow(NotFoundError);
  });

  it('setzt nur jemanden mit Zugang zur App', async () => {
    stufenDb({ stufen: eineStufe, personen });
    await expect(
      appStufen.setze({ appId: 'kanzlei', stufe: 'pruefung', benutzerId: 99, durch: 1 })
    ).rejects.toThrow(ValidationError);
  });

  it('schreibt die Person und nimmt sie mit null zurueck', async () => {
    stufenDb({ stufen: eineStufe, personen });
    const r = await appStufen.setze({ appId: 'kanzlei', stufe: 'pruefung', benutzerId: 4, durch: 1 });
    expect(r.person).toEqual({ id: 4, username: 'bernd' });
    const insert = db.query.mock.calls.find(c => /INSERT INTO public\.app_stufen_personen/.test(c[0]));
    expect(insert[1]).toEqual(['kanzlei', 'pruefung', 4, 1]);

    stufenDb({ stufen: eineStufe, personen });
    const weg = await appStufen.setze({
      appId: 'kanzlei',
      stufe: 'pruefung',
      benutzerId: null,
      durch: 1,
    });
    expect(weg.person).toBeNull();
    expect(weg.hinweis).toMatch(/bei allen mit Zugang/);
    expect(
      db.query.mock.calls.some(c => /DELETE FROM public\.app_stufen_personen/.test(c[0]))
    ).toBe(true);
  });
});
