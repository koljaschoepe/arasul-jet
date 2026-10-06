/**
 * Die Liste der Plattform-Flows über HTTP (Plan 011, Schritt 5).
 *
 * Die Registry ist hier NICHT gemockt: sie arbeitet gegen ein echtes temporäres
 * Verzeichnis. Geblieben ist nur `GET /api/flows` -- das Ara-Kit liest die
 * Liste vor einem Update. Die Verwaltung (anlegen, ändern, Läufe, Vorlagen)
 * ist mit der Totcode-Prüfung vom 06.10.2026 gefallen.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const request = require('supertest');

// Muss VOR dem Laden der Registry gesetzt sein — sie liest FLOWS_DIR beim Import.
const TMP_FLOWS = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-flows-'));
process.env.FLOWS_DIR = TMP_FLOWS;

const { generateTestToken, setupAuthMocks } = require('../helpers/authMock');

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('mock-salt'),
}));
jest.mock('../../src/database');
jest.mock('../../src/utils/logger');

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const registry = require('../../src/services/flows/flowRegistry');
const { app } = require('../../src/server');

logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

/** Eine gültige Flow-Datei. */
const datei = name =>
  `---\nname: ${name}\nbeschreibung: Fasst etwas zusammen.\n---\nFasse den Text zusammen.\n`;

describe('GET /api/flows', () => {
  let token;

  beforeAll(() => {
    token = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    setupAuthMocks(db);
    registry.clearCache();
    for (const f of fs.readdirSync(TMP_FLOWS)) {
      fs.rmSync(path.join(TMP_FLOWS, f), { recursive: true, force: true });
    }
  });

  afterAll(() => {
    fs.rmSync(TMP_FLOWS, { recursive: true, force: true });
  });

  const auth = req => req.set('Authorization', `Bearer ${token}`);

  test('ohne Token gibt es keine Flows', async () => {
    const res = await request(app).get('/api/flows');
    expect(res.status).toBe(401);
  });

  test('listet die Flows, die als Datei liegen', async () => {
    fs.writeFileSync(path.join(TMP_FLOWS, 'notiz.md'), datei('notiz'));
    fs.writeFileSync(path.join(TMP_FLOWS, 'zweit.md'), datei('zweit'));

    const res = await auth(request(app).get('/api/flows'));
    expect(res.status).toBe(200);
    expect(res.body.data.map(s => s.name).sort()).toEqual(['notiz', 'zweit']);
    expect(res.body.data[0].prompt).toBe('Fasse den Text zusammen.');
    expect(res.body.fehlerhaft).toEqual([]);
  });

  test('eine kaputte Datei legt die Liste nicht lahm, sondern wird gemeldet', async () => {
    fs.writeFileSync(path.join(TMP_FLOWS, 'notiz.md'), datei('notiz'));
    fs.writeFileSync(path.join(TMP_FLOWS, 'kaputt.md'), '---\nwerkzeuge: [unsinn]\n---\nX');

    const res = await auth(request(app).get('/api/flows'));
    expect(res.status).toBe(200);
    expect(res.body.data.map(s => s.name)).toEqual(['notiz']);
    expect(res.body.fehlerhaft).toHaveLength(1);
    expect(res.body.fehlerhaft[0].name).toBe('kaputt');
  });

  test('die Verwaltung darunter gibt es nicht mehr', async () => {
    for (const [verb, pfad] of [
      ['post', '/api/flows'],
      ['get', '/api/flows/laeufe'],
      ['post', '/api/flows/laeufe'],
      ['get', '/api/flows/werkzeuge'],
      ['get', '/api/flows/vorlagen'],
    ]) {
      const res = await auth(request(app)[verb](pfad)).send({});
      expect([403, 404]).toContain(res.status);
    }
  });
});
