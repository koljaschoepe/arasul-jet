/**
 * Die offenen Freigaben in der Übersicht (Phase D2).
 *
 * Gemessen wird, was die Phase verlangt: die Liste zeigt Titel, Zusammenhang
 * und Frist, Bestätigen und Ablehnen gehen an die Wege aus C7, die Ablehnung
 * verlangt eine Begründung, und die Liste aktualisiert sich OHNE NEULADEN —
 * das letzte ist der Grund, warum der Test die zweite Antwort des Servers
 * mitzählt.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { OffeneFreigaben } from '../OffeneFreigaben';

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toast }));

const IN_EINER_STUNDE = new Date(Date.now() + 60 * 60_000 + 30_000).toISOString();

const EINE = {
  id: 7,
  run_id: 42,
  app_id: 'beispielapp',
  stand: 'live' as const,
  flow_name: 'freigabe',
  titel: 'Wochenbericht fuer KW 34 versenden',
  zusammenhang: 'Der Bericht ist fertig und soll an die Belegschaft gehen.',
  frist: IN_EINER_STUNDE,
  angefragt_am: new Date().toISOString(),
};

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Erste Abfrage: `offen`. Jede weitere: was danach übrig ist. */
function listen(...runden: unknown[][]) {
  let n = 0;
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad !== '/freigabe-anfragen') return {};
    const runde = runden[Math.min(n, runden.length - 1)];
    n += 1;
    return { data: runde };
  });
}

describe('OffeneFreigaben', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    toast.success.mockReset();
    toast.warning.mockReset();
  });

  it('nennt Titel, Zusammenhang, Herkunft und Restzeit', async () => {
    listen([EINE]);
    render(<OffeneFreigaben />, { wrapper: huelle() });
    expect(await screen.findByText(EINE.titel)).toBeInTheDocument();
    expect(screen.getByText(/an die Belegschaft/)).toBeInTheDocument();
    expect(screen.getByText('beispielapp')).toBeInTheDocument();
    expect(screen.getByText('Flow freigabe')).toBeInTheDocument();
    expect(screen.getByTestId('freigabe-7-frist')).toHaveTextContent('noch 1 Stunde');
  });

  /**
   * Steht die Liste leer, steht sie gar nicht da. Ein Leerzustand wäre auf der
   * Übersicht eines Mitarbeiters, der nie eine Freigabe bekommt, eine
   * Dauermeldung über etwas, das es nicht gibt.
   */
  it('schweigt, wenn nichts wartet', async () => {
    listen([]);
    render(<OffeneFreigaben />, { wrapper: huelle() });
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(screen.queryByTestId('offene-freigaben')).not.toBeInTheDocument();
  });

  it('bestätigt über den Weg aus C7 und verschwindet danach ohne Neuladen', async () => {
    listen([EINE], []);
    apiMock.post.mockResolvedValue({ data: { ...EINE, status: 'bestaetigt', fortgesetzt: true } });
    render(<OffeneFreigaben />, { wrapper: huelle() });

    fireEvent.click(await screen.findByTestId('freigabe-7-bestaetigen'));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/freigabe-anfragen/7/bestaetigen', {})
    );
    // Das ist die Messung „Aktualisierung ohne Neuladen": die Zeile geht weg,
    // weil die Abfrage entwertet und neu geholt wurde.
    await waitFor(() => expect(screen.queryByTestId('freigabe-7')).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('läuft weiter'));
  });

  /**
   * `fortgesetzt: false` heißt: die Entscheidung steht, aber der Lauf wird
   * nicht mehr fortgeführt (Neustart des Backends). Das wird gesagt und nicht
   * verschwiegen — sonst wartet jemand auf ein Ergebnis, das nie kommt.
   */
  it('sagt es, wenn der Lauf nicht mehr weiterläuft', async () => {
    listen([EINE], []);
    apiMock.post.mockResolvedValue({ data: { ...EINE, status: 'bestaetigt', fortgesetzt: false } });
    render(<OffeneFreigaben />, { wrapper: huelle() });
    fireEvent.click(await screen.findByTestId('freigabe-7-bestaetigen'));
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('neu gestartet'))
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('lehnt erst ab, wenn eine Begründung dasteht', async () => {
    listen([EINE], []);
    apiMock.post.mockResolvedValue({ data: { ...EINE, status: 'abgelehnt', fortgesetzt: true } });
    render(<OffeneFreigaben />, { wrapper: huelle() });

    fireEvent.click(await screen.findByTestId('freigabe-7-ablehnen'));
    const absenden = screen.getByTestId('freigabe-7-ablehnen-absenden');
    expect(absenden).toBeDisabled();

    fireEvent.change(screen.getByTestId('freigabe-7-begruendung'), {
      target: { value: '  Zahlen stimmen nicht.  ' },
    });
    expect(absenden).toBeEnabled();
    fireEvent.click(absenden);

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/freigabe-anfragen/7/ablehnen', {
        begruendung: 'Zahlen stimmen nicht.',
      })
    );
  });

  /**
   * Ein Fehler (409 „ein anderer war schneller", 409 „Frist abgelaufen") heißt,
   * dass die Liste im Browser nicht mehr stimmt. Auch dann wird neu geholt.
   */
  it('holt die Liste auch nach einem Fehler neu', async () => {
    listen([EINE], []);
    apiMock.post.mockRejectedValue(Object.assign(new Error('Konflikt'), { status: 409 }));
    render(<OffeneFreigaben />, { wrapper: huelle() });
    fireEvent.click(await screen.findByTestId('freigabe-7-bestaetigen'));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('freigabe-7')).not.toBeInTheDocument());
  });
});
