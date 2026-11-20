/**
 * Rückmeldungen in der Verwaltung (J42, M7): die einfache Liste für
 * Entwickler. Ohne Kennzeichen fragt die Seite das Gerät gar nicht erst; das
 * Gerät weist ohnehin ab (Backend-Test `rueckmeldungen.test.js`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { RueckmeldungenSettings } from '../RueckmeldungenSettings';

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

const LISTE = {
  data: [
    {
      id: 7,
      app_id: 'belege',
      app_name: 'Belege',
      stand: 'live',
      seite: '/apps/belege/?ansicht=offen',
      text: 'Filter nach Monat fehlt',
      hat_bild: true,
      markierung: { x: 0.1, y: 0.1, breite: 0.2, hoehe: 0.2 },
      person: { id: 2, anzeigeName: 'Mia Muster' },
      stand_meldung: 'neu',
      erstellt_am: '2026-11-20T10:00:00Z',
    },
    {
      id: 6,
      app_id: 'abschluss',
      app_name: null,
      stand: 'test',
      seite: '/apps/abschluss/test/',
      text: 'Knopf zu klein',
      hat_bild: false,
      markierung: null,
      person: null,
      stand_meldung: 'neu',
      erstellt_am: '2026-11-19T10:00:00Z',
    },
  ],
};

describe('Rückmeldungen in der Verwaltung', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.del.mockReset();
  });

  it('ohne Kennzeichen: kein Aufruf, nur der Hinweis', () => {
    render(<RueckmeldungenSettings entwickler={false} />, { wrapper: huelle() });
    expect(screen.getByText('Nur mit dem Kennzeichen Entwickler')).toBeInTheDocument();
    expect(apiMock.get).not.toHaveBeenCalled();
  });

  it('zeigt je Meldung App, Person, Seite, Text und das Bild', async () => {
    apiMock.get.mockResolvedValue(LISTE);
    render(<RueckmeldungenSettings entwickler />, { wrapper: huelle() });
    const erste = await screen.findByTestId('rueckmeldung-7');
    expect(erste).toHaveTextContent('Belege');
    expect(erste).toHaveTextContent('Mia Muster');
    expect(erste).toHaveTextContent('/apps/belege/?ansicht=offen');
    expect(erste).toHaveTextContent('Filter nach Monat fehlt');
    expect(erste.querySelector('img')?.getAttribute('src')).toMatch(/\/rueckmeldungen\/7\/bild$/);

    const zweite = screen.getByTestId('rueckmeldung-6');
    expect(zweite).toHaveTextContent('abschluss (Test)');
    expect(zweite).toHaveTextContent('Gelöschte Person');
    expect(zweite).toHaveTextContent('Ohne Bildschirmfoto');
    expect(screen.getByTestId('rueckmeldungen-zahl')).toHaveTextContent('2 Rückmeldungen');
  });

  it('Entfernen fragt nach und nimmt dann Meldung und Bild weg', async () => {
    const nutzer = userEvent.setup();
    apiMock.get.mockResolvedValue(LISTE);
    apiMock.del.mockResolvedValue({});
    render(<RueckmeldungenSettings entwickler />, { wrapper: huelle() });
    await nutzer.click(await screen.findByTestId('rueckmeldung-entfernen-7'));
    expect(apiMock.del).not.toHaveBeenCalled();
    await nutzer.click(await screen.findByRole('button', { name: 'Entfernen' }));
    await waitFor(() => expect(apiMock.del).toHaveBeenCalledWith('/rueckmeldungen/7'));
  });

  it('leer ist leer', async () => {
    apiMock.get.mockResolvedValue({ data: [] });
    render(<RueckmeldungenSettings entwickler />, { wrapper: huelle() });
    expect(await screen.findByText('Noch keine Rückmeldung')).toBeInTheDocument();
  });
});
