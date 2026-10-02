/**
 * Die Karte „Neue Fassung" (J39). Gemessen wird, was ein Mensch davon hat: er
 * sieht die neuere Fassung und den Satz, dass vorher gesichert wird, er sieht
 * den Fortschritt lesbar, und er findet den Rückweg, wenn es einen gibt.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { FassungAktualisieren } from '../FassungAktualisieren';

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

describe('Neue Fassung', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bietet die neuere Fassung an und sagt, dass vorher gesichert wird', async () => {
    antworte(RUHE);
    render(<FassungAktualisieren />, { wrapper: huelle() });
    expect(await screen.findByText(/Auf 0\.8\.15 aktualisieren/)).toBeInTheDocument();
    expect(screen.getByText(/sichert vorher/)).toBeInTheDocument();

    apiMock.post.mockResolvedValue({ data: { lauf: 'x', von: '0.8.14', nach: '0.8.15' } });
    fireEvent.click(screen.getByText(/Auf 0\.8\.15 aktualisieren/));
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
    render(<FassungAktualisieren />, { wrapper: huelle() });
    expect(await screen.findByTestId('fassung-aktuell')).toBeInTheDocument();
    expect(screen.queryByText(/aktualisieren$/)).not.toBeInTheDocument();
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
    render(<FassungAktualisieren />, { wrapper: huelle() });
    expect(await screen.findByTestId('fassung-schritt')).toHaveTextContent(/gebaut/);
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
    render(<FassungAktualisieren />, { wrapper: huelle() });
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
    render(<FassungAktualisieren />, { wrapper: huelle() });
    const knopf = await screen.findByText(/Zurück auf 0\.8\.14/, { selector: 'button' });
    apiMock.post.mockResolvedValue({ data: { lauf: 'y', nach: '0.8.14' } });
    fireEvent.click(knopf);
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/update/fassung/zurueck', {}, { showError: false })
    );
  });

  it('zeigt nichts, wenn das Gerät sich nicht selbst aktualisieren kann', async () => {
    antworte({ ...RUHE, einspielenMoeglich: false });
    const { container } = render(<FassungAktualisieren />, { wrapper: huelle() });
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
