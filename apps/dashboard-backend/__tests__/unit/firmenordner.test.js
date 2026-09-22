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
  it('fragt nur nach seinen eigenen Ordnern und schliesst „am Geraet" aus', async () => {
    db.query.mockResolvedValue({ rows: [] });
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
    db.query.mockResolvedValue({
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
    });
    const ordner = await verwaltung.meineOrdner(3);
    // Auch wenn der Mensch `projekte` gar nicht sieht: der Ordner liegt bei
    // ihm an seiner echten Stelle (Regel 1 des Zielbildes).
    expect(ordner).toEqual([
      {
        kennung: 'vicona',
        name: 'Vicona',
        ebene: 2,
        eltern: 'projekte',
        pfad: 'projekte/vicona',
        recht: 'schreiben',
      },
    ]);
  });
});

describe('Die Rollen des Dienstes', () => {
  it('werden geholt und nicht geraten', async () => {
    firmenordnerAn();
    global.fetch.mockImplementation(async url => {
      if (String(url).includes('roleDefinitions')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              value: [
                { id: 'rolle-lesen', displayName: 'Can view' },
                { id: 'rolle-schreiben', displayName: 'Can edit' },
              ],
            }),
        };
      }
      return { ok: true, status: 200, text: async () => '{}' };
    });

    await dienst.ladeEin({
      raumId: 'r1',
      ordnerId: null,
      dienstNutzerId: 'u-3',
      recht: 'schreiben',
    });

    const einladung = global.fetch.mock.calls.find(([url]) => String(url).includes('/invite'));
    expect(JSON.parse(einladung[1].body).roles).toEqual(['rolle-schreiben']);
  });

  it('wirft mit Satz, wenn der Dienst die Rolle nicht kennt', async () => {
    firmenordnerAn();
    // Eine fest im Code stehende UUID waere genau so lange richtig, bis der
    // Dienst eine Fassung weiter ist -- und dann wuerde die Einladung nur
    // abgelehnt, ohne dass jemand erfaehrt, warum.
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ value: [] }),
    });
    await expect(
      dienst.ladeEin({ raumId: 'r1', ordnerId: null, dienstNutzerId: 'u-3', recht: 'lesen' })
    ).rejects.toThrow(/nennt keine Rolle/);
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
