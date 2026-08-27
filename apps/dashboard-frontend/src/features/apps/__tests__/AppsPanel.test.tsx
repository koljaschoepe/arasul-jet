/**
 * AppsPanel — die linke Spalte des Zielbilds (Phase D1).
 *
 * Die Messregel der Phase: „Login als Mitarbeiter zeigt nur freigegebene
 * Apps." Das Sieben macht das Backend (`/api/apps/meine` verbindet mit
 * `app_members`); hier wird geprüft, dass die Spalte genau das zeigt, was von
 * dort kommt — und dass ein Fehler beim Laden nicht wie „keine Apps" aussieht.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AppsPanel } from '@/features/workspace/sidebar/AppsPanel';
import { useWorkspaceStore } from '@/stores/workspaceStore';

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

const ZWEI_APPS = {
  data: [
    {
      id: 'urlaub',
      name: 'Urlaubsantrag',
      beschreibung: 'Anträge stellen',
      live: { version: '1.2.0', pfad: '/apps/urlaub/' },
      test: null,
    },
    {
      id: 'spesen',
      name: 'Spesen',
      beschreibung: null,
      live: { version: '0.9.0', pfad: '/apps/spesen/' },
      test: { version: '1.0.0-rc', pfad: '/apps/spesen/test/' },
    },
  ],
};

describe('AppsPanel', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    useWorkspaceStore.setState({ tabs: [], activeTabId: null, activeView: 'apps' });
  });

  it('zeigt die Übersicht und genau die Apps aus /api/apps/meine', async () => {
    apiMock.get.mockResolvedValue(ZWEI_APPS);
    render(<AppsPanel />, { wrapper: huelle() });

    expect(await screen.findByTestId('apps-open-urlaub-live')).toBeInTheDocument();
    expect(screen.getByTestId('apps-open-spesen-live')).toBeInTheDocument();
    // Der Teststand ist ein eigener Eintrag, mit Kennzeichen.
    expect(screen.getByTestId('apps-open-spesen-test')).toBeInTheDocument();
    expect(screen.getByTestId('apps-open-uebersicht')).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith('/apps/meine');
    // Eine App, die nicht in der Antwort steht, steht auch nicht in der Spalte.
    expect(screen.queryByTestId('apps-open-geheim-live')).not.toBeInTheDocument();
  });

  it('ein Klick öffnet den Tab dieser App mit ihrem Namen', async () => {
    apiMock.get.mockResolvedValue(ZWEI_APPS);
    render(<AppsPanel />, { wrapper: huelle() });
    fireEvent.click(await screen.findByTestId('apps-open-spesen-test'));

    const s = useWorkspaceStore.getState();
    expect(s.activeTabId).toBe('app:spesen:test');
    expect(s.tabs[0]?.title).toBe('Spesen');
    expect(s.tabs[0]?.stand).toBe('test');
  });

  it('die Übersicht ist immer da, auch ohne eine einzige App', async () => {
    apiMock.get.mockResolvedValue({ data: [] });
    render(<AppsPanel />, { wrapper: huelle() });
    expect(await screen.findByTestId('apps-leer')).toBeInTheDocument();
    expect(screen.getByTestId('apps-open-uebersicht')).toBeInTheDocument();
  });

  /**
   * „Keine Apps" und „ich konnte nicht fragen" dürfen nicht gleich aussehen:
   * der zweite Fall schickt sonst jemanden zum Administrator, der nichts
   * falsch gemacht hat.
   */
  it('ein Fehler beim Laden ist kein Leerzustand', async () => {
    apiMock.get.mockImplementation(async () => {
      throw new Error('kaputt');
    });
    render(<AppsPanel />, { wrapper: huelle() });
    await waitFor(() => expect(screen.getByTestId('apps-fehler')).toBeInTheDocument());
    expect(screen.queryByTestId('apps-leer')).not.toBeInTheDocument();
  });
});
