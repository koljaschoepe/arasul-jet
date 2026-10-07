/**
 * Die Aktivitätsleiste (M5): oben das Haus mit der Zahl offener Freigaben,
 * darunter die Apps als Symbol, unten Verwaltung (nur Administrator), Zahnrad
 * und das eigene Bild mit Name und Abmelden. Die Rolle blendet aus, das
 * Backend entscheidet — hier wird nur das Ausblenden geprüft.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityBar, appKuerzel } from '../ActivityBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { angemeldet } from '@/__tests__/helpers/authMock';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));

const get = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
}));

const APPS = [
  {
    id: 'urlaub',
    name: 'Urlaubsantrag',
    beschreibung: null,
    live: { version: '1.0.0', pfad: '/apps/urlaub/' },
    test: { version: '1.1.0', pfad: '/apps/urlaub/test/' },
  },
  {
    id: 'rechnung',
    name: 'Rechnung prüfen',
    beschreibung: null,
    live: { version: '2.0.0', pfad: '/apps/rechnung/' },
    test: null,
  },
];

function zeige({ freigaben = 0, logo = null as string | null } = {}) {
  get.mockImplementation(async (pfad: string) => {
    if (pfad === '/auth/needs-setup') return { needsSetup: false, firmenname: 'Muster GmbH', logo };
    if (pfad === '/apps/meine') return { data: APPS };
    if (pfad === '/freigabe-anfragen') {
      return { data: Array.from({ length: freigaben }, (_, i) => ({ id: i, app_id: 'urlaub' })) };
    }
    return {};
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ActivityBar />
    </QueryClientProvider>
  );
}

describe('ActivityBar', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ ansicht: { type: 'dashboard' } });
    angemeldet({ role: 'admin', anzeigeName: 'Ada Admin' });
  });

  it('zeigt dem Administrator Startseite, Apps, Verwaltung und Zahnrad, kein eigenes Bild', async () => {
    zeige();
    expect(await screen.findByLabelText('Urlaubsantrag')).toBeInTheDocument();
    expect(screen.getByLabelText('(Test) Urlaubsantrag')).toBeInTheDocument();
    expect(screen.getByLabelText('Rechnung prüfen')).toBeInTheDocument();
    for (const name of ['Startseite', 'Verwaltung', 'Einstellungen']) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
    // Bild, Name und Abmelden stehen seit dem 07.10.2026 in der Fußzeile.
    expect(screen.queryByTestId('workspace-benutzermenue')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-abmelden')).not.toBeInTheDocument();
    // Die Modelle sind seit M5 ein Bereich der Verwaltung, „Apps" keine
    // Ansicht mehr, sondern die Apps selbst.
    expect(screen.queryByLabelText('Modelle')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Apps')).not.toBeInTheDocument();
  });

  it('zeigt das Logo des Hauses über dem Haus, falls eines hinterlegt ist', async () => {
    zeige({ logo: '2026-10-04T20:00:00.000Z' });
    const logo = await screen.findByTestId('leiste-logo');
    expect(logo).toHaveAttribute('src', '/api/darstellung/logo?stand=2026-10-04T20%3A00%3A00.000Z');
    expect(logo).toHaveAttribute('alt', 'Muster GmbH');
    // Es steht vor dem Haus.
    const leiste = screen.getByTestId('aktivitaetsleiste');
    expect(leiste.firstElementChild).toBe(logo);
  });

  it('ohne Logo steht dort nichts, auch kein Platzhalter', async () => {
    zeige();
    expect(await screen.findByLabelText('Urlaubsantrag')).toBeInTheDocument();
    expect(screen.queryByTestId('leiste-logo')).not.toBeInTheDocument();
  });

  it('zeigt dem Mitarbeiter keine Verwaltung', async () => {
    angemeldet({ role: 'mitarbeiter', username: 'mia' });
    zeige();
    expect(await screen.findByLabelText('Urlaubsantrag')).toBeInTheDocument();
    expect(screen.queryByLabelText('Verwaltung')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Einstellungen')).toBeInTheDocument();
  });

  it('trägt die Zahl offener Freigaben am Haus', async () => {
    zeige({ freigaben: 3 });
    expect(await screen.findByTestId('leiste-freigaben-zahl')).toHaveTextContent('3');
    expect(screen.getByLabelText('Startseite, 3 offen')).toBeInTheDocument();
  });

  it('ohne offene Freigabe steht keine Zahl', async () => {
    zeige();
    await screen.findByLabelText('Urlaubsantrag');
    expect(screen.queryByTestId('leiste-freigaben-zahl')).not.toBeInTheDocument();
  });

  it('ein Klick öffnet genau eine Ansicht, die Auswahl ist markiert', async () => {
    zeige();
    expect(screen.getByLabelText('Startseite')).toHaveAttribute('aria-current', 'page');
    fireEvent.click(await screen.findByLabelText('(Test) Urlaubsantrag'));
    expect(useWorkspaceStore.getState().ansicht).toEqual({
      type: 'app',
      appId: 'urlaub',
      stand: 'test',
      title: 'Urlaubsantrag',
    });
    expect(screen.getByLabelText('(Test) Urlaubsantrag')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Startseite')).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByLabelText('Verwaltung'));
    expect(useWorkspaceStore.getState().ansicht).toEqual({ type: 'verwaltung' });
    fireEvent.click(screen.getByLabelText('Einstellungen'));
    expect(useWorkspaceStore.getState().ansicht).toEqual({ type: 'settings' });
    fireEvent.click(screen.getByLabelText('Startseite'));
    expect(useWorkspaceStore.getState().ansicht).toEqual({ type: 'dashboard' });
  });

  it('ein zweiter Klick auf das Zahnrad lässt den Bereich der Einstellungen stehen', async () => {
    useWorkspaceStore.setState({ ansicht: { type: 'settings', bereich: 'passwort' } });
    zeige();
    fireEvent.click(screen.getByLabelText('Einstellungen'));
    expect(useWorkspaceStore.getState().ansicht).toEqual({ type: 'settings', bereich: 'passwort' });
  });
});

describe('appKuerzel', () => {
  it('nimmt die Anfänge zweier Wörter, sonst zwei Buchstaben', () => {
    expect(appKuerzel('Rechnung prüfen')).toBe('RP');
    expect(appKuerzel('Urlaubsantrag')).toBe('Ur');
    expect(appKuerzel('  rechnungen ')).toBe('Re');
  });
});
