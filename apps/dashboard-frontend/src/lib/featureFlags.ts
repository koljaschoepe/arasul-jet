/**
 * Client-seitige Feature-Flags (localStorage-basiert).
 *
 * `workspace-shell`: schaltet die IDE-artige Workspace-Shell als Standard-UI
 * ein. Die alte Sidebar-Navigation bleibt unabhängig vom Flag unter ihren
 * bestehenden Routen erreichbar (Fallback ohne Redeploy).
 */
const WORKSPACE_SHELL_KEY = 'arasul_workspace_shell';

export function isWorkspaceShellEnabled(): boolean {
  try {
    return localStorage.getItem(WORKSPACE_SHELL_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setWorkspaceShellEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(WORKSPACE_SHELL_KEY, 'true');
    } else {
      localStorage.removeItem(WORKSPACE_SHELL_KEY);
    }
  } catch {
    /* localStorage nicht verfügbar — Flag bleibt aus */
  }
}
