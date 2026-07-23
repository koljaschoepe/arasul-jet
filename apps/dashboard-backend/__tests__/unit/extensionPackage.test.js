/**
 * Erweiterungs-Paket-Format (Plan 012 Phase E · Schritt 16).
 *
 * Zwei Dinge stehen im Mittelpunkt:
 *  - Das Manifest wird hart geprüft: Id, Typ, Zugriffs-Stufe und die
 *    Startdatei müssen stimmen, sonst wird das Paket abgewiesen.
 *  - Einem hochgeladenen Archiv wird nichts geglaubt: Pfad-Ausbrüche und
 *    Symlinks werden verworfen, ein sauberes Archiv überlebt Pack→Entpack
 *    unverändert.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const pkg = require('../../src/services/extensions/extensionPackage');

const GUELTIG = {
  id: 'meine-app',
  name: 'Meine App',
  description: 'Tut etwas Nützliches.',
  type: 'app',
  accessTier: 'internet',
  version: '1.2.3',
  arasulExtensionVersion: 1,
  entry: 'index.html',
};

async function tmpDir(prefix = 'ext-test-') {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('validateManifest', () => {
  it('akzeptiert ein gültiges Manifest und reicht Zusatzfelder durch', () => {
    const m = pkg.validateManifest({ ...GUELTIG, eigenes: 'feld' });
    expect(m.id).toBe('meine-app');
    expect(m.type).toBe('app');
    expect(m.eigenes).toBe('feld');
  });

  it('setzt Standardwerte für accessTier, version und Formatversion', () => {
    const m = pkg.validateManifest({
      id: 'x1',
      name: 'X',
      type: 'tool',
      entry: 'tool.mjs',
    });
    expect(m.accessTier).toBe('internet');
    expect(m.version).toBe('0.1.0');
    expect(m.arasulExtensionVersion).toBe(1);
    expect(m.description).toBe('');
  });

  it.each([
    ['ungültige Id', { ...GUELTIG, id: 'Meine App' }],
    ['Id mit Slash', { ...GUELTIG, id: '../ausbruch' }],
    ['unbekannter Typ', { ...GUELTIG, type: 'plugin' }],
    ['unbekannte Zugriffs-Stufe', { ...GUELTIG, accessTier: 'root' }],
    ['fehlender Name', { ...GUELTIG, name: '' }],
    ['fehlende Startdatei', { ...GUELTIG, entry: '' }],
    ['Startdatei bricht aus', { ...GUELTIG, entry: '../../etc/passwd' }],
    ['absolute Startdatei', { ...GUELTIG, entry: '/etc/passwd' }],
    ['fremde Formatversion', { ...GUELTIG, arasulExtensionVersion: 99 }],
  ])('weist %s ab', (_name, manifest) => {
    expect(() => pkg.validateManifest(manifest)).toThrow();
  });

  it('weist Nicht-Objekte ab', () => {
    expect(() => pkg.validateManifest(null)).toThrow();
    expect(() => pkg.validateManifest([])).toThrow();
  });
});

describe('assertSafeId', () => {
  it('lässt saubere Ids durch', () => {
    expect(pkg.assertSafeId('a')).toBe('a');
    expect(pkg.assertSafeId('mein-tool-2')).toBe('mein-tool-2');
  });

  it('wirft bei Pfad-Trennern und Großbuchstaben', () => {
    for (const bad of ['../x', 'a/b', 'Gross', '-vorn', 'hinten-', '']) {
      expect(() => pkg.assertSafeId(bad)).toThrow();
    }
  });
});

describe('Pack → Entpack', () => {
  it('überlebt den Rundlauf inklusive Unterordner', async () => {
    const quelle = await tmpDir();
    const ziel = await tmpDir();
    await pkg.writeManifest(quelle, GUELTIG);
    await fsp.writeFile(path.join(quelle, 'index.html'), '<html>hallo</html>');
    await fsp.mkdir(path.join(quelle, 'assets'));
    await fsp.writeFile(path.join(quelle, 'assets', 'stil.css'), 'body{}');

    const archiv = path.join(await tmpDir(), 'paket.tar.gz');
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(archiv);
      pkg.packToStream(quelle).pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    });

    const manifest = await pkg.extractArchive(archiv, ziel);
    expect(manifest.id).toBe('meine-app');
    expect(await fsp.readFile(path.join(ziel, 'index.html'), 'utf8')).toBe('<html>hallo</html>');
    expect(await fsp.readFile(path.join(ziel, 'assets', 'stil.css'), 'utf8')).toBe('body{}');
  });

  it('weist ein Archiv ohne manifest.json ab', async () => {
    const quelle = await tmpDir();
    const ziel = await tmpDir();
    await fsp.writeFile(path.join(quelle, 'nur-text.txt'), 'kein Manifest');

    const archiv = path.join(await tmpDir(), 'ohne-manifest.tar.gz');
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(archiv);
      pkg.packToStream(quelle).pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    });

    await expect(pkg.extractArchive(archiv, ziel)).rejects.toThrow(/manifest\.json/i);
  });

  it('verwirft ein Archiv mit Symlink', async () => {
    const quelle = await tmpDir();
    const ziel = await tmpDir();
    await pkg.writeManifest(quelle, GUELTIG);
    await fsp.writeFile(path.join(quelle, 'index.html'), '<html></html>');
    await fsp.symlink('/etc/passwd', path.join(quelle, 'gehei.link'));

    const archiv = path.join(await tmpDir(), 'symlink.tar.gz');
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(archiv);
      pkg.packToStream(quelle).pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    });

    await expect(pkg.extractArchive(archiv, ziel)).rejects.toThrow(/Eintragstyp|unerlaubt/i);
    // Der Symlink darf auch nicht halb angelegt worden sein.
    await expect(fsp.lstat(path.join(ziel, 'gehei.link'))).rejects.toThrow();
  });

  it('verwirft ein Archiv mit Pfad-Ausbruch (../)', async () => {
    // Handgebauter tar-Eintrag: die tar-Bibliothek erzeugt so einen Pfad nicht
    // freiwillig, ein Angreifer-Archiv enthält ihn aber genau so.
    const ziel = await tmpDir();
    const name = '../ausbruch.txt';
    const inhalt = Buffer.from('boese\n');

    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'utf8');
    header.write('0000644\0', 100, 8, 'ascii'); // mode
    header.write('0000000\0', 108, 8, 'ascii'); // uid
    header.write('0000000\0', 116, 8, 'ascii'); // gid
    header.write(inhalt.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
    header.write('00000000000\0', 136, 12, 'ascii'); // mtime
    header.write('0', 156, 1, 'ascii'); // typeflag = normale Datei
    header.write('ustar\0' + '00', 257, 8, 'ascii');
    header.write('        ', 148, 8, 'ascii'); // Prüfsumme zunächst Leerzeichen
    let summe = 0;
    for (const b of header) summe += b;
    header.write(summe.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');

    const daten = Buffer.alloc(512);
    inhalt.copy(daten);
    const tarBuf = Buffer.concat([header, daten, Buffer.alloc(1024)]);
    const archiv = path.join(await tmpDir(), 'ausbruch.tar.gz');
    await fsp.writeFile(archiv, zlib.gzipSync(tarBuf));

    await expect(pkg.extractArchive(archiv, ziel)).rejects.toThrow();
    // Nichts darf oberhalb des Zielordners gelandet sein.
    await expect(fsp.access(path.join(ziel, '..', 'ausbruch.txt'))).rejects.toThrow();
  });
});
