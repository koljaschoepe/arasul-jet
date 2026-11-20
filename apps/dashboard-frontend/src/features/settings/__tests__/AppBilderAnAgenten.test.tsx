/**
 * Der Schalter „Bildschirmfotos an den Agenten" auf der Seite der App (J43,
 * M7): Vorgabe aus, ein Satz sagt, was der Agent bekommt, ein Klick schickt
 * `PUT /apps/:id/bilder-an-agenten`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AppBilderAnAgenten } from '../apps/AppBilderAnAgenten';

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() };
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toast }));

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('AppBilderAnAgenten', () => {
  beforeEach(() => {
    apiMock.put.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it('aus: der Satz sagt, dass das Bild am Gerät bleibt', () => {
    render(<AppBilderAnAgenten appId="belege" name="Belege" erlaubt={false} />, {
      wrapper: huelle(),
    });
    expect(screen.getByTestId('bilder-an-agenten-schalter')).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByTestId('bilder-an-agenten-satz')).toHaveTextContent(
      'das Bildschirmfoto bleibt am Gerät'
    );
  });

  it('ein Klick schaltet an und meldet es', async () => {
    apiMock.put.mockResolvedValue({ data: { app_id: 'belege', bilder_an_agenten: true } });
    render(<AppBilderAnAgenten appId="belege" name="Belege" erlaubt={false} />, {
      wrapper: huelle(),
    });
    fireEvent.click(screen.getByTestId('bilder-an-agenten-schalter'));
    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith(
        '/apps/belege/bilder-an-agenten',
        { erlaubt: true },
        { showError: false }
      )
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Bildschirmfotos zu Belege gehen ab jetzt an den Agenten.'
      )
    );
  });

  it('ein Fehler steht als Meldung da', async () => {
    apiMock.put.mockRejectedValue(new Error('Nicht erlaubt'));
    render(<AppBilderAnAgenten appId="belege" name="Belege" erlaubt />, { wrapper: huelle() });
    fireEvent.click(screen.getByTestId('bilder-an-agenten-schalter'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
