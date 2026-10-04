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

  // J36: eine Zahl an der App, keine Liste und keine Fassung.
  it('trägt an der Kachel höchstens die Zahl der wartenden Freigaben', async () => {
    antworten();
    render(<Uebersicht wartend={{ urlaub: 2, andere: 5 }} />, { wrapper: huelle() });
    const zahl = await screen.findByTestId('uebersicht-app-urlaub-live-wartend');
    expect(zahl).toHaveTextContent(/^2$/);
    expect(zahl).toHaveAttribute('aria-label', '2 Freigaben warten');
    expect(screen.queryByTestId('offene-freigaben')).not.toBeInTheDocument();
  });

  it('zeigt ohne wartende Freigabe keine Zahl', async () => {
    antworten();
    render(<Uebersicht wartend={{}} />, { wrapper: huelle() });
    await screen.findByTestId('uebersicht-app-urlaub-live');
    expect(screen.queryByTestId('uebersicht-app-urlaub-live-wartend')).not.toBeInTheDocument();
  });

  it('zeigt dem Mitarbeiter keine Fassung, dem Administrator schon', async () => {
    antworten();
    const { unmount } = render(<Uebersicht />, { wrapper: huelle() });
    await screen.findByTestId('uebersicht-app-urlaub-live');
    expect(screen.queryByText(/Fassung/)).not.toBeInTheDocument();
    unmount();

    angemeldet({ role: 'admin', username: 'admin' });
    render(<Uebersicht />, { wrapper: huelle() });
    expect(await screen.findByText('Fassung 1.2.0')).toBeInTheDocument();
  });
});
