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
    expect(screen.getByText(/sichert vorher/)).toBeInTheDocument();

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
});
