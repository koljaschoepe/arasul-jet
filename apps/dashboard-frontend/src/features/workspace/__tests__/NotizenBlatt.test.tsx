/**
 * Tests: die Notizen unter 900 px (Phase D6, 28.08.2026).
 *
 * Der Fund der ersten D6-Messung am Orin: bei 390 px verdeckte die Notizspalte
 * die Mitte vollstaendig. Alle sieben Verwaltungsansichten waren rot, und das
 * Bild zeigte jedes Mal „NOTIZEN -- noch nichts notiert". Die Regel dagegen
 * ist eine Regel und keine Zahl: **unter 900 px stehen Notizen und Mitte nie
 * nebeneinander**. Die Notizen liegen dort als Blatt darueber, sie fangen zu
 * an, und jede Ansicht, die kommt, schliesst sie.
 *
 * Gemessen wird die Verdrahtung, nicht das Aussehen: dass das Panel gemountet
 * BLEIBT (die Notizen schreiben nach einer Sekunde Ruhe), dass es das
 * Blatt-Kennzeichen traegt, dass die Mitte ihre Breite bekommt und dass der
 * eine Knopf in der Kopfleiste je nach Breite das Richtige schaltet.
 */

import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import WorkspaceShell from '../WorkspaceShell';
import { angemeldet } from '@/__tests__/helpers/authMock';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));
vi.mock('../ActivityBar', () => ({ ActivityBar: () => <div data-testid="mock-activitybar" /> }));
vi.mock('../WorkspaceMenuBar', () => ({ WorkspaceMenuBar: () => <div /> }));
vi.mock('../StatusBar', () => ({ StatusBar: () => <div /> }));
vi.mock('../TabBar', () => ({ TabBar: () => <div /> }));
vi.mock('../TabContent', () => ({ TabContent: () => <div data-testid="mock-tabcontent" /> }));
vi.mock('../SidebarHost', () => ({ SidebarHost: () => <div data-testid="mock-sidebar" /> }));
vi.mock('../RightPanel', () => ({ RightPanel: () => <div data-testid="mock-rightpanel" /> }));

/** Ein matchMedia-Doppel: `schmal` sagt, ob `(max-width: 899px)` passt. */
function fensterbreite(schmal: boolean) {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: schmal,
    media: '',
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

let zurueck = () => {};

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeView: 'apps',
    sidebarVisible: true,
    rightPanelVisible: true,
    notizenBlattOffen: false,
  });
}

function renderShell(pfad = '/workspace') {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route
          path="/workspace/*"
          element={
            <WorkspaceShell theme="dark" onToggleTheme={() => {}} onLogout={async () => {}} />
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetStore();
  localStorage.clear();
  angemeldet({ role: 'admin' });
});

afterEach(() => {
  zurueck();
  vi.restoreAllMocks();
});

describe('Die Notizen unter 900 px', () => {
  it('liegen als Blatt ueber der Mitte statt daneben, und die Mitte bekommt ihre Breite', async () => {
    zurueck = fensterbreite(true);
    renderShell();
    await screen.findByTestId('mock-tabcontent');

    const rechts = screen.getByTestId('mock-rightpanel').closest('[data-panel]');
    const mitte = document.querySelector('[data-panel]#main');
    expect(rechts).toHaveAttribute('data-shell-blatt', 'true');
    expect(mitte).toHaveAttribute('data-shell-voll', 'true');
  });

  it('fangen zu an, obwohl die Spalte als Voreinstellung offen ist', async () => {
    zurueck = fensterbreite(true);
    renderShell();
    await screen.findByTestId('mock-tabcontent');

    // `rightPanelVisible` bleibt true — das ist die Voreinstellung fuer den
    // breiten Arbeitsplatz und geht hier niemandem verloren.
    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(true);
    expect(screen.getByTestId('mock-rightpanel').closest('[data-panel]')).toHaveAttribute(
      'data-shell-hidden',
      'true'
    );
  });

  it('gehen auf, wenn jemand sie aufzieht, und der Knoten bleibt derselbe', async () => {
    zurueck = fensterbreite(true);
    renderShell();
    const inhalt = await screen.findByTestId('mock-rightpanel');
    const panel = inhalt.closest('[data-panel]');

    act(() => {
      useWorkspaceStore.getState().toggleNotizenBlatt();
    });

    expect(panel).toHaveAttribute('data-shell-hidden', 'false');
    // Kein Unmount: ein Zuklappen waehrend der Schreibpause verloere den Text.
    expect(screen.getByTestId('mock-rightpanel')).toBe(inhalt);
  });

  it('schliessen sich, sobald eine Ansicht geoeffnet wird', async () => {
    zurueck = fensterbreite(true);
    renderShell();
    await screen.findByTestId('mock-tabcontent');

    act(() => {
      useWorkspaceStore.getState().toggleNotizenBlatt();
    });
    expect(useWorkspaceStore.getState().notizenBlattOffen).toBe(true);

    act(() => {
      useWorkspaceStore.getState().openTab({ type: 'settings' });
    });
    expect(useWorkspaceStore.getState().notizenBlattOffen).toBe(false);
  });

  it('bleiben ueber 900 px eine Spalte', async () => {
    zurueck = fensterbreite(false);
    renderShell();
    await screen.findByTestId('mock-tabcontent');

    const rechts = screen.getByTestId('mock-rightpanel').closest('[data-panel]');
    expect(rechts).toHaveAttribute('data-shell-blatt', 'false');
    expect(rechts).toHaveAttribute('data-shell-hidden', 'false');
    expect(document.querySelector('[data-panel]#main')).toHaveAttribute('data-shell-voll', 'false');
  });
});
