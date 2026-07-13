/**
 * Tests: URL-Sync der WorkspaceShell (Deep-Links, Browser-Zurück, Gating).
 *
 * 1. v2-Deep-Link /workspace/terminal: Terminal ist kein Tab mehr — die URL
 *    blendet das Terminal-Panel ein (gleiche Semantik wie die
 *    TerminalPanelBridge in TabContent) und normalisiert sich auf den
 *    aktiven Tab.
 * 2. Extension-Gating: Tabs deaktivierter Apps öffnen sich auch per
 *    Deep-Link / Browser-Zurück nicht wieder (Plan 002 §5 Kriterium 4).
 * 3. Keep-alive-Verdrahtung: ausgeblendete Flächen werden über aria-hidden
 *    am echten react-resizable-panels-Panel versteckt, nicht unmounted.
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
    terminalVisible: false,
    chatVisible: true,
    terminalSessions: [],
    activeTerminalSessionId: null,
    chatScope: null,
    explorerRequest: null,
  });
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

    await waitFor(() => expect(useWorkspaceStore.getState().terminalVisible).toBe(true));
    // Kein Terminal-Tab, bestehende Tabs unverändert
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['dashboard']);
    // URL normalisiert sich auf den aktiven Tab
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toBe('/workspace/dashboard')
    );
  });

  it('v2-Deep-Link /workspace/terminal beim ersten Start: Dashboard-Tab + Terminal-Panel', async () => {
    renderShell('/workspace/terminal');

    await waitFor(() => expect(useWorkspaceStore.getState().terminalVisible).toBe(true));
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

  it('Keep-alive: Terminal-Fläche wird per aria-hidden versteckt, nicht unmounted', async () => {
    useWorkspaceStore.setState({
      tabs: [{ id: 'dashboard', type: 'dashboard', title: 'Dashboard' }],
      activeTabId: 'dashboard',
    });

    renderShell('/workspace/dashboard');

    // Terminal-Panel ist zu — TerminalPanel bleibt trotzdem gemountet,
    // das umgebende [data-panel] trägt aria-hidden='true' (CSS versteckt es)
    const terminalContent = await screen.findByTestId('mock-terminal-panel');
    const panelRoot = terminalContent.closest('[data-panel]');
    expect(panelRoot).not.toBeNull();
    expect(panelRoot).toHaveAttribute('aria-hidden', 'true');

    act(() => {
      useWorkspaceStore.setState({ terminalVisible: true });
    });
    expect(terminalContent.closest('[data-panel]')).toHaveAttribute('aria-hidden', 'false');
    // Wieder ausblenden: derselbe Knoten (kein Remount), nur wieder versteckt
    act(() => {
      useWorkspaceStore.setState({ terminalVisible: false });
    });
    expect(screen.getByTestId('mock-terminal-panel')).toBe(terminalContent);
    expect(terminalContent.closest('[data-panel]')).toHaveAttribute('aria-hidden', 'true');
  });
});
