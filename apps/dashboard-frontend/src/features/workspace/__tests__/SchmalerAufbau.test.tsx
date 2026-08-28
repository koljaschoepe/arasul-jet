/**
 * Tests: der schmale Aufbau unter 900 px (Phase D7, 28.08.2026).
 *
 * Zwei Messungen am Orin stehen dahinter. Die erste (D6): bei 390 px bekam
 * die Mitte NULL Pixel -- 48 fuer die Aktivitaetsleiste, 160 fuer die
 * Sidebar, 220 fuer die Notizen sind mehr als 390 -- und alle sieben
 * Verwaltungsansichten zeigten „NOTIZEN, noch nichts notiert". Die zweite:
 * das Blatt, das D6 daraufhin ueber die Mitte legte, verdeckte die App
 * weiterhin; sie stand abgedunkelt dahinter, und was darunter lag, war fuer
 * niemanden anklickbar.
 *
 * Die Regel ab D7 ist deshalb keine Zahl, sondern ein Aufbau: unter 900 px
 * eine Spalte, ein Hamburger-Menue statt Aktivitaetsleiste und Sidebar, keine
 * Tab-Leiste -- und die Notizen sind dort eine eigene ANSICHT. Es liegt nichts
 * mehr uebereinander.
 *
 * Gemessen wird die Verdrahtung, nicht das Aussehen: welches Panel versteckt
 * ist, dass beide gemountet BLEIBEN (die Notizen schreiben nach einer Sekunde
 * Ruhe), und dass jede Ansicht Zettel und Menue wieder zumacht.
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
vi.mock('../TabBar', () => ({ TabBar: () => <div data-testid="mock-tabbar" /> }));
vi.mock('../TabContent', () => ({ TabContent: () => <div data-testid="mock-tabcontent" /> }));
vi.mock('../SidebarHost', () => ({ SidebarHost: () => <div data-testid="mock-sidebar" /> }));
vi.mock('../RightPanel', () => ({ RightPanel: () => <div data-testid="mock-rightpanel" /> }));
vi.mock('../SchmalMenue', () => ({ SchmalMenue: () => <div data-testid="mock-schmalmenue" /> }));

/**
 * Ein matchMedia-Doppel: `schmal` sagt, ob `(max-width: 899px)` passt.
 *
 * Es merkt sich seine Horcher, damit ein Test das Fenster WAEHREND des Laufs
 * breiter ziehen kann (`umstellen`). Ein Doppel mit leeren Horchern koennte
 * das nicht: `useSchmalesFenster` liest `matches` einmal beim Einhaengen und
 * danach nur noch auf Zuruf.
 */
function fensterbreite(schmal: boolean) {
  const original = window.matchMedia;
  const horcher = new Set<() => void>();
  const abfrage = {
    matches: schmal,
    media: '',
    addEventListener: (_art: string, ruf: () => void) => horcher.add(ruf),
    removeEventListener: (_art: string, ruf: () => void) => horcher.delete(ruf),
  };
  window.matchMedia = vi.fn().mockReturnValue(abfrage) as unknown as typeof window.matchMedia;
  const zurueckstellen = () => {
    window.matchMedia = original;
  };
  zurueckstellen.umstellen = (jetztSchmal: boolean) => {
    abfrage.matches = jetztSchmal;
    for (const ruf of horcher) ruf();
  };
  return zurueckstellen;
}

let zurueck = () => {};

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeView: 'apps',
    sidebarVisible: true,
    rightPanelVisible: true,
    notizenAnsichtOffen: false,
    menueOffen: false,
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

const panelVon = (kennung: string) => screen.getByTestId(kennung).closest('[data-panel]');

beforeEach(() => {
  resetStore();
  localStorage.clear();
  angemeldet({ role: 'admin' });
});

afterEach(() => {
  zurueck();
  vi.restoreAllMocks();
});

describe('Der schmale Aufbau unter 900 px', () => {
  it('hat eine Spalte: kein Aktivitaetsstreifen, keine Sidebar, keine Tab-Leiste, dafuer ein Menue', async () => {
    zurueck = fensterbreite(true);
    renderShell();
    await screen.findByTestId('mock-tabcontent');

    expect(screen.queryByTestId('mock-activitybar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-tabbar')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-schmalmenue')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-shell')).toHaveAttribute('data-shell-aufbau', 'schmal');
    // Die Sidebar bleibt gemountet und ist nur versteckt.
    expect(panelVon('mock-sidebar')).toHaveAttribute('data-shell-hidden', 'true');
  });

  it('zeigt die Mitte, solange der Zettel zu ist -- und beide bekommen die ganze Breite', async () => {
    zurueck = fensterbreite(true);
    renderShell();
    await screen.findByTestId('mock-tabcontent');

    expect(panelVon('mock-tabcontent')).toHaveAttribute('data-shell-hidden', 'false');
    expect(panelVon('mock-tabcontent')).toHaveAttribute('data-shell-voll', 'true');
    expect(panelVon('mock-rightpanel')).toHaveAttribute('data-shell-hidden', 'true');
    expect(panelVon('mock-rightpanel')).toHaveAttribute('data-shell-voll', 'true');
    // `rightPanelVisible` bleibt true -- das ist die Voreinstellung fuer den
    // breiten Arbeitsplatz und geht hier niemandem verloren.
    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(true);
  });

  it('tauscht Mitte gegen Zettel, statt ihn darueberzulegen -- und unmountet nichts', async () => {
    zurueck = fensterbreite(true);
    renderShell();
    const zettel = await screen.findByTestId('mock-rightpanel');

    act(() => {
      useWorkspaceStore.getState().toggleNotizenAnsicht();
    });

    expect(panelVon('mock-rightpanel')).toHaveAttribute('data-shell-hidden', 'false');
    expect(panelVon('mock-tabcontent')).toHaveAttribute('data-shell-hidden', 'true');
    // Kein Unmount: ein Zuklappen waehrend der Schreibpause verloere den Text.
    expect(screen.getByTestId('mock-rightpanel')).toBe(zettel);
    expect(screen.getByTestId('mock-tabcontent')).toBeInTheDocument();
  });

  it('macht Zettel und Menue zu, sobald eine Ansicht geoeffnet wird', async () => {
    zurueck = fensterbreite(true);
    renderShell();
    await screen.findByTestId('mock-tabcontent');

    act(() => {
      useWorkspaceStore.getState().toggleNotizenAnsicht();
      useWorkspaceStore.getState().toggleMenue();
    });
    expect(useWorkspaceStore.getState().notizenAnsichtOffen).toBe(true);
    expect(useWorkspaceStore.getState().menueOffen).toBe(true);

    act(() => {
      useWorkspaceStore.getState().openTab({ type: 'settings' });
    });
    expect(useWorkspaceStore.getState().notizenAnsichtOffen).toBe(false);
    expect(useWorkspaceStore.getState().menueOffen).toBe(false);
  });

  it('macht den Zettel auch zu, wenn das Fenster wieder breit wird', async () => {
    const doppel = fensterbreite(true);
    zurueck = doppel;
    renderShell();
    await screen.findByTestId('mock-tabcontent');

    act(() => {
      useWorkspaceStore.getState().toggleNotizenAnsicht();
    });
    expect(useWorkspaceStore.getState().notizenAnsichtOffen).toBe(true);

    // Dasselbe Fenster, jetzt breit gezogen: sonst bliebe der Aufenthaltsort
    // von vorhin stehen, und wer es wieder schmal zieht, faende die Notizen
    // offen vor statt seiner Arbeit.
    act(() => {
      doppel.umstellen(false);
    });
    expect(useWorkspaceStore.getState().notizenAnsichtOffen).toBe(false);
    expect(screen.getByTestId('workspace-shell')).toHaveAttribute(
      'data-shell-aufbau',
      'drei-spalten'
    );
  });

  it('laesst ueber 900 px die drei Spalten aus D1 stehen', async () => {
    zurueck = fensterbreite(false);
    renderShell();
    await screen.findByTestId('mock-tabcontent');

    expect(screen.getByTestId('workspace-shell')).toHaveAttribute(
      'data-shell-aufbau',
      'drei-spalten'
    );
    expect(screen.getByTestId('mock-activitybar')).toBeInTheDocument();
    expect(screen.getByTestId('mock-tabbar')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-schmalmenue')).not.toBeInTheDocument();
    expect(panelVon('mock-rightpanel')).toHaveAttribute('data-shell-hidden', 'false');
    expect(panelVon('mock-tabcontent')).toHaveAttribute('data-shell-hidden', 'false');
    expect(panelVon('mock-tabcontent')).toHaveAttribute('data-shell-voll', 'false');
  });
});
