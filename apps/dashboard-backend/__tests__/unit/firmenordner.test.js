/**
 * Der Firmenordner (J33, 22.09.2026).
 *
 * Gemessen wird, was dieses Repo entscheidet, und nicht, was OpenCloud tut:
 *
 *   1. DER SCHALTER. Ohne `COMPOSE_PROFILES=firmenordner` ist jede Spiegelung
 *      ein stilles Nichts -- kein Aufruf, kein Zeitablauf, kein Vermerk. Das
 *      ist die Zusage, an der die ganze Benutzerverwaltung haengt: ein
 *      Mitarbeiter wird angelegt, auch wenn es hier keinen Dateidienst gibt.
 *   2. DIE REGEL „NUR VERGEBEN". Weniger auf einem Kind als auf dem
 *      Elternteil wird ABGEWIESEN und nicht stillschweigend angenommen.
 *   3. DER DIENST DARF AUSFALLEN. Faellt er beim Anlegen eines Menschen aus,
 *      steht der Mensch trotzdem in `admin_users` -- und was fehlt, steht als
 *      Satz in der Datenbank.
 *   4. WAS EIN MENSCH SIEHT. Ein Ordner am Geraet kommt nie vor.
 *   5. DIE WURZEL (Auftrag firmenordner-rechte-im-frontend, 22.09.2026). Genau
 *      eine, ohne Rechte-Zeile, zuerst in der Antwort, nie loeschbar, solange
 *      ein anderer Ordner besteht -- und `sicht.md` nennt nichts Fremdes.
 */

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';
process.env.RATE_LIMIT_ENABLED = 'false';

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../../src/database');
const dienst = require('../../src/services/firmenordner/ordnerdienst');
const verwaltung = require('../../src/services/firmenordner/ordnerVerwaltung');

/** Ein Gerät mit eingeschaltetem Firmenordner. */
function firmenordnerAn() {
  process.env.COMPOSE_PROFILES = 'firmenordner';
  process.env.FIRMENORDNER_INTERN = 'http://firmenordner:9200';
  process.env.FIRMENORDNER_ADMIN_PASSWORT = 'geheim';
  process.env.FIRMENORDNER_ADRESSE = 'https://arasul:8443';
}

function firmenordnerAus() {
  delete process.env.COMPOSE_PROFILES;
  delete process.env.FIRMENORDNER_INTERN;
  delete process.env.FIRMENORDNER_ADMIN_PASSWORT;
}

beforeEach(() => {
  db.query.mockReset();
  dienst._rollenVergessen();
  firmenordnerAus();
  global.fetch = jest.fn();
});

describe('Der eine Schalter', () => {
  it('ist aus, solange COMPOSE_PROFILES ihn nicht nennt', () => {
    process.env.FIRMENORDNER_INTERN = 'http://firmenordner:9200';
    expect(dienst.istAn()).toBe(false);
  });

  it('ist aus, wenn ein anderes Profil laeuft', () => {
    process.env.COMPOSE_PROFILES = 'tunnel';
    process.env.FIRMENORDNER_INTERN = 'http://firmenordner:9200';
    expect(dienst.istAn()).toBe(false);
  });

  it('ist an, wenn er neben einem anderen Profil steht', () => {
    process.env.COMPOSE_PROFILES = 'tunnel, firmenordner';
    process.env.FIRMENORDNER_INTERN = 'http://firmenordner:9200';
    expect(dienst.istAn()).toBe(true);
  });

  it('macht die Spiegelung zu einem stillen Nichts', async () => {
    await verwaltung.spiegleNutzer({
      benutzerId: 7,
      username: 'mia',
      email: null,
      passwort: 'start',
    });
    // Weder eine Anfrage an den Dienst noch eine Zeile in der Datenbank: auf
    // einem Geraet ohne Firmenordner gibt es nichts zu spiegeln und nichts
    // nachzuholen.
    expect(global.fetch).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('meldet „gibt es hier nicht" und nicht „kaputt"', async () => {
    const lage = await dienst.zustand();
    expect(lage).toEqual({
      an: false,
      erreichbar: false,
      grund: 'Auf diesem Geraet laeuft kein Firmenordner',
    });
  });

  it('unterscheidet ein fehlendes Geheimnis von einem fehlenden Dienst', async () => {
    firmenordnerAn();
    delete process.env.FIRMENORDNER_ADMIN_PASSWORT;
    const lage = await dienst.zustand();
    // Das Profil laeuft, der Container steht da -- es fehlt nur die Datei.
    // Das als „aus" zu melden waere die falsche Auskunft an genau den
    // Menschen, der es beheben kann.
    expect(lage.an).toBe(true);
    expect(lage.erreichbar).toBe(false);
    expect(lage.grund).toMatch(/firmenordner_admin_password/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('Rechte werden nur vergeben', () => {
  /** Ein Ordner der Ebene 2 unter `projekte`, und ein Mensch. */
  function baumMit({ rechtAufEltern }) {
    db.query.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM public.firmenordner_ordner o WHERE o.id')) {
        const id = Number(params[0]);
        return id === 1
          ? {
              rows: [
                {
                  id: 1,
                  kennung: 'projekte',
                  ebene: 1,
                  eltern_id: null,
                  art: 'geteilt',
                  raum_id: 'r1',
                  pfad: '',
                },
              ],
            }
          : {
              rows: [
                {
                  id: 2,
                  kennung: 'vicona',
                  ebene: 2,
                  eltern_id: 1,
                  art: 'geteilt',
                  raum_id: 'r1',
                  pfad: 'vicona',
                },
              ],
            };
      }
      if (sql.includes('FROM public.admin_users WHERE id')) {
        return { rows: [{ id: 3, username: 'mia', email: null, is_active: true }] };
      }
      if (sql.includes('SELECT recht FROM public.firmenordner_rechte')) {
        return { rows: rechtAufEltern ? [{ recht: rechtAufEltern }] : [] };
      }
      if (sql.includes('INSERT INTO public.firmenordner_rechte')) {
        return { rows: [{ neu: true }] };
      }
      return { rows: [] };
    });
  }

  it('nimmt mehr auf dem Kind an -- das ist der Normalfall', async () => {
    baumMit({ rechtAufEltern: 'lesen' });
    const ergebnis = await verwaltung.gibRecht({
      ordnerId: 2,
      benutzerId: 3,
      recht: 'schreiben',
      durch: 1,
    });
    expect(ergebnis.recht).toBe('schreiben');
  });

  it('weist weniger auf dem Kind AB, statt es still zu schlucken', async () => {
    baumMit({ rechtAufEltern: 'schreiben' });
    // Der Dienst kennt kein Entziehen nach unten. Eine angenommene,
    // unausgefuehrte Bitte waere schlimmer als eine abgelehnte: der
    // Administrator saehe „lesen", waehrend der Mensch schreibt.
    await expect(
      verwaltung.gibRecht({ ordnerId: 2, benutzerId: 3, recht: 'lesen', durch: 1 })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('nennt im Fehler den Ausweg und nicht nur das Verbot', async () => {
    baumMit({ rechtAufEltern: 'schreiben' });
    await expect(
      verwaltung.gibRecht({ ordnerId: 2, benutzerId: 3, recht: 'lesen', durch: 1 })
    ).rejects.toThrow(/einzeln/);
  });

  it('laesst dasselbe Recht wie oben durch', async () => {
    baumMit({ rechtAufEltern: 'lesen' });
    const ergebnis = await verwaltung.gibRecht({
      ordnerId: 2,
      benutzerId: 3,
      recht: 'lesen',
      durch: 1,
    });
    expect(ergebnis.recht).toBe('lesen');
  });

  it('gibt auf einen Ordner am Geraet gar kein Recht', async () => {
    db.query.mockImplementation(async sql => {
      if (sql.includes('FROM public.firmenordner_ordner o WHERE o.id')) {
        return {
          rows: [
            {
              id: 9,
              kennung: 'geraet',
              ebene: 1,
              eltern_id: null,
              art: 'am_geraet',
              raum_id: 'r9',
              pfad: '',
            },
          ],
        };
      }
      return { rows: [] };
    });
    await expect(
      verwaltung.gibRecht({ ordnerId: 9, benutzerId: 3, recht: 'lesen', durch: 1 })
    ).rejects.toThrow(/am Geraet/);
  });
});

describe('Der Dienst darf ausfallen', () => {
  it('legt keine Spiegelzeile an, wenn der Dienst den Menschen nicht annimmt', async () => {
    firmenordnerAn();
    // Keine Zeile ohne Kennung: sie waere ein Spiegel, der auf nichts zeigt,
    // und jeder spaetere Aufruf haette eine Kennung in der Hand, die es nicht
    // gibt.
    db.query.mockResolvedValue({ rows: [] });
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'kaputt',
    });

    await expect(
      verwaltung.spiegleNutzer({ benutzerId: 7, username: 'mia', email: null, passwort: 'x' })
    ).resolves.toBeUndefined();

    const inserts = db.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO public.firmenordner_nutzer')
    );
    expect(inserts).toHaveLength(0);
  });

  it('haelt fest, was offen ist, statt die Anfrage scheitern zu lassen', async () => {
    firmenordnerAn();
    db.query.mockImplementation(async sql => {
      if (sql.includes('SELECT * FROM public.firmenordner_nutzer')) {
        return { rows: [{ user_id: 7, dienst_id: 'u-7', dienst_name: 'mia' }] };
      }
      return { rows: [] };
    });
    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await verwaltung.spiegleNutzer({
      benutzerId: 7,
      username: 'mia',
      email: null,
      passwort: 'x',
    });

    const update = db.query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE public.firmenordner_nutzer')
    );
    expect(update).toBeDefined();
    // `passwort_gespiegelt` falsch, und der Grund steht als Satz daneben.
    expect(update[1][1]).toBe(false);
    expect(update[1][2]).toMatch(/ECONNREFUSED/);
  });
});

describe('Was ein Mensch sieht', () => {
  /** Ohne Wurzel: die Frage nach ihr bekommt keine Zeile. */
  function ohneWurzel(zeilen) {
    db.query.mockImplementation(async sql =>
      sql.includes('o.art = $1') ? { rows: [] } : { rows: zeilen }
    );
  }

  it('fragt nur nach seinen eigenen Ordnern und schliesst „am Geraet" aus', async () => {
    ohneWurzel([]);
    await verwaltung.meineOrdner(3);
    const [sql, params] = db.query.mock.calls[0];
    // Beide Bedingungen, und beide sind wichtig: die erste macht einen
    // fremden Ordner unsichtbar (er kommt gar nicht erst in die Liste), die
    // zweite den Ordner am Geraet.
    expect(sql).toMatch(/r\.user_id = \$1/);
    expect(sql).toMatch(/o\.art = 'geteilt'/);
    expect(params).toEqual([3]);
  });

  it('nennt den Pfad der Ebene 2 an seiner echten Stelle im Baum', async () => {
    ohneWurzel([
      {
        kennung: 'vicona',
        name: 'Vicona',
        ebene: 2,
        art: 'geteilt',
        recht: 'schreiben',
        eltern_kennung: 'projekte',
        pfad: 'projekte/vicona',
      },
    ]);
    const ordner = await verwaltung.meineOrdner(3);
    // Auch wenn der Mensch `projekte` gar nicht sieht: der Ordner liegt bei
    // ihm an seiner echten Stelle (Regel 1 des Zielbildes).
    expect(ordner).toEqual([
      {
        kennung: 'vicona',
        name: 'Vicona',
        ebene: 2,
        art: 'geteilt',
        eltern: 'projekte',
        pfad: 'projekte/vicona',
        recht: 'schreiben',
      },
    ]);
  });
});

describe('Die Wurzel (Auftrag firmenordner-rechte-im-frontend, 22.09.2026)', () => {
  const WURZEL = {
    id: 1,
    kennung: 'firma',
    name: 'Firma',
    ebene: 0,
    eltern_id: null,
    art: 'wurzel',
    raum_id: 'r-wurzel',
    pfad: '',
  };

  /** Ein Geraet mit Wurzel, ohne andere Ordner und ohne Rechte. */
  function mitWurzel({ andere = 0 } = {}) {
    db.query.mockImplementation(async (sql, params) => {
      if (sql.includes('o.art = $1')) {
        return { rows: [WURZEL] };
      }
      if (sql.includes('FROM public.firmenordner_ordner o WHERE o.id')) {
        return Number(params[0]) === 1 ? { rows: [WURZEL] } : { rows: [] };
      }
      if (sql.includes('COUNT(*)::int AS n FROM public.firmenordner_ordner WHERE id <>')) {
        return { rows: [{ n: andere }] };
      }
      if (sql.includes('FROM public.admin_users WHERE id')) {
        return {
          rows: [{ id: 3, username: 'mia', email: null, role: 'mitarbeiter', is_active: true }],
        };
      }
      return { rows: [] };
    });
  }

  it('steht ZUERST in der Antwort, mit leerem Pfad und art wurzel', async () => {
    mitWurzel();
    const ordner = await verwaltung.meineOrdner(3, 'mitarbeiter');
    expect(ordner[0]).toEqual({
      kennung: 'firma',
      name: 'Firma',
      ebene: 0,
      art: 'wurzel',
      eltern: null,
      pfad: '',
      recht: 'lesen',
    });
  });

  it('liest jeder Mitarbeiter, und der Administrator schreibt -- aus der Rolle, nicht aus einer Zeile', async () => {
    mitWurzel();
    const [alsMitarbeiter] = await verwaltung.meineOrdner(3, 'mitarbeiter');
    const [alsAdmin] = await verwaltung.meineOrdner(3, 'admin');
    expect(alsMitarbeiter.recht).toBe('lesen');
    expect(alsAdmin.recht).toBe('schreiben');
    // Keine Abfrage der Rechte-Tabelle nach der Wurzel: es gibt dort keine
    // Zeile fuer sie, und es soll keine geben.
    const rechteFragen = db.query.mock.calls.filter(
      ([sql]) => sql.includes('firmenordner_rechte') && sql.includes('r-wurzel')
    );
    expect(rechteFragen).toHaveLength(0);
  });

  it('bekommt kein Recht je Person', async () => {
    mitWurzel();
    await expect(
      verwaltung.gibRecht({ ordnerId: 1, benutzerId: 3, recht: 'lesen', durch: 1 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('faellt nicht, solange ein anderer Ordner besteht', async () => {
    mitWurzel({ andere: 2 });
    await expect(verwaltung.loescheOrdner({ ordnerId: 1 })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('faellt, wenn sie der letzte Ordner ist -- als RAUM, nicht als Unterordner', async () => {
    firmenordnerAn();
    mitWurzel({ andere: 0 });
    global.fetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    await expect(verwaltung.loescheOrdner({ ordnerId: 1 })).resolves.toEqual({
      kennung: 'firma',
      ebene: 0,
      art: 'wurzel',
    });
    // Der Raum-Weg (Graph, zwei DELETE, das zweite mit Purge) und nicht der
    // WebDAV-Weg fuer einen Ordner darin: der antwortet auf die Wurzel eines
    // Raums mit 405 (22.09.2026 am Orin, beim Aufraeumen der Abnahme).
    const wege = global.fetch.mock.calls
      .filter(([, o]) => o?.method === 'DELETE')
      .map(([url]) => String(url));
    expect(wege.length).toBeGreaterThanOrEqual(2);
    expect(wege.every(w => w.includes('/graph/v1.0/drives/'))).toBe(true);
    expect(wege.some(w => w.includes('/dav/spaces/'))).toBe(false);
  });

  it('gibt es nur einmal', async () => {
    mitWurzel();
    await expect(
      verwaltung.legeOrdnerAn({
        kennung: 'zweite',
        name: 'Zweite',
        ebene: 0,
        art: 'wurzel',
        durch: 1,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('bekommt beim Abgleich jeden aktiven Menschen als Mitglied -- Administratoren als Schreiber', async () => {
    firmenordnerAn();
    db.query.mockImplementation(async sql => {
      if (sql.includes('o.art = $1')) {
        return { rows: [WURZEL] };
      }
      if (sql.includes('FROM public.firmenordner_nutzer f')) {
        return {
          rows: [
            { user_id: 1, dienst_id: 'u-1', username: 'admin', role: 'admin', is_active: true },
            { user_id: 3, dienst_id: 'u-3', username: 'mia', role: 'mitarbeiter', is_active: true },
            {
              user_id: 4,
              dienst_id: 'u-4',
              username: 'weg',
              role: 'mitarbeiter',
              is_active: false,
            },
          ],
        };
      }
      return { rows: [] };
    });
    global.fetch.mockImplementation(async (url, opts = {}) => {
      const weg = String(url);
      if (weg.includes('roleDefinitions')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              value: [
                {
                  id: 'view-root',
                  displayName: 'Can view',
                  rolePermissions: [{ condition: 'exists @Resource.Root' }],
                },
                {
                  id: 'edit-root',
                  displayName: 'Can edit',
                  rolePermissions: [{ condition: 'exists @Resource.Root' }],
                },
              ],
            }),
        };
      }
      if (weg.endsWith('/root/permissions') && (opts.method || 'GET') === 'GET') {
        // `mia` ist schon Leserin, `weg` ist noch Mitglied, obwohl stillgelegt.
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              value: [
                { id: 'p-3', roles: ['view-root'], grantedToV2: { user: { id: 'u-3' } } },
                { id: 'p-4', roles: ['view-root'], grantedToV2: { user: { id: 'u-4' } } },
                { id: 'p-geraet', roles: ['manage'], grantedToV2: { user: { id: 'u-geraet' } } },
              ],
            }),
        };
      }
      return { ok: true, status: 200, text: async () => '{}' };
    });

    const bericht = await verwaltung.spiegleWurzelMitglieder();
    expect(bericht).toEqual({ eingeladen: 1, geaendert: 0, entfernt: 1 });

    const einladungen = global.fetch.mock.calls.filter(([url]) => String(url).includes('/invite'));
    expect(einladungen).toHaveLength(1);
    const koerper = JSON.parse(einladungen[0][1].body);
    expect(koerper.recipients[0].objectId).toBe('u-1');
    expect(koerper.roles).toEqual(['edit-root']);

    const entfernt = global.fetch.mock.calls.filter(
      ([url, o]) => (o?.method || 'GET') === 'DELETE' && String(url).includes('/permissions/')
    );
    // Nur `weg` (stillgelegt) faellt -- das Konto des Geraets bleibt unangetastet.
    expect(entfernt.map(([url]) => String(url).split('/').pop())).toEqual(['p-4']);
  });
});

describe('sicht.md (Regel 3 des Zielbildes)', () => {
  it('nennt seine Ordner mit Stufe, seine Apps mit APP.md und die Orte -- und nichts Fremdes', async () => {
    firmenordnerAn();
    const WURZEL = {
      id: 1,
      kennung: 'firma',
      name: 'Firma',
      ebene: 0,
      eltern_id: null,
      art: 'wurzel',
      raum_id: 'r-w',
      pfad: '',
    };
    db.query.mockImplementation(async sql => {
      if (sql.includes('o.art = $1')) {
        return { rows: [WURZEL] };
      }
      if (sql.includes('FROM public.firmenordner_rechte r') && sql.includes('r.user_id = $1')) {
        return {
          rows: [
            {
              kennung: 'vicona',
              name: 'Vicona',
              ebene: 2,
              art: 'geteilt',
              recht: 'schreiben',
              eltern_kennung: 'projekte',
              pfad: 'projekte/vicona',
            },
          ],
        };
      }
      if (sql.includes('FROM public.app_members f')) {
        return {
          rows: [
            {
              id: 'belege',
              name: 'Belege',
              beschreibung: null,
              freigegeben_bis: 'live',
              live_version: '1.0.0',
              test_version: null,
              live_manifest: { backend: {} },
              test_manifest: null,
            },
          ],
        };
      }
      return { rows: [] };
    });
    global.fetch.mockImplementation(async url => {
      if (String(url).includes('places.json')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              places: [{ name: 'github-firma', description: 'Der Quellcode', write: false }],
            }),
        };
      }
      return { ok: false, status: 404, text: async () => '' };
    });

    const text = await verwaltung.sichtFuer({
      benutzerId: 3,
      username: 'mia',
      rolle: 'mitarbeiter',
    });
    expect(text).toContain('# Sicht von mia');
    expect(text).toContain('`/ (Wurzel „firma")`: lesen');
    expect(text).toContain('`projekte/vicona/`: schreiben');
    expect(text).toContain('`apps/belege/APP.md`');
    expect(text).toContain('github-firma — Der Quellcode · nur lesen');
    // Der Bereich `projekte` steht NICHT als eigener Ordner da: mia hat auf
    // ihm kein Recht, und ein Ordner ohne Recht ist unsichtbar, auch sein Name.
    expect(text).not.toMatch(/`projekte\/`/);
    // Hoechstens eine Bildschirmseite.
    expect(text.split('\n').length).toBeLessThanOrEqual(50);
  });
});

describe('Die Aenderungen eines Ordners kommen aus dem Dienst', () => {
  it('loest die Vorlage des Protokolls zu einem Satz auf, neueste zuerst', async () => {
    firmenordnerAn();
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          value: [
            {
              id: 'a',
              template: {
                message: '{user} added {sharee} as member of {space}',
                variables: {
                  user: { id: 'u-1', displayName: 'Admin' },
                  sharee: { id: 'u-3', displayName: 'mia' },
                  space: { id: 'r', name: 'projekte' },
                },
              },
              times: { recordedTime: '2026-09-22T17:59:19Z' },
            },
            {
              id: 'b',
              template: {
                message: '{user} added {resource} to {folder}',
                variables: {
                  user: { id: 'u-3', displayName: 'mia' },
                  resource: { id: 'x', name: 'angebot.md' },
                  folder: { id: 'r', name: 'projekte' },
                },
              },
              times: { recordedTime: '2026-09-22T17:59:22Z' },
            },
          ],
        }),
    });
    const liste = await dienst.aenderungen('r');
    expect(liste).toEqual([
      {
        wann: '2026-09-22T17:59:22Z',
        wer: 'mia',
        text: 'mia added angebot.md to projekte',
        datei: 'angebot.md',
      },
      {
        wann: '2026-09-22T17:59:19Z',
        wer: 'Admin',
        text: 'Admin added mia as member of projekte',
        datei: null,
      },
    ]);
    expect(String(global.fetch.mock.calls[0][0])).toContain(
      'org.libregraph/activities?kql=itemid%3Ar'
    );
  });
});

describe('Die Rollen des Dienstes', () => {
  /**
   * Die Antwort, die der Orin am 22.09.2026 wirklich gegeben hat -- gekuerzt
   * auf das, was hier entscheidet. ZWEIMAL „Can view", DREIMAL „Can edit",
   * und die Ordner-Rolle steht VOR der Raum-Rolle: wer die erste passende
   * nimmt, laedt auf einen Raum mit einer Ordner-Rolle ein.
   */
  const ROLLEN = {
    value: [
      {
        id: 'view-folder',
        displayName: 'Can view',
        rolePermissions: [
          { condition: 'exists @Resource.File' },
          { condition: 'exists @Resource.Folder' },
        ],
      },
      {
        id: 'view-root',
        displayName: 'Can view',
        rolePermissions: [{ condition: 'exists @Resource.Root' }],
      },
      {
        id: 'edit-folder',
        displayName: 'Can edit',
        rolePermissions: [{ condition: 'exists @Resource.Folder' }],
      },
      {
        id: 'edit-root',
        displayName: 'Can edit',
        rolePermissions: [{ condition: 'exists @Resource.Root' }],
      },
      {
        id: 'edit-file',
        displayName: 'Can edit',
        rolePermissions: [{ condition: 'exists @Resource.File' }],
      },
      {
        id: 'manage-root',
        displayName: 'Can manage',
        rolePermissions: [{ condition: 'exists @Resource.Root' }],
      },
    ],
  };

  function dienstMitRollen(rollen = ROLLEN) {
    global.fetch.mockImplementation(async url => {
      if (String(url).includes('roleDefinitions')) {
        return { ok: true, status: 200, text: async () => JSON.stringify(rollen) };
      }
      return { ok: true, status: 200, text: async () => '{}' };
    });
  }

  /** Die Rolle, mit der die Einladung wirklich hinausging. */
  function rolleDerEinladung() {
    const ruf = global.fetch.mock.calls.find(([url]) => String(url).includes('/invite'));
    return JSON.parse(ruf[1].body).roles[0];
  }

  it('holt die Kennungen und raet sie nicht', async () => {
    firmenordnerAn();
    dienstMitRollen();
    await dienst.ladeEin({
      raumId: 'r1',
      ordnerId: null,
      dienstNutzerId: 'u-3',
      recht: 'schreiben',
    });
    const gefragt = global.fetch.mock.calls.find(([url]) =>
      String(url).includes('roleDefinitions')
    );
    // `v1beta1` und nicht `v1.0`: der Weg unter v1.0 antwortet 404 (gemessen).
    expect(String(gefragt[0])).toContain('/graph/v1beta1/roleManagement');
  });

  it('nimmt fuer einen RAUM die Rolle mit @Resource.Root', async () => {
    firmenordnerAn();
    dienstMitRollen();
    await dienst.ladeEin({
      raumId: 'r1',
      ordnerId: null,
      dienstNutzerId: 'u-3',
      recht: 'schreiben',
    });
    expect(rolleDerEinladung()).toBe('edit-root');
  });

  it('und fuer einen ORDNER die mit @Resource.Folder', async () => {
    firmenordnerAn();
    dienstMitRollen();
    await dienst.ladeEin({
      raumId: 'r1',
      ordnerId: 'o1',
      dienstNutzerId: 'u-3',
      recht: 'schreiben',
    });
    // Beide heissen „Can edit". Die erste passende zu nehmen waere eine Wette
    // auf die Reihenfolge -- und die Ordner-Rolle steht hier vor der
    // Raum-Rolle, also waere die Wette beim Raum verloren gewesen.
    expect(rolleDerEinladung()).toBe('edit-folder');
  });

  it('unterscheidet auch beim Lesen', async () => {
    firmenordnerAn();
    dienstMitRollen();
    await dienst.ladeEin({ raumId: 'r1', ordnerId: null, dienstNutzerId: 'u-3', recht: 'lesen' });
    expect(rolleDerEinladung()).toBe('view-root');
  });

  it('wirft mit Satz, wenn der Dienst die Rolle nicht kennt', async () => {
    firmenordnerAn();
    // Eine fest im Code stehende UUID waere genau so lange richtig, bis der
    // Dienst eine Fassung weiter ist -- und dann wuerde die Einladung nur
    // abgelehnt, ohne dass jemand erfaehrt, warum.
    dienstMitRollen({ value: [] });
    await expect(
      dienst.ladeEin({ raumId: 'r1', ordnerId: null, dienstNutzerId: 'u-3', recht: 'lesen' })
    ).rejects.toThrow(/nennt keine Rolle/);
  });
});

describe('Anlegen und Wegwerfen im Dienst', () => {
  it('legt einen Ordner der Ebene 2 ueber WebDAV an, nicht ueber die Graph-API', async () => {
    firmenordnerAn();
    global.fetch.mockResolvedValue({ ok: true, status: 201, text: async () => '' });
    await dienst.legeOrdnerAn('r1', 'vicona');
    const [url, opt] = global.fetch.mock.calls[0];
    // `POST /graph/v1.0/drives/<raum>/root/children` antwortet 404 -- den Weg
    // aus Microsofts Graph gibt es hier nicht (gemessen am 22.09.2026).
    expect(opt.method).toBe('MKCOL');
    expect(String(url)).toContain('/dav/spaces/r1/vicona');
  });

  it('nimmt „gibt es schon" beim Anlegen hin', async () => {
    firmenordnerAn();
    global.fetch.mockResolvedValue({ ok: false, status: 405, text: async () => '' });
    await expect(dienst.legeOrdnerAn('r1', 'vicona')).resolves.toBeUndefined();
  });

  it('wirft einen Raum in ZWEI Schritten weg -- beide immer', async () => {
    firmenordnerAn();
    global.fetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    await dienst.loescheRaum('r1');
    // Das erste DELETE antwortet 204 und sieht aus wie Erfolg; der Raum steht
    // danach als `trashed` in der Liste und seine Dateien liegen unveraendert
    // auf der Platte. Erst `Purge: T` nimmt ihn wirklich weg.
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][1].headers.Purge).toBeUndefined();
    expect(global.fetch.mock.calls[1][1].headers.Purge).toBe('T');
  });

  it('setzt eine Raumkennung mit $ und ! richtig in den Weg', async () => {
    firmenordnerAn();
    global.fetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    await dienst.loescheOrdner('9eb$2c2c!155b', 'vicona');
    // Eine Raumkennung traegt `$` und `!`; `encodeURI` liesse beide stehen.
    expect(String(global.fetch.mock.calls[0][0])).toContain('9eb%242c2c!155b');
  });
});

describe('Wegwerfen ist keine Anfrage wie die anderen (J33, 22.09.2026)', () => {
  /**
   * Eine Antwort des Dienstes, die sich nach Weg und Methode richtet -- beim
   * Wegwerfen sind es drei bis vier Aufrufe hintereinander, und welcher
   * welchen bekommt, ist genau die Frage.
   */
  function antworten(regeln) {
    global.fetch.mockImplementation((url, opt = {}) => {
      const weg = String(url);
      const methode = opt.method || 'GET';
      const purge = Boolean(opt.headers?.Purge);
      for (const regel of regeln) {
        if (regel.methode && regel.methode !== methode) continue;
        if (regel.enthaelt && !weg.includes(regel.enthaelt)) continue;
        if (regel.purge !== undefined && regel.purge !== purge) continue;
        return Promise.resolve({
          ok: regel.status < 400,
          status: regel.status,
          text: async () => regel.koerper || '',
        });
      }
      return Promise.resolve({ ok: true, status: 204, text: async () => '' });
    });
  }

  const LISTE_MIT = JSON.stringify({ value: [{ id: 'r1' }, { id: 'r2' }] });
  const LISTE_OHNE = JSON.stringify({ value: [{ id: 'r2' }] });

  it('gibt dem Wegwerfen eine eigene, groessere Zeitgrenze', async () => {
    firmenordnerAn();
    const uhr = jest.spyOn(AbortSignal, 'timeout');
    antworten([{ status: 204 }]);
    await dienst.loescheRaum('r1');
    // Zehn Sekunden haben am 22.09.2026 fuer 6.076 Dateien nicht gereicht
    // (gemessen: 11,4 s fuer 6.000). Der Purge braucht seine eigene Geduld.
    expect(uhr).toHaveBeenCalledWith(dienst.ZEITGRENZE_LOESCHEN_MS);
    expect(uhr).not.toHaveBeenCalledWith(10000);
    uhr.mockRestore();
  });

  it('nimmt einen Fehler hin, wenn der Raum danach nicht mehr in der Liste steht', async () => {
    firmenordnerAn();
    // Genau der Fall vom 22.09.2026: der abgeschnittene Purge hinterlaesst
    // einen Dienst, der auf jeden weiteren Versuch `500 grpc error` sagt --
    // waehrend die Dateien laengst weg sind.
    antworten([
      {
        methode: 'DELETE',
        purge: true,
        status: 500,
        koerper: '{"error":{"message":"grpc error"}}',
      },
      { methode: 'GET', enthaelt: '/graph/v1.0/drives', status: 200, koerper: LISTE_OHNE },
      { status: 204 },
    ]);
    await expect(dienst.loescheRaum('r1')).resolves.toBeUndefined();
  });

  it('meldet den Fehler weiter, solange der Raum noch in der Liste steht', async () => {
    firmenordnerAn();
    antworten([
      { methode: 'DELETE', purge: true, status: 500, koerper: 'grpc error' },
      { methode: 'GET', enthaelt: '/graph/v1.0/drives', status: 200, koerper: LISTE_MIT },
      { status: 204 },
    ]);
    await expect(dienst.loescheRaum('r1')).rejects.toThrow(/grpc error/);
  });

  it('blaettert die Liste zu Ende, bevor es „weg" sagt', async () => {
    firmenordnerAn();
    // Eine Liste in zwei Seiten, und `r1` steht auf der zweiten. Wer nur die
    // erste liest, wirft die letzte Zeile weg, die den Raum noch kennt --
    // dieselbe Leiche wie im Auftrag `app-leiche`, nur andersherum.
    global.fetch.mockImplementation((url, opt = {}) => {
      const weg = String(url);
      if ((opt.method || 'GET') === 'GET' && weg.includes('/graph/v1.0/drives')) {
        const zweite = weg.includes('$skiptoken');
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(
              zweite
                ? { value: [{ id: 'r1' }] }
                : {
                    value: [{ id: 'r9' }],
                    '@odata.nextLink': 'http://firmenordner:9200/graph/v1.0/drives?$skiptoken=2',
                  }
            ),
        });
      }
      return Promise.resolve({ ok: false, status: 500, text: async () => 'grpc error' });
    });
    await expect(dienst.loescheRaum('r1')).rejects.toThrow(/grpc error/);
  });

  it('folgt einer naechsten Seite nicht, die woandershin zeigt', async () => {
    firmenordnerAn();
    antworten([
      { methode: 'DELETE', purge: true, status: 500, koerper: 'grpc error' },
      {
        methode: 'GET',
        enthaelt: '/graph/v1.0/drives',
        status: 200,
        koerper: JSON.stringify({
          value: [{ id: 'r2' }],
          '@odata.nextLink': 'https://fremder-rechner/graph/v1.0/drives?$skiptoken=2',
        }),
      },
      { status: 204 },
    ]);
    // Eine Liste, die auf einen fremden Rechner verweist, ist keine Antwort
    // auf unsere Frage -- also gilt, was dieser Dienst gesagt hat: `r1` ist
    // nicht darin.
    await expect(dienst.loescheRaum('r1')).resolves.toBeUndefined();
  });

  it('behauptet nichts, wenn die Liste selbst nicht kommt', async () => {
    firmenordnerAn();
    antworten([
      { methode: 'DELETE', purge: true, status: 500, koerper: 'grpc error' },
      { methode: 'GET', enthaelt: '/graph/v1.0/drives', status: 503, koerper: 'weg' },
      { status: 204 },
    ]);
    await expect(dienst.loescheRaum('r1')).rejects.toThrow(/grpc error/);
  });

  /** Ein Papierkorb mit zwei Eintraegen, einer davon unserer. */
  const PAPIERKORB = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
    <d:response><d:href>/dav/spaces/trash-bin/r1/</d:href></d:response>
    <d:response><d:href>/dav/spaces/trash-bin/r1/aaa-111/</d:href>
      <oc:trashbin-original-location>vicona</oc:trashbin-original-location></d:response>
    <d:response><d:href>/dav/spaces/trash-bin/r1/bbb-222/</d:href>
      <oc:trashbin-original-location>notizen.md</oc:trashbin-original-location></d:response>
  </d:multistatus>`;

  it('leert den einen Eintrag aus dem Papierkorb, den es gerade hineingeworfen hat', async () => {
    firmenordnerAn();
    // Ein WebDAV-DELETE ist ein Verschieben: der Ordner liegt danach unter
    // `.Trash/files/…` und jede Datei darin ist noch da (am 22.09.2026 am
    // Orin nachgesehen). Die Route verspricht „samt allem, was darin liegt".
    antworten([{ methode: 'PROPFIND', status: 207, koerper: PAPIERKORB }, { status: 204 }]);
    await dienst.loescheOrdner('r1', 'vicona');
    const wege = global.fetch.mock.calls.map(([u, o]) => `${o.method} ${String(u)}`);
    expect(wege).toEqual([
      'DELETE http://firmenordner:9200/dav/spaces/r1/vicona',
      'PROPFIND http://firmenordner:9200/dav/spaces/trash-bin/r1',
      'DELETE http://firmenordner:9200/dav/spaces/trash-bin/r1/aaa-111',
    ]);
  });

  it('laesst liegen, was ein Mensch selbst in den Papierkorb gelegt hat', async () => {
    firmenordnerAn();
    antworten([{ methode: 'PROPFIND', status: 207, koerper: PAPIERKORB }, { status: 204 }]);
    await dienst.loescheOrdner('r1', 'gibt-es-nicht-im-papierkorb');
    // Den Papierkorb GANZ zu leeren waere ein zweites Wegwerfen, das niemand
    // bestellt hat.
    expect(global.fetch.mock.calls.filter(([, o]) => o.method === 'DELETE')).toHaveLength(1);
  });
});

describe('Der Fehler des Dienstes traegt seine Begruendung', () => {
  it('nimmt den Koerper der Antwort mit in die Meldung', async () => {
    firmenordnerAn();
    // Am 21.09.2026 war genau dieser Satz die Stelle, an der sich „nur
    // erweitern" gezeigt hat. Ein Fehler ohne ihn waere eine Stelle weniger,
    // an der man das naechste Mal nachsehen kann.
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Field validation for 'Roles' failed on the 'available_role' tag",
    });
    await expect(dienst.legeRaumAn('projekte')).rejects.toThrow(/available_role/);
  });

  it('nimmt ein 404 beim Loeschen hin -- „gibt es nicht" ist das Ziel', async () => {
    firmenordnerAn();
    global.fetch.mockResolvedValue({ ok: false, status: 404, text: async () => 'not found' });
    await expect(dienst.loescheNutzer('u-weg')).resolves.toBeUndefined();
  });
});
