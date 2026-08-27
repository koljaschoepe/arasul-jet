/**
 * Der Schalter zwischen Test- und Livestand (Phase C5).
 *
 * Gemessen wird das, was ein Schalter falsch machen kann: eine Zeile in
 * `app_staende` umschreiben, ohne den Container zu tauschen; eine Erinnerung
 * an die vorige Version fuehren, die beim naechsten Weg nicht mehr stimmt;
 * oder ein „zurueck" anbieten, wo es nichts gibt, wohin.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const APPS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-schalten-'));
process.env.APPS_DIR = APPS_DIR;

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/app/licenseService', () => ({
  checkLimit: jest.fn().mockResolvedValue({ allowed: true, limit: -1, current: 0 }),
}));
jest.mock('../../src/services/app/appContainer', () => ({
  sorgeFuerImage: jest.fn().mockResolvedValue(undefined),
  holeImageFallsNoetig: jest.fn().mockResolvedValue(false),
  starte: jest.fn().mockResolvedValue('arasul-app-urlaub-live'),
  entferne: jest.fn().mockResolvedValue(true),
  zustand: jest.fn().mockResolvedValue(null),
  apiPfad: (id, stand) => (stand === 'test' ? `/apps/${id}/test/api` : `/apps/${id}/api`),
}));
jest.mock('../../src/services/app/appSchluessel', () => ({
  erneuere: jest.fn().mockResolvedValue('aras_abc'),
  umgebungFuer: () => ({ ARASUL_API_SCHLUESSEL: 'aras_abc' }),
}));

const db = require('../../src/database');
const appStore = require('../../src/services/app/appStore');
const appContainer = require('../../src/services/app/appContainer');

const MANIFEST = version => ({
  schema: 1,
  id: 'urlaub',
  name: 'Urlaubsantrag',
  version,
  frontend: { verzeichnis: 'frontend' },
  backend: { image: `urlaub:${version}`, bauen: { verzeichnis: 'backend' } },
  ports: { backend: 8080 },
  ressourcen: { speicher: '512m', cpus: 1 },
  modelle: [],
});

beforeAll(() => {
  for (const version of ['1.0.0', '1.1.0']) {
    const ordner = path.join(APPS_DIR, 'urlaub', version);
    fs.mkdirSync(path.join(ordner, 'frontend'), { recursive: true });
    fs.writeFileSync(path.join(ordner, 'frontend', 'index.html'), '<!doctype html>');
    fs.writeFileSync(path.join(ordner, 'app.json'), JSON.stringify(MANIFEST(version)));
  }
});
afterAll(() => fs.rmSync(APPS_DIR, { recursive: true, force: true }));
beforeEach(() => {
  db.query.mockReset();
  appContainer.starte.mockClear();
  appContainer.sorgeFuerImage.mockClear();
});

/** Die Antworten, die `staendeVon` liefern soll. */
function staende(zeilen) {
  db.query.mockResolvedValueOnce({ rows: zeilen });
}

/**
 * Die Abfragen, die `spieleEin` danach stellt, in ihrer Reihenfolge:
 * Lizenzgrenze (SELECT 1), Zahl der Apps, INSERT apps, INSERT app_staende.
 */
function spieleEinLaeuftDurch(version) {
  db.query
    .mockResolvedValueOnce({ rows: [{ id: 'urlaub' }] }) // App gibt es schon
    .mockResolvedValueOnce({ rows: [] }) // INSERT apps
    .mockResolvedValueOnce({
      rows: [{ app_id: 'urlaub', stand: 'live', version, vorige_version: null }],
    });
}

describe('schalte', () => {
  test('nach live nimmt die Version aus dem Teststand -- ueber spieleEin, nicht per UPDATE', async () => {
    staende([
      { stand: 'test', version: '1.1.0', vorige_version: null, manifest: MANIFEST('1.1.0') },
    ]);
    spieleEinLaeuftDurch('1.1.0');

    const ergebnis = await appStore.schalte({ appId: 'urlaub', ziel: 'live', durch: 1 });

    expect(ergebnis.version).toBe('1.1.0');
    // Der Container wird getauscht. Ein Schalter, der nur die Zeile umschriebe,
    // haette einen Livestand versprochen, dessen Container die alte Version
    // faehrt -- und dessen API-Schluessel zum ersetzten Container gehoert.
    expect(appContainer.starte).toHaveBeenCalledTimes(1);
    expect(appContainer.starte.mock.calls[0][1]).toBe('live');
    expect(appContainer.starte.mock.calls[0][0].version).toBe('1.1.0');
  });

  test('nach live ohne Teststand ist ein sauberes Nein, kein Absturz', async () => {
    staende([]);
    await expect(appStore.schalte({ appId: 'urlaub', ziel: 'live', durch: 1 })).rejects.toThrow(
      /keinen Teststand/i
    );
    expect(appContainer.starte).not.toHaveBeenCalled();
  });

  test('zurueck ohne vorige Version sagt das, statt irgendetwas zu tun', async () => {
    staende([
      { stand: 'live', version: '1.1.0', vorige_version: null, manifest: MANIFEST('1.1.0') },
    ]);
    await expect(appStore.schalte({ appId: 'urlaub', ziel: 'zurueck', durch: 1 })).rejects.toThrow(
      /nie eine andere Version/i
    );
    expect(appContainer.starte).not.toHaveBeenCalled();
  });

  test('zurueck ohne Livestand ebenso', async () => {
    staende([]);
    await expect(appStore.schalte({ appId: 'urlaub', ziel: 'zurueck', durch: 1 })).rejects.toThrow(
      /keinen Livestand/i
    );
  });

  test('zurueck spielt die vorige Version wieder ein', async () => {
    staende([
      { stand: 'live', version: '1.1.0', vorige_version: '1.0.0', manifest: MANIFEST('1.1.0') },
    ]);
    spieleEinLaeuftDurch('1.0.0');

    const ergebnis = await appStore.schalte({ appId: 'urlaub', ziel: 'zurueck', durch: 1 });

    expect(ergebnis.version).toBe('1.0.0');
    expect(appContainer.starte.mock.calls[0][0].version).toBe('1.0.0');
  });
});

describe('spieleEin fuehrt Buch ueber die vorige Version', () => {
  test('die Buchfuehrung steht in der einen INSERT-Anweisung, nicht im Schalter', async () => {
    spieleEinLaeuftDurch('1.1.0');
    await appStore.spieleEin({ appId: 'urlaub', version: '1.1.0', stand: 'live', durch: 1 });

    const einfuegen = db.query.mock.calls.find(c =>
      c[0].includes('INSERT INTO public.app_staende')
    );
    expect(einfuegen).toBeDefined();
    // Nur bei einem echten Wechsel: dieselbe Version noch einmal einzuspielen
    // (was der Schalter nach live tut) darf die Erinnerung nicht ueberschreiben.
    expect(einfuegen[0]).toMatch(/vorige_version = CASE/);
    expect(einfuegen[0]).toMatch(/public\.app_staende\.version <> EXCLUDED\.version/);
    expect(einfuegen[0]).toMatch(/RETURNING[\s\S]*vorige_version/);
  });

  test('das Image entsteht nach der Regel des Manifests, nicht nach der des Aufrufers', async () => {
    spieleEinLaeuftDurch('1.1.0');
    await appStore.spieleEin({ appId: 'urlaub', version: '1.1.0', stand: 'test', durch: 1 });

    // Der Versionsordner geht mit: ohne ihn wuesste `sorgeFuerImage` nicht,
    // woraus es bauen soll, und fiele auf „Image holen" zurueck.
    expect(appContainer.sorgeFuerImage).toHaveBeenCalledWith(
      expect.objectContaining({ version: '1.1.0' }),
      path.join(APPS_DIR, 'urlaub', '1.1.0')
    );
    expect(appContainer.starte.mock.calls[0][3]).toBe(path.join(APPS_DIR, 'urlaub', '1.1.0'));
  });
});
