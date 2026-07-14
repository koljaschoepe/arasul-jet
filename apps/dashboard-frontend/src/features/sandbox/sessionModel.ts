/**
 * Session-Modell für Sandbox-Terminals — reine Helfer für die Identität
 * MEHRERER gleichzeitiger Sessions im selben Projekt (Container).
 *
 * Hintergrund: Das Backend hängt jede Terminal-Verbindung an eine tmux-Session
 * im Container. Zwei Verbindungen mit demselben tmux-Namen spiegeln denselben
 * Screen; für UNABHÄNGIGE Shells braucht jede Session einen distinkten,
 * stabilen tmux-Namen. Die erste Session eines Projekts nutzt 'main' (reattach
 * an das bereits laufende tmux + rückwärtskompatibel zum alten 1-Session-Modell,
 * dessen Session-Id == Projekt-Id war).
 */

import type { TerminalSession } from '@/stores/workspaceStore';
import type { SandboxProject } from './types';

/** Eine offene Session, aufgelöst auf frische (aktive) Projektdaten. */
export interface OpenSession {
  session: TerminalSession;
  project: SandboxProject;
}

/** tmux-Name der k-ten Session eines Projekts (1-basiert). k=1 → 'main'. */
export function terminalNameForIndex(k: number): string {
  return k === 1 ? 'main' : `main-${k}`;
}

/** Alle offenen Sessions eines Projekts, in Registry-Reihenfolge. */
export function sessionsForProject(
  projectId: string,
  sessions: TerminalSession[]
): TerminalSession[] {
  return sessions.filter(s => s.projectId === projectId);
}

/**
 * Nächste freie Session-Identität für ein Projekt.
 *
 * - Erste Session eines Projekts: `id === projectId`, tmux 'main'.
 * - Weitere Sessions: `id = ${projectId}#${k}`, tmux `main-${k}`.
 *
 * Der Index wird über die belegten tmux-Namen bestimmt (kleinster freier),
 * damit er über das Schließen einzelner Sessions hinweg kollisionsfrei bleibt.
 * Die Id ist zusätzlich gegen Kollisionen abgesichert.
 */
export function nextTerminalSession(
  projectId: string,
  title: string,
  existing: TerminalSession[]
): TerminalSession {
  const forProject = sessionsForProject(projectId, existing);
  if (forProject.length === 0) {
    return { id: projectId, projectId, title, terminalName: 'main' };
  }

  const usedNames = new Set(forProject.map(s => s.terminalName ?? 'main'));
  let k = 1;
  while (usedNames.has(terminalNameForIndex(k))) k++;
  const terminalName = terminalNameForIndex(k);

  const usedIds = new Set(existing.map(s => s.id));
  let id = terminalName === 'main' ? projectId : `${projectId}#${k}`;
  let suffix = k;
  while (usedIds.has(id)) {
    suffix++;
    id = `${projectId}#${suffix}`;
  }

  return { id, projectId, title, terminalName };
}
