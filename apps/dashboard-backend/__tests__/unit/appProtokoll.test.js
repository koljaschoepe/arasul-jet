/**
 * Das Protokoll eines App-Containers fuer das Kit (M5, Auftrag
 * app-protokoll-abrufen).
 *
 * Drei Zusagen: ohne `app:deploy` nichts, die Obergrenze haelt, und kein Wert
 * aus der Umgebung des Containers steht in der Antwort. Der Dienst laeuft
 * echt, nur Docker ist nachgebaut -- die Schwaerzung IST die Zusage, und eine
 * Attrappe davon sagte nichts.
 */
const express = require('express');
const request = require('supertest');

process.env.APPS_DIR = '/tmp/arasul-protokoll-test';
process.env.RATE_LIMIT_ENABLED = 'false';

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/auditLog', () => ({ logSecurityEvent: jest.fn() }));
jest.mock('../../src/services/core/docker', () => ({
  docker: { getContainer: jest.fn() },
}));
jest.mock('../../src/middleware/apiKeyAuth', () => {
  const echt = jest.requireActual('../../src/middleware/apiKeyAuth');
  const { VORGABE_ENDPUNKTE } = jest.requireActual('../../src/config/apiBereiche');
  return {
    ...echt,
    requireApiKey: (req, res, next) => {
      req.apiKey = {
        id: 1,
        prefix: 'aras_test123',
        userId: 42,
        allowedEndpoints:
          req.headers['x-api-key'] === 'kit' ? ['app:deploy'] : [...VORGABE_ENDPUNKTE],
      };
      next();
    },
  };
});

const { docker } = require('../../src/services/core/docker');
const appContainer = require('../../src/services/app/appContainer');
const { errorHandler } = require('../../src/middleware/errorHandler');

const SCHLUESSEL = 'aras_0123456789abcdef0123456789abcdef';
const DB_PASSWORT = 'Kx9-geheim-Passwort';
const DB_URL = `postgresql://app_probe_test:${DB_PASSWORT}@postgres-db:5432/arasul_app_probe_test`;
const PROXY = 'http://arasul-app-probe-test:proxytoken12345@ausgang:3128';

/** Ein Block im Docker-Format: 8 Byte Vorspann (Strom, Laenge), dann die Nutzdaten. */
function block(text, strom = 1) {
  const nutz = Buffer.from(text, 'utf8');
  const kopf = Buffer.alloc(8);
  kopf[0] = strom;
  kopf.writeUInt32BE(nutz.length, 4);
  return Buffer.concat([kopf, nutz]);
}

function container({ zeilen, env, state, restarts = 0 }) {
  const logs = jest.fn().mockResolvedValue(Buffer.concat(zeilen.map(z => block(`${z}\n`))));
  docker.getContainer.mockReturnValue({
    inspect: jest.fn().mockResolvedValue({
      Config: { Env: env },
      State: state || { Running: true, Status: 'running', StartedAt: '2026-10-06T20:00:00Z' },
      RestartCount: restarts,
    }),
    logs,
  });
  return logs;
}

function app() {
  const a = express();
  a.use('/api/v1/external', require('../../src/routes/external/deploy'));
  a.use(errorHandler);
  return a;
}

const ENV = [
  'PATH=/usr/local/sbin:/usr/local/bin:/usr/bin',
  'NODE_ENV=production',
  'PORT=8080',
  'ARASUL_API_URL=http://dashboard-backend:3001/api/v1/external',
  `ARASUL_API_SCHLUESSEL=${SCHLUESSEL}`,
  `ARASUL_DB_URL=${DB_URL}`,
  'ARASUL_ABSCHLUSS_TOKEN=abschluss-token-abcdef',
  `HTTP_PROXY=${PROXY}`,
  'MANDANT_ZUGANG=vom-partner-gesetzt',
  'PROBE_VERSION=1.0.0',
];

beforeEach(() => jest.clearAllMocks());

describe('GET /apps/:id/protokoll', () => {
  it('liefert die letzten Zeilen des Teststandes, ohne Docker-Vorspann', async () => {
    const logs = container({
      zeilen: ['2026-10-06T20:00:01Z Probe hoert auf 8080', '2026-10-06T20:00:02Z bereit'],
      env: ENV,
    });
    const res = await request(app())
      .get('/api/v1/external/apps/probe/protokoll')
      .set('x-api-key', 'kit')
      .expect(200);
    expect(docker.getContainer).toHaveBeenCalledWith('arasul-app-probe-test');
    expect(logs).toHaveBeenCalledWith(expect.objectContaining({ tail: 200, timestamps: true }));
    expect(res.body.data).toMatchObject({
      app_id: 'probe',
      stand: 'test',
      container: 'arasul-app-probe-test',
      laeuft: true,
      neustarts: 0,
      exit_code: null,
      zeilen: ['2026-10-06T20:00:01Z Probe hoert auf 8080', '2026-10-06T20:00:02Z bereit'],
      geschwaerzt: 0,
    });
  });

  it('schwaerzt jeden Wert aus der Umgebung, auch das Passwort aus der Adresse allein', async () => {
    container({
      zeilen: [
        `Schluessel: ${SCHLUESSEL}`,
        `Datenbank: ${DB_URL}`,
        `verbinde mit ${DB_PASSWORT}`,
        `Proxy ${PROXY}`,
        'Mandant vom-partner-gesetzt',
        'Abschluss abschluss-token-abcdef',
        'Basis http://dashboard-backend:3001/api/v1/external, Version 1.0.0',
      ],
      env: ENV,
    });
    const res = await request(app())
      .get('/api/v1/external/apps/probe/protokoll')
      .set('x-api-key', 'kit')
      .expect(200);
    const text = res.body.data.zeilen.join('\n');
    for (const geheim of [
      SCHLUESSEL,
      DB_PASSWORT,
      'proxytoken12345',
      'vom-partner-gesetzt',
      'abschluss-token',
    ]) {
      expect(text).not.toContain(geheim);
    }
    expect(text).toContain('[geschwärzt]');
    // Harmloses bleibt lesbar: die Basis-Adresse und kurze Werte.
    expect(text).toContain('http://dashboard-backend:3001/api/v1/external');
    expect(text).toContain('Version 1.0.0');
    expect(res.body.data.geschwaerzt).toBeGreaterThanOrEqual(6);
  });

  it('nennt Rueckgabewert und Neustarts eines abgestuerzten Containers', async () => {
    container({
      zeilen: ['Error: Cannot find module express'],
      env: ENV,
      state: { Running: false, Status: 'exited', ExitCode: 1 },
      restarts: 4,
    });
    const res = await request(app())
      .get('/api/v1/external/apps/probe/protokoll?stand=live&zeilen=50')
      .set('x-api-key', 'kit')
      .expect(200);
    expect(docker.getContainer).toHaveBeenCalledWith('arasul-app-probe-live');
    expect(res.body.data).toMatchObject({ laeuft: false, exit_code: 1, neustarts: 4 });
  });

  it('haelt die Obergrenze von 1000 Zeilen', async () => {
    container({ zeilen: ['x'], env: [] });
    await request(app())
      .get('/api/v1/external/apps/probe/protokoll?zeilen=5000')
      .set('x-api-key', 'kit')
      .expect(400);
    await request(app())
      .get('/api/v1/external/apps/probe/protokoll?stand=irgendwo')
      .set('x-api-key', 'kit')
      .expect(400);
  });

  it('antwortet 404, wenn es den Container nicht gibt', async () => {
    const fehlt = Object.assign(new Error('no such container'), { statusCode: 404 });
    docker.getContainer.mockReturnValue({ inspect: jest.fn().mockRejectedValue(fehlt) });
    const res = await request(app())
      .get('/api/v1/external/apps/probe/protokoll')
      .set('x-api-key', 'kit')
      .expect(404);
    expect(res.body.error.message).toMatch(/Kein Container/);
  });

  it('verlangt den Bereich app:deploy', async () => {
    await request(app())
      .get('/api/v1/external/apps/probe/protokoll')
      .set('x-api-key', 'app')
      .expect(403);
    expect(docker.getContainer).not.toHaveBeenCalled();
  });
});

describe('geheimeWerte', () => {
  it('laesst Harmloses und Kurzes aus und nimmt das Laengste zuerst', () => {
    const werte = appContainer.geheimeWerte([
      'PATH=/usr/bin:/bin:/usr/local/bin',
      'PORT=8080',
      'KURZ=abc',
      'A=geheim-12345',
      'B=geheim-12345-und-mehr',
      'kaputt',
    ]);
    expect(werte).toEqual(['geheim-12345-und-mehr', 'geheim-12345']);
  });
});
