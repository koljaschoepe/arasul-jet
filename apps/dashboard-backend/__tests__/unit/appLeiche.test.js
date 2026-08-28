/**
 * Eine App, die registriert ist, gesund meldet und trotzdem nicht ausgeliefert
 * werden kann (Auftrag app-leiche, 28.08.2026).
 *
 * Der Befund am Orin: `urlaubsantrag` stand als test UND live in
 * `app_staende`, beide Container liefen und meldeten healthy, und
 * `/arasul/apps/urlaubsantrag/` gab es nicht. `GET /apps/urlaubsantrag/`
 * endete in INTERNAL_ERROR. Gemessen wird hier, dass das Geraet diesen Zustand
 * SIEHT und SAGT -- und dass der Weg, ihn loszuwerden, ohne Handgriff in der
 * Datenbank auskommt.
 */
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const APPS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-app-leiche-'));
process.env.APPS_DIR = APPS_DIR;

jest.mock('../../src/database', () => {
  const query = jest.fn();
  return { query, transaction: jest.fn(cb => cb({ query })) };
});
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/auditLog', () => ({ logSecurityEvent: jest.fn() }));
jest.mock('../../src/services/core/docker', () => ({
  docker: {
    getContainer: jest.fn(() => ({
      // Genau der Befund: der Container laeuft und ist nach seiner eigenen
      // Pruefung gesund. Sie prueft das Backend am Port der App -- die Dateien
      // daneben kann sie nicht sehen.
      inspect: jest.fn().mockResolvedValue({
        State: {
          Running: true,
          Status: 'running',
          Health: { Status: 'healthy' },
          StartedAt: '2026-08-28T09:00:00Z',
        },
        Config: { Image: 'urlaubsantrag:1.0.0' },
      }),
      remove: jest.fn().mockResolvedValue(undefined),
    })),
    getImage: jest.fn(() => ({
      inspect: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    })),
    listImages: jest.fn().mockResolvedValue([]),
    listContainers: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../../src/middleware/auth', () => {
  const echt = jest.requireActual('../../src/middleware/auth');
  const user = { id: '1', username: 'admin', role: 'admin' };
  return {
    requireAuth: (req, res, next) => {
      req.user = user;
      next();
    },
    optionalAuth: (req, res, next) => {
      req.user = user;
      next();
    },
    requireRole: echt.requireRole,
    ROLLEN: echt.ROLLEN,
    invalidateUserCache: jest.fn(),
  };
});

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const appStore = require('../../src/services/app/appStore');
const { errorHandler } = require('../../src/middleware/errorHandler');

const MANIFEST = {
  schema: 1,
  id: 'urlaubsantrag',
  name: 'Urlaubsantrag',
  version: '1.0.0',
  frontend: { verzeichnis: 'frontend' },
  backend: { image: 'urlaubsantrag:1.0.0', gesundheit: '/gesund' },
  ports: { backend: 8080 },
  ressourcen: { speicher: '512m', cpus: 1 },
  modelle: [],
};

const VERSION = path.join(APPS_DIR, 'urlaubsantrag', '1.0.0');

function dateienHinlegen() {
  fs.mkdirSync(path.join(VERSION, 'frontend'), { recursive: true });
  fs.writeFileSync(path.join(VERSION, 'frontend', 'index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(VERSION, 'app.json'), JSON.stringify(MANIFEST));
}

function dateienWegnehmen() {
  fs.rmSync(path.join(APPS_DIR, 'urlaubsantrag'), { recursive: true, force: true });
}

function verwaltung() {
  const a = express();
  a.use(express.json());
  a.use('/api/apps', require('../../src/routes/store/apps'));
  a.use(errorHandler);
  return a;
}

function auslieferung() {
  const a = express();
  a.use('/apps', require('../../src/routes/appAusliefern'));
  a.use(errorHandler);
  return a;
}

/** Die Antworten fuer `holeApp` einer App mit genau einem Livestand ohne Flows. */
function appMitLivestand() {
  db.query
    .mockResolvedValueOnce({ rows: [{ id: 'urlaubsantrag', name: 'Urlaubsantrag' }] })
    .mockResolvedValueOnce({
      rows: [{ stand: 'live', version: '1.0.0', vorige_version: null, manifest: MANIFEST }],
    })
    .mockResolvedValueOnce({ rows: [] }) // app_flows
    .mockResolvedValueOnce({ rows: [] }); // flow_settings
}

afterAll(() => fs.rmSync(APPS_DIR, { recursive: true, force: true }));
beforeEach(() => {
  db.query.mockReset();
  logger.warn.mockClear();
  dateienWegnehmen();
});

describe('Ein Stand sagt, ob er ausgeliefert werden kann', () => {
  test('mit Dateien und gesundem Container: lieferbar', async () => {
    dateienHinlegen();
    appMitLivestand();
    const res = await request(verwaltung()).get('/api/apps/urlaubsantrag');
    expect(res.status).toBe(200);
    const live = res.body.data.staende.live;
    expect(live.backend.gesundheit).toBe('healthy');
    expect(live.dateien).toEqual({ manifest: true, frontend: true });
    expect(live.lieferbar).toBe(true);
    expect(live.mangel).toBeNull();
  });

  test('der Container ist healthy, die Dateien fehlen: NICHT lieferbar, mit Grund', async () => {
    appMitLivestand();
    const res = await request(verwaltung()).get('/api/apps/urlaubsantrag');
    expect(res.status).toBe(200);
    const live = res.body.data.staende.live;
    // Der Container luegt nicht -- er weiss es nur nicht.
    expect(live.backend.gesundheit).toBe('healthy');
    expect(live.dateien).toEqual({ manifest: false, frontend: false });
    expect(live.lieferbar).toBe(false);
    expect(live.mangel).toMatch(/fehlen am Geraet/);
  });

  test('nur das Frontend fehlt: der Mangel nennt das Frontend', async () => {
    dateienHinlegen();
    fs.rmSync(path.join(VERSION, 'frontend'), { recursive: true });
    appMitLivestand();
    const res = await request(verwaltung()).get('/api/apps/urlaubsantrag');
    expect(res.body.data.staende.live.dateien).toEqual({ manifest: true, frontend: false });
    expect(res.body.data.staende.live.mangel).toMatch(/Frontend fehlt/);
  });

  test('die Liste aller Apps traegt dieselbe Aussage', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'urlaubsantrag',
          name: 'Urlaubsantrag',
          stand: 'live',
          version: '1.0.0',
          manifest: MANIFEST,
        },
      ],
    });
    const res = await request(verwaltung()).get('/api/apps');
    expect(res.status).toBe(200);
    expect(res.body.data[0].staende.live.lieferbar).toBe(false);
    expect(res.body.data[0].staende.live.mangel).toMatch(/fehlen/);
  });
});

describe('GET /apps/<id>/ ohne Dateien ist eine Antwort, kein Absturz', () => {
  function freigegeben() {
    db.query
      .mockResolvedValueOnce({ rows: [{ stand: 'live' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ version: '1.0.0', manifest: MANIFEST }] });
  }

  test('mit Dateien kommt die Seite', async () => {
    dateienHinlegen();
    freigegeben();
    const res = await request(auslieferung()).get('/apps/urlaubsantrag/');
    expect(res.status).toBe(200);
  });

  test('ohne Dateien: 503 APP_DATEIEN_FEHLEN statt INTERNAL_ERROR', async () => {
    freigegeben();
    const res = await request(auslieferung()).get('/apps/urlaubsantrag/');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('APP_DATEIEN_FEHLEN');
    // Die Aussage steht in der Meldung: `details` gibt der Fehlerbehandler
    // bei 5xx bewusst nicht heraus (BH6).
    expect(res.body.error.message).toMatch(/urlaubsantrag 1\.0\.0 steht als live/);
    expect(res.body.error.message).toMatch(/entfernen oder neu einspielen/);
  });

  test('auch eine Datei der App bekommt die 503 und nicht ein 404 fuer die Datei', async () => {
    freigegeben();
    const res = await request(auslieferung()).get('/apps/urlaubsantrag/app.js');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('APP_DATEIEN_FEHLEN');
  });
});

describe('GET /api/apps/meine: eine Kachel ohne Seite dahinter gibt es nicht', () => {
  test('ein Livestand ohne Frontend faellt aus der Liste', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'urlaubsantrag',
          name: 'Urlaubsantrag',
          beschreibung: null,
          freigegeben_bis: 'live',
          live_version: '1.0.0',
          test_version: null,
          live_manifest: MANIFEST,
          test_manifest: null,
        },
      ],
    });
    const res = await request(verwaltung()).get('/api/apps/meine');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('mit Frontend steht sie da', async () => {
    dateienHinlegen();
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'urlaubsantrag',
          name: 'Urlaubsantrag',
          beschreibung: null,
          freigegeben_bis: 'live',
          live_version: '1.0.0',
          test_version: null,
          live_manifest: MANIFEST,
          test_manifest: null,
        },
      ],
    });
    const res = await request(verwaltung()).get('/api/apps/meine');
    expect(res.body.data.map(a => a.id)).toEqual(['urlaubsantrag']);
  });
});

describe('DELETE /api/apps/:id: der Weg, die Leiche loszuwerden', () => {
  function appVorhanden() {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'urlaubsantrag' }] }) // gibt es sie
      .mockResolvedValueOnce({ rows: [] }) // staendeVon
      .mockResolvedValueOnce({ rowCount: 1 }); // DELETE apps
  }

  test('ohne `dateien` bleiben die Ordner liegen', async () => {
    dateienHinlegen();
    appVorhanden();
    const res = await request(verwaltung()).delete('/api/apps/urlaubsantrag');
    expect(res.status).toBe(200);
    expect(res.body.data.dateien_entfernt).toBeNull();
    expect(fs.existsSync(VERSION)).toBe(true);
  });

  test('mit `?dateien=true` gehen sie mit -- der Weg der Oberflaeche', async () => {
    dateienHinlegen();
    appVorhanden();
    const res = await request(verwaltung()).delete('/api/apps/urlaubsantrag?dateien=true');
    expect(res.status).toBe(200);
    expect(res.body.data.dateien_entfernt).toEqual(['1.0.0']);
    expect(fs.existsSync(path.join(APPS_DIR, 'urlaubsantrag'))).toBe(false);
    expect(db.query.mock.calls.at(-1)[0]).toContain('DELETE FROM public.apps');
  });

  test('geht auch, wenn es die Dateien schon nicht mehr gibt', async () => {
    // Genau der Fall am Orin: nichts auf der Platte, Zeile und Container da.
    appVorhanden();
    const res = await request(verwaltung()).delete('/api/apps/urlaubsantrag?dateien=true');
    expect(res.status).toBe(200);
    expect(res.body.data.dateien_entfernt).toEqual([]);
  });

  test('ein anderes Wort als true/false ist ein 400', async () => {
    const res = await request(verwaltung()).delete('/api/apps/urlaubsantrag?dateien=ja');
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('Beim Start sagt das Geraet, was nicht stimmt', () => {
  test('ein Stand ohne Dateien wird gemeldet, nicht geloescht', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ app_id: 'urlaubsantrag', stand: 'live', version: '1.0.0', manifest: MANIFEST }],
    });
    const maengel = await appStore.pruefeStaende();
    expect(maengel).toHaveLength(1);
    expect(maengel[0]).toMatchObject({ app_id: 'urlaubsantrag', stand: 'live' });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('nicht lieferbar'));
    // Genau eine Abfrage: lesen, nicht schreiben.
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('mit Dateien ist nichts zu melden', async () => {
    dateienHinlegen();
    db.query.mockResolvedValueOnce({
      rows: [{ app_id: 'urlaubsantrag', stand: 'live', version: '1.0.0', manifest: MANIFEST }],
    });
    expect(await appStore.pruefeStaende()).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
