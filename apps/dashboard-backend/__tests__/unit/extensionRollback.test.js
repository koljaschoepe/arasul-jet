/**
 * Rollback-Netz (Plan 017 Schritt 4) — echter Pack→Restore-Round-Trip der
 * Snapshot-Helfer gegen das Dateisystem (EXTENSIONS_DIR in einen Temp-Ordner
 * umgelenkt, BEVOR das Modul geladen wird).
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-rollback-'));
process.env.EXTENSIONS_DIR = TMP;

const pkg = require('../../src/services/extensions/extensionPackage');

const MANIFEST_V1 = {
  id: 'meine-app',
  name: 'Meine App',
  type: 'app',
  entry: 'index.html',
  version: '1.0.0',
  arasulExtensionVersion: 1,
};

async function schreibePaket(version, extra) {
  const dir = pkg.packageDirFor('meine-app');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ ...MANIFEST_V1, version })
  );
  await fsp.writeFile(path.join(dir, 'index.html'), extra || `v${version}`);
}

afterAll(async () => {
  await fsp.rm(TMP, { recursive: true, force: true });
});

describe('saveSnapshot / restoreSnapshot', () => {
  it('kein Snapshot, solange nichts gesichert wurde', async () => {
    expect(await pkg.hasSnapshot('meine-app')).toBe(false);
  });

  it('sichert den aktuellen Stand und stellt ihn nach Überschreiben wieder her', async () => {
    await schreibePaket('1.0.0', 'ALT');
    expect(await pkg.saveSnapshot('meine-app')).toBe(true);
    expect(await pkg.hasSnapshot('meine-app')).toBe(true);

    // Paket überschreiben (neue Version + geänderter Inhalt).
    await schreibePaket('2.0.0', 'NEU');
    expect(
      await fsp.readFile(path.join(pkg.packageDirFor('meine-app'), 'index.html'), 'utf8')
    ).toBe('NEU');

    // Rollback → der gesicherte v1-Stand ist wieder da.
    const manifest = await pkg.restoreSnapshot('meine-app');
    expect(manifest.version).toBe('1.0.0');
    expect(
      await fsp.readFile(path.join(pkg.packageDirFor('meine-app'), 'index.html'), 'utf8')
    ).toBe('ALT');
  });

  it('saveSnapshot ohne Paket-Ordner ist ein No-op', async () => {
    expect(await pkg.saveSnapshot('gibt-es-nicht')).toBe(false);
  });

  it('restoreSnapshot ohne Snapshot wirft', async () => {
    await expect(pkg.restoreSnapshot('gibt-es-nicht')).rejects.toThrow(/Rollback-Punkt/i);
  });

  it('removeSnapshot entfernt den Rollback-Punkt (idempotent)', async () => {
    await schreibePaket('3.0.0');
    await pkg.saveSnapshot('meine-app');
    expect(await pkg.hasSnapshot('meine-app')).toBe(true);
    await pkg.removeSnapshot('meine-app');
    expect(await pkg.hasSnapshot('meine-app')).toBe(false);
    await expect(pkg.removeSnapshot('meine-app')).resolves.toBeUndefined();
  });
});
