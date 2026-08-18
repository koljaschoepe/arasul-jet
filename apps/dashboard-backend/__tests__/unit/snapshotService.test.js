/**
 * snapshotService — mehrstufiges Undo pro Datei (Plan 022, Schritt 4).
 * Arbeitet gegen einen echten temporären Ordner (kein Mock-fs), weil der Dienst
 * eng am Dateisystem hängt (Symlink-sichere Wiederherstellung, Versionsstapel).
 */
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const snapshotService = require('../../src/services/flows/snapshotService');

describe('snapshotService', () => {
  let root;

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'snap-'));
  });
  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  async function schreibe(rel, inhalt) {
    const abs = path.join(root, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, inhalt, 'utf8');
  }
  async function lies(rel) {
    return fsp.readFile(path.join(root, rel), 'utf8');
  }

  it('macht ein Überschreiben mehrstufig rückgängig', async () => {
    await schreibe('a.txt', 'v1');
    await snapshotService.sichereVorher(root, 'a.txt', { existierte: true, altInhalt: 'v1' });
    await schreibe('a.txt', 'v2');
    await snapshotService.sichereVorher(root, 'a.txt', { existierte: true, altInhalt: 'v2' });
    await schreibe('a.txt', 'v3');

    const info = await snapshotService.versionsInfo(root, 'a.txt');
    expect(info.anzahl).toBe(2);

    let res = await snapshotService.wiederherstellen(root, 'a.txt');
    expect(res.ok).toBe(true);
    expect(await lies('a.txt')).toBe('v2');

    res = await snapshotService.wiederherstellen(root, 'a.txt');
    expect(res.ok).toBe(true);
    expect(await lies('a.txt')).toBe('v1');

    // Kein weiterer Snapshot → nichts mehr rückgängig.
    res = await snapshotService.wiederherstellen(root, 'a.txt');
    expect(res.ok).toBe(false);
  });

  it('löscht eine neu angelegte Datei beim Rückgängig (existierte=false)', async () => {
    await snapshotService.sichereVorher(root, 'neu.txt', { existierte: false });
    await schreibe('neu.txt', 'inhalt');

    const res = await snapshotService.wiederherstellen(root, 'neu.txt');
    expect(res.ok).toBe(true);
    expect(res.art).toBe('neu');
    expect(fs.existsSync(path.join(root, 'neu.txt'))).toBe(false);
  });

  it('kürzt einen reinen Anhang auf die alte Größe (art=trunc)', async () => {
    await schreibe('log.txt', 'AAAA');
    await snapshotService.sichereVorher(root, 'log.txt', {
      existierte: true,
      art: 'trunc',
      altGroesse: 4,
    });
    await fsp.appendFile(path.join(root, 'log.txt'), 'BBBB');
    expect(await lies('log.txt')).toBe('AAAABBBB');

    const res = await snapshotService.wiederherstellen(root, 'log.txt');
    expect(res.ok).toBe(true);
    expect(await lies('log.txt')).toBe('AAAA');
  });

  it('liefert den Vorher-Inhalt für den Diff', async () => {
    await schreibe('d.txt', 'alt');
    await snapshotService.sichereVorher(root, 'd.txt', { existierte: true, altInhalt: 'alt' });
    await schreibe('d.txt', 'neu');
    expect(await snapshotService.letzterInhalt(root, 'd.txt')).toBe('alt');
  });

  it('speichert keine Kopie über der Größengrenze', async () => {
    const gross = 'x'.repeat(snapshotService.MAX_SNAPSHOT_BYTES + 1);
    const gesichert = await snapshotService.sichereVorher(root, 'big.txt', {
      existierte: true,
      altInhalt: gross,
    });
    expect(gesichert).toBe(false);
    expect(await snapshotService.versionsInfo(root, 'big.txt')).toBeNull();
  });
});
