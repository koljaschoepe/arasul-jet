/**
 * Das Entwickler-Cockpit (J44, M7, Karte entwickler-cockpit).
 *
 * Belegt wird, was die Karte verlangt und das Backend traegt:
 *   - die mitgelieferte App sieht nur, wer das Kennzeichen Entwickler traegt,
 *     auch ohne Admin-Rolle -- ohne Kennzeichen weder in `/meine` noch ueber
 *     die Adresse (403), auch nicht als Administrator;
 *   - ihre Kennung ist fuer Pakete vergeben;
 *   - Stand und Ablehnungsgrund setzt ein Entwickler am Geraet;
 *   - die Uebersicht je App mit Test, Live, offenen Meldungen und „Test neuer".
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
  a.use('/api/entwickler', require('../../src/routes/entwickler'));
  a.use('/apps', require('../../src/routes/appAusliefern'));
  a.use(errorHandler);
  return a;
};

let ordner;
function cockpitGebaut() {
  const wurzel = path.join(ordner, 'entwickler-cockpit');
  fs.mkdirSync(path.join(wurzel, 'frontend'), { recursive: true });
  fs.writeFileSync(
    path.join(wurzel, 'app.json'),
    JSON.stringify({
      schema: 1,
      id: 'entwickler-cockpit',
      name: 'Entwickler-Cockpit',
      version: '1.0.0',
      frontend: { verzeichnis: 'frontend' },
      marken: '5',
      symbol: 'gauge',
    })
  );
  fs.writeFileSync(path.join(wurzel, 'frontend', 'index.html'), '<!doctype html><p>Cockpit</p>');
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

describe('die Kennung ist vergeben', () => {
  test('ein Manifest mit entwickler-cockpit wird abgewiesen, mit Satz', () => {
    const r = AppManifest.safeParse({
      schema: 1,
      id: 'entwickler-cockpit',
      name: 'Nachbau',
      version: '1.0.0',
      frontend: { verzeichnis: 'frontend' },
    });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toMatch(/vergeben/);
  });

  test('als Pfad und Parameter bleibt sie eine gültige Kennung', () => {
    expect(AppId.safeParse('entwickler-cockpit').success).toBe(true);
  });
});

describe('wer das Cockpit sieht', () => {
  test('ein Entwickler ohne Admin-Rolle: ja, ohne Blick in app_members', async () => {
    kennzeichen(true);
    await expect(
      appZugang.pruefe({ benutzerId: 2, appId: 'entwickler-cockpit', stand: 'live' })
    ).resolves.toMatchObject({ app_id: 'entwickler-cockpit', stand: 'live' });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).not.toMatch(/app_members/);
  });

  test('ein Administrator ohne Kennzeichen: 403 mit Grund für die Sperrseite', async () => {
    kennzeichen(false);
    await expect(
      appZugang.pruefe({ benutzerId: 1, appId: 'entwickler-cockpit', stand: 'live' })
    ).rejects.toMatchObject({ statusCode: 403, grund: 'nicht_freigegeben' });
  });

  test('einen Teststand gibt es nicht: 404', async () => {
    kennzeichen(true);
    await expect(
      appZugang.pruefe({ benutzerId: 2, appId: 'entwickler-cockpit', stand: 'test' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('/apps/entwickler-cockpit/ liefert die Seite an einen Entwickler', async () => {
    cockpitGebaut();
    kennzeichen(true);
    const res = await request(app()).get('/apps/entwickler-cockpit/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Cockpit');
  });

  test('ohne Kennzeichen ist die Adresse zu, auch für den Administrator', async () => {
    cockpitGebaut();
    mockAngemeldet = { ...CHEF };
    kennzeichen(false);
    const seite = await request(app()).get('/apps/entwickler-cockpit/').set('Accept', 'text/html');
    expect(seite.status).toBe(403);
    expect(seite.text).not.toContain('Cockpit</p>');

    kennzeichen(false);
    const datei = await request(app()).get('/apps/entwickler-cockpit/assets/app.js');
    expect(datei.status).toBe(403);
  });

  test('ohne Anmeldung: Umzug zur Anmeldung, nichts aus der App', async () => {
    cockpitGebaut();
    mockAngemeldet = null;
    const res = await request(app()).get('/apps/entwickler-cockpit/');
    expect(res.status).toBe(302);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('fehlt der Bau im Abbild, ist das 503 APP_DATEIEN_FEHLEN', async () => {
    kennzeichen(true);
    const res = await request(app()).get('/apps/entwickler-cockpit/');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('APP_DATEIEN_FEHLEN');
  });

  test('/meine: der Eintrag nur mit Kennzeichen und nur, wenn gebaut', async () => {
    expect(await mitgeliefert.fuerNutzer(2)).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();

    cockpitGebaut();
    kennzeichen(false);
    expect(await mitgeliefert.fuerNutzer(1)).toEqual([]);

    kennzeichen(true);
    const liste = await mitgeliefert.fuerNutzer(2);
    expect(liste).toEqual([
      expect.objectContaining({
        id: 'entwickler-cockpit',
        symbol: 'gauge',
        mitgeliefert: true,
        live: { version: '1.0.0', pfad: '/apps/entwickler-cockpit/', api: null },
        test: null,
      }),
    ]);
  });
});

describe('PATCH /api/rueckmeldungen/:id: Stand setzen im Cockpit', () => {
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

  test('ohne Kennzeichen: 403, auch als Administrator, und nichts geändert', async () => {
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

describe('GET /api/entwickler/apps', () => {
  test('ohne Kennzeichen: 403', async () => {
    mockAngemeldet = { ...CHEF };
    kennzeichen(false);
    expect((await request(app()).get('/api/entwickler/apps')).status).toBe(403);
  });

  test('je App Test und Live, offene Meldungen, und ob Test neuer ist', async () => {
    cockpitGebaut();
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
          { app_id: 'entwickler-cockpit', offen: 1, neu: 1, umgesetzt: 0 },
        ],
      });

    const res = await request(app()).get('/api/entwickler/apps');
    expect(res.status).toBe(200);
    const [belege, probe, neu, cockpit] = res.body.data;
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
    expect(cockpit).toMatchObject({
      id: 'entwickler-cockpit',
      mitgeliefert: true,
      test_neuer: false,
      live: { version: '1.0.0' },
      meldungen: { offen: 1 },
    });
  });
});
