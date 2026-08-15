/**
 * Ein-Ordner-Modell — Abgleich Platte ↔ Datenbank (2026-07-29).
 *
 * Der Projektordner (`data/projects/<uuid>`) ist die EINZIGE Wahrheit:
 *
 *   - Jeder Unterordner spiegelt sich als `knowledge_spaces`-Zeile
 *     (`rel_pfad` = Pfad relativ zum Projektordner).
 *   - Jede indexierbare Datei spiegelt sich als `documents`-Zeile
 *     (`rel_pfad` gesetzt) und wandert automatisch durch die bestehende
 *     Index-Pipeline (MinIO → status 'pending' → Document-Indexer → Qdrant).
 *   - Verschwindet eine Datei von der Platte, verschwinden Dokument,
 *     MinIO-Objekt und Vektoren; verschwindet ein Ordner, verschwindet
 *     sein Raum.
 *
 * Zwei Richtungen, klar getrennt:
 *
 *   materialisiere() — EINMALIG je Altbestand (DB → Platte): Räume ohne
 *     `rel_pfad` bekommen einen Ordner, Dokumente ohne `rel_pfad` werden aus
 *     MinIO als Datei in ihren Ordner gelegt. Läuft bei jedem Takt mit und
 *     ist dann billig (zwei leere SELECTs) — so bleiben auch die alten
 *     Upload-/Space-Routen benutzbar: was sie anlegen, landet beim nächsten
 *     Takt auf der Platte.
 *
 *   synchronisiere() — laufend (Platte → DB): Abgleich per Größe/mtime,
 *     Inhalt per SHA-256 nur bei Verdacht. Umbenennen/Verschieben wird über
 *     den Hash erkannt und kostet KEINE Neu-Indexierung (Pfad-Update +
 *     Qdrant-Payload statt Pipeline-Neustart).
 *
 * Es gibt bewusst KEINEN fs-Watcher: Routen stoßen den Abgleich nach jeder
 * Datei-Operation direkt an (`trigger`), alles andere (Terminal, Git, Flows,
 * Sandbox-Mounts) fängt der Intervall-Takt ein. Ein Watcher über Container-
 * Bind-Mounts wäre die unzuverlässigere Abkürzung.
 *
 * Duplikate: identischer Inhalt an zwei Pfaden ist auf der Platte erlaubt,
 * indexiert wird er nur EINMAL (bestehender content_hash-Schutz). Die zweite
 * Datei bleibt sichtbar, bekommt aber keine eigene documents-Zeile.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const { dekodiereUploadName } = require('../../utils/uploadName');

// Lazy geladen, damit Tests einzelne Abhängigkeiten ersetzen können.
function deps(overrides = {}) {
  return {
    db: overrides.db || require('../../database'),
    minio: overrides.minio || require('../documents/minioService'),
    documentService: overrides.documentService || require('../documents/documentService'),
    qdrantService: overrides.qdrantService || require('../documents/qdrantService'),
    ablage: overrides.ablage || require('./ablageService'),
  };
}

/**
 * Dateiendungen, die in die Index-Pipeline gehören. Bilder sind seit dem
 * QA-Sweep 2026-08-15 dabei: Der Indexer OCR't sie lokal (tesseract via
 * `document_processor.PARSERS` → `parse_image`), damit hochgeladene Scans /
 * Screenshots im RAG auffindbar werden — vorher lief OCR nur für Bild-PDFs,
 * ein als PNG/JPG abgelegter Scan blieb unsichtbar. Die unterstützten
 * Bildendungen MÜSSEN mit `PARSERS` im Indexer übereinstimmen. Echtes Binäres
 * (Archive, Programme) bleibt weiter draußen.
 */
const INDEXIERBAR = new Set([
  '.pdf',
  '.docx',
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.html',
  '.htm',
  '.xml',
  '.yaml',
  '.yml',
  '.log',
  // Bilder → OCR im Indexer (muss zu document_processor.PARSERS passen).
  '.png',
  '.jpg',
  '.jpeg',
  '.tiff',
  '.tif',
  '.bmp',
  '.webp',
]);

const MAX_INDEX_BYTES = 50 * 1024 * 1024; // wie Upload-Deckel der Ablage
const MAX_SYNC_ENTRIES = 20000;
const MAX_SYNC_DEPTH = 20;
const VERSTECKT = new Set(['.git', 'node_modules', '__pycache__', '.venv', '.arasul']);

/**
 * Systemordner NUR auf der obersten Ebene des Projektordners (Plan 014,
 * Phase 1): `flows/` enthält die projektgebundenen Flow-Definitionen — die
 * gehören in die Flow-Registry, nicht als Dokumente in den Wissens-Index.
 * Bewusst nicht in VERSTECKT: ein Nutzer-Unterordner namens `flows` in
 * größerer Tiefe bleibt normales Wissen.
 */
const SYSTEM_WURZELORDNER = new Set(['flows']);

/** Marker eines gesunden Projektordners — Voraussetzung für Löschungen. */
const MARKER_DATEI = '.arasul';
const INTERVAL_MS = parseInt(process.env.ORDNER_SYNC_INTERVAL_MS || '20000', 10);

/**
 * Merkzettel „schon geprüft": rel → { size, mtimeMs }. Verhindert, dass eine
 * Datei mit junger mtime (z. B. frisch aus Git ausgecheckt) bei JEDEM Takt neu
 * gehasht wird. Lebt nur im Speicher — nach einem Neustart wird einmal ehrlich
 * nachgehasht.
 */
const gesehen = new Map(); // projectId → Map(rel → {size, mtimeMs})

/** Läufe je Projekt serialisieren — zwei Abgleiche desselben Ordners nie parallel. */
const laufend = new Map(); // projectId → Promise
const triggerTimer = new Map(); // projectId → Timeout

let intervalHandle = null;

/** SHA-256 einer Datei als Strom — 50-MB-PDFs nicht in den Heap ziehen. */
function hashDatei(abs) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(abs);
    s.on('data', d => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

/** MinIO-Objekt als Buffer (getObject liefert einen Strom). */
function ladeObjekt(minio, objectName) {
  return new Promise((resolve, reject) => {
    minio
      .getObject(objectName)
      .then(stream => {
        const teile = [];
        stream.on('data', d => teile.push(d));
        stream.on('end', () => resolve(Buffer.concat(teile)));
        stream.on('error', reject);
      })
      .catch(reject);
  });
}

/** Ordnername → plattentauglich (Windows-kritische Zeichen raus, Ränder säubern). */
function plattenName(name) {
  const sauber = String(name || '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 100)
    .trim();
  return sauber || 'ordner';
}

/** Eindeutigen Slug für einen neuen Raum finden (Spalte ist global UNIQUE). */
async function freierSlug(db, wunsch) {
  const basis =
    String(wunsch || 'ordner')
      .toLowerCase()
      .replace(/[äöüß]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] || c)
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'ordner';
  for (let i = 0; i < 50; i += 1) {
    const kandidat = i === 0 ? basis : `${basis}-${i + 1}`;
    const { rows } = await db.query('SELECT 1 FROM knowledge_spaces WHERE slug = $1', [kandidat]);
    if (rows.length === 0) {
      return kandidat;
    }
  }
  return `${basis}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Wurzel-Raum eines Projekts: Heimat aller Dateien, die direkt im
 * Projektordner liegen. Für das Standard-Projekt ist das der globale
 * „Allgemein"-Raum (is_default); andere Projekte bekommen bei Bedarf einen
 * eigenen Wurzel-Raum gleichen Namens.
 */
async function wurzelRaum(db, projectId) {
  const { rows } = await db.query(
    `SELECT id, name, slug FROM knowledge_spaces
      WHERE project_id = $1 AND rel_pfad IS NULL
        AND COALESCE(is_workspace, FALSE) = FALSE
        AND (is_default = TRUE OR lower(name) = 'allgemein')
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1`,
    [projectId]
  );
  if (rows.length > 0) {
    return rows[0];
  }
  const slug = await freierSlug(db, `allgemein-${String(projectId).slice(0, 8)}`);
  // is_system: der Wurzel-Raum ist Infrastruktur des Ordner-Syncs — löschbar
  // wäre er nur eine Quelle stiller Duplikate (nächster Takt legte ihn neu an).
  const neu = await db.query(
    `INSERT INTO knowledge_spaces (name, slug, description, icon, project_id, is_system)
     VALUES ('Allgemein', $1, 'Dateien direkt im Projektordner.', 'inbox', $2, TRUE)
     RETURNING id, name, slug`,
    [slug, projectId]
  );
  return neu.rows[0];
}

/**
 * Plattenbaum einlesen: Ordner (Eltern vor Kindern) und Dateien mit Stat.
 * `lesefehler` zählt nicht lesbare Ordner — bei > 0 ist der Baum UNVOLLSTÄNDIG
 * und darf nicht als Lösch-Grundlage dienen (sonst würde ein I/O-Schluckauf
 * ganze Wissensbestände wegräumen).
 */
async function leseBaum(dir) {
  const ordner = [];
  const dateien = [];
  let budget = MAX_SYNC_ENTRIES;
  let lesefehler = 0;

  async function rekurse(abs, rel, tiefe) {
    if (tiefe > MAX_SYNC_DEPTH || budget <= 0) {
      return;
    }
    let dirents;
    try {
      dirents = await fsp.readdir(abs, { withFileTypes: true });
    } catch (err) {
      lesefehler += 1;
      logger.warn(`Ordner-Sync: "${rel || '.'}" nicht lesbar: ${err.message}`);
      return;
    }
    for (const d of dirents) {
      if (VERSTECKT.has(d.name) || d.isSymbolicLink() || budget <= 0) {
        continue;
      }
      if (rel === '' && d.isDirectory() && SYSTEM_WURZELORDNER.has(d.name)) {
        continue;
      }
      const kindRel = rel ? `${rel}/${d.name}` : d.name;
      const kindAbs = path.join(abs, d.name);
      if (d.isDirectory()) {
        budget -= 1;
        ordner.push({ rel: kindRel, name: d.name, parentRel: rel });
        await rekurse(kindAbs, kindRel, tiefe + 1);
      } else if (d.isFile()) {
        budget -= 1;
        let stat;
        try {
          stat = await fsp.stat(kindAbs);
        } catch {
          continue;
        }
        dateien.push({
          rel: kindRel,
          name: d.name,
          parentRel: rel,
          abs: kindAbs,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        });
      }
    }
  }

  await rekurse(dir, '', 0);
  return { ordner, dateien, lesefehler };
}

/** Ordner → Räume abgleichen. Liefert Map parentRel/rel → Raum {id,name,slug}. */
async function syncRaeume(db, projectId, ordner, loeschenErlaubt) {
  const raumJeRel = new Map();
  raumJeRel.set('', await wurzelRaum(db, projectId));

  for (const o of ordner) {
    const vorhanden = await db.query(
      `SELECT id, name, slug FROM knowledge_spaces WHERE project_id = $1 AND rel_pfad = $2`,
      [projectId, o.rel]
    );
    if (vorhanden.rows.length > 0) {
      const raum = vorhanden.rows[0];
      if (raum.name !== o.name) {
        await db.query('UPDATE knowledge_spaces SET name = $1, updated_at = NOW() WHERE id = $2', [
          o.name.slice(0, 100),
          raum.id,
        ]);
        raum.name = o.name.slice(0, 100);
      }
      raumJeRel.set(o.rel, raum);
      continue;
    }

    // Alt-Raum ohne Platten-Spiegel „beanspruchen": gleicher Name, gleiche
    // Eltern-Ebene → das IST der Ordner, nur eben aus der Vor-Platten-Zeit.
    const parentId = o.parentRel ? raumJeRel.get(o.parentRel)?.id || null : null;
    const legacy = await db.query(
      `SELECT id, name, slug FROM knowledge_spaces
        WHERE project_id = $1 AND rel_pfad IS NULL
          AND COALESCE(is_workspace, FALSE) = FALSE AND is_default = FALSE
          AND lower(name) = lower($2)
          AND parent_id IS NOT DISTINCT FROM $3
        ORDER BY created_at ASC
        LIMIT 1`,
      [projectId, o.name, parentId]
    );
    if (legacy.rows.length > 0) {
      await db.query(
        'UPDATE knowledge_spaces SET rel_pfad = $1, updated_at = NOW() WHERE id = $2',
        [o.rel, legacy.rows[0].id]
      );
      raumJeRel.set(o.rel, legacy.rows[0]);
      continue;
    }

    const slug = await freierSlug(db, o.name);
    const neu = await db.query(
      `INSERT INTO knowledge_spaces (name, slug, description, icon, parent_id, project_id, rel_pfad)
       VALUES ($1, $2, $3, 'folder', $4, $5, $6)
       RETURNING id, name, slug`,
      [
        o.name.slice(0, 100),
        slug,
        `Ordner "${o.rel}" im Projektordner.`,
        parentId,
        projectId,
        o.rel,
      ]
    );
    raumJeRel.set(o.rel, neu.rows[0]);
  }

  // Räume, deren Ordner verschwunden ist, löschen (Dokumente regelt der
  // Datei-Abgleich; die FK setzt space_id verwaister Zeilen auf NULL).
  // NUR bei vollständig gelesenem Baum — sonst wäre ein Lesefehler ein Löschbefehl.
  if (loeschenErlaubt) {
    const disk = new Set(ordner.map(o => o.rel));
    const { rows: verwaist } = await db.query(
      `SELECT id, rel_pfad FROM knowledge_spaces
        WHERE project_id = $1 AND rel_pfad IS NOT NULL`,
      [projectId]
    );
    for (const raum of verwaist) {
      if (!disk.has(raum.rel_pfad)) {
        await db.query('DELETE FROM knowledge_spaces WHERE id = $1', [raum.id]);
        logger.info(`Ordner-Sync: Raum für gelöschten Ordner "${raum.rel_pfad}" entfernt`);
      }
    }
  }

  return raumJeRel;
}

/** Neue Datei in die Index-Pipeline geben (MinIO + documents-Zeile 'pending'). */
async function legeDokumentAn(d, { projectId, datei, spaceId }) {
  const { db, minio } = d;
  const buffer = await fsp.readFile(datei.abs);
  const filename = minio.sanitizeFilename(datei.name);
  const fileExt = filename.includes('.') ? '.' + filename.split('.').pop().toLowerCase() : '';
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const fileHash = crypto.createHash('sha256').update(`${filename}:${buffer.length}`).digest('hex');

  await minio.enforceQuota(buffer.length);
  const objectName = `${Date.now()}_${filename}`;
  await minio.uploadObject(objectName, buffer, buffer.length, {
    'Content-Type': 'application/octet-stream',
  });

  const insert = await db.query(
    `INSERT INTO documents (
        id, filename, original_filename, file_path, file_size,
        mime_type, file_extension, content_hash, file_hash,
        status, uploaded_by, space_id, project_id, rel_pfad
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 'ordner-sync', $10, $11, $12)
     ON CONFLICT (content_hash) WHERE deleted_at IS NULL AND status <> 'deleted'
     DO NOTHING
     RETURNING id`,
    [
      crypto.randomUUID(),
      filename,
      datei.name,
      objectName,
      buffer.length,
      'application/octet-stream',
      fileExt,
      contentHash,
      fileHash,
      spaceId,
      projectId,
      datei.rel,
    ]
  );
  if (insert.rows.length === 0) {
    // Inhaltsgleiches Dokument existiert schon (anderer Pfad) — Kopie wieder
    // wegräumen, Datei bleibt sichtbar, nur eben ohne zweiten Index-Eintrag.
    try {
      await minio.removeObject(objectName);
    } catch (err) {
      logger.warn(`Ordner-Sync: Duplikat-Aufräumen fehlgeschlagen: ${err.message}`);
    }
    return null;
  }
  return insert.rows[0].id;
}

/**
 * Platte → DB für EIN Projekt abgleichen.
 * @returns {Promise<{neu:number, geaendert:number, verschoben:number, geloescht:number}>}
 */
async function synchronisiere(projectId, overrides = {}) {
  const d = deps(overrides);
  const { db, documentService, qdrantService, ablage } = d;
  const stats = { neu: 0, geaendert: 0, verschoben: 0, geloescht: 0 };

  const dir = await ablage.projektOrdner(projectId);
  const { ordner, dateien, lesefehler } = await leseBaum(dir);

  const { rows: zeilen } = await db.query(
    `SELECT id, rel_pfad, content_hash, file_size, space_id, uploaded_at, file_path
       FROM documents
      WHERE project_id = $1 AND rel_pfad IS NOT NULL
        AND deleted_at IS NULL AND status <> 'deleted'`,
    [projectId]
  );

  // Lösch-Sicherung: Gelöscht wird nur, wenn der Baum vollständig gelesen
  // wurde UND die Marker-Datei `.arasul` da ist. Der Marker wird erst
  // geschrieben, wenn Platte und DB nachweislich übereinstimmen — ein leerer
  // oder fremder Ordner (nicht gemountetes Volume, umgezogene Platte) hat
  // keinen Marker und löst damit NIE Massen-Löschungen aus. Neues/Geändertes
  // wird auch im ausgesetzten Zustand normal verarbeitet.
  const marker = path.join(dir, MARKER_DATEI);
  const markerVorhanden = fs.existsSync(marker);
  const loeschenErlaubt = lesefehler === 0 && markerVorhanden;
  if (!loeschenErlaubt && zeilen.length > 0) {
    logger.warn(
      `Ordner-Sync ${projectId}: Löschungen ausgesetzt ` +
        `(${lesefehler} Lesefehler, Marker ${markerVorhanden ? 'da' : 'fehlt'}, ` +
        `${zeilen.length} Dokument(e) in der DB)`
    );
  }

  const raumJeRel = await syncRaeume(db, projectId, ordner, loeschenErlaubt);
  const zeileJePfad = new Map(zeilen.map(z => [z.rel_pfad, z]));
  const zeileJeHash = new Map(zeilen.map(z => [z.content_hash, z]));

  let cache = gesehen.get(String(projectId));
  if (!cache) {
    cache = new Map();
    gesehen.set(String(projectId), cache);
  }

  const beansprucht = new Set(); // rel_pfade alter Zeilen, die ein Rename übernommen hat
  const diskPfade = new Set();

  const verarbeiteDatei = async datei => {
    const raum = raumJeRel.get(datei.parentRel) || raumJeRel.get('');
    const zeile = zeileJePfad.get(datei.rel);

    if (zeile) {
      // Raum folgt dem Ordner — die Platte ist die Wahrheit.
      if (raum && zeile.space_id !== raum.id) {
        await db.query('UPDATE documents SET space_id = $1 WHERE id = $2', [raum.id, zeile.id]);
        qdrantService
          .updateDocumentSpacePayload(zeile.id, raum.id, raum.name, raum.slug)
          .catch(err => logger.warn(`Ordner-Sync: Qdrant-Payload: ${err.message}`));
      }
      const c = cache.get(datei.rel);
      const unveraendert =
        Number(zeile.file_size) === datei.size &&
        (c ? c.size === datei.size && c.mtimeMs === datei.mtimeMs : false);
      if (unveraendert) {
        return;
      }
      const hash = await hashDatei(datei.abs);
      cache.set(datei.rel, { size: datei.size, mtimeMs: datei.mtimeMs });
      if (hash === zeile.content_hash) {
        return;
      }
      // Inhalt geändert: alte Zeile samt Vektoren/MinIO austragen, frisch in
      // die Pipeline — sauberer als in einer indexierten Zeile herumzudoktern.
      await documentService.deleteDocument(zeile.id, zeile.file_path);
      const neuId = await legeDokumentAn(d, { projectId, datei, spaceId: raum?.id || null });
      if (neuId) {
        stats.geaendert += 1;
      }
      return;
    }

    // Kein Eintrag an diesem Pfad: Umzug? Alt-Dokument? Oder wirklich neu?
    const hash = await hashDatei(datei.abs);
    cache.set(datei.rel, { size: datei.size, mtimeMs: datei.mtimeMs });
    const perHash = zeileJeHash.get(hash);
    if (perHash && !fs.existsSync(path.join(dir, perHash.rel_pfad))) {
      // Umbenannt/verschoben: Pfad + Raum nachziehen, KEINE Neu-Indexierung.
      await db.query(
        `UPDATE documents SET rel_pfad = $1, filename = $2, original_filename = $2, space_id = $3
          WHERE id = $4`,
        [datei.rel, d.minio.sanitizeFilename(datei.name), raum?.id || null, perHash.id]
      );
      beansprucht.add(perHash.rel_pfad);
      cache.delete(perHash.rel_pfad);
      if (raum) {
        qdrantService
          .updateDocumentSpacePayload(perHash.id, raum.id, raum.name, raum.slug)
          .catch(err => logger.warn(`Ordner-Sync: Qdrant-Payload: ${err.message}`));
      }
      stats.verschoben += 1;
      return;
    }

    // Alt-Dokument (noch nie materialisiert) mit gleichem Inhalt → beanspruchen.
    const alt = await db.query(
      `SELECT id FROM documents
        WHERE project_id = $1 AND rel_pfad IS NULL AND content_hash = $2
          AND deleted_at IS NULL AND status <> 'deleted'
        ORDER BY uploaded_at ASC
        LIMIT 1`,
      [projectId, hash]
    );
    if (alt.rows.length > 0) {
      await db.query('UPDATE documents SET rel_pfad = $1, space_id = $2 WHERE id = $3', [
        datei.rel,
        raum?.id || null,
        alt.rows[0].id,
      ]);
      return;
    }

    const neuId = await legeDokumentAn(d, { projectId, datei, spaceId: raum?.id || null });
    if (neuId) {
      stats.neu += 1;
    }
  };

  for (const datei of dateien) {
    const ext = path.extname(datei.name).toLowerCase();
    if (!INDEXIERBAR.has(ext) || datei.size > MAX_INDEX_BYTES) {
      continue;
    }
    diskPfade.add(datei.rel);
    try {
      await verarbeiteDatei(datei);
    } catch (err) {
      // Eine kranke Datei (I/O, MinIO, DB) darf den Abgleich der übrigen
      // nicht mitreißen — nächste Runde probiert es erneut.
      logger.warn(`Ordner-Sync: "${datei.rel}" übersprungen: ${err.message}`);
    }
  }

  // Zeilen, deren Datei weg ist (und die kein Umzug übernommen hat).
  const fehlend = zeilen.filter(
    z =>
      !diskPfade.has(z.rel_pfad) &&
      !beansprucht.has(z.rel_pfad) &&
      !fs.existsSync(path.join(dir, z.rel_pfad))
  );
  if (loeschenErlaubt) {
    for (const zeile of fehlend) {
      try {
        await documentService.deleteDocument(zeile.id, zeile.file_path);
        cache.delete(zeile.rel_pfad);
        stats.geloescht += 1;
      } catch (err) {
        logger.warn(`Ordner-Sync: Dokument "${zeile.rel_pfad}" nicht löschbar: ${err.message}`);
      }
    }
  }

  // Marker setzen, sobald Platte und DB übereinstimmen (vollständiger Baum,
  // keine verwaisten Zeilen) — ab dann sind Löschungen in diesem Ordner erlaubt.
  if (!markerVorhanden && lesefehler === 0 && fehlend.length === 0) {
    try {
      await fsp.writeFile(
        marker,
        'Arasul-Projektordner — Marker des Ordner-Syncs, nicht löschen.\n',
        {
          flag: 'wx',
        }
      );
    } catch (err) {
      if (err.code !== 'EEXIST') {
        logger.warn(`Ordner-Sync ${projectId}: Marker nicht schreibbar: ${err.message}`);
      }
    }
  }

  if (stats.neu || stats.geaendert || stats.verschoben || stats.geloescht) {
    logger.info(
      `Ordner-Sync ${projectId}: ${stats.neu} neu, ${stats.geaendert} geändert, ` +
        `${stats.verschoben} verschoben, ${stats.geloescht} gelöscht`
    );
  }
  return stats;
}

/**
 * Altbestand DB → Platte holen: Räume ohne rel_pfad bekommen Ordner,
 * Dokumente ohne rel_pfad werden aus MinIO als Datei abgelegt.
 */
async function materialisiere(projectId, overrides = {}) {
  const d = deps(overrides);
  const { db, minio, ablage } = d;
  const dir = await ablage.projektOrdner(projectId);

  // 1) Räume: Ordner aus der Namenskette anlegen (Eltern vor Kindern).
  const { rows: raeume } = await db.query(
    `SELECT id, name, parent_id, rel_pfad FROM knowledge_spaces
      WHERE project_id = $1 AND COALESCE(is_workspace, FALSE) = FALSE`,
    [projectId]
  );
  const jeId = new Map(raeume.map(r => [r.id, r]));
  const pfadFuer = (raum, besucht = new Set()) => {
    if (raum.rel_pfad) {
      return raum.rel_pfad;
    }
    // Zyklus-Wächter: eine kaputte parent_id-Kette (nur per Direkt-SQL möglich)
    // darf den Sync nicht in die Endlos-Rekursion schicken.
    if (besucht.has(raum.id)) {
      return plattenName(raum.name);
    }
    besucht.add(raum.id);
    const eltern = raum.parent_id ? jeId.get(raum.parent_id) : null;
    const basis = eltern ? pfadFuer(eltern, besucht) : '';
    return basis ? `${basis}/${plattenName(raum.name)}` : plattenName(raum.name);
  };
  for (const raum of raeume) {
    // Wurzel-Räume („Allgemein"/is_default) bleiben ohne Platten-Ordner.
    const istWurzel =
      !raum.parent_id && raum.rel_pfad === null && /^allgemein$/i.test(raum.name || '');
    if (raum.rel_pfad || istWurzel) {
      continue;
    }
    const rel = pfadFuer(raum);
    try {
      await fsp.mkdir(path.join(dir, rel), { recursive: true });
      await db.query(
        'UPDATE knowledge_spaces SET rel_pfad = $1, updated_at = NOW() WHERE id = $2',
        [rel, raum.id]
      );
      raum.rel_pfad = rel;
    } catch (err) {
      logger.warn(`Materialisieren: Ordner "${rel}" fehlgeschlagen: ${err.message}`);
    }
  }

  // 2) Dokumente: Datei aus MinIO in den Ordner ihres Raums legen.
  const { rows: docs } = await db.query(
    `SELECT d.id, d.filename, d.original_filename, d.file_path, d.space_id
       FROM documents d
      WHERE d.project_id = $1 AND d.rel_pfad IS NULL
        AND d.deleted_at IS NULL AND d.status <> 'deleted'`,
    [projectId]
  );
  let geholt = 0;
  for (const doc of docs) {
    const raum = doc.space_id ? jeId.get(doc.space_id) : null;
    const zielOrdner = raum?.rel_pfad || '';
    // Historische `original_filename`-Werte können latin1-Mojibake tragen
    // („invoiceÂ·…") — vor dem multer-Fix hochgeladen. Idempotent reparieren,
    // damit der kaputte Name nicht auf der Platte materialisiert wird.
    const basisName = path.basename(
      dekodiereUploadName(doc.original_filename || doc.filename || 'dokument')
    );
    let rel = zielOrdner ? `${zielOrdner}/${basisName}` : basisName;
    try {
      const buffer = await ladeObjekt(minio, doc.file_path);
      // Namens-Kollision auf der Platte: Liegt dort bereits DIESELBE Datei
      // (gleicher Inhalt), wird sie schlicht beansprucht statt als „-2"-Kopie
      // dupliziert; nur bei anderem Inhalt weicht der Name aus.
      const inhaltHash = crypto.createHash('sha256').update(buffer).digest('hex');
      let kandidat = rel;
      const ext = path.extname(basisName);
      const stamm = basisName.slice(0, basisName.length - ext.length);
      let beansprucht = false;
      for (let i = 2; fs.existsSync(path.join(dir, kandidat)) && i < 100; i += 1) {
        if ((await hashDatei(path.join(dir, kandidat))) === inhaltHash) {
          beansprucht = true;
          break;
        }
        kandidat = zielOrdner ? `${zielOrdner}/${stamm}-${i}${ext}` : `${stamm}-${i}${ext}`;
      }
      rel = kandidat;
      if (!beansprucht) {
        await fsp.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
        await fsp.writeFile(path.join(dir, rel), buffer);
      }
      await db.query('UPDATE documents SET rel_pfad = $1 WHERE id = $2', [rel, doc.id]);
      geholt += 1;
    } catch (err) {
      logger.warn(`Materialisieren: Dokument ${doc.id} ("${rel}") fehlgeschlagen: ${err.message}`);
    }
  }
  if (geholt > 0) {
    logger.info(`Materialisieren ${projectId}: ${geholt} Dokument(e) auf die Platte geholt`);
  }
  return { dokumente: geholt };
}

/**
 * Git-gekoppelte Projekte (project_git) tragen einen kompletten Repo-Checkout
 * im Ordner. Der wird NICHT automatisch in die Wissens-Pipeline gegeben —
 * hunderte Repo-Dateien (Configs, Lockfiles, Docs) würden Stunden GPU-Zeit
 * für KI-Analysen verbrennen und den RAG-Index vergiften. Der Coding-Agent
 * arbeitet auf Repos über Datei-Werkzeuge und Terminal, nicht über RAG.
 */
async function istGitGekoppelt(projectId, d) {
  const { rows } = await d.db.query('SELECT 1 FROM project_git WHERE project_id = $1', [projectId]);
  return rows.length > 0;
}

/** Einen Lauf je Projekt serialisieren (materialisieren + abgleichen). */
function laufFuer(projectId, overrides = {}) {
  const kette = Promise.resolve(laufend.get(String(projectId)))
    .catch(() => {})
    .then(async () => {
      if (await istGitGekoppelt(projectId, deps(overrides))) {
        return null;
      }
      await materialisiere(projectId, overrides);
      return synchronisiere(projectId, overrides);
    });
  laufend.set(String(projectId), kette);
  return kette;
}

/**
 * Abgleich bald anstoßen (entprellt) — Routen rufen das nach jeder
 * Datei-Operation, damit der Baum nicht auf den nächsten Takt warten muss.
 */
function trigger(projectId, overrides = {}) {
  const key = String(projectId);
  if (triggerTimer.has(key)) {
    return;
  }
  const timer = setTimeout(() => {
    triggerTimer.delete(key);
    laufFuer(projectId, overrides).catch(err =>
      logger.warn(`Ordner-Sync (Trigger) ${projectId}: ${err.message}`)
    );
  }, 500);
  // Ein anstehender Abgleich darf den Prozess nicht am Leben halten (Tests,
  // Shutdown) — verpasst wird nichts, der Intervall-Takt holt ihn nach.
  timer.unref?.();
  triggerTimer.set(key, timer);
}

/** Alle Projekte einmal abgleichen. */
async function alleProjekte(overrides = {}) {
  const d = deps(overrides);
  const { rows } = await d.db.query('SELECT id FROM projects');
  for (const projekt of rows) {
    try {
      await laufFuer(projekt.id, overrides);
    } catch (err) {
      logger.warn(`Ordner-Sync ${projekt.id}: ${err.message}`);
    }
  }
}

/** Boot: Altbestand materialisieren, dann Intervall-Takt starten. */
function starte(overrides = {}) {
  if (intervalHandle) {
    return;
  }
  alleProjekte(overrides).catch(err => logger.error(`Ordner-Sync (Boot): ${err.message}`));
  intervalHandle = setInterval(() => {
    alleProjekte(overrides).catch(err => logger.warn(`Ordner-Sync (Takt): ${err.message}`));
  }, INTERVAL_MS);
  intervalHandle.unref?.();
  logger.info(`Ordner-Sync gestartet (Takt: ${INTERVAL_MS} ms)`);
}

/** Nur für Tests/Shutdown. */
function stoppe() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  for (const t of triggerTimer.values()) {
    clearTimeout(t);
  }
  triggerTimer.clear();
  laufend.clear();
  gesehen.clear();
}

module.exports = {
  INDEXIERBAR,
  synchronisiere,
  materialisiere,
  trigger,
  starte,
  stoppe,
  _intern: { leseBaum, plattenName, freierSlug, wurzelRaum },
};
