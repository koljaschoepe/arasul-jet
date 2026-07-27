/**
 * Zod-Schemas für die Projekt↔Repo-Kopplung (Plan 013, B9).
 *
 * Nur HTTPS-GitHub-Remotes werden akzeptiert — SSH/`git://` scheiden aus, weil
 * die Authentisierung hier über einen HTTPS-PAT läuft (kein Deploy-Key-Handling).
 */

const { z } = require('zod');

const ProjectIdParams = z.object({ projectId: z.uuid('Ungültige Projekt-ID') }).strict();

/** HTTPS-Git-URL auf github.com (mit oder ohne `.git`). */
const RepoUrl = z
  .string()
  .trim()
  .max(300)
  .regex(
    /^https:\/\/(www\.)?github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(\.git)?\/?$/,
    'Nur HTTPS-URLs auf github.com (z.B. https://github.com/owner/repo)'
  );

/** Branch-Name: kein Leerraum, keine Git-Sonderzeichen. */
const Branch = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._\-/]+$/, 'Ungültiger Branch-Name')
  .default('main');

/**
 * Personal Access Token. Optional beim Ändern (leer = gespeicherten Token
 * behalten). Wird verschlüsselt gespeichert und nie zurückgegeben.
 */
const Pat = z.string().trim().min(8, 'Token zu kurz').max(500);

const ConnectGitBody = z
  .object({
    repo_url: RepoUrl,
    branch: Branch,
    pat: Pat.optional(),
  })
  .strict();

module.exports = {
  ProjectIdParams,
  ConnectGitBody,
  RepoUrl,
  Branch,
};
