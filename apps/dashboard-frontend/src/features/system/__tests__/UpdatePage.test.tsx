/**
 * Aktualisierungen (Phase D5).
 *
 * Gemessen wird, was die Phase verlangt: die Fassung kommt aus dem Bau, und
 * die Seite sagt ehrlich, wenn dieses Gerät nicht über die Schnittstelle
 * einspielen kann. Der Ablauf des Einspielens selbst (hochladen, prüfen,
 * einspielen) steht nur da, wenn er auch gehen kann.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import UpdatePage from '../UpdatePage';

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));
vi.mock('../../../hooks/useApi', () => ({ useApi: () => apiMock }));

const STATUS_EINSPIELBAR = {
  status: 'idle',
  fassung: { version: '0.3.0', anzeige: '0.3.0', bekannt: true },
  einspielenMoeglich: true,
  einspielenGrund: null,
};

const STATUS_NICHT_EINSPIELBAR = {
  ...STATUS_EINSPIELBAR,
  einspielenMoeglich: false,
  einspielenGrund:
    'Ein Paket laesst sich an diesem Geraet nicht ueber die Schnittstelle einspielen: im Backend-Container gibt es kein `docker`-Programm.',
};

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function antworte(status: Record<string, unknown>, verlauf: unknown[] = []) {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/update/status') return status;
    if (pfad === '/update/history') return { updates: verlauf };
    if (pfad === '/update/usb-devices') return { devices: [] };
    if (pfad === '/system/info') return { build_hash: 'abcdef1234', jetpack_version: '6.0' };
    throw new Error(`unerwarteter Pfad: ${pfad}`);
  });
}

describe('Aktualisierungen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('zeigt die Fassung aus dem Bau', async () => {
    antworte(STATUS_EINSPIELBAR);
    render(<UpdatePage />, { wrapper: huelle() });

    expect(await screen.findByText('0.3.0')).toBeInTheDocument();
    expect(await screen.findByText('abcdef1')).toBeInTheDocument();
  });

  it('sagt es, wenn das Geraet nicht ueber die Schnittstelle einspielen kann', async () => {
    antworte(STATUS_NICHT_EINSPIELBAR);
    render(<UpdatePage />, { wrapper: huelle() });

    const satz = await screen.findByTestId('einspielen-nicht-moeglich');
    expect(satz.textContent).toContain('docker');
    // Und dann steht der Weg zum Einspielen NICHT da: ein Knopf, der
    // zuverlaessig scheitert, ist schlimmer als keiner.
    expect(screen.queryByText('Hochladen und prüfen')).not.toBeInTheDocument();
    expect(screen.queryByText('.araupdate Datei auswählen')).not.toBeInTheDocument();
  });

  it('bietet den Weg an, wenn das Geraet einspielen kann', async () => {
    antworte(STATUS_EINSPIELBAR);
    render(<UpdatePage />, { wrapper: huelle() });

    expect(await screen.findByText('.araupdate Datei auswählen')).toBeInTheDocument();
    expect(screen.getByText('Hochladen und prüfen')).toBeInTheDocument();
    expect(screen.queryByTestId('einspielen-nicht-moeglich')).not.toBeInTheDocument();
  });

  it('sagt bei einem Geraet ohne Fassung, dass es seine Fassung nicht kennt', async () => {
    antworte({
      ...STATUS_EINSPIELBAR,
      fassung: { version: null, anzeige: 'Vorserie', bekannt: false },
    });
    render(<UpdatePage />, { wrapper: huelle() });

    expect(await screen.findByText('Vorserie')).toBeInTheDocument();
    expect(screen.getByText(/kennt seine Fassung nicht/)).toBeInTheDocument();
  });

  it('sagt bei leerem Verlauf einen Satz statt einer leeren Liste', async () => {
    antworte(STATUS_EINSPIELBAR);
    render(<UpdatePage />, { wrapper: huelle() });
    expect(await screen.findByTestId('verlauf-leer')).toBeInTheDocument();
  });

  it('zeigt den Verlauf mit Fassung, Ausgang und Dauer', async () => {
    antworte(STATUS_EINSPIELBAR, [
      {
        id: 1,
        version_from: '0.2.0',
        version_to: '0.3.0',
        source: 'dashboard',
        status: 'completed',
        started_at: '2026-08-28T09:00:00.000Z',
        duration_seconds: 240,
      },
    ]);
    render(<UpdatePage />, { wrapper: huelle() });
    // Zweimal dieselbe Zeile ist Absicht: oben in der Kachel „Letzte
    // Aktualisierung", unten im Verlauf.
    await waitFor(() => expect(screen.getAllByText(/0\.2\.0 auf 0\.3\.0/)).toHaveLength(2));
    expect(screen.getByText('Abgeschlossen')).toBeInTheDocument();
    expect(screen.getByText('4 min')).toBeInTheDocument();
  });
});
