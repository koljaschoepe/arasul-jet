/**
 * Die Aktualisierung im Bereich Gerät (J39, M5). Gemessen wird, was ein Mensch
 * davon hat: er sieht, welche Fassung läuft, die neuere und den Satz, dass
 * vorher gesichert wird; er bestätigt, bevor etwas startet; er sieht den
 * Fortschritt lesbar, das Protokoll nur aufgeklappt, und findet den Rückweg.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Aktualisierung } from '../Aktualisierung';

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() };
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));
vi.mock('../../../hooks/useApi', () => ({ useApi: () => apiMock }));

const RUHE = {
  fassung: { version: '0.8.14', nummer: '0.8.14' },
  einspielenMoeglich: true,
  einspielenGrund: null,
  laeuft: false,
  lauf: null,
  zurueckMoeglich: false,
  vorige: null,
};

const NACHTS = {
  aktiv: false,
  fenster: {
    von: '02:00',
    bis: '04:00',
    zeitzone: 'Europe/Berlin',
    beginn: '2026-10-05T00:00:00.000Z',
    ende: '2026-10-05T02:00:00.000Z',
    laeuftGerade: false,
    laufendBis: null,
  },
  letzter: null,
  hinweis: null,
};

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function antworte(stand: Record<string, unknown>, neueste: string | null = '0.8.15') {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/update/fassung') return { data: stand };
    if (pfad === '/update/fassung/neueste') return { data: neueste ? { fassung: neueste } : null };
    if (pfad === '/update/fassung/nachts') return { data: NACHTS };
    throw new Error(`unerwarteter Pfad: ${pfad}`);
  });
}

describe('Aktualisierung', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bietet die neuere Fassung an, sagt, dass vorher gesichert wird, und fragt nach', async () => {
    antworte(RUHE);
    render(<Aktualisierung />, { wrapper: huelle() });
    expect(await screen.findByTestId('fassung-einspielen')).toHaveTextContent(
      'Auf 0.8.15 aktualisieren'
    );
    expect(screen.getByTestId('fassung-hier')).toHaveTextContent('Hier läuft Fassung 0.8.14.');
    expect(screen.getByText(/Das Gerät sichert vorher und geht/)).toBeInTheDocument();

    // Der Knopf startet nichts: erst die Bestätigung.
    fireEvent.click(screen.getByTestId('fassung-einspielen'));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      /einige Minuten nicht erreichbar/
    );
    expect(apiMock.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(apiMock.post).not.toHaveBeenCalled();

    apiMock.post.mockResolvedValue({ data: { lauf: 'x', von: '0.8.14', nach: '0.8.15' } });
    fireEvent.click(screen.getByTestId('fassung-einspielen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Aktualisieren' }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        '/update/fassung/einspielen',
        { fassung: '0.8.15' },
        { showError: false }
      )
    );
  });

  it('bietet nichts an, wenn das Gerät schon die neueste trägt', async () => {
    antworte(RUHE, '0.8.14');
    render(<Aktualisierung />, { wrapper: huelle() });
    expect(await screen.findByTestId('fassung-aktuell')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('fassung-aktuell')).toHaveTextContent(
        'Das ist die neueste Fassung.'
      )
    );
    expect(screen.queryByTestId('fassung-einspielen')).not.toBeInTheDocument();
  });

  it('zeigt den Schritt und das Protokoll, solange der Lauf läuft', async () => {
    antworte({
      ...RUHE,
      laeuft: true,
      lauf: {
        art: 'einspielen',
        status: 'laeuft',
        schritt: 'installieren',
        nach: '0.8.15',
        protokoll: ['[10:00:01] install.sh in /home/arasul/arasul-0.8.15'],
      },
    });
    render(<Aktualisierung />, { wrapper: huelle() });
    expect(await screen.findByTestId('fassung-schritt')).toHaveTextContent(/gebaut/);
    // Das Protokoll ist Technik: erst aufgeklappt sichtbar.
    expect(screen.queryByTestId('fassung-protokoll')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('fassung-protokoll-knopf'));
    expect(screen.getByTestId('fassung-protokoll')).toHaveTextContent('install.sh in');
  });

  it('nennt ein zurückgerolltes Einspielen beim Namen', async () => {
    antworte({
      ...RUHE,
      lauf: {
        status: 'zurueckgerollt',
        nach: '0.8.15',
        meldung: 'Die Fassung 0.8.15 ließ sich nicht einspielen.',
      },
    });
    render(<Aktualisierung />, { wrapper: huelle() });
    expect(await screen.findByText(/läuft wieder mit der vorigen Fassung/)).toBeInTheDocument();
  });

  it('zeigt den Rückweg, wenn es einen gibt', async () => {
    antworte({
      ...RUHE,
      fassung: { version: '0.8.15', nummer: '0.8.15' },
      zurueckMoeglich: true,
      vorige: { fassung: '0.8.14' },
      lauf: { status: 'fertig', nach: '0.8.15' },
    });
    render(<Aktualisierung />, { wrapper: huelle() });
    const knopf = await screen.findByTestId('fassung-zurueck');
    expect(knopf).toHaveTextContent('Zurück auf 0.8.14');
    apiMock.post.mockResolvedValue({ data: { lauf: 'y', nach: '0.8.14' } });
    fireEvent.click(knopf);
    expect(apiMock.post).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Zurück' }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/update/fassung/zurueck', {}, { showError: false })
    );
  });

  it('sagt, warum es nicht geht, wenn das Gerät sich nicht selbst aktualisieren kann', async () => {
    antworte({
      ...RUHE,
      einspielenMoeglich: false,
      einspielenGrund: 'Das spielt Ihr Betreuer ein.',
    });
    render(<Aktualisierung />, { wrapper: huelle() });
    expect(await screen.findByTestId('einspielen-nicht-moeglich')).toHaveTextContent(
      'Das spielt Ihr Betreuer ein.'
    );
    expect(screen.getByTestId('fassung-hier')).toHaveTextContent('0.8.14');
    expect(screen.queryByTestId('fassung-einspielen')).not.toBeInTheDocument();
  });

  describe('nachts selbst einspielen', () => {
    const mit = (nachts: Record<string, unknown>) => {
      apiMock.get.mockImplementation(async (pfad: string) => {
        if (pfad === '/update/fassung') return { data: RUHE };
        if (pfad === '/update/fassung/neueste') return { data: { fassung: '0.8.15' } };
        if (pfad === '/update/fassung/nachts') return { data: { ...NACHTS, ...nachts } };
        throw new Error(`unerwarteter Pfad: ${pfad}`);
      });
    };

    it('steht aus, und sagt das Fenster in der Zeit des Geräts', async () => {
      mit({});
      render(<Aktualisierung />, { wrapper: huelle() });
      const schalter = await screen.findByTestId('nachts-schalter');
      expect(schalter).not.toBeChecked();
      expect(screen.getByTestId('nachts-einspielen')).toHaveTextContent(
        /zwischen 02:00 und 04:00 Uhr/
      );
      expect(screen.getByTestId('nachts-einspielen')).toHaveTextContent(/Europe\/Berlin/);
      expect(screen.getByTestId('nachts-fenster')).toHaveTextContent(/Aus\./);
    });

    it('einschalten schickt den Schalter und fragt neu', async () => {
      mit({});
      apiMock.put.mockResolvedValue({ data: {} });
      render(<Aktualisierung />, { wrapper: huelle() });
      fireEvent.click(await screen.findByTestId('nachts-schalter'));
      await waitFor(() =>
        expect(apiMock.put).toHaveBeenCalledWith(
          '/update/fassung/nachts',
          { aktiv: true },
          expect.anything()
        )
      );
    });

    it('zeigt bei „an" das nächste Fenster mit Wochentag', async () => {
      mit({ aktiv: true });
      render(<Aktualisierung />, { wrapper: huelle() });
      expect(await screen.findByTestId('nachts-fenster')).toHaveTextContent(
        /Nächstes Fenster: Montag, 5\. Oktober, 02:00 bis 04:00 Uhr/
      );
    });

    it('im Fenster: läuft gerade, und das nächste Fenster ist das der folgenden Nacht', async () => {
      mit({
        aktiv: true,
        fenster: {
          ...NACHTS.fenster,
          beginn: '2026-10-06T00:00:00.000Z',
          ende: '2026-10-06T02:00:00.000Z',
          laeuftGerade: true,
          laufendBis: '2026-10-05T02:00:00.000Z',
        },
      });
      render(<Aktualisierung />, { wrapper: huelle() });
      expect(await screen.findByTestId('nachts-fenster')).toHaveTextContent(
        /gerade offen\. Nächstes Fenster: Dienstag, 6\. Oktober/
      );
    });

    it('sagt das Ergebnis der letzten Nacht und lässt es wegklicken', async () => {
      const letzter = {
        id: 1,
        fenster: '2026-10-05',
        trocken: false,
        ergebnis: 'zurueckgefallen',
        grund: null,
        von: '0.8.14',
        nach: '0.8.15',
        gestartet: '2026-10-05T00:00:00Z',
        beendet: '2026-10-05T00:20:00Z',
        gesehen_am: null,
      };
      mit({ aktiv: true, letzter, hinweis: letzter });
      apiMock.post.mockResolvedValue({ data: { ok: true } });
      render(<Aktualisierung />, { wrapper: huelle() });
      expect(await screen.findByTestId('nachts-letzte')).toHaveTextContent(
        /In der Nacht zum 5\. Oktober ist die Aktualisierung auf 0\.8\.15 misslungen\. Das Gerät läuft wieder mit 0\.8\.14\./
      );
      fireEvent.click(screen.getByTestId('nachts-gelesen'));
      await waitFor(() =>
        expect(apiMock.post).toHaveBeenCalledWith(
          '/update/fassung/nachts/gesehen',
          {},
          expect.anything()
        )
      );
    });

    it('„Ablauf prüfen" zeigt den Bericht des Trockenlaufs und spielt nichts ein', async () => {
      mit({});
      apiMock.post.mockResolvedValue({
        data: {
          id: 2,
          trocken: true,
          ergebnis: 'trockenlauf',
          grund:
            'Eingespielt würde 0.8.15 (jetzt 0.8.14); vorher würde gesichert. Es wurde nichts verändert.',
        },
      });
      render(<Aktualisierung />, { wrapper: huelle() });
      fireEvent.click(await screen.findByTestId('nachts-pruefen'));
      expect(await screen.findByTestId('nachts-probe')).toHaveTextContent(
        /Es wurde nichts verändert/
      );
      expect(apiMock.post).toHaveBeenCalledTimes(1);
      expect(apiMock.post.mock.calls[0]?.[0]).toBe('/update/fassung/nachts/trockenlauf');
    });
  });
});
