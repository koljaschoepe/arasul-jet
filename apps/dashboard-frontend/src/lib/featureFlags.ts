/**
 * Client-seitige Feature-Flags (localStorage-basiert).
 *
 * `workspace-shell`: die IDE-artige Workspace-Shell ist seit Schritt 10 die
 * Standard-UI (Default an). Der Opt-out schreibt explizit den Wert `'false'`,
 * damit die alte Sidebar-Navigation wieder unter `/` erscheint. Die Legacy-UI
 * bleibt unabhängig vom Flag unter ihren bestehenden Routen erreichbar
 * (Fallback ohne Redeploy); nur der Einstieg auf `/` wird umgeschaltet.
 *
 * Semantik des localStorage-Werts unter `arasul_workspace_shell`:
 *   - `'false'`          → Shell aus (expliziter Opt-out)
 *   - `'true'`           → Shell an (alter Opt-in-Wert bleibt gültig)
 *   - nicht gesetzt / *  → Shell an (neuer Default)
 */
const WORKSPACE_SHELL_KEY = 'arasul_workspace_shell';

export function isWorkspaceShellEnabled(): boolean {
  try {
    return localStorage.getItem(WORKSPACE_SHELL_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setWorkspaceShellEnabled(enabled: boolean): void {
  try {
    // Beide Zustände werden explizit persistiert: `'false'` ist der Opt-out
    // (removeItem würde den Default `an` wiederherstellen und den Opt-out
    // wirkungslos machen), `'true'` der bewusste Opt-in.
    localStorage.setItem(WORKSPACE_SHELL_KEY, enabled ? 'true' : 'false');
  } catch {
    /* localStorage nicht verfügbar — Flag folgt dem Default */
  }
}
