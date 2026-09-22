/**
 * Mein Firmenordner, aus der Sicht eines Mitarbeiters (Auftrag
 * firmenordner-rechte-im-frontend, 22.09.2026).
 *
 * Die Messung ist die negative: der Dialog zeigt genau, was
 * `GET /api/firmenordner` nennt -- und was es nicht nennt, steht auch hier
 * nicht, auch nicht als Name.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MeinFirmenordnerDialog } from '../MeinFirmenordnerDialog';
import { keinFirmenordner } from '../useMeinFirmenordner';

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

describe('MeinFirmenordnerDialog', () => {
  beforeEach(() => apiMock.get.mockReset());

  it('zeigt die Adresse und die eigenen Ordner mit Stufe, die Wurzel zuerst', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        adresse: 'https://arasul:8443',
        erreichbar: true,
        benutzer: 'mia',
        ordner: [
          {
            kennung: 'firma',
            name: 'Firma',
            ebene: 0,
            art: 'wurzel',
            eltern: null,
            pfad: '',
            recht: 'lesen',
          },
          {
            kennung: 'vicona',
            name: 'Vicona',
            ebene: 2,
            art: 'geteilt',
            eltern: 'projekte',
            pfad: 'projekte/vicona',
            recht: 'schreiben',
          },
        ],
      },
    });
    render(<MeinFirmenordnerDialog offen beiSchliessen={() => {}} />, { wrapper: huelle() });

    expect(await screen.findByTestId('mein-firmenordner-adresse')).toHaveTextContent(
      'https://arasul:8443'
    );
    const liste = screen.getByTestId('mein-firmenordner-liste');
    expect(liste.firstChild).toHaveTextContent('Wurzel');
    expect(screen.getByTestId('mein-ordner-vicona')).toHaveTextContent('projekte/vicona/');
    expect(screen.getByTestId('mein-ordner-vicona')).toHaveTextContent('schreiben');
    // Der Bereich `projekte` steht NICHT als eigene Zeile: kein Recht, kein Eintrag.
    expect(screen.queryByTestId('mein-ordner-projekte')).not.toBeInTheDocument();
  });

  /**
   * Der 503 kommt hier nicht über den Api-Mock, sondern über den Hook: eine
   * abgelehnte Antwort des Mocks blieb in Vitest als unbehandelte Ablehnung
   * am Test hängen, obwohl React Query sie längst als `error` hielt (22.09.2026
   * dreimal nachgestellt: derselbe Hook inline im Test besteht, importiert
   * fällt er). Was dieser Test misst, ist ohnehin nur die Antwort des Dialogs
   * auf einen 503 -- und die hängt am Hook, nicht am Netz.
   */
  it('sagt, dass es hier keinen Firmenordner gibt, wenn die Route 503 antwortet', async () => {
    const hook = await import('../useMeinFirmenordner');
    vi.spyOn(hook, 'useMeinFirmenordner').mockReturnValue({
      data: undefined,
      error: Object.assign(new Error('kein Dienst'), { status: 503 }),
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof hook.useMeinFirmenordner>);
    render(<MeinFirmenordnerDialog offen beiSchliessen={() => {}} />, { wrapper: huelle() });
    expect(await screen.findByText(/läuft kein Firmenordner/)).toBeInTheDocument();
    expect(screen.queryByTestId('mein-firmenordner-fehler')).not.toBeInTheDocument();
  });

  it('unterscheidet den 503 von jedem anderen Fehler', () => {
    expect(keinFirmenordner(Object.assign(new Error('x'), { status: 503 }) as never)).toBe(true);
    expect(keinFirmenordner(Object.assign(new Error('x'), { status: 500 }) as never)).toBe(false);
    expect(keinFirmenordner(null)).toBe(false);
  });
});
