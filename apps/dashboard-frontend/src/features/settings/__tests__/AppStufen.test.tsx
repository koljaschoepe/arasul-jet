/**
 * Die Freigabestufen auf der Seite der App (M5, 04.10.2026): je Stufe eine
 * Standardperson aus dem Kreis mit Zugang, und ohne sie ein Hinweis, dass neue
 * Freigaben bei allen mit Zugang liegen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AppStufen } from '../apps/AppStufen';

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

const STUFEN = {
  stufen: [
    {
      stufe: 'pruefung',
      bezeichnung: 'Prüfung',
      flows: ['zwei-stufen'],
      person: { id: 4, username: 'bernd' },
      gilt: true,
      gesetzt_am: null,
      hinweis: null,
    },
    {
      stufe: 'leitung',
      bezeichnung: 'Leitung',
      flows: ['zwei-stufen'],
      person: null,
      gilt: false,
      gesetzt_am: null,
      hinweis: 'Keine Standardperson: jede neue Freigabe dieser Stufe liegt bei allen mit Zugang.',
    },
  ],
  personen: [
    { id: 3, username: 'anna' },
    { id: 4, username: 'bernd' },
  ],
};

describe('AppStufen', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.put.mockReset();
    toast.success.mockReset();
  });

  it('zeigt je Stufe die Person und ohne Person den Hinweis', async () => {
    apiMock.get.mockResolvedValue({ data: STUFEN });
    render(<AppStufen appId="probe" />, { wrapper: huelle() });
    expect(await screen.findByTestId('stufe-pruefung')).toHaveTextContent('Prüfung');
    expect(screen.getByTestId('stufe-pruefung-person')).toHaveTextContent('bernd');
    expect(screen.getByTestId('stufe-leitung-person')).toHaveTextContent('alle mit Zugang');
    expect(screen.queryByTestId('stufe-pruefung-hinweis')).not.toBeInTheDocument();
    expect(screen.getByTestId('stufe-leitung-hinweis')).toHaveTextContent('bei allen mit Zugang');
    expect(apiMock.get).toHaveBeenCalledWith('/apps/probe/stufen');
  });

  it('setzt die Standardperson einer Stufe', async () => {
    apiMock.get.mockResolvedValue({ data: STUFEN });
    apiMock.put.mockResolvedValue({ data: {} });
    render(<AppStufen appId="probe" />, { wrapper: huelle() });
    fireEvent.click(await screen.findByTestId('stufe-leitung-person'));
    fireEvent.click(await screen.findByTestId('stufe-leitung-anna'));
    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/apps/probe/stufen/leitung', { benutzer_id: 3 })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('zuerst bei anna'))
    );
  });

  it('sagt es, wenn kein Flow eine Stufe nennt', async () => {
    apiMock.get.mockResolvedValue({ data: { stufen: [], personen: [] } });
    render(<AppStufen appId="probe" />, { wrapper: huelle() });
    expect(await screen.findByTestId('stufen-leer')).toBeInTheDocument();
  });
});
