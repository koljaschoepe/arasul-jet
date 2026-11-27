/** Der Store (J60): Apps nach Abteilung, ganz oben die Reihe „Neu“. */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { StoreAnsicht, istNeu, nachAbteilung } from '../StoreAnsicht';
import { useWorkspaceStore } from '@/stores/workspaceStore';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));

const get = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get, put: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }),
}));

const vor = (tage: number) => new Date(Date.now() - tage * 86_400_000).toISOString();
const app = (id: string, extra = {}) => ({
  id,
  name: id.toUpperCase(),
  beschreibung: null,
  live: { version: '1', pfad: `/apps/${id}/` },
  test: null,
  ...extra,
});

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState({ ansicht: { type: 'store' } });
});

describe('Store', () => {
  it('gruppiert nach Abteilung, „Weitere“ zuletzt, und hat eine Reihe „Neu“', async () => {
    get.mockResolvedValue({
      data: [
        app('lohn', { abteilung: 'Personal', seit: vor(100) }),
        app('urlaub', { abteilung: 'Personal', seit: vor(100) }),
        app('wareneingang', { abteilung: 'Einkauf', seit: vor(2) }),
        app('misc', { seit: vor(100) }),
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <StoreAnsicht />
      </QueryClientProvider>
    );
    const neu = await screen.findByTestId('store-neu');
    expect(within(neu).getByText('WARENEINGANG')).toBeInTheDocument();
    expect(within(neu).queryByText('LOHN')).not.toBeInTheDocument();
    const titel = [...document.querySelectorAll('section > h2')].map(h => h.textContent);
    expect(titel).toEqual(['Neu', 'Einkauf', 'Personal', 'Weitere']);
    fireEvent.click(screen.getByTestId('store-app-lohn'));
    expect(useWorkspaceStore.getState().ansicht).toMatchObject({ type: 'app', appId: 'lohn' });
  });

  it('eine App nur im Test trägt das Wort „Im Test“', async () => {
    get.mockResolvedValue({
      data: [app('neu', { live: null, test: { version: '0.1', pfad: '/apps/neu/test/' } })],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <StoreAnsicht />
      </QueryClientProvider>
    );
    expect(await screen.findByText('Im Test')).toBeInTheDocument();
  });

  it('istNeu und nachAbteilung sind reine Funktionen', () => {
    expect(istNeu({ seit: vor(1) })).toBe(true);
    expect(istNeu({ seit: vor(30) })).toBe(false);
    expect(istNeu({ seit: null })).toBe(false);
    expect(nachAbteilung([])).toEqual([]);
  });
});
