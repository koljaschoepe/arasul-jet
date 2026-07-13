/**
 * Tests: Keep-alive-Kette der Terminal-Fläche (Plan 002 §5 Kriterium 3).
 *
 * Das Terminal überlebt Panel-Toggles nur, wenn BEIDE Glieder halten:
 * 1. TerminalPanel mountet SandboxApp einmalig (mount-once) und unmountet
 *    sie beim Ausblenden NICHT — sonst sterben WebSocket-Sessions und
 *    laufende Prozesse bei jedem Toggle.
 * 2. Die CSS-Regel `[data-panel][data-shell-hidden='true'] { display:none }` in
 *    index.css versteckt das umgebende Panel nur visuell (WorkspaceShell setzt
 *    data-shell-hidden, react-resizable-panels erzwingt display:flex inline).
 *    Anker ist bewusst data-shell-hidden statt aria-hidden — sonst kollidiert
 *    die Regel mit Radix-Dialogen (hideOthers), siehe DialogPanelCollision.test.
 */

import fs from 'node:fs';
import path from 'node:path';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { TerminalPanel } from '../terminal/TerminalPanel';

const { mountLog } = vi.hoisted(() => ({ mountLog: { mounts: 0, unmounts: 0 } }));

// SandboxApp-Mock: protokolliert Mount/Unmount und spiegelt das visible-Prop
vi.mock('@/features/sandbox', async () => {
  const React = await import('react');
  function MockSandboxApp({ visible }: { visible?: boolean }) {
    React.useEffect(() => {
      mountLog.mounts++;
      return () => {
        mountLog.unmounts++;
      };
    }, []);
    return React.createElement('div', {
      'data-testid': 'mock-sandbox-app',
      'data-visible': String(visible),
    });
  }
  return { default: MockSandboxApp };
});

function resetStore(terminalVisible: boolean) {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    sidebarVisible: true,
    terminalVisible,
    chatVisible: true,
    terminalSessions: [],
    activeTerminalSessionId: null,
    chatScope: null,
    explorerRequest: null,
  });
}

describe('TerminalPanel Keep-alive', () => {
  beforeEach(() => {
    mountLog.mounts = 0;
    mountLog.unmounts = 0;
  });

  it('mountet SandboxApp erst beim ersten Einblenden (mount-once)', async () => {
    resetStore(false);
    render(<TerminalPanel />);
    expect(screen.queryByTestId('mock-sandbox-app')).not.toBeInTheDocument();
    expect(mountLog.mounts).toBe(0);

    act(() => {
      useWorkspaceStore.setState({ terminalVisible: true });
    });
    expect(await screen.findByTestId('mock-sandbox-app')).toBeInTheDocument();
    expect(mountLog.mounts).toBe(1);
  });

  it('Ausblenden unmountet NICHT — Sessions überleben den Toggle', async () => {
    resetStore(true);
    render(<TerminalPanel />);
    await screen.findByTestId('mock-sandbox-app');
    const mountsAfterFirstShow = mountLog.mounts;

    // Panel ausblenden: SandboxApp bleibt gemountet, bekommt nur visible=false
    act(() => {
      useWorkspaceStore.setState({ terminalVisible: false });
    });
    expect(screen.getByTestId('mock-sandbox-app')).toBeInTheDocument();
    expect(screen.getByTestId('mock-sandbox-app').dataset.visible).toBe('false');
    expect(mountLog.unmounts).toBe(0);

    // Wieder einblenden: kein Remount (kein zweiter Mount-Effekt)
    act(() => {
      useWorkspaceStore.setState({ terminalVisible: true });
    });
    expect(mountLog.mounts).toBe(mountsAfterFirstShow);
    expect(screen.getByTestId('mock-sandbox-app').dataset.visible).toBe('true');
    expect(mountLog.unmounts).toBe(0);
  });

  it('Keep-alive-CSS-Regel existiert in index.css (data-shell-hidden → display:none)', () => {
    // Zweites Glied der Kette: fällt diese Regel weg, bleiben ausgeblendete
    // Panels sichtbar (react-resizable-panels setzt display:flex inline) —
    // bzw. ein Umbau auf hidden/unmount würde die Sessions killen.
    // Vitest läuft mit cwd = apps/dashboard-frontend
    const cssPath = path.resolve(process.cwd(), 'src/index.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toMatch(
      /\[data-panel\]\[data-shell-hidden='true'\][^{]*\{[^}]*display:\s*none\s*!important/
    );
    // Regressionsschutz Bug (b): die Versteck-Regel darf NICHT an aria-hidden
    // hängen, sonst kollabieren Panels beim Öffnen von Radix-Dialogen.
    expect(css).not.toMatch(/\[data-panel\]\[aria-hidden='true'\][^{]*\{[^}]*display:\s*none/);
  });
});
