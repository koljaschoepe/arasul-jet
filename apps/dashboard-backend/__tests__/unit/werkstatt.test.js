/**
 * Die Werkstatt (J44, M7, Karte entwickler-cockpit; seit J52, Karte
 * werkstatt-und-rechte, heisst sie Werkstatt und steht allen offen).
 *
 * Belegt wird, was die Karten verlangen und das Backend traegt:
 *   - die mitgelieferte App oeffnet jede aktive Person, mit oder ohne das
 *     Recht in der Werkstatt, in `/meine` und ueber die Adresse;
 *   - die alte Adresse `/apps/entwickler-cockpit/` zieht um, vor der Anmeldung;
 *   - neue und alte Kennung sind fuer Pakete vergeben;
 *   - Stand und Ablehnungsgrund setzt nur, wer das Recht hat;
 *   - `/api/werkstatt/ich` sagt, ob das Recht da ist;
 *   - die Uebersicht je App mit Test, Live, offenen Meldungen und „Test neuer"
 *     nur mit dem Recht.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/auditLog', () => ({ logSecurityEvent: jest.fn() }));

let mockAngemeldet = null;
jest.mock('../../src/middleware/auth', () => {
  const echt = jest.requireActual('../../src/middleware/auth');
  const setze = (req, res, next) => {
    if (mockAngemeldet) {
      req.user = { ...mockAngemeldet };
    }
    next();
  };
  return {
    requireAuth: setze,
    optionalAuth: setze,
    requireRole: echt.requireRole,
    ROLLEN: echt.ROLLEN,
  };
});

const db = require('../../src/database');
const { logSecurityEvent } = require('../../src/utils/auditLog');
const { errorHandler } = require('../../src/middleware/errorHandler');
const mitgeliefert = require('../../src/services/app/mitgeliefert');
const appZugang = require('../../src/services/app/appZugang');
const { AppManifest, AppId } = require('../../src/schemas/apps');

const MIA = { id: '2', username: 'mia', role: 'mitarbeiter' };
const CHEF = { id: '1', username: 'chef', role: 'admin' };

const app = () => {
  const a = express();
  a.use(express.json());
  a.use('/api/rueckmeldungen', require('../../src/routes/rueckmeldungen'));
  a.use('/api/werkstatt', require('../../src/routes/werkstatt'));
  a.use('/apps', require('../../src/routes/appAusliefern'));
  a.use(errorHandler);
  return a;
};

let ordner;
function werkstattGebaut() {
  const wurzel = path.join(ordner, 'werkstatt');
  fs.mkdirSync(path.join(wurzel, 'frontend'), { recursive: true });
  fs.writeFileSync(
    path.join(wurzel, 'app.json'),
    JSON.stringify({
      schema: 1,
      id: 'werkstatt',
      name: 'Werkstatt',
      version: '2.0.0',
      frontend: { verzeichnis: 'frontend' },
      marken: '5',
      symbol: 'hammer',
    })
  );
  fs.writeFileSync(path.join(wurzel, 'frontend', 'index.html'), '<!doctype html><p>Werkstatt</p>');
}

beforeEach(() => {
  db.query.mockReset();
  logSecurityEvent.mockClear();
  ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'mitgeliefert-'));
  mitgeliefert._setzeVerzeichnis(ordner);
  mockAngemeldet = { ...MIA };
});
afterEach(() => {
  fs.rmSync(ordner, { recursive: true, force: true });
});

const kennzeichen = wert => db.query.mockResolvedValueOnce({ rows: [{ entwickler: wert }] });
/** `istAktiv` in `mitgeliefert.js`: eine Zeile, wenn die Person aktiv ist. */
const aktiv = (ja = true) => db.query.mockResolvedValueOnce({ rows: ja ? [{ '?column?': 1 }] : [] });

describe('die Kennung ist vergeben, die neue und die alte', () => {
  test.each(['werkstatt', 'entwickler-cockpit'])(
    'ein Manifest mit %s wird abgewiesen, mit Satz',
    id => {
      const r = AppManifest.safeParse({
        schema: 1,
        id,
        name: 'Nachbau',
        version: '1.0.0',
        frontend: { verzeichnis: 'frontend' },
      });
      expect(r.success).toBe(false);
      expect(r.error.issues[0].message).toMatch(/vergeben/);
    }
  );

  test('als Pfad und Parameter bleibt sie eine gültige Kennung', () => {
    expect(AppId.safeParse('werkstatt').success).toBe(true);
  });
});

describe('die alte Adresse zieht um', () => {
  test.each([
    ['/apps/entwickler-cockpit/', '/apps/werkstatt/'],
    ['/apps/entwickler-cockpit', '/apps/werkstatt/'],
    ['/apps/entwickler-cockpit/assets/app.js', '/apps/werkstatt/assets/app.js'],
    ['/apps/entwickler-cockpit/?x=1#apps', '/apps/werkstatt/?x=1'],
  ])('%s -> %s, dauerhaft und vor der Anmeldung', async (alt, neu) => {
    mockAngemeldet = null;
    const res = await request(app()).get(alt);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(neu);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('wer die Werkstatt öffnet: jede aktive Person', () => {
  test('ein Mitarbeiter ohne das Recht: ja, ohne Blick in app_members oder das Kennzeichen', async () => {
    aktiv();
    await expect(
      appZugang.pruefe({ benutzerId: 2, appId: 'werkstatt', stand: 'live' })
    ).resolves.toMatchObject({ app_id: 'werkstatt', stand: 'live' });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).not.toMatch(/app_members|entwickler/);
  });

  test('ein gesperrtes Konto: 403 mit Grund für die Sperrseite', async () => {
    aktiv(false);
    await expect(
      appZugang.pruefe({ benutzerId: 1, appId: 'werkstatt', stand: 'live' })
    ).rejects.toMatchObject({ statusCode: 403, grund: 'nicht_freigegeben' });
  });

  test('einen Teststand gibt es nicht: 404', async () => {
    aktiv();
    await expect(
      appZugang.pruefe({ benutzerId: 2, appId: 'werkstatt', stand: 'test' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('/apps/werkstatt/ liefert die Seite an jeden, Mitarbeiter wie Administrator', async () => {
    werkstattGebaut();
    for (const wer of [MIA, CHEF]) {
      mockAngemeldet = { ...wer };
      aktiv();
      const res = await request(app()).get('/apps/werkstatt/');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Werkstatt');
    }
  });

  test('ohne Anmeldung: Umzug zur Anmeldung, nichts aus der App', async () => {
    werkstattGebaut();
    mockAngemeldet = null;
    const res = await request(app()).get('/apps/werkstatt/');
    expect(res.status).toBe(302);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('fehlt der Bau im Abbild, ist das 503 APP_DATEIEN_FEHLEN', async () => {
    aktiv();
    const res = await request(app()).get('/apps/werkstatt/');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('APP_DATEIEN_FEHLEN');
  });

  test('/meine: der Eintrag für jede aktive Person, nur wenn gebaut', async () => {
    expect(await mitgeliefert.fuerNutzer(2)).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();

    werkstattGebaut();
    aktiv(false);
    expect(await mitgeliefert.fuerNutzer(1)).toEqual([]);

    aktiv();
    const liste = await mitgeliefert.fuerNutzer(2);
    expect(liste).toEqual([
      expect.objectContaining({
        id: 'werkstatt',
        name: 'Werkstatt',
        symbol: 'hammer',
        mitgeliefert: true,
        live: { version: '2.0.0', pfad: '/apps/werkstatt/', api: null },
        test: null,
      }),
    ]);
  });
});

describe('GET /api/werkstatt/ich', () => {
  test.each([
    [true, true],
    [false, false],
  ])('Kennzeichen %s -> recht %s', async (wert, recht) => {
    kennzeichen(wert);
    const res = await request(app()).get('/api/werkstatt/ich');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ recht });
  });
});

describe('PATCH /api/rueckmeldungen/:id: Stand setzen in der Werkstatt', () => {
  const zeile = (ueber = {}) => ({
    id: '7',
    app_id: 'belege',
    app_name: 'Belege',
    stand: 'live',
    seite: '/apps/belege/',
    text: 'Filter fehlt',
    bild: null,
    markierung: null,
    person_id: '3',
    username: 'ole',
    vorname: 'Ole',
    nachname: 'Beispiel',
    stand_meldung: 'abgelehnt',
    grund: 'Gibt es schon.',
    stand_geaendert_am: '2026-11-20T12:00:00Z',
    erstellt_am: '2026-11-20T10:00:00Z',
    ...ueber,
  });

  test('ohne das Recht: 403, auch als Administrator, und nichts geändert', async () => {
    for (const wer of [MIA, CHEF]) {
      mockAngemeldet = { ...wer };
      kennzeichen(false);
      const res = await request(app())
        .patch('/api/rueckmeldungen/7')
        .send({ stand_meldung: 'angenommen' });
      expect(res.status).toBe(403);
    }
    expect(db.query.mock.calls.every(([sql]) => !/UPDATE/.test(sql))).toBe(true);
  });

  test('abgelehnt ohne Grund: 400', async () => {
    kennzeichen(true);
    const res = await request(app())
      .patch('/api/rueckmeldungen/7')
      .send({ stand_meldung: 'abgelehnt' });
    expect(res.status).toBe(400);
  });

  test('abgelehnt mit Grund: gesetzt, mit Person und Protokoll', async () => {
    kennzeichen(true);
    db.query
      .mockResolvedValueOnce({ rows: [{ id: '7', app_id: 'belege', vorher: 'neu' }] })
      .mockResolvedValueOnce({ rows: [zeile()] });
    const res = await request(app())
      .patch('/api/rueckmeldungen/7')
      .send({ stand_meldung: 'abgelehnt', grund: 'Gibt es schon.' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: 7,
      stand_meldung: 'abgelehnt',
      grund: 'Gibt es schon.',
      vorher: 'neu',
    });
    expect(db.query.mock.calls[1][1]).toEqual([7, 'abgelehnt', 'Gibt es schon.', 'person:2']);
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '2',
        action: 'rueckmeldung_stand_gesetzt',
        details: expect.objectContaining({ vorher: 'neu', nachher: 'abgelehnt', mit_grund: true }),
      })
    );
  });

  test('ein neuer Stand ohne Grund löscht den alten', async () => {
    kennzeichen(true);
    db.query
      .mockResolvedValueOnce({ rows: [{ id: '7', app_id: 'belege', vorher: 'abgelehnt' }] })
      .mockResolvedValueOnce({ rows: [zeile({ stand_meldung: 'angenommen', grund: null })] });
    const res = await request(app())
      .patch('/api/rueckmeldungen/7')
      .send({ stand_meldung: 'angenommen' });
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[1][1][2]).toBeNull();
  });

  test('eine unbekannte Meldung: 404', async () => {
    kennzeichen(true);
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app())
      .patch('/api/rueckmeldungen/99')
      .send({ stand_meldung: 'umgesetzt' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/werkstatt/apps', () => {
  test('ohne das Recht: 403, auch als Administrator', async () => {
    for (const wer of [MIA, CHEF]) {
      mockAngemeldet = { ...wer };
      kennzeichen(false);
      expect((await request(app()).get('/api/werkstatt/apps')).status).toBe(403);
    }
  });

  test('je App Test und Live, offene Meldungen, und ob Test neuer ist', async () => {
    werkstattGebaut();
    kennzeichen(true);
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'belege',
            name: 'Belege',
            live_version: '1.0.0',
            live_am: '2026-11-01T10:00:00Z',
            live_text: null,
            live_manifest: { symbol: 'receipt' },
            test_version: '1.1.0',
            test_am: '2026-11-19T10:00:00Z',
            test_text: 'Filter nach Monat.',
            test_manifest: {},
            schaltung_ergebnis: null,
          },
          {
            id: 'probe',
            name: 'Probe',
            live_version: '2.0.0',
            live_am: '2026-11-18T10:00:00Z',
            live_text: 'x',
            live_manifest: {},
            test_version: '2.0.0',
            test_am: '2026-11-17T10:00:00Z',
            test_text: 'x',
            test_manifest: {},
            schaltung_ergebnis: 'live',
            schaltung_satz: null,
            schaltung_nach: '2.0.0',
            schaltung_am: '2026-11-18T10:00:00Z',
          },
          {
            id: 'neu',
            name: 'Neu',
            live_version: null,
            test_version: '0.1.0',
            test_am: '2026-11-20T09:00:00Z',
            test_text: null,
            test_manifest: {},
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { app_id: 'belege', offen: 3, neu: 2, umgesetzt: 1 },
          { app_id: 'werkstatt', offen: 1, neu: 1, umgesetzt: 0 },
        ],
      });

    const res = await request(app()).get('/api/werkstatt/apps');
    expect(res.status).toBe(200);
    const [belege, probe, neu, werkstatt] = res.body.data;
    expect(belege).toMatchObject({
      symbol: 'receipt',
      test_neuer: true,
      zuletzt_geaendert: '2026-11-19T10:00:00Z',
      meldungen: { offen: 3, neu: 2, umgesetzt: 1 },
      test: { version: '1.1.0', aenderungstext: 'Filter nach Monat.' },
    });
    expect(probe).toMatchObject({
      test_neuer: false,
      meldungen: { offen: 0 },
      letzte_schaltung: { ergebnis: 'live' },
    });
    expect(neu).toMatchObject({ test_neuer: true, live: null });
    expect(werkstatt).toMatchObject({
      id: 'werkstatt',
      name: 'Werkstatt',
      mitgeliefert: true,
      test_neuer: false,
      live: { version: '2.0.0' },
      meldungen: { offen: 1 },
    });
  });
});
