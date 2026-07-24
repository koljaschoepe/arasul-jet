/**
 * Projekt-Ebene (Workspace-Neuausrichtung Batch 2) — die oberste Ebene über den
 * Ordnern (knowledge_spaces.project_id).
 *
 * Ein Projekt bündelt mehrere Ordner und ist der Scope für Suche + Agenten: das
 * AKTIVE Projekt bestimmt, welche Ordner der Explorer zeigt und über welche
 * space_ids die RAG-Suche läuft. Einzel-Admin → das aktive Projekt ist eine
 * app-weite Singleton-Einstellung (system_settings.id = 1).
 *
 * Kein Qdrant-Re-Index nötig: Scoping bleibt ein space_id-Set im Qdrant-Filter;
 * ein Projekt löst sich zur Laufzeit in die space_ids seiner Ordner auf.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { generateSlug } = require('../../utils/slugGenerator');
const {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} = require('../../utils/errors');

/** ID des Standard-Projekts (is_default = TRUE). */
async function getDefaultProjectId() {
  const result = await db.query('SELECT id FROM projects WHERE is_default = TRUE LIMIT 1');
  return result.rows[0]?.id || null;
}

/**
 * ID des aktiven Projekts. Fällt auf das Standard-Projekt zurück, falls die
 * Einstellung leer ist (nie „gar kein Projekt aktiv" — es gibt immer Standard).
 */
async function getActiveProjectId() {
  const result = await db.query('SELECT active_project_id FROM system_settings WHERE id = 1');
  return result.rows[0]?.active_project_id || getDefaultProjectId();
}

/**
 * Die space_ids aller Ordner eines Projekts — der RAG-Scope des Projekts.
 * Die unsichtbaren Workspace-Räume (is_workspace = TRUE) tragen kein project_id
 * und sind damit automatisch nicht dabei.
 */
async function getProjectSpaceIds(projectId) {
  if (!projectId) {
    return [];
  }
  const result = await db.query('SELECT id FROM knowledge_spaces WHERE project_id = $1', [
    projectId,
  ]);
  return result.rows.map(r => r.id);
}

/** Alle Projekte mit Ordner-Zähler, sortiert. */
async function listProjects() {
  const result = await db.query(`
    SELECT p.id, p.name, p.slug, p.description, p.icon, p.color,
           p.is_default, p.sort_order, p.created_at, p.updated_at,
           COALESCE(fc.folder_count, 0)::int AS folder_count
      FROM projects p
      LEFT JOIN (
        SELECT project_id, COUNT(*) AS folder_count
          FROM knowledge_spaces
         WHERE is_workspace = FALSE
         GROUP BY project_id
      ) fc ON fc.project_id = p.id
     ORDER BY p.sort_order, p.name
  `);
  return result.rows;
}

/** Ein Projekt (oder NotFound). */
async function getProject(id) {
  const result = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Projekt nicht gefunden');
  }
  return result.rows[0];
}

/** Erzeugt einen eindeutigen Slug aus dem Namen (Muster wie bei knowledge_spaces). */
async function uniqueSlug(name) {
  const base = generateSlug(name);
  const existing = await db.query('SELECT slug FROM projects WHERE slug LIKE $1', [base + '%']);
  const taken = new Set(existing.rows.map(r => r.slug));
  if (!taken.has(base)) {
    return base;
  }
  let counter = 1;
  while (taken.has(`${base}-${counter}`)) {
    counter++;
  }
  return `${base}-${counter}`;
}

/** Neues Projekt anlegen. */
async function createProject({ name, description = null, icon = 'layers', color = '#6366f1' }) {
  const trimmed = name.trim();
  const dup = await db.query('SELECT id FROM projects WHERE LOWER(name) = LOWER($1)', [trimmed]);
  if (dup.rows.length > 0) {
    throw new ConflictError('Ein Projekt mit diesem Namen existiert bereits');
  }
  const slug = await uniqueSlug(trimmed);
  const sortResult = await db.query(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM projects'
  );
  const sortOrder = sortResult.rows[0].next_order;

  const result = await db.query(
    `INSERT INTO projects (name, slug, description, icon, color, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [trimmed, slug, description ? description.trim() : null, icon, color, sortOrder]
  );
  logger.info(`Projekt angelegt: ${trimmed} (${slug})`);
  return result.rows[0];
}

/** Projekt aktualisieren (Teil-Update). */
async function updateProject(id, patch) {
  await getProject(id); // wirft NotFound

  const fields = [];
  const params = [];
  let i = 1;
  const add = (col, val) => {
    fields.push(`${col} = $${i++}`);
    params.push(val);
  };

  if (patch.name !== undefined && patch.name.trim()) {
    const trimmed = patch.name.trim();
    const dup = await db.query(
      'SELECT id FROM projects WHERE LOWER(name) = LOWER($1) AND id <> $2',
      [trimmed, id]
    );
    if (dup.rows.length > 0) {
      throw new ConflictError('Ein Projekt mit diesem Namen existiert bereits');
    }
    add('name', trimmed);
  }
  if (patch.description !== undefined) {
    add('description', patch.description ? patch.description.trim() : null);
  }
  if (patch.icon !== undefined) {
    add('icon', patch.icon);
  }
  if (patch.color !== undefined) {
    add('color', patch.color);
  }
  if (patch.sort_order !== undefined) {
    add('sort_order', patch.sort_order);
  }

  if (fields.length === 0) {
    throw new ValidationError('Keine Änderungen angegeben');
  }
  fields.push('updated_at = NOW()');
  params.push(id);

  const result = await db.query(
    `UPDATE projects SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );
  logger.info(`Projekt aktualisiert: ${id}`);
  return result.rows[0];
}

/**
 * Projekt löschen. Nicht erlaubt für das Standard-Projekt oder solange es noch
 * Ordner enthält (der Nutzer räumt erst auf — kein stilles Mitreißen von
 * Ordnern/Dokumenten/Qdrant-Vektoren). War es das aktive Projekt, wird danach
 * das Standard-Projekt aktiv.
 */
async function deleteProject(id) {
  const project = await getProject(id);
  if (project.is_default) {
    throw new ForbiddenError('Das Standard-Projekt kann nicht gelöscht werden');
  }

  const folderCount = await db.query(
    'SELECT COUNT(*)::int AS c FROM knowledge_spaces WHERE project_id = $1',
    [id]
  );
  if ((folderCount.rows[0]?.c ?? 0) > 0) {
    throw new ConflictError(
      'Projekt enthält noch Ordner — bitte zuerst die Ordner löschen oder in ein anderes Projekt verschieben'
    );
  }

  const activeId = await getActiveProjectId();
  await db.query('DELETE FROM projects WHERE id = $1', [id]);

  // War es aktiv: aufs Standard-Projekt zurückfallen (der FK setzt die Spalte
  // per ON DELETE SET NULL auf NULL; wir setzen explizit Standard).
  if (activeId === id) {
    const def = await getDefaultProjectId();
    await db.query('UPDATE system_settings SET active_project_id = $1 WHERE id = 1', [def]);
  }
  logger.info(`Projekt gelöscht: ${id} (${project.name})`);
}

/** Aktives Projekt setzen. */
async function setActiveProjectId(projectId) {
  await getProject(projectId); // wirft NotFound
  await db.query('UPDATE system_settings SET active_project_id = $1 WHERE id = 1', [projectId]);
  logger.info(`Aktives Projekt gesetzt: ${projectId}`);
  return projectId;
}

module.exports = {
  getDefaultProjectId,
  getActiveProjectId,
  getProjectSpaceIds,
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  setActiveProjectId,
};
