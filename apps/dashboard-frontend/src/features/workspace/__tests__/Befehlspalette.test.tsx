/**
 * Die Befehlspalette (J51): ⌘K/Strg+K öffnet sie, sie springt zu jeder
 * freigegebenen App, jeder Seite der Verwaltung (nur Admin) und der
 * Einstellungen, ganz mit der Tastatur.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Befehlspalette } from '../Befehlspalette';
import { istPalettenTaste, useWorkspaceStore } from '@/stores/workspaceStore';
import { angemeldet } from '@/__tests__/helpers/authMock';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));

const get = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
}));

const APPS = [
  {
    id: 'belege',
    name: 'Belege',
    beschreibung: null,
    symbol: 'receipt',
    live: { version: '1.0.0', pfad: '/apps/belege/' },
    test: { version: '1.1.0', pfad: '/apps/belege/test/' },
  },
  {
    id: 'abschluss',
    name: 'Abschluss',
    beschreibung: null,
    live: { version: '1.0.0', pfad: '/apps/abschluss/' },
    test: null,
  },
  {
    id: 'reisekosten',
    name: 'Reisekosten',
    beschreibung: null,
    live: { version: '1.0.0', pfad: '/apps/reisekosten/' },
    test: null,
  },
  {
    id: 'urlaub',
    name: 'Urlaub',
    beschreibung: null,
    live: { version: '1.0.0', pfad: '/apps/urlaub/' },
    test: null,
  },
];

function zeige() {
  get.mockImplementation(async (pfad: string) => {
    if (pfad === '/apps/meine') return { data: APPS };
    return { data: [] };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Befehlspalette />
    </QueryClientProvider>
  );
}

const taste = (init: KeyboardEventInit) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  });

describe('Befehlspalette', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      ansicht: { type: 'dashboard' },
      zuletztStand: {},
      paletteOffen: false,
    });
    angemeldet({ role: 'admin', anzeigeName: 'Ada Admin' });
  });

  it('erkennt ⌘K und Strg+K, nicht K allein oder mit Umschalt', () => {
    const k = { key: 'k', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
    expect(istPalettenTaste({ ...k, metaKey: true })).toBe(true);
    expect(istPalettenTaste({ ...k, ctrlKey: true, key: 'K' })).toBe(true);
    expect(istPalettenTaste(k)).toBe(false);
    expect(istPalettenTaste({ ...k, ctrlKey: true, shiftKey: true })).toBe(false);
  });

  it('öffnet mit der Tastenkombination und zeigt Apps, Verwaltung und Einstellungen', async () => {
    zeige();
    expect(screen.queryByTestId('befehlspalette')).not.toBeInTheDocument();
    taste({ key: 'k', ctrlKey: true });
    expect(await screen.findByTestId('befehlspalette')).toBeInTheDocument();
    expect(await screen.findByTestId('palette-app-belege')).toBeInTheDocument();
    expect(screen.getByTestId('palette-app-belege-test')).toBeInTheDocument();
    expect(screen.queryByTestId('palette-app-urlaub-test')).not.toBeInTheDocument();
    expect(screen.getByTestId('palette-verwaltung-benutzer')).toBeInTheDocument();
    expect(screen.getByTestId('palette-einstellungen-erscheinungsbild')).toBeInTheDocument();
  });

  it('ein Mitarbeiter sieht keine Verwaltung', async () => {
    angemeldet({ role: 'mitarbeiter', anzeigeName: 'Max' });
    useWorkspaceStore.setState({ paletteOffen: true });
    zeige();
    expect(await screen.findByTestId('palette-app-urlaub')).toBeInTheDocument();
    expect(screen.queryByTestId('palette-verwaltung-benutzer')).not.toBeInTheDocument();
  });

  it('tippen engt ein, Enter springt und schließt', async () => {
    useWorkspaceStore.setState({ paletteOffen: true });
    zeige();
    await screen.findByTestId('palette-app-urlaub');
    const feld = screen.getByTestId('befehlspalette-feld');
    fireEvent.change(feld, { target: { value: 'Urlaub' } });
    expect(screen.queryByTestId('palette-verwaltung-benutzer')).not.toBeInTheDocument();
    fireEvent.keyDown(feld, { key: 'Enter' });
    expect(useWorkspaceStore.getState().ansicht).toMatchObject({ type: 'app', appId: 'urlaub' });
    expect(useWorkspaceStore.getState().paletteOffen).toBe(false);
  });

  it('sucht scharf: „Ab“ findet Abschluss, nicht Belege', async () => {
    useWorkspaceStore.setState({ paletteOffen: true });
    zeige();
    await screen.findByTestId('palette-app-belege');
    const feld = screen.getByTestId('befehlspalette-feld');
    fireEvent.change(feld, { target: { value: 'Ab' } });
    expect(screen.getByTestId('palette-app-abschluss')).toBeInTheDocument();
    expect(screen.queryByTestId('palette-app-belege')).not.toBeInTheDocument();
    expect(screen.queryByTestId('palette-app-belege-test')).not.toBeInTheDocument();
    expect(screen.queryByTestId('palette-app-urlaub')).not.toBeInTheDocument();
  });

  it('ab drei Zeichen findet die Suche auch mitten im Wort', async () => {
    useWorkspaceStore.setState({ paletteOffen: true });
    zeige();
    await screen.findByTestId('palette-app-reisekosten');
    const feld = screen.getByTestId('befehlspalette-feld');
    fireEvent.change(feld, { target: { value: 'kosten' } });
    expect(screen.getByTestId('palette-app-reisekosten')).toBeInTheDocument();
    fireEvent.change(feld, { target: { value: 'ko' } });
    expect(screen.queryByTestId('palette-app-reisekosten')).not.toBeInTheDocument();
  });
});
