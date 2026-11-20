/**
 * Die Rueckmeldungen fuer das Kit (J43, M7, Karte rueckmeldung-schnittstelle).
 *
 * Was die Karte als `fertig` verlangt und hier belegt wird:
 *   - nur ein Schluessel mit dem Bereich `feedback:agent` liest; `app:deploy`
 *     allein bekommt 403;
 *   - ist der Schalter der App aus, enthaelt die Antwort weder Bild noch
 *     Markierung noch einen Verweis darauf -- nicht einmal den Namen der
 *     Datei, gesucht im ganzen Text der Antwort; der Abholweg antwortet 403;
 *   - ist er an, kommt der Weg zum Bild mit der Markierung, und das Bild selbst;
 *   - der Stand laesst sich setzen, `abgelehnt` nur mit Grund;
 *   - jede Abfrage steht im Protokoll: wer, welche App, mit oder ohne Bilder.
 *
 * `requireEndpoint` ist das echte: es ist die Zusage, die hier gemessen wird.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/auditLog', () => ({ logSecurityEvent: jest.fn() }));

jest.mock('../../src/middleware/apiKeyAuth', () => {
  const echt = jest.requireActual('../../src/middleware/apiKeyAuth');
  const BEREICHE = {
    rueck: ['feedback:agent'],
    kit: ['app:deploy'],
    gebunden: ['feedback:agent'],
  };
  return {
    ...echt,
    requireApiKey: (req, res, next) => {
      const schluessel = req.headers['x-api-key'];
      if (!schluessel) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'API key required' } });
        return;
      }
      req.apiKey = {
        id: 3,
        prefix: 'aras_rueck12',
        name: 'Kit Rückmeldungen',
        userId: 1,
        allowedEndpoints: BEREICHE[schluessel] ?? [],
        appId: schluessel === 'gebunden' ? 'andere' : null,
        stand: null,
      };
      next();
    },
  };
});

const db = require('../../src/database');
const { logSecurityEvent } = require('../../src/utils/auditLog');
const router = require('../../src/routes/external/rueckmeldungen');
const { errorHandler } = require('../../src/middleware/errorHandler');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/v1/external', router);
  a.use(errorHandler);
  return a;
}

const BILDNAME = '0b6f7a52-3a4e-4c1b-9f0e-1d2c3b4a5f60.png';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

/** Zwei Meldungen: eine mit Bild und Markierung, eine ohne. */
const ZEILEN = [
  {
    id: '7',
    app_id: 'belege',
    stand: 'live',
    seite: '/apps/belege/?ansicht=offen',
    text: 'Hier fehlt ein Filter nach Monat.',
    bild: BILDNAME,
    markierung: { x: 0.1, y: 0.2, breite: 0.3, hoehe: 0.1 },
    person_id: '2',
    username: 'mia',
    vorname: 'Mia',
    nachname: 'Muster',
    stand_meldung: 'neu',
    grund: null,
    stand_geaendert_am: null,
    erstellt_am: '2026-11-20T10:00:00.000Z',
  },
  {
    id: '8',
    app_id: 'belege',
    stand: 'test',
    seite: '/apps/belege/test/',
    text: 'Der Knopf Speichern reagiert nicht.',
    bild: null,
    markierung: null,
    person_id: null,
    stand_meldung: 'angenommen',
    grund: null,
    stand_geaendert_am: '2026-11-20T11:00:00.000Z',
    erstellt_am: '2026-11-20T10:30:00.000Z',
  },
];

/** Die Datenbank, nach Abfrage beantwortet. `bilderAn` ist der Schalter der App. */
function datenbank({ bilderAn, appDa = true, meldungDa = true }) {
  db.query.mockImplementation(async (sql, werte) => {
    if (/FROM public\.apps WHERE id/.test(sql)) {
      return {
        rows: appDa ? [{ id: 'belege', name: 'Belege', bilder_an_agenten: bilderAn }] : [],
      };
    }
    if (/WITH alt AS/.test(sql)) {
      return { rows: meldungDa ? [{ id: werte[0], vorher: 'neu' }] : [] };
    }
    if (/SELECT id FROM public\.rueckmeldungen WHERE id = \$1 AND app_id/.test(sql)) {
      return { rows: meldungDa ? [{ id: werte[0] }] : [] };
    }
    if (/SELECT bild FROM public\.rueckmeldungen/.test(sql)) {
      return { rows: [{ bild: BILDNAME }] };
    }
    if (/WHERE r\.id = \$1/.test(sql)) {
      return {
        rows: [{ ...ZEILEN[0], stand_meldung: 'abgelehnt', grund: 'Gibt es schon unter Filter.' }],
      };
    }
    if (/WHERE r\.app_id = \$1/.test(sql)) {
      return { rows: ZEILEN };
    }
    throw new Error(`Unerwartete Abfrage: ${sql}`);
  });
}

let ordner;
beforeEach(() => {
  db.query.mockReset();
  logSecurityEvent.mockReset();
  ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'rueckmeldungen-kit-'));
  process.env.APPS_DIR = ordner;
  fs.mkdirSync(path.join(ordner, '.rueckmeldungen'));
  fs.writeFileSync(path.join(ordner, '.rueckmeldungen', BILDNAME), PNG);
});
afterEach(() => {
  fs.rmSync(ordner, { recursive: true, force: true });
  delete process.env.APPS_DIR;
});

describe('Wer darf lesen', () => {
  test('ohne Schlüssel 401', async () => {
    const res = await request(app()).get('/api/v1/external/apps/belege/rueckmeldungen');
    expect(res.status).toBe(401);
  });

  test('ein Schlüssel, der nur ausrollen darf (app:deploy), bekommt 403 und keine Abfrage', async () => {
    datenbank({ bilderAn: true });
    const res = await request(app())
      .get('/api/v1/external/apps/belege/rueckmeldungen')
      .set('X-API-Key', 'kit');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
    const bild = await request(app())
      .get('/api/v1/external/apps/belege/rueckmeldungen/7/bild')
      .set('X-API-Key', 'kit');
    expect(bild.status).toBe(403);
    const stand = await request(app())
      .patch('/api/v1/external/apps/belege/rueckmeldungen/7')
      .set('X-API-Key', 'kit')
      .send({ stand_meldung: 'angenommen' });
    expect(stand.status).toBe(403);
  });

  test('ein an eine andere App gebundener Schlüssel bekommt 403', async () => {
    datenbank({ bilderAn: true });
    const res = await request(app())
      .get('/api/v1/external/apps/belege/rueckmeldungen')
      .set('X-API-Key', 'gebunden');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('eine App, die es nicht gibt: 404', async () => {
    datenbank({ bilderAn: false, appDa: false });
    const res = await request(app())
      .get('/api/v1/external/apps/gibtsnicht/rueckmeldungen')
      .set('X-API-Key', 'rueck');
    expect(res.status).toBe(404);
  });
});

describe('Schalter aus (Vorgabe): kein Bild, keine Markierung, kein Verweis', () => {
  test('die Liste trägt Text, Seite, Person, Zeit und Stand, aber nichts vom Bild', async () => {
    datenbank({ bilderAn: false });
    const res = await request(app())
      .get('/api/v1/external/apps/belege/rueckmeldungen')
      .set('X-API-Key', 'rueck');
    expect(res.status).toBe(200);
    expect(res.body.data.bilder_an_agenten).toBe(false);
    expect(res.body.data.anzahl).toBe(2);
    const [erste, zweite] = res.body.data.meldungen;
    expect(erste).toEqual({
      id: 7,
      app_id: 'belege',
      stand: 'live',
      seite: '/apps/belege/?ansicht=offen',
      text: 'Hier fehlt ein Filter nach Monat.',
      person: { id: 2, anzeigeName: 'Mia Muster' },
      erstellt_am: '2026-11-20T10:00:00.000Z',
      stand_meldung: 'neu',
      grund: null,
      stand_geaendert_am: null,
    });
    expect(zweite.person).toBeNull();
    for (const m of res.body.data.meldungen) {
      expect(m).not.toHaveProperty('bild');
      expect(m).not.toHaveProperty('markierung');
      expect(m).not.toHaveProperty('hat_bild');
    }
    // Im ganzen Text der Antwort: kein Dateiname, kein Weg, keine Markierung.
    const roh = JSON.stringify(res.body);
    expect(roh).not.toMatch(/\.png/);
    expect(roh).not.toMatch(/\/bild/);
    expect(roh).not.toMatch(/markierung|breite|hoehe/);
  });

  test('der Abholweg des Bildes antwortet 403, ohne nach der Meldung zu fragen', async () => {
    datenbank({ bilderAn: false });
    const res = await request(app())
      .get('/api/v1/external/apps/belege/rueckmeldungen/7/bild')
      .set('X-API-Key', 'rueck');
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Einstellungen › Apps/);
    expect(db.query.mock.calls.some(([sql]) => /rueckmeldungen/.test(sql))).toBe(false);
  });

  test('auch die Antwort auf einen gesetzten Stand nennt kein Bild', async () => {
    datenbank({ bilderAn: false });
    const res = await request(app())
      .patch('/api/v1/external/apps/belege/rueckmeldungen/7')
      .set('X-API-Key', 'rueck')
      .send({ stand_meldung: 'abgelehnt', grund: 'Gibt es schon unter Filter.' });
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('bild');
    expect(JSON.stringify(res.body)).not.toMatch(/\.png|markierung/);
  });
});

describe('Schalter an', () => {
  test('je Meldung der Weg zum Bild mit Markierung, ohne Foto null', async () => {
    datenbank({ bilderAn: true });
    const res = await request(app())
      .get('/api/v1/external/apps/belege/rueckmeldungen')
      .set('X-API-Key', 'rueck');
    expect(res.status).toBe(200);
    expect(res.body.data.bilder_an_agenten).toBe(true);
    const [erste, zweite] = res.body.data.meldungen;
    expect(erste.bild).toEqual({
      weg: '/api/v1/external/apps/belege/rueckmeldungen/7/bild',
      format: 'png',
      markierung: { x: 0.1, y: 0.2, breite: 0.3, hoehe: 0.1 },
    });
    expect(zweite.bild).toBeNull();
    // Der Dateiname am Gerät geht trotzdem nicht hinaus.
    expect(JSON.stringify(res.body)).not.toContain(BILDNAME);
  });

  test('das Bild kommt als PNG', async () => {
    datenbank({ bilderAn: true });
    const res = await request(app())
      .get('/api/v1/external/apps/belege/rueckmeldungen/7/bild')
      .set('X-API-Key', 'rueck');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(Buffer.compare(res.body, PNG)).toBe(0);
  });

  test('eine Meldung einer anderen App: 404', async () => {
    datenbank({ bilderAn: true, meldungDa: false });
    const res = await request(app())
      .get('/api/v1/external/apps/belege/rueckmeldungen/99/bild')
      .set('X-API-Key', 'rueck');
    expect(res.status).toBe(404);
  });
});

describe('Filter', () => {
  test('stand_meldung als Liste mit Komma und stand gehen an die Abfrage', async () => {
    datenbank({ bilderAn: false });
    const res = await request(app())
      .get('/api/v1/external/apps/belege/rueckmeldungen?stand_meldung=neu,angenommen&stand=live')
      .set('X-API-Key', 'rueck');
    expect(res.status).toBe(200);
    const [, werte] = db.query.mock.calls.find(([sql]) => /WHERE r\.app_id = \$1/.test(sql));
    expect(werte).toEqual(['belege', ['neu', 'angenommen'], 'live', 200]);
  });

  test('ein unbekannter Stand ist 400', async () => {
    const res = await request(app())
      .get('/api/v1/external/apps/belege/rueckmeldungen?stand_meldung=erledigt')
      .set('X-API-Key', 'rueck');
    expect(res.status).toBe(400);
  });
});

describe('Stand setzen', () => {
  test('abgelehnt ohne Grund ist 400', async () => {
    datenbank({ bilderAn: false });
    const res = await request(app())
      .patch('/api/v1/external/apps/belege/rueckmeldungen/7')
      .set('X-API-Key', 'rueck')
      .send({ stand_meldung: 'abgelehnt' });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('angenommen: 200, Stand und Schlüssel gehen in die Zeile', async () => {
    datenbank({ bilderAn: false });
    const res = await request(app())
      .patch('/api/v1/external/apps/belege/rueckmeldungen/7')
      .set('X-API-Key', 'rueck')
      .send({ stand_meldung: 'angenommen' });
    expect(res.status).toBe(200);
    expect(res.body.data.vorher).toBe('neu');
    const [, werte] = db.query.mock.calls.find(([sql]) => /WITH alt AS/.test(sql));
    expect(werte).toEqual([7, 'belege', 'angenommen', null, 'schluessel:aras_rueck12']);
  });

  test('eine Meldung, die es zu dieser App nicht gibt: 404', async () => {
    datenbank({ bilderAn: false, meldungDa: false });
    const res = await request(app())
      .patch('/api/v1/external/apps/belege/rueckmeldungen/99')
      .set('X-API-Key', 'rueck')
      .send({ stand_meldung: 'umgesetzt' });
    expect(res.status).toBe(404);
  });
});

describe('Protokoll', () => {
  test('jede Abfrage: welcher Schlüssel, welche App, mit oder ohne Bilder, wie viele', async () => {
    datenbank({ bilderAn: false });
    await request(app())
      .get('/api/v1/external/apps/belege/rueckmeldungen')
      .set('X-API-Key', 'rueck');
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        action: 'rueckmeldungen_abgefragt',
        details: expect.objectContaining({
          schluessel: 'aras_rueck12',
          schluessel_name: 'Kit Rückmeldungen',
          app_id: 'belege',
          mit_bildern: false,
          anzahl: 2,
        }),
      })
    );
  });

  test('ein abgeholtes Bild und ein gesetzter Stand stehen auch darin', async () => {
    datenbank({ bilderAn: true });
    await request(app())
      .get('/api/v1/external/apps/belege/rueckmeldungen/7/bild')
      .set('X-API-Key', 'rueck');
    await request(app())
      .patch('/api/v1/external/apps/belege/rueckmeldungen/7')
      .set('X-API-Key', 'rueck')
      .send({ stand_meldung: 'umgesetzt' });
    const aktionen = logSecurityEvent.mock.calls.map(([e]) => e.action);
    expect(aktionen).toEqual(['rueckmeldung_bild_abgeholt', 'rueckmeldung_stand_gesetzt']);
    expect(logSecurityEvent.mock.calls[0][0].details).toMatchObject({
      app_id: 'belege',
      rueckmeldung: 7,
      mit_bildern: true,
    });
  });

  test('eine Abweisung schreibt keine Abfrage ins Protokoll', async () => {
    await request(app()).get('/api/v1/external/apps/belege/rueckmeldungen').set('X-API-Key', 'kit');
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });
});
