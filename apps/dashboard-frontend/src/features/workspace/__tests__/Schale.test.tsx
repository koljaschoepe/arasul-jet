/**
 * Die Schale (J60): Glasleiste, Dock und Popup-Suche, wie der Klickentwurf 7
 * sie vorgibt. Gerechnet wird mit den echten Bausteinen der Bibliothek.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SchalenKopf } from '../SchalenKopf';
import { SchalenDock } from '../SchalenDock';
import { Suche } from '../Suche';
import { useWorkspaceStore } from '@/stores/workspaceStore';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));
import { angemeldet } from '@/__tests__/helpers/authMock';

const get = vi.fn();
const put = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get, put, post: vi.fn(), patch: vi.fn(), del: vi.fn() }),
}));

const APPS = [
  {
    id: 'urlaub',
    name: 'Urlaubsantrag',
    beschreibung: null,
    live: { version: '1.0.0', pfad: '/apps/urlaub/' },
    test: null,
  },
];

function huelle(kinder: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{kinder}</QueryClientProvider>);
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (pfad: string) => {
    if (pfad === '/apps/meine') return { data: APPS };
    if (pfad === '/apps/reihenfolge') return { data: [] };
    if (pfad === '/freigabe-anfragen') return { data: [{ id: 1 }, { id: 2 }] };
    return { data: [] };
  });
  angemeldet({ role: 'mitarbeiter', username: 'mia' });
  localStorage.clear();
  useWorkspaceStore.setState({
    ansicht: { type: 'dashboard' },
    paletteOffen: false,
    leistenSlot: null,
  });
});

describe('Glasleiste', () => {
  it('trägt auf der Startseite den Vogel, ab der zweiten Ebene „vorige Ebene“', () => {
    huelle(<SchalenKopf />);
    expect(screen.getByTestId('schale-vogel')).toBeInTheDocument();
    expect(screen.queryByText(/vorige Ebene/)).not.toBeInTheDocument();
  });

  it('zeigt in einer App „vorige Ebene“, und ein Klick führt zur Startseite', () => {
    useWorkspaceStore.setState({
      ansicht: { type: 'app', appId: 'urlaub', stand: 'live', title: 'Urlaubsantrag' },
    });
    huelle(<SchalenKopf />);
    expect(screen.queryByTestId('schale-vogel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/vorige Ebene/));
    expect(useWorkspaceStore.getState().ansicht.type).toBe('dashboard');
  });

  it('im Test trägt sie den blauen Streifen, in Live nicht', () => {
    useWorkspaceStore.setState({ ansicht: { type: 'app', appId: 'urlaub', stand: 'test' } });
    const { unmount } = huelle(<SchalenKopf />);
    expect(screen.getByTestId('schale-kopf')).toHaveAttribute('data-test', 'true');
    unmount();
    useWorkspaceStore.setState({ ansicht: { type: 'app', appId: 'urlaub', stand: 'live' } });
    huelle(<SchalenKopf />);
    expect(screen.getByTestId('schale-kopf')).not.toHaveAttribute('data-test');
  });

  it('das Suchen-Icon öffnet die Suche und hält einen Platz für die App bereit', () => {
    huelle(<SchalenKopf />);
    expect(screen.getByTestId('schale-leisten-slot')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('schale-suche'));
    expect(useWorkspaceStore.getState().paletteOffen).toBe(true);
  });
});

describe('Dock', () => {
  it('hat Start, Für Sie, Plus, Store und Zuletzt, und die Zahl offener Freigaben', async () => {
    huelle(<SchalenDock />);
    const dock = screen.getByTestId('schale-dock');
    for (const id of ['dock-start', 'dock-fuer-sie', 'dock-plus', 'dock-store', 'dock-zuletzt']) {
      expect(within(dock).getByTestId(id)).toBeInTheDocument();
    }
    expect(await within(dock).findByText('2')).toBeInTheDocument();
    expect(screen.getByTestId('dock-start')).toHaveAttribute('aria-current', 'page');
  });

  it('Store öffnet den Store und markiert ihn', () => {
    huelle(<SchalenDock />);
    fireEvent.click(screen.getByTestId('dock-store'));
    expect(useWorkspaceStore.getState().ansicht.type).toBe('store');
  });
});

describe('Popup-Suche', () => {
  const zeige = (onLogout = vi.fn()) => {
    useWorkspaceStore.setState({ paletteOffen: true });
    return huelle(<Suche onLogout={onLogout} />);
  };

  it('hat die Gruppen Apps, Befehle und Konto, die Verwaltung nur für Admins', async () => {
    zeige();
    const popup = await screen.findByTestId('suche-popup');
    expect(await within(popup).findByText('Urlaubsantrag')).toBeInTheDocument();
    for (const g of ['Apps', 'Befehle', 'Konto']) {
      expect(within(popup).getByRole('region', { name: g })).toBeInTheDocument();
    }
    expect(within(popup).queryByRole('region', { name: 'Verwaltung' })).not.toBeInTheDocument();
  });

  it('zeigt dem Admin die Verwaltung', async () => {
    angemeldet({ role: 'admin' });
    zeige();
    const popup = await screen.findByTestId('suche-popup');
    expect(within(popup).getByRole('region', { name: 'Verwaltung' })).toBeInTheDocument();
  });

  it('Tippen engt ein, Wählen öffnet die App und schließt', async () => {
    zeige();
    const feld = await screen.findByRole('searchbox');
    fireEvent.change(feld, { target: { value: 'urlaub' } });
    expect(screen.queryByText('Zur Startseite')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByText('Urlaubsantrag'));
    expect(useWorkspaceStore.getState().ansicht).toMatchObject({ type: 'app', appId: 'urlaub' });
    expect(useWorkspaceStore.getState().paletteOffen).toBe(false);
  });

  it('öffnet mit Strg+K und mit „/“, nicht aber mit „/“ in einem Feld', () => {
    huelle(<Suche onLogout={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(useWorkspaceStore.getState().paletteOffen).toBe(true);
    useWorkspaceStore.setState({ paletteOffen: false });
    fireEvent.keyDown(window, { key: '/' });
    expect(useWorkspaceStore.getState().paletteOffen).toBe(true);
    useWorkspaceStore.setState({ paletteOffen: false });
    const feld = document.createElement('input');
    document.body.appendChild(feld);
    fireEvent.keyDown(feld, { key: '/' });
    expect(useWorkspaceStore.getState().paletteOffen).toBe(false);
    feld.remove();
  });

  it('der Befehl zum Abmelden ruft das Abmelden', async () => {
    const aus = vi.fn(async () => {});
    zeige(aus);
    fireEvent.click(await screen.findByText('Abmelden'));
    expect(aus).toHaveBeenCalled();
  });

  it('der Befehl „Dunkel einschalten“ schreibt die Wahl, Vorgabe ist hell', async () => {
    put.mockResolvedValue({ data: { theme: 'dark' } });
    zeige();
    fireEvent.click(await screen.findByText('Dunkel einschalten'));
    expect(put).toHaveBeenCalledWith('/darstellung', { theme: 'dark' });
  });
});
