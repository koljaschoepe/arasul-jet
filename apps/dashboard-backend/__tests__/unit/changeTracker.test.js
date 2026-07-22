/**
 * Änderungs-Verfolgung (Plan 011, Schritt 16).
 *
 * Zwei Ebenen: der Ordner-Abzug (gegen ein echtes Temp-Verzeichnis, damit die
 * Zusage — Symlinks nicht folgen, Deckel greifen — wirklich geprüft wird) und
 * der reine Vergleich zweier Abzüge (neu/geändert/gelöscht, Vorher/Nachher).
 */

const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const {
  snapshot,
  berechneAenderungen,
  STORE_MAX_BYTES,
} = require('../../src/services/skills/changeTracker');

let root;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'changetracker-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('snapshot', () => {
  it('erfasst Dateien rekursiv mit Inhalt', async () => {
    await fs.writeFile(path.join(root, 'a.txt'), 'Hallo');
    await fs.mkdir(path.join(root, 'unter'));
    await fs.writeFile(path.join(root, 'unter', 'b.txt'), 'Welt');

    const abzug = await snapshot([root]);
    expect(abzug.size).toBe(2);
    expect(abzug.get(path.join(root, 'a.txt')).inhalt).toBe('Hallo');
    expect(abzug.get(path.join(root, 'unter', 'b.txt')).inhalt).toBe('Welt');
  });

  it('gibt einen leeren Abzug für einen fehlenden Ordner zurück (kein Wurf)', async () => {
    const abzug = await snapshot([path.join(root, 'gibtsnicht')]);
    expect(abzug.size).toBe(0);
  });

  it('folgt keinem Symlink', async () => {
    await fs.writeFile(path.join(root, 'echt.txt'), 'x');
    try {
      await fs.symlink(path.join(root, 'echt.txt'), path.join(root, 'link.txt'));
    } catch {
      return; // Symlinks auf dieser Plattform nicht möglich → Test überspringen.
    }
    const abzug = await snapshot([root]);
    // Nur die echte Datei, nicht der Link.
    expect([...abzug.keys()].map(p => path.basename(p))).toEqual(['echt.txt']);
  });

  it('markiert eine Binärdatei statt ihren Inhalt zu halten', async () => {
    await fs.writeFile(path.join(root, 'bin'), Buffer.from([1, 2, 0, 3, 4]));
    const abzug = await snapshot([root]);
    const e = abzug.get(path.join(root, 'bin'));
    expect(e.binaer).toBe(true);
    expect(e.inhalt).toBeNull();
  });
});

describe('berechneAenderungen', () => {
  it('erkennt neu, geändert, gelöscht und ignoriert Unverändertes', async () => {
    await fs.writeFile(path.join(root, 'bleibt.txt'), 'gleich');
    await fs.writeFile(path.join(root, 'aendert.txt'), 'alt');
    await fs.writeFile(path.join(root, 'weg.txt'), 'verschwindet');
    const vorher = await snapshot([root]);

    // Änderungen am Ordner nachstellen.
    await fs.writeFile(path.join(root, 'aendert.txt'), 'neu');
    await fs.rm(path.join(root, 'weg.txt'));
    await fs.writeFile(path.join(root, 'frisch.txt'), 'gerade erst');
    const nachher = await snapshot([root]);

    const { aenderungen } = berechneAenderungen(vorher, nachher, [root]);
    const byPfad = Object.fromEntries(aenderungen.map(a => [a.pfad, a]));

    expect(byPfad['bleibt.txt']).toBeUndefined(); // unverändert → nicht gelistet
    expect(byPfad['frisch.txt']).toMatchObject({ art: 'neu', vorher: null, nachher: 'gerade erst' });
    expect(byPfad['aendert.txt']).toMatchObject({ art: 'geaendert', vorher: 'alt', nachher: 'neu' });
    expect(byPfad['weg.txt']).toMatchObject({ art: 'geloescht', vorher: 'verschwindet', nachher: null });
  });

  it('sortiert neu vor geändert vor gelöscht', () => {
    const v = new Map([
      ['/r/g.txt', { root: '/r', groesse: 1, mtimeMs: 1, inhalt: 'a', binaer: false, zuGross: false }],
      ['/r/d.txt', { root: '/r', groesse: 1, mtimeMs: 1, inhalt: 'x', binaer: false, zuGross: false }],
    ]);
    const n = new Map([
      ['/r/g.txt', { root: '/r', groesse: 1, mtimeMs: 2, inhalt: 'b', binaer: false, zuGross: false }],
      ['/r/n.txt', { root: '/r', groesse: 1, mtimeMs: 1, inhalt: 'y', binaer: false, zuGross: false }],
    ]);
    const { aenderungen } = berechneAenderungen(v, n, ['/r']);
    expect(aenderungen.map(a => a.art)).toEqual(['neu', 'geaendert', 'geloescht']);
  });

  it('vergleicht große Dateien über Größe/mtime (ohne Inhalt)', () => {
    const v = new Map([
      ['/r/big', { root: '/r', groesse: 999, mtimeMs: 100, inhalt: null, binaer: false, zuGross: true }],
    ]);
    // Gleiche Größe, andere mtime → geändert (Terminal fasst die mtime an).
    const n = new Map([
      ['/r/big', { root: '/r', groesse: 999, mtimeMs: 200, inhalt: null, binaer: false, zuGross: true }],
    ]);
    const { aenderungen } = berechneAenderungen(v, n, ['/r']);
    expect(aenderungen).toHaveLength(1);
    expect(aenderungen[0]).toMatchObject({ art: 'geaendert', hinweis: 'zu groß für Vorschau' });
  });

  it('verdeckt eine vorhandene Nachher-Vorschau NICHT mit einem alten Hinweis', () => {
    // Vorher war die Datei zu groß (kein Inhalt, Hinweis), jetzt ist sie klein
    // und lesbar. Der lesbare Nachher-Inhalt muss erhalten bleiben, ohne dass
    // ein „zu groß"-Hinweis ihn in der Anzeige verdeckt.
    const v = new Map([
      ['/r/f.txt', { root: '/r', groesse: 999999, mtimeMs: 1, inhalt: null, binaer: false, zuGross: true }],
    ]);
    const n = new Map([
      ['/r/f.txt', { root: '/r', groesse: 5, mtimeMs: 2, inhalt: 'klein', binaer: false, zuGross: false }],
    ]);
    const { aenderungen } = berechneAenderungen(v, n, ['/r']);
    expect(aenderungen).toHaveLength(1);
    expect(aenderungen[0]).toMatchObject({ art: 'geaendert', nachher: 'klein' });
    expect(aenderungen[0].hinweis).toBeNull(); // kein verdeckender Hinweis
  });

  it('kürzt lange Vorschauen und setzt gekuerzt', () => {
    const lang = 'x'.repeat(STORE_MAX_BYTES + 5000);
    const v = new Map();
    const n = new Map([
      ['/r/big.txt', { root: '/r', groesse: lang.length, mtimeMs: 1, inhalt: lang, binaer: false, zuGross: false }],
    ]);
    const { aenderungen } = berechneAenderungen(v, n, ['/r']);
    expect(aenderungen[0].gekuerzt).toBe(true);
    expect(Buffer.byteLength(aenderungen[0].nachher, 'utf8')).toBeLessThanOrEqual(STORE_MAX_BYTES);
  });

  it('stellt bei mehreren Ordnern den Ordnernamen des Zweitordners voran', () => {
    const v = new Map();
    const n = new Map([
      ['/quelle/datei.txt', { root: '/quelle', groesse: 1, mtimeMs: 1, inhalt: 'x', binaer: false, zuGross: false }],
    ]);
    const { aenderungen } = berechneAenderungen(v, n, ['/arbeit', '/quelle']);
    expect(aenderungen[0].pfad).toBe('quelle/datei.txt');
  });
});
