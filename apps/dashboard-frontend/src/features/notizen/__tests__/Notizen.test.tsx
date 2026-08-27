/**
 * Notizen — der Zettel in der rechten Spalte (Phase D1).
 *
 * Gespeichert wird von selbst, nach einer Sekunde Ruhe. Geprüft wird genau
 * das: dass nicht bei jedem Tastendruck geschrieben wird, dass am Ende die
 * LETZTE Fassung ankommt, und dass eine auffrischende Antwort den gerade
 * getippten Text nicht überschreibt.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Notizen } from '../Notizen';

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('Notizen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiMock.get.mockReset();
    apiMock.put.mockReset();
    apiMock.get.mockResolvedValue({ data: { inhalt: 'alter Text', geaendert_am: null } });
    apiMock.put.mockImplementation(async (_p: string, body: { inhalt: string }) => ({
      data: { inhalt: body.inhalt, geaendert_am: '2026-08-27T20:00:00.000Z' },
    }));
  });
  afterEach(() => vi.useRealTimers());

  it('zeigt, was der Server hat', async () => {
    render(<Notizen />, { wrapper: huelle() });
    await waitFor(() => expect(screen.getByLabelText('Notizen')).toHaveValue('alter Text'));
  });

  it('schreibt erst nach einer Sekunde Ruhe, und dann die letzte Fassung', async () => {
    render(<Notizen />, { wrapper: huelle() });
    const feld = await screen.findByLabelText('Notizen');
    await waitFor(() => expect(feld).toHaveValue('alter Text'));

    fireEvent.change(feld, { target: { value: 'a' } });
    act(() => void vi.advanceTimersByTime(400));
    fireEvent.change(feld, { target: { value: 'ab' } });
    act(() => void vi.advanceTimersByTime(400));
    // Bis hierhin war nie eine ganze Sekunde Ruhe.
    expect(apiMock.put).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1000));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledTimes(1));
    expect(apiMock.put).toHaveBeenCalledWith('/notizen', { inhalt: 'ab' }, { showError: false });
  });

  it('schreibt nicht, solange der Text derselbe ist wie beim Server', async () => {
    render(<Notizen />, { wrapper: huelle() });
    await waitFor(() => expect(screen.getByLabelText('Notizen')).toHaveValue('alter Text'));
    act(() => void vi.advanceTimersByTime(3000));
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  it('sagt, wann zuletzt gespeichert wurde, statt still „gespeichert" zu behaupten', async () => {
    render(<Notizen />, { wrapper: huelle() });
    const feld = await screen.findByLabelText('Notizen');
    await waitFor(() => expect(feld).toHaveValue('alter Text'));
    expect(screen.getByTestId('notizen-stand')).toHaveTextContent('noch nichts notiert');

    fireEvent.change(feld, { target: { value: 'neu' } });
    act(() => void vi.advanceTimersByTime(1100));
    await waitFor(() =>
      expect(screen.getByTestId('notizen-stand')).toHaveTextContent(/gespeichert \d/)
    );
  });
});
