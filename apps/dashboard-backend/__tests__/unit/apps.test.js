/**
 * /api/apps und die Auslieferung unter /apps/<id>/ (Phase C3).
 *
 * Zwei Dinge werden hier gehalten, die leicht auseinanderlaufen: dass jede
 * Verwaltungsroute dem Mitarbeiter 403 gibt (ausser seiner eigenen Liste), und
 * dass die Auslieferung eine Anfrage an `/api/` NICHT mit der Startseite
 * beantwortet.
 */
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const APPS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-apps-route-'));
process.env.APPS_DIR = APPS_DIR;

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/auditLog', () => ({ logSecurityEvent: jest.fn() }));
jest.mock('../../src/services/app/licenseService', () => ({
  checkLimit: jest.fn().mockResolvedValue({ allowed: true, limit: -1, current: 0 }),
}));
jest.mock('../../src/services/core/docker', () => ({
  docker: {
    getContainer: jest.fn(() => ({
      inspect: jest.fn().mockResolvedValue({
        State: { Running: true, Status: 'running', StartedAt: '2026-08-27T09:00:00Z' },
        Config: { Image: 'urlaub:1.0.0' },
      }),
      logs: jest.fn().mockResolvedValue(Buffer.from('zeile eins\n')),
      remove: jest.fn().mockResolvedValue(undefined),
    })),
    getImage: jest.fn(() => ({ inspect: jest.fn().mockResolvedValue({}) })),
    createContainer: jest.fn().mockResolvedValue({ start: jest.fn().mockResolvedValue(undefined) }),
    listContainers: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../src/middleware/auth', () => {
  const echt = jest.requireActual('../../src/middleware/auth');
  let mockUser = null;
  return {
    __setUser: u => {
      mockUser = u;
    },
    requireAuth: (req, res, next) => {
      req.user = mockUser;
      next();
    },
    requireRole: echt.requireRole,
    ROLLEN: echt.ROLLEN,
    invalidateUserCache: jest.fn(),
  };
});

const db = require('../../src/database');
const auth = require('../../src/middleware/auth');
const licenseService = require('../../src/services/app/licenseService');
const { errorHandler } = require('../../src/middleware/errorHandler');

const ADMIN = { id: '1', username: 'admin', role: 'admin' };
const MITARBEITER = { id: '2', username: 'mia', role: 'mitarbeiter' };

const MANIFEST = {
  schema: 1,
  id: 'urlaub',
  name: 'Urlaubsantrag',
  version: '1.0.0',
  frontend: { verzeichnis: 'frontend' },
  backend: { image: 'urlaub:1.0.0' },
  ports: { backend: 8080 },
  ressourcen: { speicher: '512m', cpus: 1 },
  modelle: [],
  flows: [],
};

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

beforeAll(() => {
  const ordner = path.join(APPS_DIR, 'urlaub', '1.0.0', 'frontend');
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, 'index.html'), '<!doctype html><title>Urlaub</title>');
  fs.writeFileSync(path.join(ordner, 'app.js'), '// nichts');
  fs.mkdirSync(path.join(APPS_DIR, 'urlaub', '1.0.0'), { recursive: true });
  fs.writeFileSync(path.join(APPS_DIR, 'urlaub', '1.0.0', 'app.json'), JSON.stringify(MANIFEST));
});
afterAll(() => fs.rmSync(APPS_DIR, { recursive: true, force: true }));

beforeEach(() => {
  db.query.mockReset();
  licenseService.checkLimit.mockClear();
  licenseService.checkLimit.mockResolvedValue({ allowed: true, limit: -1, current: 0 });
  auth.__setUser(ADMIN);
});

describe('/api/apps: wer darf was', () => {
  test.each([
    ['get', '/api/apps'],
    ['get', '/api/apps/urlaub'],
    ['post', '/api/apps/urlaub/einspielen'],
    ['delete', '/api/apps/urlaub'],
    ['get', '/api/apps/urlaub/logs'],
  ])('%s %s: Mitarbeiter bekommt 403', async (verb, pfad) => {
    auth.__setUser(MITARBEITER);
    const res = await request(verwaltung())[verb](pfad).send({ version: '1.0.0' });
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('GET /api/apps/meine darf auch der Mitarbeiter', async () => {
    auth.__setUser(MITARBEITER);
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(verwaltung()).get('/api/apps/meine');
    expect(res.status).toBe(200);
  });

  test('/meine steht vor /:id und wird nicht als App-Kennung gelesen', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(verwaltung()).get('/api/apps/meine');
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][0]).toContain('app_members');
  });
});

describe('/api/apps/meine', () => {
  test('nennt nur Apps, von denen etwas laeuft', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 'urlaub', name: 'Urlaub', beschreibung: null, freigegeben_bis: 'live', live_version: '1.0.0', test_version: null },
        { id: 'leer', name: 'Leer', beschreibung: null, freigegeben_bis: 'live', live_version: null, test_version: null },
      ],
    });
    const res = await request(verwaltung()).get('/api/apps/meine');
    expect(res.body.data.map(a => a.id)).toEqual(['urlaub']);
    expect(res.body.data[0].live.pfad).toBe('/apps/urlaub/');
  });

  test('ein Tester sieht den Teststand dazu, ein Nutzer nicht', async () => {
    const zeile = {
      id: 'urlaub', name: 'Urlaub', beschreibung: null,
      live_version: '1.0.0', test_version: '1.1.0',
    };
    db.query.mockResolvedValueOnce({ rows: [{ ...zeile, freigegeben_bis: 'test' }] });
    const tester = await request(verwaltung()).get('/api/apps/meine');
    expect(tester.body.data[0].test.pfad).toBe('/apps/urlaub/test/');

    db.query.mockResolvedValueOnce({ rows: [{ ...zeile, freigegeben_bis: 'live' }] });
    const nutzer = await request(verwaltung()).get('/api/apps/meine');
    expect(nutzer.body.data[0].test).toBeNull();
  });
});

describe('POST /api/apps/:id/einspielen', () => {
  test('spielt eine Version ein und antwortet 201', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // App gibt es schon: keine Grenze
      .mockResolvedValueOnce({ rows: [] }) // apps upsert
      .mockResolvedValueOnce({
        rows: [{ app_id: 'urlaub', stand: 'test', version: '1.0.0', eingespielt_am: 'jetzt' }],
      });
    const res = await request(verwaltung())
      .post('/api/apps/urlaub/einspielen')
      .send({ version: '1.0.0' });
    expect(res.status).toBe(201);
    // Ohne Angabe geht es in den TESTSTAND. Live schaltet ein Mensch.
    expect(res.body.data.stand).toBe('test');
  });

  test('eine Version, die nicht auf der Platte liegt, ist 404', async () => {
    const res = await request(verwaltung())
      .post('/api/apps/urlaub/einspielen')
      .send({ version: '9.9.9' });
    expect(res.status).toBe(404);
  });

  test('eine Version in unmoeglicher Form ist 400, bevor irgendetwas passiert', async () => {
    const res = await request(verwaltung())
      .post('/api/apps/urlaub/einspielen')
      .send({ version: '../../etc' });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('die Lizenzgrenze haelt eine NEUE App auf', async () => {
    licenseService.checkLimit.mockResolvedValue({ allowed: false, limit: 3, current: 3 });
    db.query
      .mockResolvedValueOnce({ rows: [] }) // die App gibt es noch nicht
      .mockResolvedValueOnce({ rows: [{ n: 3 }] });
    const res = await request(verwaltung())
      .post('/api/apps/urlaub/einspielen')
      .send({ version: '1.0.0' });
    expect(res.status).toBe(409);
    expect(licenseService.checkLimit).toHaveBeenCalledWith('maxApps', 3);
  });

  test('eine neue VERSION einer bekannten App faellt nicht unter die Grenze', async () => {
    // Sonst blockierte ein abgelaufener Schluessel ein Update, das vielleicht
    // genau den Fehler behebt, wegen dem jemand anruft.
    licenseService.checkLimit.mockResolvedValue({ allowed: false, limit: 1, current: 1 });
    db.query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // die App gibt es schon
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ app_id: 'urlaub', stand: 'test', version: '1.0.0', eingespielt_am: 'jetzt' }],
      });
    const res = await request(verwaltung())
      .post('/api/apps/urlaub/einspielen')
      .send({ version: '1.0.0' });
    expect(res.status).toBe(201);
    expect(licenseService.checkLimit).not.toHaveBeenCalled();
  });
});

describe('Auslieferung unter /apps/<id>/', () => {
  test('liefert die Startseite des Livestandes', async () => {
    db.query.mockResolvedValue({ rows: [{ version: '1.0.0', manifest: MANIFEST }] });
    const res = await request(auslieferung()).get('/apps/urlaub/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Urlaub');
  });

  test('liefert eine Datei aus dem Paket', async () => {
    db.query.mockResolvedValue({ rows: [{ version: '1.0.0', manifest: MANIFEST }] });
    const res = await request(auslieferung()).get('/apps/urlaub/app.js');
    expect(res.status).toBe(200);
  });

  test('eine fehlende Datei ist 404, nicht die Startseite', async () => {
    // Sonst bekaeme ein fehlendes Stylesheet HTML zurueck, und der Browser
    // zeigte eine Seite ohne Gestaltung statt eines Fehlers.
    db.query.mockResolvedValue({ rows: [{ version: '1.0.0', manifest: MANIFEST }] });
    const res = await request(auslieferung()).get('/apps/urlaub/gibt-es-nicht.css');
    expect(res.status).toBe(404);
  });

  test('eine Route der App bekommt die Startseite', async () => {
    db.query.mockResolvedValue({ rows: [{ version: '1.0.0', manifest: MANIFEST }] });
    const res = await request(auslieferung()).get('/apps/urlaub/antraege/17');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Urlaub');
  });

  test('ohne Schraegstrich am Ende wird umgezogen', async () => {
    const res = await request(auslieferung()).get('/apps/urlaub');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/apps/urlaub/');
  });

  test('ein /api/-Pfad wird NICHT mit der Startseite beantwortet', async () => {
    // Traefik gibt `/apps/<id>/api/` dem Container der App. Kommt eine solche
    // Anfrage trotzdem hier an, laeuft der Container nicht -- und ein Frontend,
    // das auf seine Schnittstelle HTML bekommt, meldet einen Fehler, der nach
    // einem Fehler der App aussieht.
    db.query.mockResolvedValue({ rows: [{ version: '1.0.0', manifest: MANIFEST }] });
    const res = await request(auslieferung()).get('/apps/urlaub/api/hallo');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('eine App, die es nicht gibt, ist 404', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(auslieferung()).get('/apps/gibt-es-nicht/');
    expect(res.status).toBe(404);
  });

  test('der Teststand kommt aus dem Teststand', async () => {
    db.query.mockResolvedValue({ rows: [{ version: '1.0.0', manifest: MANIFEST }] });
    const res = await request(auslieferung()).get('/apps/urlaub/test/');
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][1]).toEqual(['urlaub', 'test']);
  });
});
