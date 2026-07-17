/**
 * Workspace file indexer (Plan 008 Schritt 13).
 *
 * Macht Dateien, die ein Agent im Workspace schreibt, OHNE manuellen Upload
 * per RAG auffindbar — indem sie in die BEWÄHRTE Ingestion-Pipeline eingespeist
 * werden (Low-Risk Option a): eine gescopte `documents`-Zeile + MinIO-Objekt.
 * Der bestehende Python-`document-indexer` (unverändert) pollt den Bucket, findet
 * die pending-Zeile über den content_hash und indexiert sie mitsamt space_id nach
 * Qdrant. Jeder Chunk trägt damit die space_id des Workspace → RAG-Isolation.
 *
 * WICHTIG — Reihenfolge (Race gegen den 30s-Scan des Indexers):
 *   INSERT der gescopten documents-Zeile ZUERST, DANN Upload nach MinIO.
 *   Lädt man umgekehrt zuerst hoch, kann der Scan das Objekt sehen, keine
 *   passende Zeile finden und sich SELBST eine UNGESCOPTE Zeile anlegen
 *   (space_id NULL). Ein danach folgender gescopter INSERT liefe ins
 *   `ON CONFLICT (content_hash) DO NOTHING` und die Datei bliebe ungescopt —
 *   Isolation kaputt. Insert-first verhindert genau das.
 *
 * Der stabile Schlüssel je (Workspace, relativer Pfad) ist `original_filename`
 * (= normalisierter relPath). Ändert sich der Inhalt (neuer content_hash),
 * wird die vorige documents-Zeile via documentService.deleteDocument gelöscht,
 * damit keine veralteten Chunks akkumulieren.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const db = require('../../database');
const minioService = require('../documents/minioService');
const documentService = require('../documents/documentService');

// Nur textbasierte, vom Indexer parsebare Typen — das sind die Formate, die ein
// Agent typischerweise schreibt. Binär-/Office-Formate entstehen über das
// `dateien`-Werkzeug nicht und werden bewusst NICHT indexiert.
const INDEXABLE_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.yaml', '.yml']);

// Größendeckel (entspricht MAX_WRITE_BYTES des dateien-Werkzeugs).
const MAX_INDEX_BYTES = 1024 * 1024; // 1 MB

const MIME_BY_EXT = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
};

/**
 * Normalisiert einen Workspace-relativen Pfad zu einem stabilen Schlüssel.
 * Entfernt führende "./" und Slashes; POSIX-Trenner. Gibt null zurück, wenn der
 * Pfad aus dem Workspace ausbräche ("..").
 * @param {string} relPath
 * @returns {string|null}
 */
function normalizeRelPath(relPath) {
  const raw = String(relPath || '').trim();
  if (!raw) {
    return null;
  }
  const norm = path.posix.normalize(raw.replace(/\\/g, '/')).replace(/^\.?\//, '');
  if (!norm || norm === '.' || norm.startsWith('..')) {
    return null;
  }
  return norm;
}

/**
 * Baut einen MinIO-Objektnamen, der pro Version eindeutig ist (Zeitstempel) und
 * den Workspace-Space kapselt. Enthält keine roh übernommenen Pfadsegmente des
 * Nutzers — nur den sanitisierten Basisnamen.
 */
function buildObjectName(spaceId, relKey) {
  const base = minioService.sanitizeFilename(path.posix.basename(relKey));
  return `workspace/${spaceId}/${Date.now()}_${base}`;
}

/**
 * Indexiert EINE Datei eines Workspace in die RAG-Pipeline (best effort).
 *
 * @param {object} args
 * @param {{space_id:?string, slug?:string, host_path?:string}} args.workspace
 * @param {string} args.relPath - Pfad relativ zum Workspace (wie vom Agenten geschrieben).
 * @param {string} args.absPath - Absoluter Pfad der Datei auf der Platte.
 * @returns {Promise<{indexed:boolean, skipped?:string, documentId?:string}>}
 */
async function indexWorkspaceFile({ workspace, relPath, absPath } = {}) {
  const spaceId = workspace && workspace.space_id;
  // Ohne Space NIEMALS indexieren — eine ungescopte Zeile würde die Isolation
  // fail-open aufweichen (über ALLE Spaces auffindbar).
  if (!spaceId) {
    logger.debug('workspaceIndexer: workspace ohne space_id — Datei wird nicht indexiert');
    return { indexed: false, skipped: 'no-space' };
  }

  const relKey = normalizeRelPath(relPath);
  if (!relKey) {
    return { indexed: false, skipped: 'invalid-path' };
  }

  const ext = path.posix.extname(relKey).toLowerCase();
  if (!INDEXABLE_EXTENSIONS.has(ext)) {
    return { indexed: false, skipped: 'unsupported-extension' };
  }

  let buffer;
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) {
      return { indexed: false, skipped: 'not-a-file' };
    }
    if (stat.size > MAX_INDEX_BYTES) {
      logger.info(
        `workspaceIndexer: "${relKey}" überschreitet ${MAX_INDEX_BYTES} Bytes — übersprungen`
      );
      return { indexed: false, skipped: 'too-large' };
    }
    buffer = await fs.readFile(absPath);
  } catch (err) {
    logger.warn(`workspaceIndexer: konnte "${relKey}" nicht lesen: ${err.message}`);
    return { indexed: false, skipped: 'read-error' };
  }

  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

  // Vorherige Version dieser (Workspace, relPath)-Datei suchen — stabiler
  // Schlüssel ist original_filename + space_id.
  const existing = await db.query(
    `SELECT id, content_hash, file_path FROM documents
      WHERE space_id = $1 AND original_filename = $2 AND deleted_at IS NULL
      ORDER BY uploaded_at DESC`,
    [spaceId, relKey]
  );

  // Inhalt unverändert → nichts zu tun.
  const unchanged = existing.rows.find(r => r.content_hash === contentHash);
  if (unchanged) {
    return { indexed: false, skipped: 'unchanged', documentId: unchanged.id };
  }

  const filename = minioService.sanitizeFilename(path.posix.basename(relKey));
  const objectName = buildObjectName(spaceId, relKey);
  const fileHash = crypto
    .createHash('sha256')
    .update(`${objectName}:${buffer.length}`)
    .digest('hex');
  const mimeType = MIME_BY_EXT[ext] || 'text/plain';
  const docId = crypto.randomUUID();

  // (1) INSERT ZUERST (gescopt, pending). ON CONFLICT auf den partiellen
  //     content_hash-Unique-Index — matcht das Verhalten der /upload-Route.
  const insertResult = await db.query(
    `INSERT INTO documents (
        id, filename, original_filename, file_path, file_size,
        mime_type, file_extension, content_hash, file_hash,
        status, uploaded_by, space_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 'workspace-agent', $10)
     ON CONFLICT (content_hash) WHERE deleted_at IS NULL AND status <> 'deleted'
     DO NOTHING
     RETURNING id`,
    [
      docId,
      filename,
      relKey,
      objectName,
      buffer.length,
      mimeType,
      ext,
      contentHash,
      fileHash,
      spaceId,
    ]
  );

  // 0 Zeilen → identischer Inhalt existiert bereits global als (anderes)
  // Dokument. Nichts hochladen, nichts löschen — der Inhalt ist bereits im Index.
  if (insertResult.rows.length === 0) {
    logger.info(
      `workspaceIndexer: identischer Inhalt für "${relKey}" bereits vorhanden — übersprungen`
    );
    return { indexed: false, skipped: 'duplicate-content' };
  }

  // (2) DANN Upload nach MinIO. Schlägt er fehl, räumen wir die eben angelegte
  //     Zeile wieder ab (kompensierende Transaktion), damit keine Karteileiche
  //     mit fehlendem Objekt zurückbleibt.
  try {
    await minioService.uploadObject(objectName, buffer, buffer.length, {
      'Content-Type': mimeType,
    });
  } catch (uploadErr) {
    logger.warn(
      `workspaceIndexer: MinIO-Upload für "${relKey}" fehlgeschlagen (${uploadErr.message}) — räume DB-Zeile ab`
    );
    try {
      await db.query(`UPDATE documents SET deleted_at = NOW(), status = 'deleted' WHERE id = $1`, [
        docId,
      ]);
    } catch (cleanupErr) {
      logger.warn(`workspaceIndexer: Cleanup der DB-Zeile fehlgeschlagen: ${cleanupErr.message}`);
    }
    return { indexed: false, skipped: 'upload-error' };
  }

  // (3) Alte Versionen löschen (soft-delete + MinIO + Qdrant-Vektoren), damit
  //     keine veralteten Chunks akkumulieren. Deren file_path ist ein ANDERES
  //     Objekt (eindeutig je Version), der frische Upload bleibt unberührt.
  for (const old of existing.rows) {
    try {
      await documentService.deleteDocument(old.id, old.file_path);
    } catch (delErr) {
      logger.warn(
        `workspaceIndexer: konnte alte Version ${old.id} von "${relKey}" nicht löschen: ${delErr.message}`
      );
    }
  }

  logger.info(`workspaceIndexer: "${relKey}" für RAG eingespeist (space ${spaceId}, doc ${docId})`);
  return { indexed: true, documentId: docId };
}

/**
 * Vollständiger On-demand-Sync: alle indexierbaren Dateien im Workspace-Verzeichnis
 * einlesen und einspeisen. Best effort — Einzelfehler brechen den Lauf nicht ab.
 *
 * @param {{space_id:?string, slug?:string, host_path:string}} workspace
 * @returns {Promise<{indexed:number, skipped:number, scanned:number}>}
 */
async function syncWorkspace(workspace) {
  const hostPath = workspace && workspace.host_path;
  const summary = { indexed: 0, skipped: 0, scanned: 0 };
  if (!hostPath || !workspace.space_id) {
    logger.debug('syncWorkspace: kein host_path/space_id — übersprungen');
    return summary;
  }

  const MAX_ENTRIES = 2000;
  /** @param {string} dir @param {string} rel */
  async function walk(dir, rel) {
    if (summary.scanned >= MAX_ENTRIES) {
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      logger.warn(`syncWorkspace: readdir "${dir}" fehlgeschlagen: ${err.message}`);
      return;
    }
    for (const entry of entries) {
      if (summary.scanned >= MAX_ENTRIES) {
        return;
      }
      // Versteckte Verzeichnisse (.git etc.) auslassen.
      if (entry.name.startsWith('.')) {
        continue;
      }
      const abs = path.join(dir, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, childRel);
      } else if (entry.isFile()) {
        summary.scanned += 1;
        const ext = path.posix.extname(entry.name).toLowerCase();
        if (!INDEXABLE_EXTENSIONS.has(ext)) {
          summary.skipped += 1;
          continue;
        }
        try {
          const res = await indexWorkspaceFile({ workspace, relPath: childRel, absPath: abs });
          if (res.indexed) {
            summary.indexed += 1;
          } else {
            summary.skipped += 1;
          }
        } catch (err) {
          summary.skipped += 1;
          logger.warn(`syncWorkspace: "${childRel}" fehlgeschlagen: ${err.message}`);
        }
      }
    }
  }

  await walk(hostPath, '');
  logger.info(
    `syncWorkspace: ${workspace.slug || workspace.space_id} — ${summary.indexed} eingespeist, ${summary.skipped} übersprungen (${summary.scanned} gescannt)`
  );
  return summary;
}

module.exports = {
  indexWorkspaceFile,
  syncWorkspace,
  normalizeRelPath,
  INDEXABLE_EXTENSIONS,
  MAX_INDEX_BYTES,
};
