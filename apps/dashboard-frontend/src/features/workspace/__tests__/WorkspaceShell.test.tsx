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
 * 3. Das Dreispalten-Raster steht.
 * 4. Seit D1: `/workspace` landet auf der Übersicht, und eine Admin-Adresse
 *    landet fuer einen Mitarbeiter ebenfalls dort.
 */

import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import WorkspaceShell from '../WorkspaceShell';
import { angemeldet } from '@/__tests__/helpers/authMock';

// Schwere Kinder mocken — getestet wird ausschließlich die Shell-Logik
vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));
vi.mock('../ActivityBar', () => ({ ActivityBar: () => <div data-testid="mock-activitybar" /> }));
vi.mock('../WorkspaceMenuBar', () => ({ WorkspaceMenuBar: () => <div /> }));
vi.mock('../StatusBar', () => ({ StatusBar: () => <div /> }));
vi.mock('../TabBar', () => ({ TabBar: () => <div /> }));
vi.mock('../TabContent', () => ({ TabContent: () => <div data-testid="mock-tabcontent" /> }));
// Seit D1 tragen die Spalten Inhalt (App-Liste, Notizen) mit eigenen
// Abfragen. Hier geht es um das Raster, nicht um das, was darin steht.
vi.mock('../SidebarHost', () => ({ SidebarHost: () => <div data-testid="mock-sidebar" /> }));
vi.mock('../RightPanel', () => ({ RightPanel: () => <div data-testid="mock-rightpanel" /> }));

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeView: 'apps',
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
    localStorage.clear();
    angemeldet({ role: 'admin' });
  });

  /**
   * Seit D1 gibt es einen Standard-Tab. Vorher stand hier „bleibt leer", weil
   * es keinen gab, der immer passt; die erste Ansicht nach der Anmeldung soll
   * die eigenen Apps zeigen und keinen Leerzustand.
   */
  it('ohne Deep-Link landet der Workspace auf der Übersicht', async () => {
    renderShell('/workspace');
    await screen.findByTestId('mock-tabcontent');
    await waitFor(() =>
      expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['dashboard'])
    );
  });

  it('ein App-Deep-Link öffnet den Tab dieser App', async () => {
    renderShell('/workspace/app/beispielapp');
    await screen.findByTestId('mock-tabcontent');
    await waitFor(() => {
      const tabs = useWorkspaceStore.getState().tabs;
      expect(tabs.map(t => t.id)).toEqual(['app:beispielapp:live']);
      expect(tabs[0]?.appId).toBe('beispielapp');
      expect(tabs[0]?.stand).toBe('live');
    });
  });

  it('der Teststand einer App hat einen eigenen Tab', async () => {
    renderShell('/workspace/app/beispielapp/test');
    await screen.findByTestId('mock-tabcontent');
    await waitFor(() =>
      expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['app:beispielapp:test'])
    );
  });

  /**
   * Ausblenden, keine Berechtigung: `requireRole` im Backend antwortet einem
   * Mitarbeiter auf jeden Weg hinter den Einstellungen mit 403. Hier geht es
   * nur darum, dass eine getippte Adresse ihn nicht in eine Sackgasse führt.
   */
  it('einem Mitarbeiter führt /workspace/settings auf die Übersicht', async () => {
    angemeldet({ role: 'mitarbeiter', username: 'mia' });
    renderShell('/workspace/settings');
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toBe('/workspace/dashboard')
    );
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['dashboard']);
  });

  it('der alte Terminal-Pfad öffnet nichts mehr (Terminal ist mit B2 gefallen)', async () => {
    renderShell('/workspace/terminal');
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toBe('/workspace/dashboard')
    );
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['dashboard']);
  });

  it('der alte Automationen-Pfad öffnet nichts mehr (n8n ist mit B5 gefallen)', async () => {
    renderShell('/workspace/automationen');
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toBe('/workspace/dashboard')
    );
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['dashboard']);
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

  it('drei Spalten: links und rechts werden per data-shell-hidden versteckt, nicht unmounted', async () => {
    renderShell('/workspace');

    const links = (await screen.findByTestId('mock-sidebar')).closest('[data-panel]');
    const rechts = screen.getByTestId('mock-rightpanel').closest('[data-panel]');
    expect(links).toHaveAttribute('id', 'sidebar');
    expect(rechts).toHaveAttribute('id', 'right');
    expect(links).toHaveAttribute('data-shell-hidden', 'false');
    expect(rechts).toHaveAttribute('data-shell-hidden', 'false');
    expect(document.querySelector('[data-panel]#main')).not.toBeNull();

    const rechtsInhalt = screen.getByTestId('mock-rightpanel');
    act(() => {
      useWorkspaceStore.setState({ rightPanelVisible: false, sidebarVisible: false });
    });
    // Derselbe Knoten, nur versteckt. Für die Notizen ist das mehr als eine
    // Formsache: ein Unmount während der Schreibpause verlöre den Text.
    expect(screen.getByTestId('mock-rightpanel')).toBe(rechtsInhalt);
    expect(rechts).toHaveAttribute('data-shell-hidden', 'true');
    expect(rechts).toHaveAttribute('aria-hidden', 'true');
    expect(links).toHaveAttribute('data-shell-hidden', 'true');
  });
});
