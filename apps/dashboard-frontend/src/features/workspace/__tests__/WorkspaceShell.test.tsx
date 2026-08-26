/**
 * Tests: URL-Sync der WorkspaceShell (Deep-Links, Browser-Zurück, Gating) und
 * das Dreispalten-Raster nach B2.
 *
 * 1. Extension-Gating: Tabs deaktivierter Apps öffnen sich auch per
 *    Deep-Link / Browser-Zurück nicht wieder (Plan 002 §5 Kriterium 4).
 * 2. Keep-alive-Verdrahtung: ausgeblendete Spalten werden über
 *    data-shell-hidden am echten react-resizable-panels-Panel versteckt, nicht
 *    unmounted (aria-hidden wird für die A11y gespiegelt, steuert aber die
 *    Darstellung nicht mehr — siehe DialogPanelCollision.test).
 * 3. Die drei Spalten stehen auch dann, wenn links und rechts leer sind.
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
    activeView: null,
    sidebarVisible: true,
    rightPanelVisible: true,
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

describe('WorkspaceShell, URL-Sync', () => {
  beforeEach(() => {
    resetStore();
    disabledTabTypes.clear();
    localStorage.clear();
  });

  it('ohne Deep-Link bleibt der Workspace leer (kein Default-Tab)', async () => {
    renderShell('/workspace');
    await screen.findByTestId('mock-tabcontent');
    expect(useWorkspaceStore.getState().tabs).toHaveLength(0);
  });

  it('der alte Terminal-Pfad öffnet nichts mehr (Terminal ist mit B2 gefallen)', async () => {
    useWorkspaceStore.setState({
      tabs: [{ id: 'settings', type: 'settings', title: 'Einstellungen' }],
      activeTabId: 'settings',
    });
    renderShell('/workspace/terminal');
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toBe('/workspace/settings')
    );
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['settings']);
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

  it('drei Spalten: links und rechts stehen leer, werden aber per data-shell-hidden versteckt, nicht unmounted', async () => {
    renderShell('/workspace');

    const links = (await screen.findByTestId('workspace-sidebar-leer')).closest('[data-panel]');
    const rechts = screen.getByTestId('workspace-right-panel-leer').closest('[data-panel]');
    expect(links).toHaveAttribute('id', 'sidebar');
    expect(rechts).toHaveAttribute('id', 'right');
    expect(links).toHaveAttribute('data-shell-hidden', 'false');
    expect(rechts).toHaveAttribute('data-shell-hidden', 'false');
    expect(document.querySelector('[data-panel]#main')).not.toBeNull();

    const rechtsInhalt = screen.getByTestId('workspace-right-panel-leer');
    act(() => {
      useWorkspaceStore.setState({ rightPanelVisible: false, sidebarVisible: false });
    });
    // Derselbe Knoten, nur versteckt.
    expect(screen.getByTestId('workspace-right-panel-leer')).toBe(rechtsInhalt);
    expect(rechts).toHaveAttribute('data-shell-hidden', 'true');
    expect(rechts).toHaveAttribute('aria-hidden', 'true');
    expect(links).toHaveAttribute('data-shell-hidden', 'true');
  });
});
