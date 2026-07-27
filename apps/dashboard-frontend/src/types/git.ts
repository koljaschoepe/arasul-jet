/**
 * Typen der Projekt↔Repo-Kopplung (Plan 013, B9).
 *
 * Spiegelt `project_git` (Backend). Der PAT selbst erscheint NIE — nur die
 * maskierten letzten vier Zeichen (`pat_last4`).
 */

export type GitSyncStatus = 'neu' | 'verbunden' | 'synchronisiert' | 'konflikt' | 'fehler';

/** Kopplungs-/Sync-Status eines Projekts (ohne Geheimnis). */
export interface GitLink {
  project_id: string;
  repo_url: string;
  branch: string;
  pat_last4: string | null;
  local_path: string | null;
  last_synced_at: string | null;
  last_status: GitSyncStatus;
  last_error: string | null;
  last_commit: string | null;
  created_at: string;
  updated_at: string;
}

/** Ergebnis eines Sync-Laufs. */
export interface GitSyncResult {
  status: GitSyncStatus;
  commit: string | null;
  pushed: boolean;
  kopplung?: GitLink;
}
