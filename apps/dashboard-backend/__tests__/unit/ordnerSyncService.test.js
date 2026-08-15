/**
 * Ein-Ordner-Modell: Platte ↔ DB-Abgleich (ordnerSyncService).
 *
 * Die Tests arbeiten mit einem echten Temp-Ordner und einer Skript-Datenbank
 * (SQL-Erkennung per Teilstring) — geprüft wird das VERHALTEN: neue Datei →
 * Pipeline, gelöschte Datei → Dokument weg, Umzug → Pfad-Update statt
 * Neu-Indexierung.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ordnerSync = require('../../src/services/projects/ordnerSyncService');

describe('ordnerSyncService', () => {
  let dir;

  const raum = { id: 'raum-wurzel', name: 'Allgemein', slug: 'allgemein' };

  function fakeDeps({ dokumente = [], altOhnePfad = [] } = {}) {
    const queries = [];
    const db = {
      queries,
      query: jest.fn(async (sql, params = []) => {
        queries.push({ sql, params });
        if (sql.includes('FROM knowledge_spaces') && sql.includes('is_default = TRUE')) {
          return { rows: [raum] };
        }
        if (sql.includes('FROM knowledge_spaces') && sql.includes('rel_pfad = $2')) {
          return { rows: [] };
        }
        if (sql.includes('FROM knowledge_spaces') && sql.includes('rel_pfad IS NULL')) {
          return { rows: [] };
        }
        if (sql.includes('FROM knowledge_spaces') && sql.includes('rel_pfad IS NOT NULL')) {
          return { rows: [] };
        }
        if (sql.startsWith('SELECT 1 FROM knowledge_spaces')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO knowledge_spaces')) {
          return { rows: [{ id: `raum-${params[0]}`, name: params[0], slug: params[1] }] };
        }
        if (sql.includes('FROM documents') && sql.includes('rel_pfad IS NOT NULL')) {
          return { rows: dokumente };
        }
        if (sql.includes('FROM documents') && sql.includes('rel_pfad IS NULL')) {
          return { rows: altOhnePfad };
        }
        if (sql.includes('INSERT INTO documents')) {
          return { rows: [{ id: 'doc-neu' }] };
        }
        return { rows: [] };
      }),
    };
    const minio = {
      sanitizeFilename: n => n,
      enforceQuota: jest.fn(async () => {}),
      uploadObject: jest.fn(async () => {}),
      removeObject: jest.fn(async () => {}),
      getObject: jest.fn(),
    };
    const documentService = { deleteDocument: jest.fn(async () => true) };
    const qdrantService = { updateDocumentSpacePayload: jest.fn(async () => {}) };
    const ablage = { projektOrdner: jest.fn(async () => dir) };
    return { db, minio, documentService, qdrantService, ablage };
  }

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ordner-sync-'));
  });

  afterEach(async () => {
    ordnerSync.stoppe();
    await fsp.rm(dir, { recursive: true, force: true });
  });

  test('neue indexierbare Dateien (inkl. Bild → OCR) wandern in die Pipeline; Binäres bleibt draußen', async () => {
    await fsp.writeFile(path.join(dir, 'bericht.md'), '# Bericht');
    // Bilder werden seit dem QA-Sweep 2026-08-15 indexiert (OCR im Indexer).
    await fsp.writeFile(path.join(dir, 'scan.png'), Buffer.from([0x89, 0x50]));
    // Echtes Binäres bleibt weiterhin außen vor.
    await fsp.writeFile(path.join(dir, 'archiv.zip'), Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const deps = fakeDeps();
    const stats = await ordnerSync.synchronisiere('projekt-1', deps);

    expect(stats.neu).toBe(2); // bericht.md + scan.png, NICHT archiv.zip
    expect(deps.minio.uploadObject).toHaveBeenCalledTimes(2);
    const inserts = deps.db.queries.filter(q => q.sql.includes('INSERT INTO documents'));
    const relPfade = inserts.flatMap(q => q.params);
    expect(relPfade).toContain('bericht.md');
    expect(relPfade).toContain('scan.png'); // Bild wird indexiert
    expect(relPfade).not.toContain('archiv.zip'); // Binäres nicht
    expect(relPfade).toContain(raum.id); // Wurzel-Raum
  });

  test('verschwundene Datei löscht ihr Dokument (samt Vektoren/MinIO über documentService)', async () => {
    await fsp.writeFile(path.join(dir, '.arasul'), 'marker'); // gesunder Ordner
    const deps = fakeDeps({
      dokumente: [
        {
          id: 'doc-alt',
          rel_pfad: 'weg.md',
          content_hash: 'egal',
          file_path: 'minio/weg.md',
          file_size: 5,
          space_id: raum.id,
          uploaded_at: new Date(),
        },
      ],
    });
    const stats = await ordnerSync.synchronisiere('projekt-1', deps);

    expect(stats.geloescht).toBe(1);
    expect(deps.documentService.deleteDocument).toHaveBeenCalledWith('doc-alt', 'minio/weg.md');
  });

  test('Lösch-Sicherung: ohne Marker (fremder/leerer Ordner) wird NICHTS gelöscht', async () => {
    const deps = fakeDeps({
      dokumente: [
        {
          id: 'doc-1',
          rel_pfad: 'wichtig.md',
          content_hash: 'h1',
          file_size: 5,
          space_id: raum.id,
          uploaded_at: new Date(),
        },
      ],
    });
    const stats = await ordnerSync.synchronisiere('projekt-1', deps);

    expect(stats.geloescht).toBe(0);
    expect(deps.documentService.deleteDocument).not.toHaveBeenCalled();
    // Marker darf im verdächtigen Zustand NICHT entstehen (sonst löschte Runde 2).
    expect(fs.existsSync(path.join(dir, '.arasul'))).toBe(false);
  });

  test('Marker entsteht, sobald Platte und DB übereinstimmen', async () => {
    const deps = fakeDeps();
    await ordnerSync.synchronisiere('projekt-1', deps);
    expect(fs.existsSync(path.join(dir, '.arasul'))).toBe(true);
  });

  test('Umzug (gleicher Inhalt, neuer Pfad) aktualisiert den Pfad statt neu zu indexieren', async () => {
    const inhalt = '# Umzugsgut';
    await fsp.writeFile(path.join(dir, 'neu.md'), inhalt);
    const hash = crypto.createHash('sha256').update(inhalt).digest('hex');

    const deps = fakeDeps({
      dokumente: [
        {
          id: 'doc-umzug',
          rel_pfad: 'alt.md',
          content_hash: hash,
          file_size: Buffer.byteLength(inhalt),
          space_id: raum.id,
          uploaded_at: new Date(),
        },
      ],
    });
    const stats = await ordnerSync.synchronisiere('projekt-1', deps);

    expect(stats.verschoben).toBe(1);
    expect(stats.geloescht).toBe(0);
    expect(deps.documentService.deleteDocument).not.toHaveBeenCalled();
    expect(deps.minio.uploadObject).not.toHaveBeenCalled();
    const update = deps.db.queries.find(
      q => q.sql.includes('UPDATE documents SET rel_pfad') && q.params.includes('neu.md')
    );
    expect(update).toBeDefined();
  });

  test('geänderter Inhalt: alte Zeile raus, frisch in die Pipeline', async () => {
    await fsp.writeFile(path.join(dir, 'notiz.md'), 'Version 2 — anderer Inhalt');
    const deps = fakeDeps({
      dokumente: [
        {
          id: 'doc-v1',
          rel_pfad: 'notiz.md',
          content_hash: 'hash-von-version-1',
          file_path: 'minio/notiz.md',
          file_size: 999, // andere Größe → Verdacht → Hash-Vergleich
          space_id: raum.id,
          uploaded_at: new Date(0),
        },
      ],
    });
    const stats = await ordnerSync.synchronisiere('projekt-1', deps);

    expect(stats.geaendert).toBe(1);
    expect(deps.documentService.deleteDocument).toHaveBeenCalledWith('doc-v1', 'minio/notiz.md');
    expect(deps.minio.uploadObject).toHaveBeenCalledTimes(1);
  });

  test('leseBaum überspringt .git und Symlinks, liefert Eltern vor Kindern', async () => {
    await fsp.mkdir(path.join(dir, '.git'));
    await fsp.writeFile(path.join(dir, '.git', 'HEAD'), 'ref');
    await fsp.mkdir(path.join(dir, 'kunden', 'mueller'), { recursive: true });
    await fsp.writeFile(path.join(dir, 'kunden', 'mueller', 'angebot.md'), 'x');
    fs.symlinkSync('/etc', path.join(dir, 'link'));

    const { ordner, dateien } = await ordnerSync._intern.leseBaum(dir);
    expect(ordner.map(o => o.rel)).toEqual(['kunden', 'kunden/mueller']);
    expect(dateien.map(d => d.rel)).toEqual(['kunden/mueller/angebot.md']);
  });

  test('leseBaum überspringt flows/ NUR auf der obersten Ebene (Plan 014)', async () => {
    // Projektgebundene Flow-Definitionen gehören in die Registry, nicht in den
    // Wissens-Index — ein Nutzer-Unterordner namens flows bleibt aber Wissen.
    await fsp.mkdir(path.join(dir, 'flows'));
    await fsp.writeFile(path.join(dir, 'flows', 'angebot.md'), 'x');
    await fsp.mkdir(path.join(dir, 'projekte', 'flows'), { recursive: true });
    await fsp.writeFile(path.join(dir, 'projekte', 'flows', 'notiz.md'), 'x');

    const { ordner, dateien } = await ordnerSync._intern.leseBaum(dir);
    expect(ordner.map(o => o.rel)).toEqual(['projekte', 'projekte/flows']);
    expect(dateien.map(d => d.rel)).toEqual(['projekte/flows/notiz.md']);
  });

  test('Materialisieren beansprucht eine inhaltsgleiche Datei statt eine „-2"-Kopie anzulegen', async () => {
    const inhalt = '# Schon da';
    await fsp.writeFile(path.join(dir, 'bericht.md'), inhalt);

    const deps = fakeDeps();
    deps.db.query = jest.fn(async (sql, params = []) => {
      deps.db.queries.push({ sql, params });
      if (sql.includes('FROM knowledge_spaces')) {
        return { rows: [] };
      }
      if (sql.includes('FROM documents') && sql.includes('rel_pfad IS NULL')) {
        return {
          rows: [
            { id: 'doc-alt', filename: 'bericht.md', original_filename: 'bericht.md', file_path: 'minio/bericht.md', space_id: null },
          ],
        };
      }
      return { rows: [] };
    });
    const { Readable } = require('stream');
    deps.minio.getObject = jest.fn(async () => Readable.from([Buffer.from(inhalt)]));

    await ordnerSync.materialisiere('projekt-1', deps);

    // Kein Duplikat auf der Platte, Pfad zeigt auf die vorhandene Datei.
    expect(fs.existsSync(path.join(dir, 'bericht-2.md'))).toBe(false);
    const update = deps.db.queries.find(
      q => q.sql.includes('UPDATE documents SET rel_pfad') && q.params[0] === 'bericht.md'
    );
    expect(update).toBeDefined();
  });

  test('plattenName entschärft Pfad-Zeichen', () => {
    expect(ordnerSync._intern.plattenName('Kunde: A/B?')).toBe('Kunde- A-B-');
    expect(ordnerSync._intern.plattenName('..versteckt')).toBe('versteckt');
    expect(ordnerSync._intern.plattenName('')).toBe('ordner');
  });

  test('INDEXIERBAR umfasst OCR-Bildformate (QA-Sweep 2026-08-15)', () => {
    // Muss zu document_processor.PARSERS im Indexer passen, sonst würde ein
    // Dokument-Record entstehen, den der Indexer nicht verarbeiten kann.
    for (const ext of ['.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp', '.webp']) {
      expect(ordnerSync.INDEXIERBAR.has(ext)).toBe(true);
    }
    // Echtes Binäres bleibt draußen.
    expect(ordnerSync.INDEXIERBAR.has('.zip')).toBe(false);
    expect(ordnerSync.INDEXIERBAR.has('.exe')).toBe(false);
  });
});
