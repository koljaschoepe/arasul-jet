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
vi.mock('../SidebarFooter', () => ({
  SidebarFooter: () => <div data-testid="mock-sidebarfooter" />,
}));
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
    sidebarRestore: null,
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
      tabs: [{ id: 'settings', type: 'settings', title: 'Einstellungen' }],
      activeTabId: 'settings',
    });

    renderShell('/workspace/terminal');

    await waitFor(() => expect(terminalIsVisible()).toBe(true));
    // Kein Terminal-Tab, bestehende Tabs unverändert
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['settings']);
    // URL normalisiert sich auf den aktiven Tab
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toBe('/workspace/settings')
    );
  });

  it('v2-Deep-Link /workspace/terminal beim ersten Start: nur Terminal-Panel, kein Default-Tab', async () => {
    renderShell('/workspace/terminal');

    await waitFor(() => expect(terminalIsVisible()).toBe(true));
    // Kein Dashboard-Default-Tab mehr (Plan 008): der Workspace bleibt leer,
    // der Chat-first-Einstieg lebt im rechten Panel.
    expect(useWorkspaceStore.getState().tabs).toHaveLength(0);
  });

  it('Gating: Deep-Link auf eine deaktivierte App öffnet den Tab nicht (Browser-Zurück-Szenario)', async () => {
    disabledTabTypes.add('automationen');
    useWorkspaceStore.setState({
      tabs: [{ id: 'settings', type: 'settings', title: 'Einstellungen' }],
      activeTabId: 'settings',
    });

    renderShell('/workspace/automationen');

    // Tab wird NICHT (wieder) geöffnet, URL springt zurück auf den aktiven Tab
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toBe('/workspace/settings')
    );
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['settings']);
  });

  it('Gating: bereits offener Tab einer deaktivierten App wird geschlossen', async () => {
    disabledTabTypes.add('automationen');
    useWorkspaceStore.setState({
      tabs: [
        { id: 'settings', type: 'settings', title: 'Einstellungen' },
        { id: 'automationen', type: 'automationen', title: 'Automationen' },
      ],
      activeTabId: 'automationen',
    });

    renderShell('/workspace/automationen');

    await waitFor(() =>
      expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['settings'])
    );
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toBe('/workspace/settings')
    );
  });

  it('aktivierte Apps öffnen per Deep-Link weiterhin ihren Tab', async () => {
    renderShell('/workspace/automationen');
    await waitFor(() =>
      expect(useWorkspaceStore.getState().tabs.map(t => t.type)).toContain('automationen')
    );
    expect(useWorkspaceStore.getState().activeTabId).toBe('automationen');
  });

  it('Farbregel (AC #8): die Mitte nutzt die Basis-Flächenfarbe bg-background, nicht bg-card', async () => {
    // Anker für „eine Flächenfarbe überall": der zentrale TabContent-Wrapper und
    // die Shell-Grundfläche müssen bg-background tragen. Ein Refactoring, das die
    // Mitte wieder auf bg-card (den früheren Farbbruch) umstellt, lässt diesen
    // Test fehlschlagen, bevor es unbemerkt live geht.
    useWorkspaceStore.setState({
      tabs: [{ id: 'settings', type: 'settings', title: 'Einstellungen' }],
      activeTabId: 'settings',
    });
    renderShell('/workspace/settings');

    const centerSurface = (await screen.findByTestId('mock-tabcontent')).parentElement;
    expect(centerSurface).not.toBeNull();
    expect(centerSurface).toHaveClass('bg-background');
    expect(centerSurface).not.toHaveClass('bg-card');

    const shellRoot = screen.getByTestId('workspace-shell');
    expect(shellRoot).toHaveClass('bg-background');
    expect(shellRoot).not.toHaveClass('bg-card');
  });

  it('Keep-alive: Terminal-Fläche wird per data-shell-hidden versteckt, nicht unmounted', async () => {
    useWorkspaceStore.setState({
      tabs: [{ id: 'settings', type: 'settings', title: 'Einstellungen' }],
      activeTabId: 'settings',
    });

    renderShell('/workspace/settings');

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
