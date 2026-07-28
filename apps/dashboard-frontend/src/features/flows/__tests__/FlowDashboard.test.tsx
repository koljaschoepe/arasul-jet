/**
 * FlowDashboard Tests — die Flow-Zentrale (Betriebssicht eines Flows).
 *
 * Prüft die Kernpunkte: die per-Flow-Trigger-URL steht da, und „Neuer Schlüssel"
 * erzeugt einen API-Schlüssel mit genau dem Scope `flow:run` und zeigt ihn (einmalig).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FlowDashboard from '../FlowDashboard';
import type { FlowDefinition } from '@/types/flows';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get: apiGet, post: apiPost }),
}));
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toast }));

const NEWSLETTER: FlowDefinition = {
  name: 'newsletter',
  beschreibung: 'schreibt einen Newsletter',
  argumente: [],
  ordner: ['/arasul/sandbox/projects/newsletter'],
  werkzeuge: ['dateien_schreiben'],
  rollen: [],
  schritte: [],
  grenzen: { max_aufrufe: 20, zeitlimit_s: 900, werkzeug_runden: 10, max_tiefe: 2 },
  prompt: '# Newsletter',
};

function renderDash() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FlowDashboard name="newsletter" flow={NEWSLETTER} onEdit={vi.fn()} onDelete={vi.fn()} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // GET wird für Läufe und Schlüssel aufgerufen — beides leer.
  apiGet.mockImplementation((path: string) => {
    if (path.includes('/laeufe')) return Promise.resolve({ data: [] });
    if (path.includes('/api-keys')) return Promise.resolve({ api_keys: [] });
    return Promise.resolve({});
  });
});

describe('FlowDashboard', () => {
  it('zeigt die per-Flow-Trigger-URL', () => {
    renderDash();
    // Die URL steht sowohl im URL-Feld als auch im curl-Beispiel.
    expect(
      screen.getAllByText(content => content.includes('/api/v1/external/flows/newsletter/run'))
        .length
    ).toBeGreaterThan(0);
  });

  it('„Neuer Schlüssel" erzeugt einen Key mit Scope flow:run und zeigt ihn', async () => {
    apiPost.mockResolvedValueOnce({ api_key: 'ak_live_geheim123' });
    renderDash();

    await userEvent.click(screen.getByRole('button', { name: /Neuer Schlüssel/ }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith(
      '/v1/external/api-keys',
      expect.objectContaining({ allowed_endpoints: ['flow:run'] })
    );
    expect(await screen.findByText('ak_live_geheim123')).toBeInTheDocument();
  });
});
