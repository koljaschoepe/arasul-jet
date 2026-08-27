/**
 * /api/apps und die Auslieferung unter /apps/<id>/ (Phasen C3 und C4).
 *
 * Drei Dinge werden hier gehalten, die leicht auseinanderlaufen: dass jede
 * Verwaltungsroute dem Mitarbeiter 403 gibt (ausser seiner eigenen Liste), dass
 * die Auslieferung eine Anfrage an `/api/` NICHT mit der Startseite beantwortet,
 * und dass vor jeder Seite und jedem Aufruf die Freigabe steht (C4).
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
    // Die Auslieferung unter `/apps/<id>/` benutzt `optionalAuth`: ohne
    // Sitzung soll dort kein fertiges 401 herausfallen, sondern die
    // Entscheidung zwischen Umzug (Seite) und 401 (Schnittstelle).
    optionalAuth: (req, res, next) => {
      if (mockUser) {
        req.user = mockUser;
      }
      next();
    },
    requireRole: echt.requireRole,
    ROLLEN: echt.ROLLEN,
    invalidateUserCache: jest.fn(),
  };
});

const db = require('../../src/database');
const { docker } = require('../../src/services/core/docker');
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
  backend: { image: 'urlaub:1.0.0', umgebung: { ARASUL_APP_NAME: 'Urlaub' } },
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
  docker.createContainer.mockClear();
  docker.createContainer.mockResolvedValue({ start: jest.fn().mockResolvedValue(undefined) });
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
        {
          id: 'urlaub',
          name: 'Urlaub',
          beschreibung: null,
          freigegeben_bis: 'live',
          live_version: '1.0.0',
          test_version: null,
        },
        {
          id: 'leer',
          name: 'Leer',
          beschreibung: null,
          freigegeben_bis: 'live',
          live_version: null,
          test_version: null,
        },
      ],
    });
    const res = await request(verwaltung()).get('/api/apps/meine');
    expect(res.body.data.map(a => a.id)).toEqual(['urlaub']);
    expect(res.body.data[0].live.pfad).toBe('/apps/urlaub/');
  });

  test('ein Tester sieht den Teststand dazu, ein Nutzer nicht', async () => {
    const zeile = {
      id: 'urlaub',
      name: 'Urlaub',
      beschreibung: null,
      live_version: '1.0.0',
      test_version: '1.1.0',
    };
    db.query.mockResolvedValueOnce({ rows: [{ ...zeile, freigegeben_bis: 'test' }] });
    const tester = await request(verwaltung()).get('/api/apps/meine');
    expect(tester.body.data[0].test.pfad).toBe('/apps/urlaub/test/');

    db.query.mockResolvedValueOnce({ rows: [{ ...zeile, freigegeben_bis: 'live' }] });
    const nutzer = await request(verwaltung()).get('/api/apps/meine');
    expect(nutzer.body.data[0].test).toBeNull();
  });
});

/**
 * Die Abfragen eines erfolgreichen Einspielens, in ihrer Reihenfolge:
 *   1. gibt es die App schon (Lizenzgrenze)
 *   2. die Zeile in `apps` -- seit C4 VOR dem Container, weil der Schluessel
 *      als Fremdschluessel an ihr haengt
 *   3. der alte Schluessel dieses Standes weg
 *   4. der neue Schluessel
 *   5. der Stand
 */
function einspielenAntworten() {
  db.query
    .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{ id: 7 }] })
    .mockResolvedValueOnce({
      rows: [{ app_id: 'urlaub', stand: 'test', version: '1.0.0', eingespielt_am: 'jetzt' }],
    });
}

describe('POST /api/apps/:id/einspielen', () => {
  test('spielt eine Version ein und antwortet 201', async () => {
    einspielenAntworten();
    const res = await request(verwaltung())
      .post('/api/apps/urlaub/einspielen')
      .send({ version: '1.0.0' });
    expect(res.status).toBe(201);
    // Ohne Angabe geht es in den TESTSTAND. Live schaltet ein Mensch.
    expect(res.body.data.stand).toBe('test');
  });

  test('setzt einen frischen Schluessel in die Umgebung des Containers (C4)', async () => {
    einspielenAntworten();
    await request(verwaltung()).post('/api/apps/urlaub/einspielen').send({ version: '1.0.0' });

    // Der alte Schluessel dieses Standes faellt, bevor der neue entsteht:
    // der eindeutige Index aus 171 laesst nur einen zu.
    const geloescht = db.query.mock.calls.find(([sql]) =>
      sql.includes('DELETE FROM public.api_keys')
    );
    expect(geloescht[1]).toEqual(['urlaub', 'test']);

    const angelegt = db.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO public.api_keys')
    );
    expect(angelegt[1].slice(-2)).toEqual(['urlaub', 'test']);

    const { Env } = docker.createContainer.mock.calls.at(-1)[0];
    expect(Env).toContain('ARASUL_API_URL=http://dashboard-backend:3001/api/v1/external');
    const schluessel = Env.find(z => z.startsWith('ARASUL_API_SCHLUESSEL='));
    expect(schluessel).toMatch(/^ARASUL_API_SCHLUESSEL=aras_[0-9a-f]{32}$/);
    // Was im Manifest steht, bleibt daneben stehen.
    expect(Env).toContain('ARASUL_APP_NAME=Urlaub');
  });

  test('kommt der Container nicht hoch, bleibt keine neue App stehen', async () => {
    // Sonst belegte eine leere Zeile dauerhaft einen Platz der Lizenzgrenze.
    docker.createContainer.mockRejectedValueOnce(new Error('kein Image'));
    db.query
      .mockResolvedValueOnce({ rows: [] }) // die App gibt es noch nicht
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValueOnce({ rows: [] }) // apps upsert
      .mockResolvedValueOnce({ rowCount: 0 }) // alter Schluessel weg
      .mockResolvedValueOnce({ rows: [{ id: 7 }] }) // neuer Schluessel
      .mockResolvedValueOnce({ rows: [] }); // DELETE FROM apps
    const res = await request(verwaltung())
      .post('/api/apps/urlaub/einspielen')
      .send({ version: '1.0.0' });
    expect(res.status).toBe(500);
    const aufgeraeumt = db.query.mock.calls.find(([sql]) =>
      sql.includes('DELETE FROM public.apps')
    );
    expect(aufgeraeumt[1]).toEqual(['urlaub']);
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
    einspielenAntworten();
    const res = await request(verwaltung())
      .post('/api/apps/urlaub/einspielen')
      .send({ version: '1.0.0' });
    expect(res.status).toBe(201);
    expect(licenseService.checkLimit).not.toHaveBeenCalled();
  });
});

/**
 * Die Abfragen, die eine Auslieferung ausloest, in ihrer Reihenfolge:
 *   1. `app_members`  -- ist die App diesem Menschen freigegeben, und wie weit
 *   2. `app_staende`  -- gibt es diesen Stand ueberhaupt
 *   3. `app_staende`  -- welche Version wird ausgeliefert (appStore.ausliefernAus)
 *
 * Die ersten beiden sind neu in C4. Sie stehen VOR der dritten, und zwar in
 * dieser Reihenfolge: wer eine App nicht freigegeben hat, erfaehrt auch nicht,
 * ob es sie gibt.
 */
function freigegeben(bis = 'live') {
  db.query
    .mockResolvedValueOnce({ rows: [{ stand: bis }] })
    .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
    .mockResolvedValueOnce({ rows: [{ version: '1.0.0', manifest: MANIFEST }] });
}

describe('GET /api/apps/:id/zugang: die Forward-Auth vor dem Backend einer App', () => {
  test('gibt bei Freigabe 200 und die zwei Koepfe fuer die App', async () => {
    auth.__setUser(MITARBEITER);
    db.query
      .mockResolvedValueOnce({ rows: [{ stand: 'live' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const res = await request(verwaltung()).get('/api/apps/urlaub/zugang');
    expect(res.status).toBe(200);
    expect(res.headers['x-arasul-user']).toBe('mia');
    expect(res.headers['x-arasul-role']).toBe('mitarbeiter');
  });

  test('ohne Freigabe 403, und dann steht auch kein Kopf da', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(verwaltung()).get('/api/apps/urlaub/zugang');
    expect(res.status).toBe(403);
    expect(res.headers['x-arasul-user']).toBeUndefined();
  });

  test('ein mitgeschickter X-Arasul-User aendert nichts', async () => {
    // Die Faelschungssicherheit liegt bei Traefik: es LOESCHT die Koepfe aus
    // der eingehenden Anfrage, bevor es sie aus dieser Antwort neu setzt
    // (`forwardauth.authResponseHeaders`). Hier wird die andere Haelfte
    // gehalten -- dass die Antwort den echten Menschen nennt und nicht den,
    // den der Aufrufer behauptet.
    auth.__setUser(MITARBEITER);
    db.query
      .mockResolvedValueOnce({ rows: [{ stand: 'live' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const res = await request(verwaltung())
      .get('/api/apps/urlaub/zugang')
      .set('X-Arasul-User', 'chef')
      .set('X-Arasul-Role', 'admin');
    expect(res.headers['x-arasul-user']).toBe('mia');
    expect(res.headers['x-arasul-role']).toBe('mitarbeiter');
  });

  test('der Teststand fragt mit ?stand=test und braucht eine Tester-Freigabe', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ stand: 'live' }] });
    const nein = await request(verwaltung()).get('/api/apps/urlaub/zugang?stand=test');
    expect(nein.status).toBe(403);

    db.query.mockReset();
    db.query
      .mockResolvedValueOnce({ rows: [{ stand: 'test' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const ja = await request(verwaltung()).get('/api/apps/urlaub/zugang?stand=test');
    expect(ja.status).toBe(200);
  });

  test('ein unbekannter Stand ist 400, bevor irgendetwas passiert', async () => {
    const res = await request(verwaltung()).get('/api/apps/urlaub/zugang?stand=vorschau');
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('appZugang.kopfWert: was in einer Kopfzeile stehen darf', () => {
  const { kopfWert } = require('../../src/services/app/appZugang');

  test('laesst einen gewoehnlichen Namen in Ruhe', () => {
    expect(kopfWert('Anna Schmidt')).toBe('Anna Schmidt');
  });

  test('legt Umlaute als UTF-8 ab, statt zu werfen', () => {
    // Node prueft Kopfzeilen gegen [\t\x20-\x7e\x80-\xff]. Ein Name in
    // Schriftzeichen darueber haette JEDEN Aufruf an JEDE App mit 500 beendet.
    for (const name of ['Jürgen Müller', '中村']) {
      const wert = kopfWert(name);
      expect([...wert].every(z => z.charCodeAt(0) <= 0xff)).toBe(true);
      expect(Buffer.from(wert, 'latin1').toString('utf8')).toBe(name);
    }
  });

  test('ein Zeilenumbruch im Namen wird keine zweite Kopfzeile', () => {
    expect(kopfWert('boese\r\nX-Arasul-Role: admin')).toBe('boese  X-Arasul-Role: admin');
  });
});

describe('Auslieferung unter /apps/<id>/: die Freigabe steht davor (C4)', () => {
  test('ohne Sitzung zieht die SEITE zur Anmeldung um', async () => {
    auth.__setUser(null);
    const res = await request(auslieferung()).get('/apps/urlaub/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(db.query).not.toHaveBeenCalled();
  });

  test('ohne Sitzung bekommt die SCHNITTSTELLE 401 als JSON, keinen Umzug', async () => {
    // Ein `fetch` der App bekaeme auf einen Umzug die Anmeldeseite als HTML
    // zurueck und meldete einen Fehler, der nach einem Fehler der App aussieht.
    auth.__setUser(null);
    const res = await request(auslieferung()).get('/apps/urlaub/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('angemeldet, aber nicht freigegeben: 403 auf Seite und Schnittstelle', async () => {
    for (const pfad of ['/apps/urlaub/', '/apps/urlaub/api/me']) {
      db.query.mockReset();
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(auslieferung()).get(pfad);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      // Nach dem Nein wird nicht weiter nachgesehen, auch nicht, ob es die
      // App gibt.
      expect(db.query).toHaveBeenCalledTimes(1);
    }
  });

  test('eine App, die es nicht gibt, ist 403 und nicht 404', async () => {
    // Bis C3 war das ein 404. Seit C4 antwortet die Freigabe zuerst, und die
    // kennt keine App dieses Namens -- sonst waere die Liste der Apps eines
    // Unternehmens fuer jeden Angemeldeten abzaehlbar.
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(auslieferung()).get('/apps/gibt-es-nicht/');
    expect(res.status).toBe(403);
  });

  test('freigegeben, aber diesen Stand gibt es nicht: 404', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ stand: 'test' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(auslieferung()).get('/apps/urlaub/test/');
    expect(res.status).toBe(404);
  });

  test('nur fuer live freigegeben: der Teststand bleibt zu', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ stand: 'live' }] });
    const res = await request(auslieferung()).get('/apps/urlaub/test/');
    expect(res.status).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('als Tester freigegeben: der Teststand geht auf', async () => {
    freigegeben('test');
    const res = await request(auslieferung()).get('/apps/urlaub/test/');
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[2][1]).toEqual(['urlaub', 'test']);
  });

  test('der Umzug ohne Schraegstrich passiert VOR der Anmeldung', async () => {
    // Er sagt nichts darueber aus, ob es die App gibt oder wer fragt.
    auth.__setUser(null);
    const res = await request(auslieferung()).get('/apps/urlaub');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/apps/urlaub/');
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('Was NICHT die Anfrage an eine App ist, faellt aus dem Router', () => {
  // `pfadErkennen` verlaesst den Router mit `next('router')`. Ein einfaches
  // `next()` liefe in die naechste Middleware DIESES Routers, also in die
  // Anmeldung -- und die hat mit `/apps/etwas-anderes` nichts zu tun.
  test.each([
    ['eine unmoegliche Kennung', '/apps/GROSS/'],
    ['die vergebene Kennung test', '/apps/test/'],
  ])('%s: kein 403, sondern durchgereicht', async (_was, pfad) => {
    const res = await request(auslieferung()).get(pfad);
    expect(res.status).toBe(404);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('ein POST ist keine Auslieferung', async () => {
    const res = await request(auslieferung()).post('/apps/urlaub/');
    expect(res.status).toBe(404);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('GET /apps/<id>/api/me: der eine Weg unter api/, der der Plattform gehoert', () => {
  test('nennt Namen und Rolle des Angemeldeten', async () => {
    auth.__setUser(MITARBEITER);
    db.query
      .mockResolvedValueOnce({ rows: [{ stand: 'live' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const res = await request(auslieferung()).get('/apps/urlaub/api/me');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      app_id: 'urlaub',
      stand: 'live',
      benutzer: 'mia',
      rolle: 'mitarbeiter',
    });
  });

  test('der Teststand hat seinen eigenen', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ stand: 'test' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const res = await request(auslieferung()).get('/apps/urlaub/test/api/me');
    expect(res.body.data.stand).toBe('test');
  });

  test('vergeben ist genau dieser Weg, nicht alles darunter', async () => {
    // `/apps/urlaub/api/meine-antraege` gehoert weiter der App. Kommt es hier
    // an, laeuft ihr Container nicht -- 404 mit Grund, keine Startseite.
    freigegeben();
    const res = await request(auslieferung()).get('/apps/urlaub/api/meine-antraege');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('Auslieferung unter /apps/<id>/', () => {
  test('liefert die Startseite des Livestandes', async () => {
    freigegeben();
    const res = await request(auslieferung()).get('/apps/urlaub/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Urlaub');
  });

  test('liefert eine Datei aus dem Paket', async () => {
    freigegeben();
    const res = await request(auslieferung()).get('/apps/urlaub/app.js');
    expect(res.status).toBe(200);
  });

  test('eine fehlende Datei ist 404, nicht die Startseite', async () => {
    // Sonst bekaeme ein fehlendes Stylesheet HTML zurueck, und der Browser
    // zeigte eine Seite ohne Gestaltung statt eines Fehlers.
    freigegeben();
    const res = await request(auslieferung()).get('/apps/urlaub/gibt-es-nicht.css');
    expect(res.status).toBe(404);
  });

  test('eine Route der App bekommt die Startseite', async () => {
    freigegeben();
    const res = await request(auslieferung()).get('/apps/urlaub/antraege/17');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Urlaub');
  });

  test('ein /api/-Pfad wird NICHT mit der Startseite beantwortet', async () => {
    // Traefik gibt `/apps/<id>/api/` dem Container der App. Kommt eine solche
    // Anfrage trotzdem hier an, laeuft der Container nicht -- und ein Frontend,
    // das auf seine Schnittstelle HTML bekommt, meldet einen Fehler, der nach
    // einem Fehler der App aussieht.
    freigegeben();
    const res = await request(auslieferung()).get('/apps/urlaub/api/hallo');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
