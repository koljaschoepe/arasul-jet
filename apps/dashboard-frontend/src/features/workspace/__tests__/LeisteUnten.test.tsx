/**
 * Die Leiste unten (M5, unter 900 px): Haus, die ersten vier Apps, „Mehr" mit
 * den übrigen Apps, Verwaltung, Einstellungen und Konto.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityBar } from '../ActivityBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { angemeldet } from '@/__tests__/helpers/authMock';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));

const get = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
}));

const APPS = ['eins', 'zwei', 'drei', 'vier', 'fuenf', 'sechs'].map(id => ({
  id,
  name: `App ${id}`,
  beschreibung: null,
  live: { version: '1.0.0', pfad: `/apps/${id}/` },
  test: null,
}));

function zeige(onLogout = vi.fn()) {
  get.mockImplementation(async (pfad: string) => {
    if (pfad === '/apps/meine') return { data: APPS };
    return { data: [] };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ActivityBar onLogout={onLogout} />
    </QueryClientProvider>
  );
  return onLogout;
}

describe('Leiste unten', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: true,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    useWorkspaceStore.setState({ ansicht: { type: 'dashboard' } });
    angemeldet({ role: 'admin', anzeigeName: 'Ada Admin' });
  });

  it('zeigt Haus, vier Apps und Mehr; die übrigen Apps liegen unter Mehr', async () => {
    zeige();
    expect(await screen.findByLabelText('App eins')).toBeInTheDocument();
    expect(screen.getByLabelText('App vier')).toBeInTheDocument();
    expect(screen.queryByLabelText('App fuenf')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Startseite')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Mehr'));
    const menue = await screen.findByTestId('leiste-mehr-menue');
    expect(within(menue).getByTestId('leiste-app-fuenf-live')).toBeInTheDocument();
    expect(within(menue).getByTestId('leiste-app-sechs-live')).toBeInTheDocument();
    expect(within(menue).getByTestId('leiste-verwaltung')).toBeInTheDocument();
    expect(within(menue).getByTestId('leiste-einstellungen')).toBeInTheDocument();
    expect(within(menue).getByText('Ada Admin')).toBeInTheDocument();

    fireEvent.click(within(menue).getByTestId('leiste-app-fuenf-live'));
    expect(useWorkspaceStore.getState().ansicht).toMatchObject({ type: 'app', appId: 'fuenf' });
  });

  it('dem Mitarbeiter fehlt die Verwaltung; Abmelden steht unter Mehr', async () => {
    angemeldet({ role: 'mitarbeiter', username: 'mia' });
    const onLogout = zeige();
    await screen.findByLabelText('App eins');
    fireEvent.click(screen.getByLabelText('Mehr'));
    const menue = await screen.findByTestId('leiste-mehr-menue');
    expect(within(menue).queryByTestId('leiste-verwaltung')).not.toBeInTheDocument();
    fireEvent.click(within(menue).getByTestId('workspace-abmelden'));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
