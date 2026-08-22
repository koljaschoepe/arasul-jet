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

/** Eine geänderte Datei gegenüber dem zuletzt geholten Stand (Plan 023 G3). */
export interface GitAenderung {
  art: 'neu' | 'geändert' | 'gelöscht' | 'umbenannt' | 'hinzugefügt' | 'Konflikt';
  pfad: string;
}

/**
 * Was ist hier anders als auf GitHub (Plan 023 G3)?
 *
 * Bewusst ohne Netzzugriff: verglichen wird mit dem Stand, den der letzte Sync
 * geholt hat. `stand` sagt, wann das war, damit die Anzeige nicht so tut, als
 * wüsste sie es besser.
 */
export interface GitAenderungen {
  gekoppelt: true;
  zweig: string;
  dateien: GitAenderung[];
  /** Weitere Dateien über dem Anzeigedeckel hinaus. */
  mehr: number;
  /** Eigene Commits, die noch nicht auf GitHub sind. */
  voraus: number;
  /** Commits auf GitHub, die hier noch fehlen (Stand des letzten Holens). */
  zurueck: number;
  stand: string | null;
  nieSynchronisiert: boolean;
}
