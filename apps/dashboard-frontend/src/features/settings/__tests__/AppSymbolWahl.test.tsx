/**
 * Das Symbol einer laufenden App (J51): der Administrator wählt es, solange
 * die App keines mitbringt; bringt sie eines mit, steht nur das da.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppSymbolWahl } from '../apps/AppSymbolWahl';

const put = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get: vi.fn(), post: vi.fn(), put, patch: vi.fn(), del: vi.fn() }),
}));
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toast }));

function zeige(props: { mitgebracht: string | null; ersatz: string | null }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AppSymbolWahl appId="belege" name="Belege" {...props} />
    </QueryClientProvider>
  );
}

describe('AppSymbolWahl', () => {
  beforeEach(() => {
    put.mockReset().mockResolvedValue({ data: {} });
    toast.success.mockReset();
  });

  it('bringt die App ein Symbol mit, gibt es nichts zu wählen', () => {
    zeige({ mitgebracht: 'receipt', ersatz: null });
    expect(screen.getByTestId('symbol-mitgebracht')).toBeInTheDocument();
    expect(screen.queryByTestId('symbol-wahl')).not.toBeInTheDocument();
  });

  it('ein Klick setzt das Symbol über PUT /apps/:id/symbol', async () => {
    zeige({ mitgebracht: null, ersatz: null });
    fireEvent.click(screen.getByTestId('symbol-receipt'));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        '/apps/belege/symbol',
        { symbol: 'receipt' },
        {
          showError: false,
        }
      )
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('ein gewähltes Symbol ist markiert und lässt sich zurücknehmen', async () => {
    zeige({ mitgebracht: null, ersatz: 'wrench' });
    expect(screen.getByTestId('symbol-wrench')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('symbol-zuruecknehmen'));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        '/apps/belege/symbol',
        { symbol: null },
        {
          showError: false,
        }
      )
    );
  });
});
