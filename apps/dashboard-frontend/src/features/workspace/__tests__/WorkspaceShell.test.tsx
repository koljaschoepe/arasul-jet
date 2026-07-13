/**
 * Tests: URL-Sync der WorkspaceShell (Deep-Links, Browser-Zurück, Gating).
 *
 * 1. v2-Deep-Link /workspace/terminal: Terminal ist kein Tab mehr — die URL
 *    blendet das Terminal-Panel ein (gleiche Semantik wie die
 *    TerminalPanelBridge in TabContent) und normalisiert sich auf den
 *    aktiven Tab.
 * 2. Extension-Gating: Tabs deaktivierter Apps öffnen sich auch per
 *    Deep-Link / Browser-Zurück nicht wieder (Plan 002 §5 Kriterium 4).
 * 3. Keep-alive-Verdrahtung: ausgeblendete Flächen werden über
 *    data-shell-hidden am echten react-resizable-panels-Panel versteckt, nicht
 *    unmounted (aria-hidden wird für die A11y gespiegelt, steuert aber die
 *    Darstellung nicht mehr — siehe DialogPanelCollision.test).
 */

import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import WorkspaceShell from '../WorkspaceShell';

// Schwere Kinder mocken — getestet wird ausschließlich die Shell-Logik
vi.mock('../ActivityBar', () => ({ ActivityBar: () => <div data-testid="mock-activitybar" /> }));
vi.mock('../WorkspaceMenuBar', () => ({ WorkspaceMenuBar: () => <div /> }));
vi.mock('../StatusBar', () => ({ StatusBar: () => <div /> }));
vi.mock('../TabBar', () => ({ TabBar: () => <div /> }));
vi.mock('../TabContent', () => ({ TabContent: () => <div data-testid="mock-tabcontent" /> }));
vi.mock('../explorer/ExplorerPanel', () => ({ ExplorerPanel: () => <div /> }));
vi.mock('../llm/ChatPanel', () => ({ ChatPanel: () => <div /> }));
vi.mock('../terminal/TerminalPanel', () => ({
  TerminalPanel: () => <div data-testid="mock-terminal-panel" />,
}));

// App-Gating deterministisch mocken (echte Datenbasis: GET /workspace-apps)
const { disabledTabTypes } = vi.hoisted(() => ({ disabledTabTypes: new Set<string>() }));
vi.mock('@/hooks/useWorkspaceApps', () => ({
  useWorkspaceApps: () => ({
    apps: [],
    isLoading: false,
    isAppEnabled: () => true,
    isTabTypeEnabled: (type: string) => !disabledTabTypes.has(type),
    setAppEnabled: vi.fn(),
  }),
}));

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    sidebarVisible: true,
    rightPanelVisible: true,
    rightPanelMode: 'chat',
    terminalSessions: [],
    activeTerminalSessionId: null,
    chatScope: null,
    explorerRequest: null,
  });
}

/** Terminal ist sichtbar, wenn das rechte Panel offen ist und im Terminal-Modus steht. */
function terminalIsVisible() {
  const s = useWorkspaceStore.getState();
  return s.rightPanelVisible && s.rightPanelMode === 'terminal';
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function renderShell(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/workspace/*"
          element={
            <WorkspaceShell theme="dark" onToggleTheme={() => {}} onLogout={async () => {}} />
          }
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('WorkspaceShell — URL-Sync', () => {
  beforeEach(() => {
    resetStore();
    disabledTabTypes.clear();
    localStorage.clear();
  });

  it('v2-Deep-Link /workspace/terminal blendet das Terminal-Panel ein (kein Tab)', async () => {
    useWorkspaceStore.setState({
      tabs: [{ id: 'dashboard', type: 'dashboard', title: 'Dashboard' }],
      activeTabId: 'dashboard',
    });

    renderShell('/workspace/terminal');

    await waitFor(() => expect(terminalIsVisible()).toBe(true));
    // Kein Terminal-Tab, bestehende Tabs unverändert
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['dashboard']);
    // URL normalisiert sich auf den aktiven Tab
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toBe('/workspace/dashboard')
    );
  });

  it('v2-Deep-Link /workspace/terminal beim ersten Start: Dashboard-Tab + Terminal-Panel', async () => {
    renderShell('/workspace/terminal');

    await waitFor(() => expect(terminalIsVisible()).toBe(true));
    await waitFor(() =>
      expect(useWorkspaceStore.getState().tabs.map(t => t.type)).toEqual(['dashboard'])
    );
  });

  it('Gating: Deep-Link auf eine deaktivierte App öffnet den Tab nicht (Browser-Zurück-Szenario)', async () => {
    disabledTabTypes.add('database');
    useWorkspaceStore.setState({
      tabs: [{ id: 'dashboard', type: 'dashboard', title: 'Dashboard' }],
      activeTabId: 'dashboard',
    });

    renderShell('/workspace/database');

    // Tab wird NICHT (wieder) geöffnet, URL springt zurück auf den aktiven Tab
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toBe('/workspace/dashboard')
    );
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['dashboard']);
  });

  it('Gating: bereits offener Tab einer deaktivierten App wird geschlossen', async () => {
    disabledTabTypes.add('database');
    useWorkspaceStore.setState({
      tabs: [
        { id: 'dashboard', type: 'dashboard', title: 'Dashboard' },
        { id: 'database', type: 'database', title: 'Datenbank' },
      ],
      activeTabId: 'database',
    });

    renderShell('/workspace/database');

    await waitFor(() =>
      expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['dashboard'])
    );
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toBe('/workspace/dashboard')
    );
  });

  it('aktivierte Apps öffnen per Deep-Link weiterhin ihren Tab', async () => {
    renderShell('/workspace/database');
    await waitFor(() =>
      expect(useWorkspaceStore.getState().tabs.map(t => t.type)).toContain('database')
    );
    expect(useWorkspaceStore.getState().activeTabId).toBe('database');
  });

  it('Keep-alive: Terminal-Fläche wird per data-shell-hidden versteckt, nicht unmounted', async () => {
    useWorkspaceStore.setState({
      tabs: [{ id: 'dashboard', type: 'dashboard', title: 'Dashboard' }],
      activeTabId: 'dashboard',
    });

    renderShell('/workspace/dashboard');

    // Default: rechtes Panel sichtbar, Modus Chat. Die Terminal-Fläche im
    // RightPanel ist als [data-shell-surface] gemountet, aber wegen des
    // Chat-Modus per data-shell-hidden='true' versteckt (nicht unmounted). Das
    // umgebende [data-panel]#llm ist sichtbar (rightPanelVisible).
    const terminalContent = await screen.findByTestId('mock-terminal-panel');
    const surface = terminalContent.closest('[data-shell-surface]');
    expect(surface).not.toBeNull();
    expect(surface).toHaveAttribute('data-shell-hidden', 'true');
    expect(surface).toHaveAttribute('aria-hidden', 'true');
    const panelRoot = terminalContent.closest('[data-panel]');
    expect(panelRoot).not.toBeNull();
    expect(panelRoot).toHaveAttribute('data-shell-hidden', 'false');

    // Auf den Terminal-Modus umschalten: dieselbe Fläche wird sichtbar, ohne
    // Remount (kein zweiter Knoten).
    act(() => {
      useWorkspaceStore.setState({ rightPanelVisible: true, rightPanelMode: 'terminal' });
    });
    expect(terminalContent.closest('[data-shell-surface]')).toHaveAttribute(
      'data-shell-hidden',
      'false'
    );
    expect(screen.getByTestId('mock-terminal-panel')).toBe(terminalContent);

    // Ganzes Panel ausblenden: das [data-panel]#llm wird versteckt, die Fläche
    // bleibt derselbe (kein Remount) gemountete Knoten.
    act(() => {
      useWorkspaceStore.setState({ rightPanelVisible: false });
    });
    expect(screen.getByTestId('mock-terminal-panel')).toBe(terminalContent);
    expect(terminalContent.closest('[data-panel]')).toHaveAttribute('data-shell-hidden', 'true');
  });
});
