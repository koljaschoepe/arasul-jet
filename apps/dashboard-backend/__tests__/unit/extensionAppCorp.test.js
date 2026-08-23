/**
 * App-Dateien einer Erweiterung erreichen ihren eigenen Rahmen (23.08.2026).
 *
 * Der iframe in `ExtensionAppTab.tsx` laeuft absichtlich OHNE
 * `allow-same-origin` und hat damit einen opaken Origin. Fuer ihn ist jede
 * Antwort dieses Servers fremd. Helmet setzt als Vorgabe
 * `Cross-Origin-Resource-Policy: same-origin` — und genau daran scheiterte im
 * Browser auf dem Orin `GET /api/extensions/beispiel-app/app/arasul-bruecke.js`
 * mit `net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`. Die App zeigte dauerhaft
 * „Bruecke: warte auf Token".
 *
 * Der Widerspruch war belegbar: `brueckeCors` laesst `Origin: null`
 * ausdruecklich zu, die Bruecken-API ist also fuer diesen Rahmen gebaut — nur
 * ihre eigene Client-Datei kam nie darin an.
 *
 * Der Test mountet Helmet genau wie `src/index.js`, damit er die Vorgabe
 * wirklich schlaegt und nicht nur einen leeren Kopf prueft.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';
process.env.RATE_LIMIT_ENABLED = 'false';

const os = require('os');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const express = require('express');
// `__mocks__/helmet.js` schaltet Helmet in ALLEN Tests ab (geschrieben, als das
// Paket noch fehlte). Dieser Test braucht das echte Verhalten, sonst prueft er
// gegen eine leere Antwort und waere immer gruen.
// `__mocks__/helmet.js` schaltet Helmet in ALLEN Tests ab (geschrieben, als das
// Paket noch fehlte, siehe Kopf jener Datei). Dieser Test braucht das ECHTE
// Verhalten — sonst prueft er gegen eine leere Antwort und waere immer gruen.
// `jest.unmock` greift hier nicht, der Handmock haengt am Modulnamen; deshalb
// der Weg ueber den aufgeloesten Dateipfad.
const helmet = require(path.join(__dirname, '../../../../node_modules/helmet/index.cjs'));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 1, username: 'admin', role: 'admin' };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  optionalAuth: (_req, _res, next) => next(),
}));

jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('../../src/services/extensions/extensionService');
jest.mock('../../src/services/extensions/werkstattWatcher', () => ({
  start: jest.fn(),
  stop: jest.fn(),
}));

const extensionService = require('../../src/services/extensions/extensionService');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-corp-'));
const DATEI = path.join(TMP, 'arasul-bruecke.js');

let app;

beforeAll(() => {
  fs.writeFileSync(DATEI, 'window.arasul = {};');
  app = express();
  // Genau die Konfiguration aus src/index.js — ohne sie prueft der Test nichts.
  app.use(helmet({ crossOriginEmbedderPolicy: false }));
  app.use('/api/extensions', require('../../src/routes/extensions'));
});

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('App-Dateien und der opake Rahmen', () => {
  test('Helmets Vorgabe waere same-origin', async () => {
    // Beweist die Praemisse: ohne den eigenen Kopf traegt jede Antwort
    // dieses Servers `same-origin` — und ist im Rahmen blockiert.
    const nackt = express();
    nackt.use(helmet({ crossOriginEmbedderPolicy: false }));
    nackt.get('/x', (_req, res) => res.send('ok'));
    const r = await request(nackt).get('/x');
    expect(r.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  test('die Client-Datei der Bruecke traegt cross-origin', async () => {
    extensionService.resolveAppAsset.mockResolvedValue({
      filePath: DATEI,
      contentType: 'application/javascript; charset=utf-8',
    });
    const res = await request(app).get('/api/extensions/beispiel-app/app/arasul-bruecke.js');
    expect(res.status).toBe(200);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  test('die Startdatei ebenso, und die Sandbox bleibt', async () => {
    extensionService.resolveAppAsset.mockResolvedValue({
      filePath: DATEI,
      contentType: 'text/html; charset=utf-8',
    });
    const res = await request(app).get('/api/extensions/beispiel-app/app');
    expect(res.status).toBe(200);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    // Die Lockerung gilt NUR dem Abholen. Was die Datei darf, steht weiterhin
    // in ihrer eigenen CSP — sonst waere aus dem Fund eine Oeffnung geworden.
    expect(res.headers['content-security-policy']).toMatch(/^sandbox allow-scripts/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('Lese-Token im Pfad', () => {
  // Der eigentliche Grund fuer den Token (23.08.2026): aus dem opaken Rahmen
  // kommt KEIN Cookie. `arasul_session` ist `SameSite=Strict`, und jede
  // Unteranfrage eines sandgekasteten Dokuments zaehlt als cross-site. Nur die
  // Startdatei kam an, weil ihr Abruf eine Navigation des Elternfensters ist.
  // Betroffen war damit jede Unterdatei, nicht nur `arasul-bruecke.js`.
  const appToken = require('../../src/services/extensions/appToken');

  beforeEach(() => {
    appToken.alleVerwerfen();
    extensionService.resolveAppAsset.mockResolvedValue({
      filePath: DATEI,
      contentType: 'application/javascript; charset=utf-8',
    });
  });

  test('mit gueltigem Token ohne Cookie', async () => {
    const { token } = appToken.ausgeben('beispiel-app', 1);
    const res = await request(app).get(
      `/api/extensions/beispiel-app/app/t/${token}/arasul-bruecke.js`
    );
    expect(res.status).toBe(200);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  test('die Startdatei ebenso', async () => {
    const { token } = appToken.ausgeben('beispiel-app', 1);
    const res = await request(app).get(`/api/extensions/beispiel-app/app/t/${token}`);
    expect(res.status).toBe(200);
  });

  test('ein erfundener Token kommt nicht durch', async () => {
    const res = await request(app).get(
      '/api/extensions/beispiel-app/app/t/ausgedacht/arasul-bruecke.js'
    );
    expect(res.status).toBe(401);
  });

  test('ein Token fuer eine ANDERE Erweiterung kommt nicht durch', async () => {
    const { token } = appToken.ausgeben('andere-app', 1);
    const res = await request(app).get(
      `/api/extensions/beispiel-app/app/t/${token}/arasul-bruecke.js`
    );
    expect(res.status).toBe(401);
  });

  test('ein abgelaufener Token kommt nicht durch', async () => {
    const { token } = appToken.ausgeben('beispiel-app', 1);
    const eintrag = appToken._internals.tokens.get(token);
    eintrag.exp = Date.now() - 1;
    const res = await request(app).get(
      `/api/extensions/beispiel-app/app/t/${token}/arasul-bruecke.js`
    );
    expect(res.status).toBe(401);
  });

  test('der Token-Pfad wird VOR dem Platzhalter /app/* gefunden', async () => {
    // Steht `/:id/app/*` frueher in der Datei, faengt Express den Token-Pfad
    // dort ab. Der Status verriete das hier NICHT — `requireAuth` ist in
    // diesem Test durchgereicht, die Antwort waere ebenfalls 200. Es verraet
    // der Pfad: die falsche Route reichte `t/<token>/tief/x.js` weiter und
    // suchte damit eine Datei, die es nicht gibt.
    const { token } = appToken.ausgeben('beispiel-app', 1);
    const res = await request(app).get(`/api/extensions/beispiel-app/app/t/${token}/tief/x.js`);
    expect(res.status).toBe(200);
    expect(extensionService.resolveAppAsset).toHaveBeenCalledWith('beispiel-app', 'tief/x.js');
  });
});
