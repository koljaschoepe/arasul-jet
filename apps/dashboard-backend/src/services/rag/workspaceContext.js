/**
 * Workspace-Kontext (Plan 012 Phase A) — der EINE aktive Ordner + Pins.
 *
 * Ein aktiver Top-Level-Wissensraum bindet Chat + Suche global. Sein
 * Teilbaum (er selbst + alle Unterordner) ist der Default-RAG-Scope. Zusätzlich
 * angeheftete Dokumente/Unterordner (Pins) sind immer im Kontext, unabhängig
 * vom Auto-Routing.
 *
 * Einzel-Admin: der aktive Workspace ist eine app-weite Singleton-Einstellung
 * (system_settings.id = 1). Pins sind pro Nutzer (admin_users) abgelegt.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { ValidationError, NotFoundError } = require('../../utils/errors');

/**
 * Liefert die ID des aktiven Top-Level-Wissensraums (oder null).
 */
async function getActiveWorkspaceId() {
  const result = await db.query(
    'SELECT active_workspace_space_id FROM system_settings WHERE id = 1'
  );
  return result.rows[0]?.active_workspace_space_id || null;
}

/**
 * Setzt den aktiven Workspace. `spaceId === null` hebt die Bindung auf.
 * Validiert: der Raum existiert, ist ein Top-Level-Ordner (parent_id IS NULL)
 * und kein unsichtbarer Workspace-Raum (is_workspace = FALSE).
 */
async function setActiveWorkspaceId(spaceId) {
  if (spaceId) {
    const check = await db.query(
      `SELECT id, parent_id, is_workspace
         FROM knowledge_spaces
        WHERE id = $1`,
      [spaceId]
    );
    if (check.rows.length === 0) {
      throw new NotFoundError('Wissensbereich nicht gefunden');
    }
    const row = check.rows[0];
    if (row.parent_id) {
      throw new ValidationError('Nur Top-Level-Ordner können als Workspace aktiviert werden');
    }
    if (row.is_workspace) {
      throw new ValidationError('Interner Workspace-Raum kann nicht aktiviert werden');
    }
  }

  await db.query('UPDATE system_settings SET active_workspace_space_id = $1 WHERE id = 1', [
    spaceId,
  ]);
  logger.info(`Aktiver Workspace gesetzt: ${spaceId || '(keiner)'}`);
  return spaceId || null;
}

/**
 * Expandiert einen Ordner zu seinem gesamten Teilbaum (er selbst + alle
 * verschachtelten Unterordner). Gibt ein Array von Space-IDs zurück; bei
 * unbekannter/leerer ID ein leeres Array.
 */
async function expandSubtree(spaceId) {
  if (!spaceId) {
    return [];
  }
  const result = await db.query(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM knowledge_spaces WHERE id = $1
       UNION ALL
       SELECT ks.id FROM knowledge_spaces ks JOIN subtree s ON ks.parent_id = s.id
     )
     SELECT id FROM subtree`,
    [spaceId]
  );
  return result.rows.map(r => r.id);
}

/**
 * Liefert die Pins eines Nutzers, angereichert mit Anzeigenamen. Getrennt in
 * Dokument-Pins und Ordner-Pins.
 */
async function getPins(userId) {
  const result = await db.query(
    `SELECT p.id, p.document_id, p.space_id, p.created_at,
            d.filename, d.title,
            ks.name AS space_name
       FROM pinned_documents p
       LEFT JOIN documents d
         ON p.document_id = d.id AND d.deleted_at IS NULL
       LEFT JOIN knowledge_spaces ks
         ON p.space_id = ks.id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC`,
    [userId]
  );

  return (
    result.rows
      // Jede Pin-Zeile hat per CHECK genau ein Ziel; defensiv trotzdem filtern.
      .filter(row => row.document_id || row.space_id)
      .map(row => ({
        id: row.id,
        document_id: row.document_id,
        space_id: row.space_id,
        // Ordner-Pin: Ordnername; Dokument-Pin: Titel oder Dateiname.
        label: row.space_id ? row.space_name : row.title || row.filename,
        kind: row.space_id ? 'folder' : 'document',
        created_at: row.created_at,
      }))
  );
}

/**
 * Heftet ein Dokument ODER einen Unterordner an. Genau eines von beiden muss
 * gesetzt sein. Doppelte Pins sind idempotent (ON CONFLICT DO NOTHING über die
 * partiellen Unique-Indizes).
 */
async function addPin(userId, { documentId = null, spaceId = null }) {
  const hasDoc = !!documentId;
  const hasSpace = !!spaceId;
  if (hasDoc === hasSpace) {
    throw new ValidationError('Genau ein Ziel (Dokument oder Ordner) muss angegeben werden');
  }

  if (hasDoc) {
    const check = await db.query('SELECT id FROM documents WHERE id = $1 AND deleted_at IS NULL', [
      documentId,
    ]);
    if (check.rows.length === 0) {
      throw new NotFoundError('Dokument nicht gefunden');
    }
  } else {
    const check = await db.query('SELECT id FROM knowledge_spaces WHERE id = $1', [spaceId]);
    if (check.rows.length === 0) {
      throw new NotFoundError('Ordner nicht gefunden');
    }
  }

  const result = await db.query(
    `INSERT INTO pinned_documents (user_id, document_id, space_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [userId, documentId, spaceId]
  );

  // Bereits angeheftet → bestehenden Pin zurückgeben (idempotent).
  if (result.rows.length === 0) {
    const existing = await db.query(
      `SELECT id FROM pinned_documents
        WHERE user_id = $1
          AND document_id IS NOT DISTINCT FROM $2
          AND space_id IS NOT DISTINCT FROM $3`,
      [userId, documentId, spaceId]
    );
    return existing.rows[0]?.id || null;
  }
  return result.rows[0].id;
}

/**
 * Entfernt einen Pin (nur eigenen). Wirft NotFound, wenn nicht vorhanden.
 */
async function removePin(userId, pinId) {
  const result = await db.query(
    'DELETE FROM pinned_documents WHERE id = $1 AND user_id = $2 RETURNING id',
    [pinId, userId]
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Pin nicht gefunden');
  }
}

/**
 * Löst die Pins eines Nutzers in Qdrant-Filter-Bausteine auf:
 *  - spaceIds:    Ordner-Pins zu ihren Teilbäumen expandiert
 *  - documentIds: direkt angeheftete Dokumente
 */
async function resolvePinsForScope(userId) {
  const pins = await getPins(userId);
  const documentIds = pins.filter(p => p.kind === 'document').map(p => p.document_id);
  const folderPinIds = pins.filter(p => p.kind === 'folder').map(p => p.space_id);

  const spaceIds = [];
  for (const folderId of folderPinIds) {
    const sub = await expandSubtree(folderId);
    spaceIds.push(...sub);
  }

  return { spaceIds: [...new Set(spaceIds)], documentIds: [...new Set(documentIds)] };
}

module.exports = {
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  expandSubtree,
  getPins,
  addPin,
  removePin,
  resolvePinsForScope,
};
