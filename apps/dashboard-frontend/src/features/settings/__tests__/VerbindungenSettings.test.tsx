/**
 * Die Seite Verbindungen (J38): je App eingetragen, genutzt (Anzahl, zuletzt),
 * abgewiesen in Rot; dazu die Aufrufe der Plattform.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { VerbindungenSettings } from '../VerbindungenSettings';

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

const DATEN = {
  data: {
    apps: [
      {
        id: 'probe',
        name: 'Probe',
        eingetragen: [{ host: 'example.org', staende: ['live'] }],
        genutzt: [
          { host: 'example.org', anzahl: 4, zuletzt: '2026-10-02T10:00:00Z', staende: ['live'] },
        ],
        abgewiesen: [
          { host: 'boese.example', anzahl: 2, zuletzt: '2026-10-02T11:00:00Z', staende: ['live'] },
        ],
      },
      { id: 'still', name: 'Still', eingetragen: [], genutzt: [], abgewiesen: [] },
    ],
    plattform: {
      genutzt: [
        { host: 'api.anthropic.com', anzahl: 7, zuletzt: '2026-10-02T08:00:00Z', staende: [] },
      ],
    },
  },
};

let client: QueryClient;
function Huelle({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  apiMock.get.mockReset();
});
afterEach(() => client.clear());

describe('VerbindungenSettings', () => {
  it('zeigt je App eingetragen, genutzt und abgewiesen, abgewiesen in Rot', async () => {
    apiMock.get.mockResolvedValue(DATEN);
    render(<VerbindungenSettings />, { wrapper: Huelle });

    await waitFor(() => expect(screen.getByTestId('verbindungen-app-probe')).toBeInTheDocument());
    expect(apiMock.get).toHaveBeenCalledWith('/ausgang', { showError: false });
    expect(screen.getByTestId('eingetragen-probe')).toHaveTextContent('example.org');
    expect(screen.getByTestId('genutzt-probe-example.org')).toHaveTextContent('4×');
    const rot = screen.getByTestId('abgewiesen-probe-boese.example');
    expect(rot).toHaveTextContent('2×');
    expect(rot.className).toContain('text-destructive');
  });

  it('sagt bei einer App ohne Eintrag, was sie erreicht', async () => {
    apiMock.get.mockResolvedValue(DATEN);
    render(<VerbindungenSettings />, { wrapper: Huelle });
    await waitFor(() => expect(screen.getByTestId('eingetragen-still-leer')).toBeInTheDocument());
    expect(screen.getByTestId('genutzt-still-leer')).toBeInTheDocument();
    expect(screen.getByTestId('abgewiesen-still-leer')).toBeInTheDocument();
  });

  it('zeigt die Aufrufe der Plattform (Flows mit externem Modell)', async () => {
    apiMock.get.mockResolvedValue(DATEN);
    render(<VerbindungenSettings />, { wrapper: Huelle });
    await waitFor(() =>
      expect(screen.getByTestId('genutzt-plattform-api.anthropic.com')).toHaveTextContent('7×')
    );
  });

  it('nennt einen Fehler', async () => {
    apiMock.get.mockRejectedValue(new Error('aus'));
    render(<VerbindungenSettings />, { wrapper: Huelle });
    await waitFor(() => expect(screen.getByTestId('verbindungen-fehler')).toBeInTheDocument());
  });
});
