/**
 * AppRahmen — eine App in der Mitte der Shell (Phase D1).
 *
 * Drei Fragen: zeigt der Rahmen auf den richtigen Weg, was passiert mit einem
 * Tab, der im localStorage liegen geblieben ist, nachdem die Freigabe
 * zurückgenommen wurde — und seit Phase H2: kommt das Theme in den Rahmen,
 * OHNE dass er dabei neu lädt.
 *
 * Warum das letzte hier steht und nicht nur in der Playwright-Reihe: „ohne
 * Neuladen" ist eine Aussage über die IDENTITÄT des iframe-Elements, und die
 * ist hier genau zu haben (dasselbe Objekt oder ein anderes). Im Browser
 * bliebe sie eine Vermutung über ein Bild.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// Das Theme kommt seit H1 vom Angemeldeten. `AppRahmen` liest es über
// `useTheme`, und der liest den `AuthContext` — hier ist der die eine
// Schraube, an der die Tests drehen.
let angemeldeterBenutzer: { theme?: 'light' | 'dark' } | null = { theme: 'light' };
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: angemeldeterBenutzer,
    isAuthenticated: angemeldeterBenutzer !== null,
    benutzerAktualisieren: vi.fn(),
  }),
}));

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
    angemeldeterBenutzer = { theme: 'light' };
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
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
      expect(screen.getByText('urlaub ist Ihnen nicht freigegeben')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('app-rahmen-urlaub')).not.toBeInTheDocument();
  });

  it('eine App, die gar nicht in der Liste steht, ebenso', async () => {
    apiMock.get.mockResolvedValue({ data: [] });
    render(<AppRahmen appId="geheim" stand="live" />, { wrapper: huelle() });
    await waitFor(() =>
      expect(screen.getByText('geheim ist Ihnen nicht freigegeben')).toBeInTheDocument()
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

  /**
   * Das Theme in den Rahmen (Phase H2).
   *
   * jsdom gibt einem iframe ein eigenes `contentDocument` derselben Herkunft
   * — genau die Lage, in der die Shell steht (`frame-src 'self'`). Was hier
   * geprüft wird, ist deshalb dieselbe Sache wie am Gerät und keine Attrappe.
   */
  describe('das Theme geht mit in den Rahmen', () => {
    /**
     * Den Rahmen rendern und ihn so weit bringen, wie ihn ein Browser bringt.
     *
     * jsdom holt die Adresse eines iframes nicht (`resources` ist aus), also
     * steht dort ein Dokument ohne `documentElement` und es feuert kein
     * `load`. Beides wird hier von Hand nachgeholt — das ist keine Attrappe
     * des Prüflings, sondern das, was am Gerät der Server und der Browser
     * tun, bevor `AppRahmen` überhaupt an die Reihe kommt.
     */
    async function rahmenHolen() {
      apiMock.get.mockResolvedValue(MEINE);
      const ergebnis = render(<AppRahmen appId="urlaub" stand="live" />, { wrapper: huelle() });
      const rahmen = (await screen.findByTestId('app-rahmen-urlaub')) as HTMLIFrameElement;
      const dokument = rahmen.contentDocument;
      if (dokument && !dokument.documentElement) {
        dokument.appendChild(dokument.createElement('html'));
      }
      fireEvent.load(rahmen);
      return { rahmen, ergebnis };
    }

    /**
     * Hell schreibt kein Attribut — hell IST der Grund (H1). Geprüft wird das
     * an einem Dokument, in dem vorher `dark` STAND: „da steht nichts" ist
     * sonst auch dann wahr, wenn gar nichts passiert ist.
     */
    it('hell räumt das Attribut wieder weg', async () => {
      apiMock.get.mockResolvedValue(MEINE);
      const ergebnis = render(<AppRahmen appId="urlaub" stand="live" />, { wrapper: huelle() });
      const rahmen = (await screen.findByTestId('app-rahmen-urlaub')) as HTMLIFrameElement;
      const dokument = rahmen.contentDocument!;
      if (!dokument.documentElement) dokument.appendChild(dokument.createElement('html'));
      dokument.documentElement.setAttribute('data-theme', 'dark');
      dokument.documentElement.classList.add('dark');

      fireEvent.load(rahmen);
      ergebnis.rerender(<AppRahmen appId="urlaub" stand="live" />);

      await waitFor(() => expect(dokument.documentElement.getAttribute('data-theme')).toBeNull());
      expect(dokument.documentElement.classList.contains('dark')).toBe(false);
    });

    it('dunkel steht als data-theme im Dokument der App', async () => {
      angemeldeterBenutzer = { theme: 'dark' };
      const { rahmen } = await rahmenHolen();
      await waitFor(() =>
        expect(rahmen.contentDocument?.documentElement.getAttribute('data-theme')).toBe('dark')
      );
    });

    /**
     * DIE FRAGE DER PHASE. Ein Wechsel darf den Rahmen nicht austauschen:
     * das iframe-Element muss dasselbe bleiben und seine Adresse dieselbe.
     * Stünde das Theme im `key` oder in der Adresse, fiele genau das hier um
     * — und die App finge von vorn an.
     */
    it('ein Wechsel lädt den Rahmen nicht neu: dasselbe Element, dieselbe Adresse', async () => {
      const { rahmen, ergebnis } = await rahmenHolen();
      const vorher = rahmen.contentWindow;
      expect(rahmen.contentDocument?.documentElement.getAttribute('data-theme')).toBeNull();

      angemeldeterBenutzer = { theme: 'dark' };
      ergebnis.rerender(<AppRahmen appId="urlaub" stand="live" />);

      const nachher = (await screen.findByTestId('app-rahmen-urlaub')) as HTMLIFrameElement;
      expect(nachher).toBe(rahmen);
      expect(nachher.contentWindow).toBe(vorher);
      expect(nachher.getAttribute('src')).toBe('/apps/urlaub/');
      await waitFor(() =>
        expect(nachher.contentDocument?.documentElement.getAttribute('data-theme')).toBe('dark')
      );
    });

    /**
     * Der zweite Weg hinein, für eine App, die mehr tut als Farben tauschen.
     * Er nennt den Wert AUSDRÜCKLICH — am Dokument steht Hell ohne Attribut,
     * und „kein Attribut" ist für fremden Code keine Auskunft.
     */
    it('und er wird als Nachricht angekündigt, mit beiden Werten', async () => {
      const { rahmen, ergebnis } = await rahmenHolen();
      const gesendet: unknown[] = [];
      vi.spyOn(rahmen.contentWindow as Window, 'postMessage').mockImplementation(
        n => void gesendet.push(n)
      );

      angemeldeterBenutzer = { theme: 'dark' };
      ergebnis.rerender(<AppRahmen appId="urlaub" stand="live" />);

      await waitFor(() => expect(gesendet).toContainEqual({ typ: 'arasul:theme', theme: 'dark' }));
    });
  });
});
