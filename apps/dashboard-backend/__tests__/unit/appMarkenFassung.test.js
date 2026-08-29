/**
 * Auf welcher Fassung des Designsystems eine App steht (Phase H6, 29.08.2026).
 *
 * Eine App traegt die Bibliothek des Geraets als KOPIE -- als Spiegel der
 * Quelle in ihrem Frontend oder als beigelegtes `marken.js`. Die Shell zieht
 * mit jedem Deploy nach, die App bleibt auf dem Stand ihres letzten
 * Paketbaus, und der Mensch sieht beides in EINEM Rahmen uebereinander.
 * Nichts an einer laufenden App wuerde davon rot.
 *
 * Gemessen wird hier die eine Haelfte, die das Geraet beisteuert: es REICHT
 * WEITER, was das Manifest sagt, und es urteilt nicht. Die Fassung der
 * Bibliothek kennt die Shell, weil sie sie mituebersetzt (`FASSUNG` aus
 * `@marken`) -- eine zweite Zahl im Backend waere eine, die eines Tages etwas
 * anderes sagt.
 */
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const APPS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-marken-fassung-'));
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
      inspect: jest.fn().mockResolvedValue({
        State: {
          Running: true,
          Status: 'running',
          Health: { Status: 'healthy' },
          StartedAt: '2026-08-29T09:00:00Z',
        },
        Config: { Image: 'buero:1.0.0' },
      }),
    })),
    listContainers: jest.fn().mockResolvedValue([]),
    listImages: jest.fn().mockResolvedValue([]),
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
const { errorHandler } = require('../../src/middleware/errorHandler');

const BASIS = {
  schema: 1,
  id: 'buero',
  name: 'Buero',
  version: '1.0.0',
  frontend: { verzeichnis: 'frontend' },
  backend: { image: 'buero:1.0.0', gesundheit: '/gesund' },
  ports: { backend: 8080 },
  ressourcen: { speicher: '512m', cpus: 1 },
  modelle: [],
};

const VERSION = path.join(APPS_DIR, 'buero', '1.0.0');

function dateienHinlegen() {
  fs.mkdirSync(path.join(VERSION, 'frontend'), { recursive: true });
  fs.writeFileSync(path.join(VERSION, 'frontend', 'index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(VERSION, 'app.json'), JSON.stringify(BASIS));
}

function verwaltung() {
  const a = express();
  a.use(express.json());
  a.use('/api/apps', require('../../src/routes/store/apps'));
  a.use(errorHandler);
  return a;
}

/** Die Antworten fuer `holeApp` einer App mit genau einem Livestand. */
function appMitLivestand(manifest) {
  db.query
    .mockResolvedValueOnce({ rows: [{ id: 'buero', name: 'Buero' }] })
    .mockResolvedValueOnce({
      rows: [{ stand: 'live', version: '1.0.0', vorige_version: null, manifest }],
    })
    .mockResolvedValueOnce({ rows: [] }) // app_flows
    .mockResolvedValueOnce({ rows: [] }); // flow_settings
}

beforeAll(dateienHinlegen);
afterAll(() => fs.rmSync(APPS_DIR, { recursive: true, force: true }));
beforeEach(() => db.query.mockReset());

describe('Ein Stand sagt, auf welcher Fassung des Designsystems er steht', () => {
  test('das Manifest nennt sie, der Stand reicht sie weiter', async () => {
    appMitLivestand({ ...BASIS, marken: '3.1.0' });
    const res = await request(verwaltung()).get('/api/apps/buero');
    expect(res.status).toBe(200);
    expect(res.body.data.staende.live.marken).toBe('3.1.0');
  });

  test('ein Manifest ohne Angabe ergibt null und keinen Mangel', async () => {
    // Jede App, die vor H6 gebaut wurde, hat die Angabe nicht. Sie laeuft --
    // sie sieht nur vielleicht nicht mehr aus wie das Geraet um sie herum.
    // Das ist etwas anderes als "nicht lieferbar", und deshalb steht es an
    // einer anderen Stelle.
    appMitLivestand(BASIS);
    const res = await request(verwaltung()).get('/api/apps/buero');
    expect(res.body.data.staende.live.marken).toBeNull();
    expect(res.body.data.staende.live.lieferbar).toBe(true);
    expect(res.body.data.staende.live.mangel).toBeNull();
  });

  test('das Geraet vergleicht nicht -- es liest', async () => {
    // Auch eine Fassung, die es nirgends gibt, kommt unveraendert heraus. Wer
    // sie beurteilt, ist die Shell: sie UEBERSETZT die Bibliothek mit, also
    // ist ihre Fassung die des Geraets.
    appMitLivestand({ ...BASIS, marken: '99.0.0' });
    const res = await request(verwaltung()).get('/api/apps/buero');
    expect(res.body.data.staende.live.marken).toBe('99.0.0');
  });

  test('die Liste aller Apps traegt dieselbe Aussage', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'buero',
          name: 'Buero',
          stand: 'live',
          version: '1.0.0',
          manifest: { ...BASIS, marken: '3.1.0' },
        },
      ],
    });
    const res = await request(verwaltung()).get('/api/apps');
    expect(res.status).toBe(200);
    expect(res.body.data[0].staende.live.marken).toBe('3.1.0');
  });
});
