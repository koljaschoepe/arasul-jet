import { afterEach, describe, expect, it } from 'vitest';
import { isWorkspaceShellEnabled, setWorkspaceShellEnabled } from '../../lib/featureFlags';

const KEY = 'arasul_workspace_shell';

describe('workspace-shell feature flag (Schritt 10: Default an)', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('ist standardmäßig aktiv, wenn nichts gespeichert ist', () => {
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(isWorkspaceShellEnabled()).toBe(true);
  });

  it('bleibt für den alten Opt-in-Wert "true" aktiv', () => {
    localStorage.setItem(KEY, 'true');
    expect(isWorkspaceShellEnabled()).toBe(true);
  });

  it('ist nur beim expliziten Opt-out-Wert "false" deaktiviert', () => {
    localStorage.setItem(KEY, 'false');
    expect(isWorkspaceShellEnabled()).toBe(false);
  });

  it('behandelt unbekannte Werte als aktiv (Default)', () => {
    localStorage.setItem(KEY, 'irgendwas');
    expect(isWorkspaceShellEnabled()).toBe(true);
  });

  it('setWorkspaceShellEnabled(false) schreibt "false" (kein removeItem)', () => {
    setWorkspaceShellEnabled(false);
    expect(localStorage.getItem(KEY)).toBe('false');
    expect(isWorkspaceShellEnabled()).toBe(false);
  });

  it('setWorkspaceShellEnabled(true) schreibt "true" und hebt einen Opt-out auf', () => {
    setWorkspaceShellEnabled(false);
    expect(isWorkspaceShellEnabled()).toBe(false);

    setWorkspaceShellEnabled(true);
    expect(localStorage.getItem(KEY)).toBe('true');
    expect(isWorkspaceShellEnabled()).toBe(true);
  });

  it('Opt-out überlebt einen Round-Trip (persistiert als "false")', () => {
    setWorkspaceShellEnabled(false);
    // Simuliert einen erneuten App-Start mit demselben localStorage.
    expect(isWorkspaceShellEnabled()).toBe(false);
  });
});
