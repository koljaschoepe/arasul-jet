import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { app, meldung } from './beispiele';

const mockApi = vi.hoisted(() => ({
  ich: vi.fn(),
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
    expect(screen.getByTestId('werkstatt-zahl')).toHaveTextContent('1 Meldung in diesem Filter');
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
    const dialog = await screen.findByTestId('werkstatt-meldung');
    expect(within(dialog).getByTestId('werkstatt-bild')).toHaveAttribute(
      'src',
      '/api/rueckmeldungen/1/bild'
    );
    expect(within(dialog).getByTestId('werkstatt-seite')).toHaveTextContent(
      '/apps/belege/?ansicht=offen'
    );

    // Im Blatt steht „Stand“ sichtbar über der Auswahl, ohne die Grundbreite
    // der Filterzeile (sonst 224 px hoch, Generalprobe der Schleife).
    const wahl = within(dialog).getByTestId('werkstatt-stand-wahl');
    const huelle = wahl.parentElement as HTMLElement;
    expect(within(huelle).getByText('Stand')).not.toHaveClass('sr-only');
    expect(huelle.style.flex).toBe('');

    const speichern = screen.getByTestId('werkstatt-stand-speichern');
    expect(speichern).toBeDisabled();

    await nutzer.click(screen.getByTestId('werkstatt-stand-wahl'));
    await nutzer.click(await screen.findByRole('option', { name: 'Abgelehnt' }));
    expect(screen.getByTestId('werkstatt-grund-fehlt')).toBeInTheDocument();
    expect(speichern).toBeDisabled();

    await nutzer.type(screen.getByTestId('werkstatt-grund'), 'gibt es');
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
    expect(screen.getByTestId('werkstatt-wartet-belege')).toBeInTheDocument();
    expect(screen.queryByTestId('werkstatt-wartet-ruhig')).not.toBeInTheDocument();
    expect(screen.getByTestId('werkstatt-aenderung-belege')).toHaveTextContent(
      'Filter nach Monat.'
    );

    await nutzer.click(screen.getByTestId('werkstatt-live-schalten-belege'));
    expect(mockApi.schalten).not.toHaveBeenCalled();
    expect(await screen.findByText(/sichert zuerst die Daten von Belege/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Live schalten' }));
    await waitFor(() => expect(mockApi.schalten).toHaveBeenCalledWith('belege', 'live'));
    expect(await screen.findByTestId('werkstatt-schalt-ausgang')).toHaveTextContent(
      'Fassung 1.1.0'
    );
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
    await nutzer.click(screen.getByTestId('werkstatt-live-schalten-belege'));
    await nutzer.click(await screen.findByRole('button', { name: 'Live schalten' }));
    expect(await screen.findByTestId('werkstatt-schalt-ausgang')).toHaveTextContent(
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
  it('mit dem Recht: drei Einträge in der Leiste, mit der Zahl offener Meldungen', async () => {
    mockApi.ich.mockResolvedValue({ recht: true });
    mockApi.meldungen.mockResolvedValue([
      meldung({ id: 1 }),
      meldung({ id: 2, stand_meldung: 'umgesetzt' }),
    ]);
    mockApi.apps.mockResolvedValue([app()]);
    render(mitAbfragen(<App />));
    expect(await screen.findByTestId('werkstatt-eingang')).toBeInTheDocument();
    for (const k of ['eingang', 'apps', 'live']) {
      expect(screen.getAllByTestId(`werkstatt-leiste-${k}`).length).toBeGreaterThan(0);
    }
    await userEvent.setup().click(screen.getAllByTestId('werkstatt-leiste-apps')[0]!);
    expect(await screen.findByTestId('werkstatt-apps')).toBeInTheDocument();
    expect(window.location.hash).toBe('#apps');
    expect(await screen.findByTestId('werkstatt-offen-belege')).toHaveTextContent('2');
  });

  it('ohne das Recht: nur „Meine Meldungen“, kein Eingang, keine Apps, kein Live', async () => {
    mockApi.ich.mockResolvedValue({ recht: false });
    mockApi.meldungen.mockResolvedValue([
      meldung({
        id: 3,
        text: 'Mein Filter fehlt',
        stand_meldung: 'abgelehnt',
        grund: 'Gibt es schon: oben rechts.',
      }),
    ]);
    // Auch ein Fragment, das auf eine Seite mit Recht zeigt, öffnet sie nicht.
    window.location.hash = '#live';
    render(mitAbfragen(<App />));
    expect(await screen.findByTestId('werkstatt-meine')).toBeInTheDocument();
    expect(screen.getAllByTestId('werkstatt-leiste-meine').length).toBeGreaterThan(0);
    for (const k of ['eingang', 'apps', 'live']) {
      expect(screen.queryByTestId(`werkstatt-leiste-${k}`)).not.toBeInTheDocument();
    }
    expect(screen.queryByTestId('werkstatt-live')).not.toBeInTheDocument();
    // Die Apps fragt die Werkstatt ohne das Recht gar nicht erst.
    expect(mockApi.apps).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getAllByText('Mein Filter fehlt')[0]!);
    const dialog = await screen.findByTestId('werkstatt-eigene-meldung');
    expect(within(dialog).getByTestId('werkstatt-grund-lesen')).toHaveTextContent(
      'Gibt es schon: oben rechts.'
    );
    expect(within(dialog).getByText('Ihre Meldung wird nicht umgesetzt.')).toBeInTheDocument();
    // Nur lesen: kein Stand setzen, kein Entfernen.
    expect(screen.queryByTestId('werkstatt-stand-speichern')).not.toBeInTheDocument();
    expect(screen.queryByTestId('werkstatt-entfernen')).not.toBeInTheDocument();
  });

  it('ohne eigene Meldung: ein Satz, wie man meldet', async () => {
    mockApi.ich.mockResolvedValue({ recht: false });
    mockApi.meldungen.mockResolvedValue([]);
    render(mitAbfragen(<App />));
    expect(await screen.findByText('Noch keine Meldung von Ihnen')).toBeInTheDocument();
  });
});
