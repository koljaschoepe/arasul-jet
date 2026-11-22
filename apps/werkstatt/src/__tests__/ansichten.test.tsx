import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { app, meldung } from './beispiele';

const mockApi = vi.hoisted(() => ({
  meldungen: vi.fn(),
  apps: vi.fn(),
  standSetzen: vi.fn(),
  entfernen: vi.fn(),
  schalten: vi.fn(),
}));
vi.mock('../api', async () => {
  const echt = await vi.importActual<typeof import('../api')>('../api');
  return { ...echt, api: mockApi };
});

import { App } from '../App';
import { Eingang } from '../Eingang';
import { TestNachLive } from '../TestNachLive';
import { FILTER_VORGABE } from '../logik';

function mitAbfragen(kind: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{kind}</QueryClientProvider>;
}

beforeEach(() => {
  // Radix Select braucht in jsdom diese drei (wie in der Shell).
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.releasePointerCapture = vi.fn();
  Object.values(mockApi).forEach(f => f.mockReset());
  window.location.hash = '';
});

describe('Eingang', () => {
  const meldungen = [
    meldung({ id: 1, text: 'Filter fehlt' }),
    meldung({ id: 2, text: 'Schon erledigt', stand_meldung: 'umgesetzt', hat_bild: false }),
  ];

  it('zeigt die offenen Meldungen mit Person und Stand; umgesetzt nur im Filter', async () => {
    render(
      mitAbfragen(
        <Eingang
          meldungen={meldungen}
          apps={[]}
          laedt={false}
          fehler={null}
          filter={FILTER_VORGABE}
          setzeFilter={() => {}}
        />
      )
    );
    expect(screen.getAllByText('Filter fehlt').length).toBeGreaterThan(0);
    expect(screen.queryByText('Schon erledigt')).not.toBeInTheDocument();
    expect(screen.getAllByText('Mia Muster').length).toBeGreaterThan(0);
    expect(screen.getByTestId('cockpit-zahl')).toHaveTextContent('1 Meldung in diesem Filter');
  });

  it('eine Meldung öffnet mit Bild und Seite; abgelehnt verlangt einen Grund', async () => {
    const nutzer = userEvent.setup();
    mockApi.standSetzen.mockResolvedValue(
      meldung({ id: 1, stand_meldung: 'abgelehnt', grund: 'gibt es' })
    );
    render(
      mitAbfragen(
        <Eingang
          meldungen={meldungen}
          apps={[]}
          laedt={false}
          fehler={null}
          filter={FILTER_VORGABE}
          setzeFilter={() => {}}
        />
      )
    );
    await nutzer.click(screen.getAllByText('Filter fehlt')[0]!);
    const dialog = await screen.findByTestId('cockpit-meldung');
    expect(within(dialog).getByTestId('cockpit-bild')).toHaveAttribute(
      'src',
      '/api/rueckmeldungen/1/bild'
    );
    expect(within(dialog).getByTestId('cockpit-seite')).toHaveTextContent(
      '/apps/belege/?ansicht=offen'
    );

    const speichern = screen.getByTestId('cockpit-stand-speichern');
    expect(speichern).toBeDisabled();

    await nutzer.click(screen.getByTestId('cockpit-stand-wahl'));
    await nutzer.click(await screen.findByRole('option', { name: 'Abgelehnt' }));
    expect(screen.getByTestId('cockpit-grund-fehlt')).toBeInTheDocument();
    expect(speichern).toBeDisabled();

    await nutzer.type(screen.getByTestId('cockpit-grund'), 'gibt es');
    expect(speichern).toBeEnabled();
    await nutzer.click(speichern);
    await waitFor(() =>
      expect(mockApi.standSetzen).toHaveBeenCalledWith(1, 'abgelehnt', 'gibt es')
    );
  });
});

describe('Test nach Live', () => {
  it('zeigt, was im Test neuer ist, und schaltet erst nach der Rückfrage', async () => {
    const nutzer = userEvent.setup();
    mockApi.schalten.mockResolvedValue({ version: '1.1.0', stand: 'live' });
    render(
      mitAbfragen(
        <TestNachLive
          apps={[app(), app({ id: 'ruhig', name: 'Ruhig', test_neuer: false })]}
          laedt={false}
          fehler={null}
        />
      )
    );
    expect(screen.getByTestId('cockpit-wartet-belege')).toBeInTheDocument();
    expect(screen.queryByTestId('cockpit-wartet-ruhig')).not.toBeInTheDocument();
    expect(screen.getByTestId('cockpit-aenderung-belege')).toHaveTextContent('Filter nach Monat.');

    await nutzer.click(screen.getByTestId('cockpit-live-schalten-belege'));
    expect(mockApi.schalten).not.toHaveBeenCalled();
    expect(await screen.findByText(/sichert zuerst die Daten von Belege/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Live schalten' }));
    await waitFor(() => expect(mockApi.schalten).toHaveBeenCalledWith('belege', 'live'));
    expect(await screen.findByTestId('cockpit-schalt-ausgang')).toHaveTextContent('Fassung 1.1.0');
  });

  it('ein Rückfall des Geräts steht als Satz da', async () => {
    const nutzer = userEvent.setup();
    const { ApiFehler } = await import('../api');
    mockApi.schalten.mockRejectedValue(
      new ApiFehler(
        'Die neue Fassung 1.1.0 ließ sich nicht starten, deshalb läuft Belege wieder mit Fassung 1.0.0.',
        409,
        'LIVE_ZURUECKGESCHALTET'
      )
    );
    render(mitAbfragen(<TestNachLive apps={[app()]} laedt={false} fehler={null} />));
    await nutzer.click(screen.getByTestId('cockpit-live-schalten-belege'));
    await nutzer.click(await screen.findByRole('button', { name: 'Live schalten' }));
    expect(await screen.findByTestId('cockpit-schalt-ausgang')).toHaveTextContent(
      'wieder mit Fassung 1.0.0'
    );
  });

  it('ohne Wartendes: alles ist live', () => {
    render(
      mitAbfragen(<TestNachLive apps={[app({ test_neuer: false })]} laedt={false} fehler={null} />)
    );
    expect(screen.getByText('Alles ist live')).toBeInTheDocument();
  });
});

describe('der Rahmen', () => {
  it('drei Einträge in der Leiste, mit der Zahl offener Meldungen', async () => {
    mockApi.meldungen.mockResolvedValue([
      meldung({ id: 1 }),
      meldung({ id: 2, stand_meldung: 'umgesetzt' }),
    ]);
    mockApi.apps.mockResolvedValue([app()]);
    render(mitAbfragen(<App />));
    expect(await screen.findByTestId('cockpit-eingang')).toBeInTheDocument();
    for (const k of ['eingang', 'apps', 'live']) {
      expect(screen.getAllByTestId(`cockpit-leiste-${k}`).length).toBeGreaterThan(0);
    }
    await userEvent.setup().click(screen.getAllByTestId('cockpit-leiste-apps')[0]!);
    expect(await screen.findByTestId('cockpit-apps')).toBeInTheDocument();
    expect(window.location.hash).toBe('#apps');
    expect(await screen.findByTestId('cockpit-offen-belege')).toHaveTextContent('2');
  });
});
