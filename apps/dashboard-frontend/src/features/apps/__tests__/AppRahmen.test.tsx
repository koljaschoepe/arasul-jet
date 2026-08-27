/**
 * AppRahmen — eine App in der Mitte der Shell (Phase D1).
 *
 * Zwei Fragen: zeigt der Rahmen auf den richtigen Weg, und was passiert mit
 * einem Tab, der im localStorage liegen geblieben ist, nachdem die Freigabe
 * zurückgenommen wurde.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AppRahmen } from '../AppRahmen';

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

const MEINE = {
  data: [
    {
      id: 'urlaub',
      name: 'Urlaubsantrag',
      beschreibung: null,
      live: { version: '1.0.0', pfad: '/apps/urlaub/' },
      test: null,
    },
  ],
};

describe('AppRahmen', () => {
  // Blockrumpf, kein Kurzausdruck: `mockReset()` gibt den Mock ZURÜCK, und
  // Vitest ruft einen von `beforeEach` zurückgegebenen Funktionswert nach dem
  // Test als Aufräumer auf. Der wirft dann die Ausnahme des Tests noch einmal,
  // diesmal ohne dass jemand sie fängt — ein rotes „kaputt" bei grünem DOM.
  beforeEach(() => {
    apiMock.get.mockReset();
  });

  it('zeigt die App unter ihrem eigenen Weg, ohne sandbox (das Cookie muss mit)', async () => {
    apiMock.get.mockResolvedValue(MEINE);
    render(<AppRahmen appId="urlaub" stand="live" />, { wrapper: huelle() });

    const rahmen = await screen.findByTestId('app-rahmen-urlaub');
    expect(rahmen.tagName).toBe('IFRAME');
    expect(rahmen).toHaveAttribute('src', '/apps/urlaub/');
    // Ein `sandbox`-Attribut nähme dem Rahmen die eigene Herkunft und damit
    // die Anmeldung (Forward-Auth aus C4).
    expect(rahmen).not.toHaveAttribute('sandbox');
  });

  it('ein Stand, der nicht freigegeben ist, wird gesagt statt gezeigt', async () => {
    apiMock.get.mockResolvedValue(MEINE);
    render(<AppRahmen appId="urlaub" stand="test" />, { wrapper: huelle() });

    await waitFor(() =>
      expect(screen.getByText('urlaub ist dir nicht freigegeben')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('app-rahmen-urlaub')).not.toBeInTheDocument();
  });

  it('eine App, die gar nicht in der Liste steht, ebenso', async () => {
    apiMock.get.mockResolvedValue({ data: [] });
    render(<AppRahmen appId="geheim" stand="live" />, { wrapper: huelle() });
    await waitFor(() =>
      expect(screen.getByText('geheim ist dir nicht freigegeben')).toBeInTheDocument()
    );
  });

  /**
   * Ein Fehler beim Laden der LISTE ist keine Aussage über die Freigabe.
   * Entscheiden tut ohnehin der Server, der den Rahmen füllt — er antwortet
   * mit 403, wenn es wirklich keine gibt.
   */
  it('bei einem Listenfehler wird die App trotzdem gezeigt', async () => {
    apiMock.get.mockImplementation(async () => {
      throw new Error('kaputt');
    });
    render(<AppRahmen appId="urlaub" stand="live" />, { wrapper: huelle() });
    await waitFor(() => expect(screen.getByTestId('app-rahmen-urlaub')).toBeInTheDocument());
  });
});
