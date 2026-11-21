/**
 * Die Leiste unten (unter 900 px): Start, die ersten vier Apps, jede genau
 * einmal, „Mehr" mit den übrigen Apps, Verwaltung, Einstellungen und
 * „Abmelden". Ungewählt nur Symbole, der Name steht am gewählten Eintrag.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityBar } from '../ActivityBar';
import { NameInEinerZeile } from '../LeisteUnten';
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
  // Die erste App hat auch einen Teststand: sie steht trotzdem nur einmal da.
  test: id === 'eins' ? { version: '1.1.0', pfad: `/apps/${id}/test/` } : null,
}));
const abmelden = vi.fn();

function zeige() {
  get.mockImplementation(async (pfad: string) => {
    if (pfad === '/apps/meine') return { data: APPS };
    return { data: [] };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ActivityBar onLogout={abmelden} />
    </QueryClientProvider>
  );
}

describe('Leiste unten', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: true,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    useWorkspaceStore.setState({ ansicht: { type: 'dashboard' }, zuletztStand: {} });
    abmelden.mockReset();
    angemeldet({ role: 'admin', anzeigeName: 'Ada Admin' });
  });

  it('zeigt Start, vier Apps und Mehr; die übrigen Apps liegen unter Mehr', async () => {
    zeige();
    expect(await screen.findByLabelText('App eins')).toBeInTheDocument();
    expect(screen.getByLabelText('App vier')).toBeInTheDocument();
    expect(screen.queryByLabelText('App fuenf')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('leiste-app-eins')).toHaveLength(1);
    expect(screen.getByLabelText('Start')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Mehr'));
    const menue = await screen.findByTestId('leiste-mehr-menue');
    expect(within(menue).getByTestId('leiste-app-fuenf')).toBeInTheDocument();
    expect(within(menue).getByTestId('leiste-app-sechs')).toBeInTheDocument();
    expect(within(menue).getByTestId('leiste-verwaltung')).toBeInTheDocument();
    expect(within(menue).getByTestId('leiste-einstellungen')).toBeInTheDocument();

    fireEvent.click(within(menue).getByTestId('leiste-app-fuenf'));
    expect(useWorkspaceStore.getState().ansicht).toMatchObject({ type: 'app', appId: 'fuenf' });
  });

  it('nur der gewählte Eintrag trägt seinen Namen sichtbar', async () => {
    zeige();
    const eins = await screen.findByLabelText('App eins');
    expect(eins).not.toHaveTextContent('App eins');
    expect(screen.getByLabelText('Start')).toHaveTextContent('Start');
    fireEvent.click(eins);
    expect(screen.getByLabelText('App eins')).toHaveTextContent('App eins');
    expect(screen.getByLabelText('Start')).not.toHaveTextContent('Start');
  });

  it('der Name steht in einer Zeile und bricht nie um', async () => {
    zeige();
    fireEvent.click(await screen.findByLabelText('App eins'));
    const name = screen.getByTestId('leiste-app-eins-name');
    expect(name.className).toContain('whitespace-nowrap');
    expect(name.className).not.toContain('break-words');
    expect(name.className).not.toContain('hyphens');
  });

  it('passt ein langer Name nicht in eine Zeile, bleibt nur das Symbol', () => {
    // jsdom misst nichts: 7 px je Zeichen, 96 px Platz, wie bei 390 px die
    // Fläche des gewählten Eintrags. „Einstellungen“ passt, ein langer
    // App-Name nicht.
    const scroll = vi
      .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return (this.textContent?.length ?? 0) * 7;
      });
    const client = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(96);
    try {
      const { rerender } = render(<NameInEinerZeile name="Einstellungen" testid="n" />);
      expect(screen.getByTestId('n')).toHaveTextContent('Einstellungen');
      rerender(<NameInEinerZeile name="Reisekostenabrechnung" testid="n" />);
      expect(screen.queryByTestId('n')).not.toBeInTheDocument();
      // Ein kurzer Name danach steht wieder da.
      rerender(<NameInEinerZeile name="Belege" testid="n" />);
      expect(screen.getByTestId('n')).toHaveTextContent('Belege');
    } finally {
      scroll.mockRestore();
      client.mockRestore();
    }
  });

  it('ist unter „Mehr" etwas offen, trägt „Mehr" seinen Namen', async () => {
    useWorkspaceStore.setState({ ansicht: { type: 'verwaltung' }, zuletztStand: {} });
    zeige();
    await screen.findByLabelText('App eins');
    expect(screen.getByTestId('leiste-mehr')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('leiste-mehr-name')).toHaveTextContent('Verwaltung');
  });

  it('„Abmelden" steht unter „Mehr"', async () => {
    zeige();
    await screen.findByLabelText('App eins');
    fireEvent.click(screen.getByLabelText('Mehr'));
    const menue = await screen.findByTestId('leiste-mehr-menue');
    expect(within(menue).getByText('Ada Admin')).toBeInTheDocument();
    fireEvent.click(within(menue).getByTestId('workspace-abmelden'));
    expect(abmelden).toHaveBeenCalledTimes(1);
  });

  it('dem Mitarbeiter fehlt die Verwaltung', async () => {
    angemeldet({ role: 'mitarbeiter', username: 'mia' });
    zeige();
    await screen.findByLabelText('App eins');
    fireEvent.click(screen.getByLabelText('Mehr'));
    const menue = await screen.findByTestId('leiste-mehr-menue');
    expect(within(menue).queryByTestId('leiste-verwaltung')).not.toBeInTheDocument();
    expect(within(menue).getByTestId('leiste-einstellungen')).toBeInTheDocument();
  });
});
