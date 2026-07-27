/**
 * DB-Schicht der Projekt↔Repo-Kopplung (Plan 013, B9).
 *
 * Dünne CRUD-Schicht über `project_git`. Fachlogik (clone/pull/push, Konflikte)
 * liegt im `gitSyncService.js` — hier steht nur der Datenzugriff, damit beide
 * für Tests einzeln stehen.
 *
 * Der PAT wird AES-256-GCM-verschlüsselt abgelegt (utils/tokenCrypto → ein Buffer
 * IV||AuthTag||Ciphertext, 1:1 als BYTEA). Der Klartext-PAT verlässt diese Datei
 * nur über `entschluesselePat` an den vertrauenswürdigen Aufrufer (den Sync-
 * Dienst) — nie nach außen, nie ins Log.
 */

const database = require('../../database');
const { encryptToken, decryptToken } = require('../../utils/tokenCrypto');

/** Spalten, die nach außen gehen — bewusst OHNE `pat_encrypted` (Geheimnis). */
const SPALTEN = `project_id, repo_url, branch, pat_last4, local_path,
  last_synced_at, last_status, last_error, last_commit, created_at, updated_at`;

/** Kopplung eines Projekts (oder null), ohne den verschlüsselten PAT. */
async function getKopplung({ projectId }, { db = database } = {}) {
  const { rows } = await db.query(`SELECT ${SPALTEN} FROM project_git WHERE project_id = $1`, [
    projectId,
  ]);
  return rows[0] || null;
}

/**
 * Legt eine Kopplung an oder ersetzt sie (ein Projekt ↔ ein Repo). Ein leerer
 * PAT (`null`) lässt einen bestehenden Token unangetastet — so kann der Nutzer
 * Repo/Branch ändern, ohne den PAT erneut einzugeben.
 */
async function upsertKopplung(
  { projectId, repoUrl, branch = 'main', pat = null, localPath = null },
  { db = database } = {}
) {
  const patBuf = pat ? encryptToken(pat) : null;
  const patLast4 = pat ? pat.slice(-4) : null;

  const { rows } = await db.query(
    `INSERT INTO project_git
       (project_id, repo_url, branch, pat_encrypted, pat_last4, local_path, last_status)
     VALUES ($1, $2, $3, $4, $5, $6, 'verbunden')
     ON CONFLICT (project_id) DO UPDATE SET
       repo_url      = EXCLUDED.repo_url,
       branch        = EXCLUDED.branch,
       -- Nur überschreiben, wenn ein neuer PAT übergeben wurde.
       pat_encrypted = COALESCE(EXCLUDED.pat_encrypted, project_git.pat_encrypted),
       pat_last4     = COALESCE(EXCLUDED.pat_last4, project_git.pat_last4),
       local_path    = COALESCE(EXCLUDED.local_path, project_git.local_path),
       last_status   = 'verbunden',
       last_error    = NULL,
       updated_at    = NOW()
     RETURNING ${SPALTEN}`,
    [projectId, repoUrl, branch, patBuf, patLast4, localPath]
  );
  return rows[0];
}

/** Der entschlüsselte Klartext-PAT (oder null). Nur für den Sync-Dienst. */
async function entschluesselePat({ projectId }, { db = database } = {}) {
  const { rows } = await db.query(`SELECT pat_encrypted FROM project_git WHERE project_id = $1`, [
    projectId,
  ]);
  const buf = rows[0]?.pat_encrypted;
  return buf ? decryptToken(buf) : null;
}

/** Schreibt das Ergebnis eines Sync-Laufs zurück. */
async function markiereSync(
  { projectId, status, error = null, commit = null, localPath = null },
  { db = database } = {}
) {
  const { rows } = await db.query(
    `UPDATE project_git
        SET last_status    = $2,
            last_error     = $3,
            last_commit    = COALESCE($4, last_commit),
            local_path     = COALESCE($5, local_path),
            last_synced_at = CASE WHEN $2 = 'synchronisiert' THEN NOW() ELSE last_synced_at END,
            updated_at     = NOW()
      WHERE project_id = $1
      RETURNING ${SPALTEN}`,
    [projectId, status, error, commit, localPath]
  );
  return rows[0] || null;
}

/** Löst die Kopplung (und damit den gespeicherten PAT) für ein Projekt. */
async function loescheKopplung({ projectId }, { db = database } = {}) {
  const { rowCount } = await db.query(`DELETE FROM project_git WHERE project_id = $1`, [projectId]);
  return rowCount > 0;
}

module.exports = {
  getKopplung,
  upsertKopplung,
  entschluesselePat,
  markiereSync,
  loescheKopplung,
  SPALTEN,
};
