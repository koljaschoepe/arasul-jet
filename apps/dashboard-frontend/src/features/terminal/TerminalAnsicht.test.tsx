/**
 * Das Terminal (Karte terminal-im-frontend, M5): der Rahmen auf `/terminal/`
 * steht nur, wenn das Gerät ein Terminal fährt und die Person Entwickler ist.
 * Sonst ein Satz, kein Rahmen vor einer verschlossenen Tür.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TerminalAnsicht from './TerminalAnsicht';

const get = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
}));

function zeige(lage: unknown) {
  get.mockImplementation(async (pfad: string) => (pfad === '/terminal' ? { data: lage } : {}));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TerminalAnsicht />
    </QueryClientProvider>
  );
}

describe('TerminalAnsicht', () => {
  beforeEach(() => get.mockReset());

  it('zeigt dem Entwickler den Rahmen auf /terminal/', async () => {
    zeige({ an: true, entwickler: true, linuxNutzer: 'ara-7' });
    const rahmen = await screen.findByTestId('terminal-rahmen');
    expect(rahmen).toHaveAttribute('src', '/terminal/');
    // Kein sandbox: die Tür hängt am Sitzungscookie.
    expect(rahmen).not.toHaveAttribute('sandbox');
    expect(rahmen).toHaveAttribute('title', 'Terminal (ara-7)');
  });

  it('ohne Terminal am Gerät: ein Satz, kein Rahmen', async () => {
    zeige({ an: false, entwickler: true, linuxNutzer: 'ara-7' });
    expect(await screen.findByText(/nicht eingeschaltet/)).toBeInTheDocument();
    expect(screen.queryByTestId('terminal-rahmen')).toBeNull();
  });

  it('ohne die Rolle Entwickler: ein Satz, kein Rahmen', async () => {
    zeige({ an: true, entwickler: false, linuxNutzer: null });
    expect(await screen.findByText('Das Terminal ist für Entwickler')).toBeInTheDocument();
    expect(screen.queryByTestId('terminal-rahmen')).toBeNull();
  });
});
