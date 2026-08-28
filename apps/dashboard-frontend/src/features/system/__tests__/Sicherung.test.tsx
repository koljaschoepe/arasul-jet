/**
 * Die Sicherung im Browser (Phase D5).
 *
 * Gemessen wird die Messregel der Phase: der Administrator löst eine Sicherung
 * aus, eine Meldung erscheint, und die Liste zeigt danach die Sicherungen mit
 * Datum und Größe. Dazu die zwei Auskünfte, die C9 getrennt hält: was hier
 * liegt und ob je eine Kopie AUSSERHALB entstanden ist.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Sicherung } from '../sicherung/Sicherung';
import type { SicherungStatus } from '../sicherung/useSicherung';

/**
 * Derselbe Zeitpunkt, wie ihn der Mensch vor dem Bildschirm liest.
 *
 * `formatDate` schreibt Ortszeit. Eine fest hingeschriebene Uhrzeit misst
 * deshalb die Zone der Maschine mit: auf dem Laptop (Europe/Berlin) stand
 * „04:00", in der CI (UTC) „02:00" — daran ist der Lauf 33163888736
 * gescheitert. Die Zone steht jetzt in `vite.config.ts` fest, und diese Zeile
 * haelt den Test auch dann aufrecht, wenn jemand sie dort wieder herausnimmt:
 * verglichen wird der Zeitpunkt, nicht die Zahl auf einer bestimmten Uhr.
 * Dass die Schreibweise selbst deutsch ist, misst `utils/formatting.test.ts`.
 */
const wieAngezeigt = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

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

const STATUS: SicherungStatus = {
  sichertWirklich: true,
  letzteSicherung: {
    status: 'completed',
    zeitpunkt: '2026-08-28T03:00:00.000Z',
    alterStunden: 6,
    veraltet: false,
    verschluesselt: true,
    groesse: '4.9G',
  },
  ausserhalb: {
    vorhanden: false,
    zeitpunkt: null,
    bytes: null,
    dateien: null,
    ziel: null,
    letzterVersuch: null,
  },
  wiederherstellungstest: { status: 'nie_gelaufen', zeitpunkt: null, tabellen: null },
  letzteWiederherstellung: null,
  laeuftGerade: null,
};

const DATEI = {
  art: 'postgres' as const,
  zweck: 'Datenbank',
  name: 'arasul_db_2026-08-28.sql.gz',
  bytes: 5_200_000_000,
  zeitpunkt: '2026-08-28T03:00:00.000Z',
};

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function antworte(status = STATUS, dateien = [DATEI]) {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/backup/status') return { data: status };
    if (pfad === '/backup/sicherungen')
      return {
        data: dateien,
        anzahl: dateien.length,
        bytes: dateien.reduce((s, d) => s + d.bytes, 0),
        ordner: '/arasul/backups',
      };
    throw new Error(`unerwarteter Pfad: ${pfad}`);
  });
}

describe('Sicherung', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('zeigt die Liste mit Datum und Groesse', async () => {
    antworte();
    render(<Sicherung />, { wrapper: huelle() });

    const zeile = await screen.findByTestId(`sicherung-${DATEI.name}`);
    expect(zeile.textContent).toContain(wieAngezeigt(DATEI.zeitpunkt));
    expect(zeile.textContent).toContain('5,2 GB');
    expect(zeile.textContent).toContain('Datenbank');
  });

  it('sagt, dass noch nie eine Kopie ausserhalb entstanden ist', async () => {
    antworte();
    render(<Sicherung />, { wrapper: huelle() });

    expect(await screen.findByText('noch nie')).toBeInTheDocument();
  });

  it('nennt Datum und Groesse der letzten Kopie ausserhalb, wenn es eine gibt', async () => {
    const zeitpunkt = '2026-08-27T02:00:00.000Z';
    antworte({
      ...STATUS,
      ausserhalb: {
        vorhanden: true,
        zeitpunkt,
        bytes: 4_900_000_000,
        dateien: 12,
        ziel: 'USB-Stick',
        letzterVersuch: 'ok',
      },
    });
    render(<Sicherung />, { wrapper: huelle() });

    expect(await screen.findByText(wieAngezeigt(zeitpunkt))).toBeInTheDocument();
    expect(screen.getByText(/4,9 GB auf USB-Stick/)).toBeInTheDocument();
  });

  it('loest eine Sicherung aus und laesst die Meldung stehen', async () => {
    antworte();
    apiMock.post.mockResolvedValue({
      data: { erfolg: true, bericht: { status: 'completed', total_size: '5.1G' } },
    });
    render(<Sicherung />, { wrapper: huelle() });

    fireEvent.click(await screen.findByTestId('sicherung-ausloesen'));

    const meldung = await screen.findByTestId('sicherung-meldung');
    expect(meldung.textContent).toContain('Sicherung fertig');
    expect(meldung.textContent).toContain('5.1G');
    expect(toast.success).toHaveBeenCalled();
    expect(apiMock.post).toHaveBeenCalledWith(
      '/backup/sicherung',
      null,
      expect.objectContaining({ showError: false })
    );
  });

  it('sagt es, wenn die Sicherung scheitert, und schweigt nicht', async () => {
    antworte();
    apiMock.post.mockRejectedValue(
      Object.assign(new Error('backup.sh hat mit Code 1 geantwortet'), { status: 500 })
    );
    render(<Sicherung />, { wrapper: huelle() });

    fireEvent.click(await screen.findByTestId('sicherung-ausloesen'));

    await waitFor(() =>
      expect(screen.getByTestId('sicherung-meldung').textContent).toContain('fehlgeschlagen')
    );
    expect(toast.error).toHaveBeenCalled();
  });

  it('laesst waehrend eines laufenden Vorgangs nichts Zweites zu', async () => {
    antworte({ ...STATUS, laeuftGerade: 'sicherung' });
    render(<Sicherung />, { wrapper: huelle() });

    const knopf = await screen.findByTestId('sicherung-ausloesen');
    expect(knopf).toBeDisabled();
    expect(screen.getByTestId('wiederherstellungstest')).toBeDisabled();
    expect(screen.getByTestId('sicherung-laeuft')).toBeInTheDocument();
  });
});
