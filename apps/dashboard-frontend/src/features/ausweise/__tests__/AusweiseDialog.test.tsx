/**
 * Die Ausweise in der Oberfläche (Brücke, 21.09.2026, J34).
 *
 * Die eine Aussage, die dieser Test hält, ist die, die ein Mensch nur einmal
 * überprüfen kann: **der Wert steht genau einmal da.** Er kommt aus
 * `POST /api/ausweise` und ist danach nirgends mehr — weder in der Liste noch
 * am Gerät. Ein Dialog, der dabei aus Versehen zugeht, hat ihn vernichtet, und
 * genau das misst der zweite Block.
 *
 * Dazu die Rolle: die Sicht des Betreibers (alle Ausweise am Gerät) darf ein
 * Mitarbeiter nicht einmal ABFRAGEN — die Route trägt `requireRole('admin')`,
 * und eine Anfrage daneben wäre ein 403 in seiner Konsole. Dieser Fund steht
 * schon zweimal in den D-Abnahmen (`DownloadContext` in D2, `useMemoryBudget`
 * in D3); er soll sich nicht zum dritten Mal wiederholen.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AusweiseDialog } from '../AusweiseDialog';
import { angemeldet } from '@/__tests__/helpers/authMock';

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ get, post, del }) }));
vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

const MEINER = {
  id: 1,
  name: 'Laptop',
  praefix: 'ausweis_abc123',
  angelegt_am: '2026-09-21T18:00:00Z',
  zuletzt_benutzt_am: null,
};

function huelle() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AusweiseDialog offen beiSchliessen={() => {}} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  del.mockReset();
  angemeldet({ role: 'mitarbeiter', username: 'anna' });
  get.mockImplementation((pfad: string) => {
    if (pfad === '/ausweise') return Promise.resolve({ data: [MEINER] });
    if (pfad === '/ausweise/alle') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});

describe('Ein Mitarbeiter sieht seine Ausweise', () => {
  it('die Liste zeigt Name, Vorsatz und die letzte Nutzung', async () => {
    huelle();
    expect(await screen.findByText('Laptop')).toBeInTheDocument();
    expect(screen.getByText('ausweis_abc123…')).toBeInTheDocument();
    // „noch nie benutzt" ist die Auskunft, an der jemand merkt, dass er den
    // Ausweis widerrufen kann — kein Fehlwert und kein Strich.
    expect(screen.getByText('noch nie benutzt')).toBeInTheDocument();
  });

  it('fragt die Sicht des Betreibers gar nicht erst ab', async () => {
    huelle();
    await screen.findByText('Laptop');
    expect(get).toHaveBeenCalledWith('/ausweise');
    expect(get.mock.calls.map(c => c[0])).not.toContain('/ausweise/alle');
    expect(screen.queryByTestId('ausweise-alle')).not.toBeInTheDocument();
  });
});

describe('Der Wert steht genau einmal da', () => {
  const FRISCH = { ...MEINER, id: 2, name: 'Zweitrechner', ausweis: `ausweis_${'f'.repeat(64)}` };

  it('nach dem Ausstellen steht er im Klartext, und die Liste nennt ihn nicht', async () => {
    post.mockResolvedValue({ data: FRISCH });
    const nutzer = userEvent.setup();
    huelle();
    await screen.findByText('Laptop');

    await nutzer.type(screen.getByTestId('ausweis-name'), 'Zweitrechner');
    await nutzer.click(screen.getByTestId('ausweis-ausstellen'));

    expect(await screen.findByTestId('ausweis-wert')).toHaveTextContent(FRISCH.ausweis);
    expect(post).toHaveBeenCalledWith('/ausweise', { name: 'Zweitrechner' });

    // Und die Liste daneben kennt ihn nicht: sie kommt aus `GET /api/ausweise`,
    // und dort steht er nicht mehr -- am Geraet liegt nur eine Pruefsumme.
    expect(screen.getByTestId('ausweise-liste')).not.toHaveTextContent(FRISCH.ausweis);
  });

  it('solange er dasteht, schließt kein Klick daneben und kein Escape', async () => {
    // Ein verlorener Ausweis ist nicht wiederzubeschaffen, nur neu
    // auszustellen. Ein Dialog, der bei Escape zugeht, hätte ihn vernichtet.
    post.mockResolvedValue({ data: FRISCH });
    const nutzer = userEvent.setup();
    const zu = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AusweiseDialog offen beiSchliessen={zu} />
      </QueryClientProvider>
    );
    await screen.findByText('Laptop');
    await nutzer.type(screen.getByTestId('ausweis-name'), 'Zweitrechner');
    await nutzer.click(screen.getByTestId('ausweis-ausstellen'));
    await screen.findByTestId('ausweis-wert');

    await nutzer.keyboard('{Escape}');
    expect(zu).not.toHaveBeenCalled();

    // Über den Knopf geht es -- der Mensch sagt, dass er ihn hat.
    await nutzer.click(screen.getByTestId('ausweise-schliessen'));
    expect(zu).toHaveBeenCalled();
  });
});

describe('Der Administrator sieht zusätzlich, was am Gerät liegt', () => {
  it('die fremden Ausweise stehen da, mit ihrem Menschen', async () => {
    angemeldet({ role: 'admin', username: 'chef' });
    get.mockImplementation((pfad: string) => {
      if (pfad === '/ausweise') return Promise.resolve({ data: [] });
      if (pfad === '/ausweise/alle')
        return Promise.resolve({
          data: [
            {
              ...MEINER,
              id: 9,
              user_id: '7',
              username: 'anna',
              role: 'mitarbeiter',
              zuletzt_benutzt_am: '2026-09-21T19:00:00Z',
            },
          ],
        });
      return Promise.resolve({ data: [] });
    });
    huelle();
    // Auf die ZEILE warten und nicht auf den Abschnitt: der steht sofort da,
    // die Liste kommt mit der Antwort.
    expect(await screen.findByTestId('ausweis-fremd-9')).toHaveTextContent('anna');
    expect(screen.getByTestId('ausweis-fremd-9')).toHaveTextContent('Laptop');
    // Der Wert steht auch hier nicht -- es gibt ihn nicht mehr.
    expect(screen.getByTestId('ausweis-fremd-9')).toHaveTextContent('ausweis_abc123…');
  });

  it('er widerruft einen fremden über dieselbe Route', async () => {
    angemeldet({ role: 'admin', username: 'chef' });
    get.mockImplementation((pfad: string) => {
      if (pfad === '/ausweise') return Promise.resolve({ data: [] });
      if (pfad === '/ausweise/alle')
        return Promise.resolve({
          data: [{ ...MEINER, id: 9, user_id: '7', username: 'anna', role: 'mitarbeiter' }],
        });
      return Promise.resolve({ data: [] });
    });
    del.mockResolvedValue({});
    const nutzer = userEvent.setup();
    huelle();
    await screen.findByTestId('ausweis-fremd-9');
    await nutzer.click(screen.getByTestId('ausweis-fremd-widerrufen-9'));
    // Die Rückfrage steht davor: widerrufen ist nicht umkehrbar.
    await nutzer.click(await screen.findByRole('button', { name: /widerrufen/i }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/ausweise/9'));
  });
});
