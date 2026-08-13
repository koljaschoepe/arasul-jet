/**
 * Einmaliger Boot-Backfill (Plan 018: Projekt-Vereinheitlichung).
 *
 * Vor Plan 018 waren Sandbox-Container (sandbox_projects) und Workspace-Projekte
 * (projects) getrennt; die Kopplung `sandbox_projects.project_id` wurde nur
 * manuell gesetzt. Nach der Vereinheitlichung leitet das Terminal seinen
 * Container aus dem aktiven Workspace-Projekt ab — jeder eigenständige Container
 * braucht daher eine Kopplung, sonst wäre er über die neue Oberfläche nicht mehr
 * erreichbar.
 *
 * Dieser Backfill koppelt jeden aktiven, ungekoppelten Container an ein
 * Workspace-Projekt:
 *   1. Gibt es ein Projekt mit gleichem Namen (case-insensitiv), das noch nicht
 *      an einen aktiven Container gekoppelt ist → koppeln.
 *   2. Sonst ein Workspace-Projekt anlegen (über projectService, damit Slug +
 *      DB-Zeile sauber entstehen) und koppeln; der Ablage-Ordner wird
 *      sichergestellt (Ordner + DB zusammen).
 *
 * Idempotent (koppelt nur NULL → Wert, legt Projekte nur bei fehlendem Match
 * an) und best-effort — Fehler dürfen den Boot nie blockieren. Uneindeutige
 * Namen werden protokolliert, nicht geraten. Die 1:1-Beziehung ist zusätzlich
 * per Unique-Index (Migration 139) abgesichert.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const projectService = require('../rag/projectService');
const ablageService = require('../projects/ablageService');

/**
 * Legt ein Workspace-Projekt mit eindeutigem Namen an. projectService wirft bei
 * Namensgleichheit ConflictError — dann mit Suffix erneut versuchen, damit ein
 * Container mit belegtem Namen trotzdem sein eigenes Projekt bekommt.
 */
async function createUniqueWorkspaceProject(baseName) {
  const candidates = [baseName, `${baseName} (Terminal)`];
  for (let i = 2; i <= 20; i++) {
    candidates.push(`${baseName} (${i})`);
  }
  let lastErr = null;
  for (const name of candidates) {
    try {
      return await projectService.createProject({ name });
    } catch (err) {
      // 23505 (PG) oder ConflictError (Service) → nächster Kandidat.
      if (err.code === '23505' || err.name === 'ConflictError' || err.status === 409) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('Kein eindeutiger Projektname gefunden');
}

async function backfillProjectLinks() {
  const unlinked = await db.query(
    `SELECT id, name, slug FROM sandbox_projects
     WHERE project_id IS NULL AND status = 'active'
     ORDER BY created_at ASC, id ASC`
  );
  if (unlinked.rows.length === 0) {
    return { linked: 0, created: 0, skipped: 0 };
  }

  // Bereits an aktive Container gekoppelte Projekt-IDs — nie doppelt belegen.
  const usedRes = await db.query(
    `SELECT project_id FROM sandbox_projects
     WHERE project_id IS NOT NULL AND status = 'active'`
  );
  const usedProjectIds = new Set(usedRes.rows.map(r => r.project_id));

  const projects = await projectService.listProjects();
  // Name → [projectIds] (case-insensitiv), für die Namensgleichheits-Zuordnung.
  const byName = new Map();
  for (const p of projects) {
    const key = p.name.trim().toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, []);
    }
    byName.get(key).push(p.id);
  }

  let linked = 0;
  let created = 0;
  let skipped = 0;

  for (const sp of unlinked.rows) {
    try {
      const nameKey = (sp.name || '').trim().toLowerCase();
      let targetProjectId = null;

      // 1. Freies, namensgleiches Workspace-Projekt suchen.
      const candidates = byName.get(nameKey) || [];
      const free = candidates.find(id => !usedProjectIds.has(id));
      if (free) {
        targetProjectId = free;
      } else {
        // 2. Neues Workspace-Projekt anlegen + koppeln.
        const created2 = await createUniqueWorkspaceProject(sp.name || 'Projekt');
        targetProjectId = created2.id;
        created++;
        const key = created2.name.trim().toLowerCase();
        if (!byName.has(key)) {
          byName.set(key, []);
        }
        byName.get(key).push(created2.id);
      }

      // Ablage-Ordner sicherstellen (Ordner + DB zusammen), dann koppeln.
      await ablageService.projektOrdner(targetProjectId).catch(err => {
        logger.warn(
          `Backfill: Ablage-Ordner für ${targetProjectId} nicht sicherstellbar: ${err.message}`
        );
      });
      const upd = await db.query(
        `UPDATE sandbox_projects SET project_id = $1
         WHERE id = $2 AND project_id IS NULL AND status = 'active'`,
        [targetProjectId, sp.id]
      );
      if (upd.rowCount > 0) {
        usedProjectIds.add(targetProjectId);
        linked++;
      } else {
        skipped++;
      }
    } catch (err) {
      skipped++;
      logger.warn(`Backfill: Container "${sp.slug}" (${sp.id}) nicht gekoppelt: ${err.message}`);
    }
  }

  logger.info(
    `Plan 018 Backfill: ${linked} Container gekoppelt (${created} neue Projekte angelegt, ${skipped} übersprungen)`
  );
  return { linked, created, skipped };
}

module.exports = { backfillProjectLinks };
