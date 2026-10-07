/**
 * Übersicht — die Mitte, solange keine App offen ist (Phase D1).
 *
 * Mitarbeiter-Sicht zuerst: was hier steht, gilt für jeden, der sich anmeldet.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Uebersicht } from '../Uebersicht';
import type { MeineApp } from '../meineApps';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { angemeldet } from '@/__tests__/helpers/authMock';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const URLAUB: MeineApp = {
  id: 'urlaub',
  name: 'Urlaubsantrag',
  beschreibung: 'Anträge stellen',
  live: { version: '1.2.0', pfad: '/apps/urlaub/' },
  test: null,
};
const EINE_APP: MeineApp[] = [URLAUB];

function antworten({ apps = EINE_APP } = {}) {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/apps/meine') return { data: apps };
    return {};
  });
}

describe('Uebersicht', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    angemeldet({ role: 'mitarbeiter', username: 'mia' });
    useWorkspaceStore.setState({ ansicht: { type: 'dashboard' } });
  });

  it('begrüßt mit dem Namen und zeigt die freigegebenen Apps als Kacheln', async () => {
    antworten();
    render(<Uebersicht />, { wrapper: huelle() });
    expect(screen.getByRole('heading', { name: 'Guten Tag, mia' })).toBeInTheDocument();
    expect(await screen.findByTestId('uebersicht-app-urlaub-live')).toBeInTheDocument();
  });

  it('grüßt mit dem Vornamen, sonst mit dem Anzeigenamen', async () => {
    antworten();
    angemeldet({ role: 'mitarbeiter', username: 'mia', vorname: 'Mia', anzeigeName: 'Mia Berg' });
    const eins = render(<Uebersicht />, { wrapper: huelle() });
    expect(screen.getByRole('heading', { name: 'Guten Tag, Mia' })).toBeInTheDocument();
    eins.unmount();
    angemeldet({ role: 'mitarbeiter', username: 'mia', vorname: null, anzeigeName: 'Mia Berg' });
    render(<Uebersicht />, { wrapper: huelle() });
    expect(screen.getByRole('heading', { name: 'Guten Tag, Mia Berg' })).toBeInTheDocument();
  });

  it('zeigt die Hinweise des Administrators unter den Kacheln', async () => {
    antworten();
    render(<Uebersicht hinweise={<p data-testid="hinweise">Hinweis</p>} />, {
      wrapper: huelle(),
    });
    const kachel = await screen.findByTestId('uebersicht-app-urlaub-live');
    const hinweise = screen.getByTestId('hinweise');
    expect(
      kachel.compareDocumentPosition(hinweise) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('eine Kachel öffnet die App im Hauptbereich', async () => {
    antworten();
    render(<Uebersicht />, { wrapper: huelle() });
    fireEvent.click(await screen.findByTestId('uebersicht-app-urlaub-live'));
    expect(useWorkspaceStore.getState().ansicht).toMatchObject({
      type: 'app',
      appId: 'urlaub',
      stand: 'live',
    });
  });

  it('ohne Freigabe steht dort, wie man zu einer App kommt', async () => {
    antworten({ apps: [] });
    render(<Uebersicht />, { wrapper: huelle() });
    expect(await screen.findByText('Noch keine App für Sie')).toBeInTheDocument();
  });

  /**
   * Die Freigaben kommen seit D2 als Slot herein und stehen VOR den Apps: ein
   * angehaltener Flow blockiert jemanden anderes, eine App wartet nicht.
   * Dass die Übersicht sie nicht selbst holt, ist die Regel des Ordners —
   * `features/X/` importiert nichts aus `features/Y/`, zusammengesetzt wird in
   * der Shell (`TabContent`).
   */
  it('zeigt den Freigaben-Slot über den Kacheln', async () => {
    antworten();
    render(<Uebersicht freigaben={<p data-testid="slot">Zwei warten</p>} />, {
      wrapper: huelle(),
    });
    const slot = await screen.findByTestId('slot');
    const kachel = await screen.findByTestId('uebersicht-app-urlaub-live');
    expect(slot.compareDocumentPosition(kachel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('fragt selbst nicht nach Freigaben', async () => {
    antworten();
    render(<Uebersicht />, { wrapper: huelle() });
    await screen.findByTestId('uebersicht-app-urlaub-live');
    expect(apiMock.get).not.toHaveBeenCalledWith('/freigabe-anfragen', expect.anything());
  });

  /** Der Teststand-Hinweis fuer Tester (D2): das Wort „Test" allein sagt nicht,
   *  was daran anders ist. */
  it('nennt die Testfassung „(Test) Name", wie die Leiste (M5)', async () => {
    antworten({
      apps: [{ ...URLAUB, test: { version: '1.3.0', pfad: '/apps/urlaub/' } }],
    });
    render(<Uebersicht />, { wrapper: huelle() });
    const kachel = await screen.findByTestId('uebersicht-app-urlaub-test');
    expect(kachel).toHaveTextContent(new RegExp(`^\\(Test\\) ${URLAUB.name}`));
    expect(screen.getByTestId('uebersicht-app-urlaub-live')).not.toHaveTextContent('(Test)');
  });

  // Die Kachel: Symbol, Name, eine Zeile offene Freigaben (M5, 07.10.2026).
  it('trägt an der Kachel die Zeile der offenen Freigaben ihres Stands', async () => {
    antworten();
    render(<Uebersicht wartend={{ 'urlaub:live': 2, 'urlaub:test': 7, andere: 5 }} />, {
      wrapper: huelle(),
    });
    const zeile = await screen.findByTestId('uebersicht-app-urlaub-live-wartend');
    expect(zeile).toHaveTextContent(/^2 Freigaben offen$/);
    expect(screen.queryByTestId('offene-freigaben')).not.toBeInTheDocument();
  });

  it('sagt ohne wartende Freigabe „Keine offene Freigabe"', async () => {
    antworten();
    render(<Uebersicht wartend={{}} />, { wrapper: huelle() });
    await screen.findByTestId('uebersicht-app-urlaub-live');
    expect(screen.queryByTestId('uebersicht-app-urlaub-live-wartend')).not.toBeInTheDocument();
    expect(screen.getByTestId('uebersicht-app-urlaub-live-ruhig')).toHaveTextContent(
      'Keine offene Freigabe'
    );
  });

  it('zeigt auf der Kachel weder Fassung noch Beschreibung, auch dem Administrator nicht', async () => {
    angemeldet({ role: 'admin', username: 'admin' });
    antworten();
    render(<Uebersicht />, { wrapper: huelle() });
    await screen.findByTestId('uebersicht-app-urlaub-live');
    expect(screen.queryByText(/Fassung/)).not.toBeInTheDocument();
    expect(screen.queryByText(URLAUB.beschreibung ?? '')).not.toBeInTheDocument();
  });

  it('zeigt ohne Symbol im Manifest ein neutrales Bild auf der Kachel, keine Buchstaben', async () => {
    antworten();
    render(<Uebersicht />, { wrapper: huelle() });
    const kachel = await screen.findByTestId('uebersicht-app-urlaub-live');
    expect(kachel.querySelector('[data-testid="app-symbol-neutral"]')).not.toBeNull();
    expect(kachel.querySelector('[data-testid="app-kuerzel"]')).toBeNull();
  });
});

describe('Band der Startseite', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    angemeldet({ role: 'mitarbeiter', username: 'mia', vorname: 'Mia' });
    useWorkspaceStore.setState({ ansicht: { type: 'dashboard' } });
  });

  it('trägt den Gruß und die Zahl offener Freigaben als Knopf', async () => {
    antworten();
    render(<Uebersicht offen={2} />, { wrapper: huelle() });
    const band = screen.getByTestId('startband');
    expect(band).toContainElement(screen.getByRole('heading', { name: 'Guten Tag, Mia' }));
    expect(screen.getByTestId('startband-freigaben')).toHaveTextContent(
      'Zwei Freigaben warten auf Sie'
    );
    expect(screen.queryByTestId('startband-erledigt')).not.toBeInTheDocument();
  });

  it('sagt bei einer Freigabe „Eine Freigabe wartet auf Sie", über zwölf die Zahl', async () => {
    antworten();
    const eins = render(<Uebersicht offen={1} />, { wrapper: huelle() });
    expect(screen.getByTestId('startband-freigaben')).toHaveTextContent(
      'Eine Freigabe wartet auf Sie'
    );
    eins.unmount();
    render(<Uebersicht offen={14} />, { wrapper: huelle() });
    expect(screen.getByTestId('startband-freigaben')).toHaveTextContent(
      '14 Freigaben warten auf Sie'
    );
  });

  it('sagt „Alles erledigt", wenn nichts wartet, und nichts, solange die Liste lädt', async () => {
    antworten();
    const eins = render(<Uebersicht offen={0} />, { wrapper: huelle() });
    expect(screen.getByTestId('startband-erledigt')).toHaveTextContent('Alles erledigt');
    expect(screen.queryByTestId('startband-freigaben')).not.toBeInTheDocument();
    eins.unmount();
    render(<Uebersicht />, { wrapper: huelle() });
    expect(screen.queryByTestId('startband-erledigt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('startband-freigaben')).not.toBeInTheDocument();
  });

  it('der Knopf rollt zu „Für Sie" und setzt den Fokus dorthin, ohne die Ansicht zu wechseln', async () => {
    antworten();
    const rollen = vi.fn();
    render(
      <Uebersicht
        offen={1}
        freigaben={
          <section id="fuer-sie" tabIndex={-1} data-testid="slot">
            Für Sie
          </section>
        }
      />,
      { wrapper: huelle() }
    );
    const ziel = screen.getByTestId('slot');
    ziel.scrollIntoView = rollen;
    fireEvent.click(screen.getByTestId('startband-freigaben'));
    expect(rollen).toHaveBeenCalled();
    expect(document.activeElement).toBe(ziel);
    expect(useWorkspaceStore.getState().ansicht).toEqual({ type: 'dashboard' });
  });

  it('blendet nur beim ersten Zeichnen ein, danach steht es', async () => {
    antworten();
    // Das erste Zeichnen dieser Datei war schon weiter oben; hier steht es.
    render(<Uebersicht offen={0} />, { wrapper: huelle() });
    expect(screen.getByTestId('startband')).not.toHaveAttribute('data-eingeblendet');
  });
});
