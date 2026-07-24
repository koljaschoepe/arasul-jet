/**
 * resolveAppAsset (Plan 012 Batch 3) — die Datei-Auflösung hinter der
 * App-Oberfläche „in der Mitte". Der Fokus liegt auf der Sicherheit: nur
 * App-Erweiterungen, und KEIN Ausbruch aus dem Paket-Ordner (weder über `..`
 * noch über einen Symlink).
 *
 * EXTENSIONS_DIR wird VOR dem Require gesetzt — extensionPackage liest die
 * Variable beim Modul-Load in eine Konstante.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

const EXT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-ext-assets-'));
process.env.EXTENSIONS_DIR = EXT_DIR;

jest.mock('../../src/utils/logger');
jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));

const db = require('../../src/database');
const extensionService = require('../../src/services/extensions/extensionService');

const PKG = path.join(EXT_DIR, 'notiz-app');

const appRow = (over = {}) => ({
  id: 'notiz-app',
  name: 'Notiz-App',
  description: '',
  ext_type: 'app',
  access_tier: 'internet',
  version: '0.1.0',
  source: 'built',
  enabled: true,
  manifest: { entry: 'index.html' },
  installed_at: '2026-07-24T00:00:00.000Z',
  package_path: PKG,
  ...over,
});

const mockExt = row => db.query.mockResolvedValueOnce({ rows: [row] });

beforeAll(() => {
  fs.mkdirSync(path.join(PKG, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(PKG, 'index.html'), '<h1>Hallo</h1>');
  fs.writeFileSync(path.join(PKG, 'assets', 'app.js'), 'console.log(1)');
  // Eine Datei AUSSERHALB des Pakets, die niemand erreichen darf.
  fs.writeFileSync(path.join(EXT_DIR, 'geheim.txt'), 'GEHEIM');
});

afterAll(() => {
  fs.rmSync(EXT_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveAppAsset', () => {
  it('liefert die Startdatei (entry) bei leerem Pfad', async () => {
    mockExt(appRow());
    const a = await extensionService.resolveAppAsset('notiz-app', '');
    expect(a.filePath.endsWith('index.html')).toBe(true);
    expect(a.contentType).toMatch(/text\/html/);
  });

  it('liefert eine Unterdatei mit passendem Content-Type', async () => {
    mockExt(appRow());
    const a = await extensionService.resolveAppAsset('notiz-app', 'assets/app.js');
    expect(a.filePath.endsWith('app.js')).toBe(true);
    expect(a.contentType).toMatch(/javascript/);
  });

  it('lehnt Nicht-App-Erweiterungen ab', async () => {
    mockExt(appRow({ ext_type: 'tool' }));
    await expect(extensionService.resolveAppAsset('notiz-app', '')).rejects.toThrow(
      /App-Erweiterungen/i
    );
  });

  it('verweigert einen Ausbruch aus dem Paket über ".."', async () => {
    mockExt(appRow());
    const p = extensionService.resolveAppAsset('notiz-app', '../geheim.txt');
    await expect(p).rejects.toThrow();
    // Und ganz sicher nicht den Inhalt der Außen-Datei.
    await p.catch(() => {});
  });

  it('verweigert einen Symlink aus dem Paket heraus', async () => {
    const link = path.join(PKG, 'raus.html');
    fs.symlinkSync(path.join(EXT_DIR, 'geheim.txt'), link);
    try {
      mockExt(appRow());
      await expect(extensionService.resolveAppAsset('notiz-app', 'raus.html')).rejects.toThrow(
        /verlässt das Erweiterungs-Paket/i
      );
    } finally {
      fs.unlinkSync(link);
    }
  });

  it('meldet eine fehlende Datei als NotFound', async () => {
    mockExt(appRow());
    await expect(extensionService.resolveAppAsset('notiz-app', 'gibtsnicht.html')).rejects.toThrow(
      /nicht gefunden/i
    );
  });
});
