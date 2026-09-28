/**
 * Die Groessengrenze eines Bereichs (J33, 28.09.2026).
 *
 * Bis dahin hatte jeder Raum still die Vorgabe des Dienstes, 1 GB, und ein
 * Abgleich des Kits scheiterte mit „exceeds the quota for the folder", ohne
 * dass der Administrator davon wusste. Gemessen wird, was dieses Repo
 * entscheidet:
 *
 *   1. Ein neuer Raum bekommt die Vorgabe des Geraets (100 GB), nicht die
 *      des Dienstes.
 *   2. Belegt und Grenze kommen aus EINER Liste; `total: 0` heisst ohne
 *      Grenze und nie „0 Bytes".
 *   3. `frei` ist nie mehr, als die Platte hat.
 *   4. Eine Grenze unter dem Belegten und eine Grenze fuer ein Projekt werden
 *      mit Satz abgewiesen.
 *   5. `passt` weist mit `409 GRENZE_ERREICHT` und einem Satz ab, und ein
 *      Projekt verraet nicht, wie voll sein Bereich ist.
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

const fs = require('fs');
const db = require('../../src/database');
const dienst = require('../../src/services/firmenordner/ordnerdienst');
const verwaltung = require('../../src/services/firmenordner/ordnerVerwaltung');

const GB = 1000 * 1000 * 1000;
const MB = 1000 * 1000;

function firmenordnerAn() {
  process.env.COMPOSE_PROFILES = 'firmenordner';
  process.env.FIRMENORDNER_INTERN = 'http://firmenordner:9200';
  process.env.FIRMENORDNER_ADMIN_PASSWORT = 'geheim';
}

/** Die Ordner am Geraet: Wurzel, ein Bereich mit Projekt, ein Bereich, den der Dienst nicht kennt. */
const ORDNER = [
  {
    id: 1,
    kennung: 'firma',
    name: 'Firma',
    ebene: 0,
    eltern_id: null,
    art: 'wurzel',
    raum_id: 'r-firma',
    pfad: '',
    eltern_kennung: null,
    rechte_anzahl: 0,
  },
  {
    id: 2,
    kennung: 'projekte',
    name: 'Projekte',
    ebene: 1,
    eltern_id: null,
    art: 'geteilt',
    raum_id: 'r-projekte',
    pfad: 'projekte',
    eltern_kennung: null,
    rechte_anzahl: 1,
  },
  {
    id: 3,
    kennung: 'vicona',
    name: 'Vicona',
    ebene: 2,
    eltern_id: 2,
    art: 'geteilt',
    raum_id: 'r-projekte',
    pfad: 'vicona',
    eltern_kennung: 'projekte',
    rechte_anzahl: 1,
  },
  {
    id: 4,
    kennung: 'neu',
    name: 'Neu',
    ebene: 1,
    eltern_id: null,
    art: 'geteilt',
    raum_id: null,
    pfad: 'neu',
    eltern_kennung: null,
    rechte_anzahl: 0,
  },
];

/** Die Liste der Raeume, wie der Orin sie am 28.09.2026 nannte (gekuerzt). */
function drives(quoten) {
  return {
    value: [
      {
        driveType: 'personal',
        id: 'p1',
        quota: { total: 0, used: 0, remaining: 9223372036854776000 },
      },
      { driveType: 'virtual', id: 'v1' },
      ...Object.entries(quoten).map(([id, q]) => ({
        driveType: 'project',
        id,
        quota: { state: 'normal', ...q },
      })),
    ],
  };
}

/** Antworten der Reihe nach; jede Anfrage wird mitgeschrieben. */
function reihe(...antworten) {
  const liste = [...antworten];
  global.fetch.mockImplementation(() => {
    const a = liste.shift() || { status: 200, koerper: {} };
    return Promise.resolve({
      ok: a.status < 400,
      status: a.status,
      text: async () => (a.koerper === undefined ? '' : JSON.stringify(a.koerper)),
    });
  });
}

/** Die Datenbank: Ordnerliste, ein Ordner nach Kennung, die Rechte eines Menschen. */
function datenbank({ rechte = [] } = {}) {
  db.query.mockImplementation(async (sql, werte = []) => {
    if (sql.includes('WHERE o.id = $1')) {
      return { rows: ORDNER.filter(o => o.id === Number(werte[0])) };
    }
    if (sql.includes('WHERE o.art = $1')) {
      return { rows: ORDNER.filter(o => o.art === werte[0]) };
    }
    if (sql.includes('FROM public.firmenordner_rechte r') && sql.includes('r.user_id = $1')) {
      return { rows: rechte };
    }
    if (sql.includes('FROM public.firmenordner_ordner o')) {
      return { rows: ORDNER };
    }
    return { rows: [] };
  });
}

let statfs;
beforeEach(() => {
  db.query.mockReset();
  global.fetch = jest.fn();
  firmenordnerAn();
  statfs = jest
    .spyOn(fs.promises, 'statfs')
    .mockResolvedValue({ bavail: 500 * 1000, bsize: 1000 * 1000 }); // 500 GB frei
});
afterEach(() => statfs.mockRestore());

describe('Die Vorgabe fuer einen neuen Raum', () => {
  it('legt einen Raum mit 100 GB an, nicht mit der 1 GB des Dienstes', async () => {
    reihe({ status: 201, koerper: { id: 'r-neu' } });
    await dienst.legeRaumAn('neu');
    const koerper = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(koerper.quota).toEqual({ total: 100 * GB });
    expect(dienst.GRENZE_VORGABE_BYTES).toBe(100 * GB);
  });
});

describe('Belegt und Grenze aus der Liste des Dienstes', () => {
  it('liest nur Raeume der Art project, und total 0 ist ohne Grenze', async () => {
    reihe({
      status: 200,
      koerper: drives({
        'r-firma': { total: 1 * GB, used: 111702 },
        'r-projekte': { total: 0, used: 31, remaining: 9223372036854776000 },
      }),
    });
    const g = await dienst.groessen();
    expect([...g.keys()]).toEqual(['r-firma', 'r-projekte']);
    expect(g.get('r-firma')).toEqual({ belegt: 111702, grenze: 1 * GB, zustand: 'normal' });
    expect(g.get('r-projekte').grenze).toBeNull();
  });

  it('blaettert, solange der Dienst eine naechste Seite nennt', async () => {
    reihe(
      {
        status: 200,
        koerper: {
          ...drives({ a: { total: GB, used: 1 } }),
          '@odata.nextLink': 'http://firmenordner:9200/graph/v1.0/drives?$skiptoken=2',
        },
      },
      { status: 200, koerper: drives({ b: { total: GB, used: 2 } }) }
    );
    const g = await dienst.groessen();
    expect([...g.keys()]).toEqual(['a', 'b']);
    expect(String(global.fetch.mock.calls[1][0])).toContain('$skiptoken=2');
  });

  it('setzt die Grenze per PATCH, und null wird zu total 0', async () => {
    reihe({ status: 200, koerper: { quota: { total: 0, used: 5 } } });
    const r = await dienst.setzeGrenze('9eb$2c!1', null);
    const [url, opt] = global.fetch.mock.calls[0];
    expect(opt.method).toBe('PATCH');
    expect(String(url)).toContain('/graph/v1.0/drives/9eb%242c!1');
    expect(JSON.parse(opt.body)).toEqual({ quota: { total: 0 } });
    expect(r).toEqual({ belegt: 5, grenze: null });
  });
});

describe('Die Uebersicht der Verwaltung', () => {
  it('nennt je Hauptordner und Bereich belegt, Grenze, frei und Stufe', async () => {
    datenbank();
    reihe({
      status: 200,
      koerper: drives({
        'r-firma': { total: 1 * GB, used: 950 * MB },
        'r-projekte': { total: 0, used: 31 },
      }),
    });
    const u = await verwaltung.platzUebersicht();
    expect(u.erreichbar).toBe(true);
    expect(u.vorgabe).toBe(100 * GB);
    expect(u.platte.frei).toBe(500 * GB);
    // Das Projekt fehlt (es teilt den Raum seines Bereichs), und „neu" auch:
    // der Dienst kennt es noch nicht.
    expect(u.ordner.map(o => o.kennung)).toEqual(['firma', 'projekte']);
    expect(u.ordner[0]).toMatchObject({
      belegt: 950 * MB,
      grenze: 1 * GB,
      frei: 50 * MB,
      begrenzt_durch: 'grenze',
      stufe: 'knapp',
    });
    // Ohne Grenze ist frei der Platz der Platte, und nicht die int64-Zahl des Dienstes.
    expect(u.ordner[1]).toMatchObject({
      grenze: null,
      frei: 500 * GB,
      begrenzt_durch: 'platte',
      stufe: 'gut',
    });
  });

  it('verspricht nie mehr, als die Platte hat', async () => {
    datenbank();
    statfs.mockResolvedValue({ bavail: 3, bsize: GB }); // 3 GB frei
    reihe({ status: 200, koerper: drives({ 'r-projekte': { total: 100 * GB, used: 0 } }) });
    const u = await verwaltung.platzUebersicht();
    expect(u.ordner[0]).toMatchObject({ frei: 3 * GB, begrenzt_durch: 'platte', stufe: 'knapp' });
  });

  it('zeigt voll, wenn nichts mehr hineinpasst', async () => {
    datenbank();
    reihe({ status: 200, koerper: drives({ 'r-projekte': { total: GB, used: GB + 5 } }) });
    const u = await verwaltung.platzUebersicht();
    expect(u.ordner[0]).toMatchObject({ frei: 0, stufe: 'voll' });
  });

  it('antwortet der Dienst nicht, ist die Liste leer und erreichbar false', async () => {
    datenbank();
    reihe({ status: 500, koerper: {} });
    const u = await verwaltung.platzUebersicht();
    expect(u).toMatchObject({ erreichbar: false, ordner: [] });
  });
});

describe('Die Grenze setzen', () => {
  it('setzt sie im Raum des Bereichs und nennt vorher und nachher', async () => {
    datenbank();
    reihe(
      { status: 200, koerper: drives({ 'r-projekte': { total: GB, used: 10 * MB } }) },
      { status: 200, koerper: { quota: { total: 50 * MB, used: 10 * MB } } }
    );
    const r = await verwaltung.setzeGrenze(2, 50 * MB);
    expect(r).toMatchObject({ kennung: 'projekte', vorher: GB, grenze: 50 * MB, frei: 40 * MB });
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ quota: { total: 50 * MB } });
  });

  it('weist eine Grenze unter dem Belegten mit Satz ab', async () => {
    datenbank();
    reihe({ status: 200, koerper: drives({ 'r-projekte': { total: GB, used: 60 * MB } }) });
    await expect(verwaltung.setzeGrenze(2, 50 * MB)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('liegen schon 60 MB'),
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('ein Projekt hat keine eigene Grenze', async () => {
    datenbank();
    await expect(verwaltung.setzeGrenze(3, 50 * MB)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Grenze seines Bereichs'),
    });
  });

  it('ein Bereich, den der Dienst noch nicht kennt, sagt, was zu tun ist', async () => {
    datenbank();
    await expect(verwaltung.setzeGrenze(4, 50 * MB)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Jetzt nachholen'),
    });
  });
});

describe('Passt das noch hinein? (die Frage des Kits)', () => {
  const RECHTE = [
    {
      kennung: 'projekte',
      name: 'Projekte',
      ebene: 1,
      art: 'geteilt',
      recht: 'schreiben',
      eltern_kennung: null,
      pfad: 'projekte',
    },
    {
      kennung: 'vicona',
      name: 'Vicona',
      ebene: 2,
      art: 'geteilt',
      recht: 'schreiben',
      eltern_kennung: 'projekte',
      pfad: 'projekte/vicona',
    },
  ];

  function voll() {
    datenbank({ rechte: RECHTE });
    reihe({
      status: 200,
      koerper: drives({
        'r-firma': { total: GB, used: 0 },
        'r-projekte': { total: 50 * MB, used: 10 * MB },
      }),
    });
  }

  it('nennt je eigenen Ordner belegt und Grenze, ein Projekt nur frei', async () => {
    voll();
    const ordner = await verwaltung.meineOrdnerMitPlatz(7, 'mitarbeiter');
    const nach = Object.fromEntries(ordner.map(o => [o.pfad, o.platz]));
    expect(nach['']).toMatchObject({ belegt: 0, grenze: GB, im_bereich: false });
    expect(nach.projekte).toMatchObject({ belegt: 10 * MB, grenze: 50 * MB, frei: 40 * MB });
    // Wer nur das Projekt hat, sieht den Bereich nicht -- auch nicht, wie voll er ist.
    expect(nach['projekte/vicona']).toMatchObject({
      belegt: null,
      grenze: null,
      frei: 40 * MB,
      im_bereich: true,
    });
  });

  it('antwortet mit passt, wenn es hineinpasst', async () => {
    voll();
    const r = await verwaltung.passt({
      benutzerId: 7,
      rolle: 'mitarbeiter',
      pfad: 'projekte',
      bytes: 30 * MB,
    });
    expect(r).toMatchObject({ passt: true, frei: 40 * MB });
  });

  it('weist ab mit 409 GRENZE_ERREICHT und einem Satz in Kundensprache', async () => {
    voll();
    const fehler = await verwaltung
      .passt({ benutzerId: 7, rolle: 'mitarbeiter', pfad: 'projekte', bytes: 60 * MB })
      .catch(e => e);
    expect(fehler.statusCode).toBe(409);
    expect(fehler.code).toBe('GRENZE_ERREICHT');
    expect(fehler.message).toBe(
      '„projekte“ ist zu voll: frei sind noch 40 MB, gebraucht werden 60 MB. Ihr Administrator kann die Grenze unter Einstellungen → Firmenordner anheben.'
    );
    expect(fehler.details).toMatchObject({ frei: 40 * MB, grenze: 50 * MB, bytes: 60 * MB });
  });

  it('ein Projekt spricht vom Bereich, ohne seinen Namen zu nennen', async () => {
    voll();
    const fehler = await verwaltung
      .passt({ benutzerId: 7, rolle: 'mitarbeiter', pfad: 'projekte/vicona', bytes: 60 * MB })
      .catch(e => e);
    expect(fehler.message).toContain('Der Bereich, in dem „projekte/vicona“ liegt, ist zu voll');
    expect(fehler.details).toMatchObject({ belegt: null, grenze: null });
  });

  it('ist die Platte die engere Zahl, hilft kein Anheben der Grenze', async () => {
    voll();
    statfs.mockResolvedValue({ bavail: 20, bsize: MB }); // 20 MB frei
    const fehler = await verwaltung
      .passt({ benutzerId: 7, rolle: 'mitarbeiter', pfad: 'projekte', bytes: 30 * MB })
      .catch(e => e);
    expect(fehler.code).toBe('GRENZE_ERREICHT');
    expect(fehler.message).toContain('Auf dem Gerät ist nicht mehr genug Platz');
  });

  it('einen fremden Ordner gibt es fuer ihn nicht', async () => {
    voll();
    await expect(
      verwaltung.passt({ benutzerId: 7, rolle: 'mitarbeiter', pfad: 'buchhaltung', bytes: 1 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('Groessen, wie ein Mensch sie liest', () => {
  it('dezimal wie der Dienst, deutsche Zahl', () => {
    expect(verwaltung.groesseLesbar(50 * MB)).toBe('50 MB');
    expect(verwaltung.groesseLesbar(1.5 * GB)).toBe('1,5 GB');
    expect(verwaltung.groesseLesbar(100 * GB)).toBe('100 GB');
    expect(verwaltung.groesseLesbar(31)).toBe('31 Bytes');
  });
});
