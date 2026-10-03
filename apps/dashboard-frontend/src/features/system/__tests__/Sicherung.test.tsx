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
import type { SicherungStatus, Sicherungsdatei } from '../sicherung/useSicherung';

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

const TRAEGER = {
  angesteckt: true,
  name: 'GOLDENBACKUP',
  dateisystem: 'ext4',
  frei: 412_000_000_000,
  gesamt: 931_000_000_000,
};

const INHALT = {
  angesteckt: true,
  name: 'GOLDENBACKUP',
  neuesteSicherung: {
    datum: '20261002',
    zeitpunkt: '2026-10-02T02:00:00.000Z',
    bytes: 1234,
    apps: [{ id: 'belege', staende: ['test', 'live'] }],
    dateien: 9,
  },
  tage: ['20261002'],
};

const KEIN_INHALT = { angesteckt: false, name: null, neuesteSicherung: null, tage: [] };

function mitTraeger(extra: Partial<SicherungStatus['ausserhalb']> = {}): SicherungStatus {
  return {
    ...STATUS,
    ausserhalb: {
      ...STATUS.ausserhalb,
      vorhanden: true,
      zeitpunkt: '2026-10-02T02:00:00.000Z',
      bytes: 1234,
      dateien: 9,
      letzterVersuch: 'kopiert',
      datentraeger: TRAEGER,
      klartextDateien: 0,
      ...extra,
    },
  };
}

function antworte(
  status = STATUS,
  dateien: Sicherungsdatei[] = [DATEI],
  inhalt: object = KEIN_INHALT
) {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/backup/status') return { data: status };
    if (pfad === '/backup/extern/inhalt') return { data: inhalt };
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

  // M5: die Staende. Ein Stand zeigt, was er NEU geschrieben hat, und wer ein
  // volles Ziel hatte, liest, dass der aelteste Stand dafuer gefallen ist.
  it('nennt die Staende mit dem, was jeder neu geschrieben hat', async () => {
    const stand = {
      art: 'stand' as const,
      zweck: 'Stand des ganzen Geräts: Datenbank, Apps, Flows, Firmenordner, Konfiguration',
      name: '637755c9',
      id: '637755c9a1b2c3d4',
      bytes: 2_200_000,
      zeitpunkt: '2026-10-03T00:00:12.000Z',
    };
    antworte(
      {
        ...STATUS,
        staende: {
          anzahl: 2,
          bytes: 415_000_000,
          neuester: { id: stand.id, zeitpunkt: stand.zeitpunkt, geschrieben: 2_200_000 },
          aeltester: '2026-10-02T00:00:10.000Z',
          aufbewahrung: { tage: 7, wochen: 12, monate: 60 },
          hinweis:
            'Auf dem Datentraeger war kein Platz mehr: 1 aelteste(r) Stand/Staende sind entfallen.',
          entfallenWegenPlatz: ['2026-09-01T00:00:00.000Z'],
        },
      },
      [stand]
    );
    render(<Sicherung />, { wrapper: huelle() });

    const zeile = await screen.findByTestId('sicherung-637755c9');
    expect(zeile.textContent).toContain('2 MB neu');
    expect(await screen.findByText(/2 Stände/)).toBeTruthy();
    expect(screen.getByText(/7 Tage, 12 Wochen und 60 Monate/)).toBeTruthy();
    expect(screen.getByTestId('sicherung-platz-hinweis').textContent).toContain(
      'der älteste Stand ist entfallen'
    );
  });

  it('sagt, dass noch nie eine Kopie ausserhalb entstanden ist', async () => {
    antworte();
    render(<Sicherung />, { wrapper: huelle() });

    expect(await screen.findByText('noch nie')).toBeInTheDocument();
  });

  it('nennt Datum, Namen und freien Platz des Datentraegers statt eines Pfades', async () => {
    antworte(mitTraeger(), [DATEI], INHALT);
    render(<Sicherung />, { wrapper: huelle() });

    expect(await screen.findByText(wieAngezeigt('2026-10-02T02:00:00.000Z'))).toBeInTheDocument();
    expect(
      screen.getByText(/Datenträger „GOLDENBACKUP“, 412 GB frei von 931 GB/)
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('/arasul/extern');
  });

  it('sagt ohne Datentraeger, dass einfach eine SSD eingesteckt wird', async () => {
    antworte(
      mitTraeger({
        vorhanden: false,
        zeitpunkt: null,
        datentraeger: { ...TRAEGER, angesteckt: false, name: null, frei: null, gesamt: null },
        ziel: '/arasul/extern',
      })
    );
    render(<Sicherung />, { wrapper: huelle() });

    expect(await screen.findByText(/Kein Datenträger angesteckt/)).toBeInTheDocument();
    expect(screen.getByText(/einfach einstecken/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('/arasul/extern');
  });

  it('uebersetzt den letzten Versuch in Klartext', async () => {
    antworte(mitTraeger({ letzterVersuch: 'zu_wenig_platz' }));
    render(<Sicherung />, { wrapper: huelle() });

    expect((await screen.findByTestId('sicherung-versuch')).textContent).toContain(
      'zu wenig Platz'
    );
  });

  it('warnt deutlich, wenn Klartext auf dem Datentraeger liegt', async () => {
    antworte(mitTraeger({ klartextDateien: 3 }));
    render(<Sicherung />, { wrapper: huelle() });

    const warnung = await screen.findByTestId('sicherung-klartext-warnung');
    expect(warnung.textContent).toContain('3 Dateien');
    expect(warnung.textContent).toContain('unverschlüsselt');
  });

  it('warnt ganz oben, wenn der Schluessel nicht zur Sicherung passt', async () => {
    antworte({
      ...STATUS,
      schluessel: {
        passt: false,
        geprueft: '2026-10-02T03:00:00.000Z',
        grund: null,
        aelterUnlesbar: 0,
        lokal: null,
        extern: null,
      },
    });
    render(<Sicherung />, { wrapper: huelle() });

    const warnung = await screen.findByTestId('sicherung-schluessel-warnung');
    expect(warnung).toHaveAttribute('role', 'alert');
    expect(warnung.textContent).toContain('Wiederherstellungscode');
  });

  it('gibt bei aelteren unlesbaren Sicherungen nur einen ruhigen Hinweis', async () => {
    antworte({
      ...STATUS,
      schluessel: {
        passt: true,
        geprueft: null,
        grund: null,
        aelterUnlesbar: 2,
        lokal: null,
        extern: null,
      },
    });
    render(<Sicherung />, { wrapper: huelle() });

    expect(await screen.findByTestId('sicherung-schluessel-hinweis')).toBeInTheDocument();
    expect(screen.queryByTestId('sicherung-schluessel-warnung')).not.toBeInTheDocument();
  });

  describe('Eine App zurueckholen', () => {
    it('verlangt die Kennung, bevor etwas geschieht, und laesst den Bericht stehen', async () => {
      antworte(mitTraeger(), [DATEI], INHALT);
      apiMock.post.mockResolvedValue({
        data: {
          erfolg: true,
          app: 'belege',
          quelle: 'extern',
          bericht: [
            {
              schritt: 'datenbank',
              stand: 'live',
              erfolg: true,
              text: 'Die Daten der App (Live) sind zurückgeholt.',
            },
            {
              schritt: 'paket',
              erfolg: false,
              text: 'Das Paket der App ließ sich nicht zurückholen.',
            },
          ],
        },
      });
      render(<Sicherung />, { wrapper: huelle() });

      // Der Datentraeger ist vorgewaehlt, die App steht in der Liste.
      fireEvent.click(await screen.findByTestId('app-zurueckholen-belege'));
      expect((await screen.findByTestId('app-zurueckholen-text')).textContent).toContain(
        'Stand vom'
      );

      const absenden = screen.getByTestId('app-zurueckholen-absenden');
      expect(absenden).toBeDisabled();
      fireEvent.click(absenden);
      fireEvent.change(screen.getByTestId('app-zurueckholen-kennung'), {
        target: { value: 'beleg' },
      });
      expect(absenden).toBeDisabled();
      expect(apiMock.post).not.toHaveBeenCalled();

      fireEvent.change(screen.getByTestId('app-zurueckholen-kennung'), {
        target: { value: 'belege' },
      });
      expect(absenden).toBeEnabled();
      fireEvent.click(absenden);

      const bericht = await screen.findByTestId('app-zurueck-bericht');
      expect(bericht.textContent).toContain('Die Daten der App (Live) sind zurückgeholt.');
      expect(bericht.textContent).toContain('Das Paket der App ließ sich nicht zurückholen.');
      expect(apiMock.post).toHaveBeenCalledWith(
        '/backup/wiederherstellung/app/belege',
        { bestaetigung: 'belege', quelle: 'extern', paket: true },
        expect.objectContaining({ showError: false })
      );
    });

    it('schickt den Wiederherstellungscode mit, wenn er eingegeben wurde', async () => {
      antworte(mitTraeger(), [DATEI], INHALT);
      apiMock.post.mockResolvedValue({
        data: { erfolg: true, app: 'belege', quelle: 'extern', bericht: [] },
      });
      render(<Sicherung />, { wrapper: huelle() });

      fireEvent.click(await screen.findByTestId('app-code-oeffnen'));
      fireEvent.change(screen.getByTestId('app-code'), { target: { value: ' ABCD-1234 ' } });
      fireEvent.click(await screen.findByTestId('app-zurueckholen-belege'));
      fireEvent.change(await screen.findByTestId('app-zurueckholen-kennung'), {
        target: { value: 'belege' },
      });
      fireEvent.click(screen.getByTestId('app-zurueckholen-absenden'));

      await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
      expect(apiMock.post.mock.calls[0]?.[1]).toMatchObject({
        wiederherstellungscode: 'ABCD-1234',
      });
    });

    it('nimmt das Ergebnis aus einer 500-Antwort, damit der Bericht nicht verloren geht', async () => {
      antworte(mitTraeger(), [DATEI], INHALT);
      apiMock.post.mockRejectedValue(
        Object.assign(new Error('HTTP 500'), {
          data: {
            data: {
              erfolg: false,
              app: 'belege',
              quelle: 'extern',
              bericht: [
                {
                  schritt: 'datenbank',
                  stand: 'live',
                  erfolg: false,
                  text: 'Die Daten der App (Live) ließen sich nicht zurückholen.',
                },
              ],
            },
          },
        })
      );
      render(<Sicherung />, { wrapper: huelle() });

      fireEvent.click(await screen.findByTestId('app-zurueckholen-belege'));
      fireEvent.change(await screen.findByTestId('app-zurueckholen-kennung'), {
        target: { value: 'belege' },
      });
      fireEvent.click(screen.getByTestId('app-zurueckholen-absenden'));

      const bericht = await screen.findByTestId('app-zurueck-bericht');
      expect(bericht.textContent).toContain('nicht vollständig');
      expect(bericht.textContent).toContain('ließen sich nicht zurückholen');
    });

    it('bietet ohne Datentraeger die Apps dieses Geraets an', async () => {
      antworte(STATUS, [
        {
          art: 'app-datenbanken' as unknown as typeof DATEI.art,
          zweck: 'Die Datenbanken der Apps',
          name: 'arasul_app_mein_beleg_live_20261001_020000.sql.gz',
          datenbank: 'arasul_app_mein_beleg_live',
          bytes: 100,
          zeitpunkt: '2026-10-01T02:00:00.000Z',
        } as typeof DATEI,
      ]);
      render(<Sicherung />, { wrapper: huelle() });

      expect(await screen.findByTestId('app-zurueckholen-mein-beleg')).toBeInTheDocument();
    });
  });

  describe('Das ganze Geraet zurueckholen', () => {
    it('verlangt das Wort, und der Bericht nennt Tabellen und Apps', async () => {
      antworte(mitTraeger(), [DATEI], INHALT);
      apiMock.post.mockResolvedValue({
        data: {
          erfolg: false,
          bericht: { status: 'fertig', tabellen: 96 },
          apps: [
            { app_id: 'belege', stand: 'live', version: '1.0.0', erfolg: true, grund: null },
            {
              app_id: 'kalender',
              stand: 'test',
              version: '1.0.0',
              erfolg: false,
              grund: 'Image fehlt',
            },
          ],
        },
      });
      render(<Sicherung />, { wrapper: huelle() });

      expect(await screen.findByTestId('geraet-zurueck-warnung')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('geraet-zurueckholen'));

      const absenden = await screen.findByTestId('geraet-zurueckholen-absenden');
      expect(absenden).toBeDisabled();
      fireEvent.change(screen.getByTestId('geraet-zurueckholen-wort'), {
        target: { value: 'wiederher' },
      });
      expect(absenden).toBeDisabled();
      expect(apiMock.post).not.toHaveBeenCalled();
      fireEvent.change(screen.getByTestId('geraet-zurueckholen-wort'), {
        target: { value: 'wiederherstellen' },
      });
      fireEvent.click(absenden);

      const bericht = await screen.findByTestId('geraet-zurueck-bericht');
      expect(bericht.textContent).toContain('96 Tabellen');
      expect(bericht.textContent).toContain('„belege“ läuft wieder');
      expect(bericht.textContent).toContain('„kalender“');
      expect(bericht.textContent).toContain('läuft nicht wieder');
      expect(apiMock.post).toHaveBeenCalledWith(
        '/backup/wiederherstellung',
        { bestaetigung: 'wiederherstellen', quelle: 'extern' },
        expect.objectContaining({ showError: false })
      );
    });
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
    expect(meldung.textContent).toContain('5,1 GB');
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
