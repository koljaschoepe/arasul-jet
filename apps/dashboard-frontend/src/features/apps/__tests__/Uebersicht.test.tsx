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

const EINE_APP = [
  {
    id: 'urlaub',
    name: 'Urlaubsantrag',
    beschreibung: 'Anträge stellen',
    live: { version: '1.2.0', pfad: '/apps/urlaub/' },
    test: null,
  },
];

function antworten({ apps = EINE_APP, freigaben = [] as unknown[] } = {}) {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/apps/meine') return { data: apps };
    if (pfad === '/freigabe-anfragen') return { data: freigaben };
    return {};
  });
}

describe('Uebersicht', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    angemeldet({ role: 'mitarbeiter', username: 'mia' });
    useWorkspaceStore.setState({ tabs: [], activeTabId: null, activeView: 'apps' });
  });

  it('begrüßt mit dem Namen und zeigt die freigegebenen Apps als Kacheln', async () => {
    antworten();
    render(<Uebersicht />, { wrapper: huelle() });
    expect(screen.getByRole('heading', { name: 'Guten Tag, mia' })).toBeInTheDocument();
    expect(await screen.findByTestId('uebersicht-app-urlaub-live')).toBeInTheDocument();
  });

  it('eine Kachel öffnet die App in der Mitte', async () => {
    antworten();
    render(<Uebersicht />, { wrapper: huelle() });
    fireEvent.click(await screen.findByTestId('uebersicht-app-urlaub-live'));
    expect(useWorkspaceStore.getState().activeTabId).toBe('app:urlaub:live');
  });

  it('ohne Freigabe steht dort, wie man zu einer App kommt', async () => {
    antworten({ apps: [] });
    render(<Uebersicht />, { wrapper: huelle() });
    expect(await screen.findByText('Noch keine App für dich')).toBeInTheDocument();
  });

  /**
   * Nur die Zahl, keine Oberfläche zum Entscheiden — die ist D2 oder später.
   * Ohne die Zahl blieb eine angehaltene Freigabe (C7) unsichtbar, bis jemand
   * die Adresse kannte.
   */
  it('sagt, wie viele Freigaben warten', async () => {
    antworten({ freigaben: [{ id: 1 }, { id: 2 }] });
    render(<Uebersicht />, { wrapper: huelle() });
    expect(await screen.findByTestId('uebersicht-freigaben')).toHaveTextContent(
      '2 Freigaben warten auf deine Entscheidung.'
    );
  });

  it('und schweigt, wenn keine wartet', async () => {
    antworten({ freigaben: [] });
    render(<Uebersicht />, { wrapper: huelle() });
    await screen.findByTestId('uebersicht-app-urlaub-live');
    expect(screen.queryByTestId('uebersicht-freigaben')).not.toBeInTheDocument();
  });
});
