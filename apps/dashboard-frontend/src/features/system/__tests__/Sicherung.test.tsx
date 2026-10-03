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
import type { SicherungStatus, Sicherungsdatei, Stand } from '../sicherung/useSicherung';
import { standInWorten } from '../sicherung/standInWorten';

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

/** Zwei Stände von diesem Gerät: gestern Nacht und vor drei Tagen, dazu einer davor. */
const TAG = 86_400_000;
const nachts = (vorTagen: number) => {
  const d = new Date(Date.now() - vorTagen * TAG);
  d.setHours(2, 0, 0, 0);
  return d.toISOString();
};
const STAENDE: Stand[] = [
  {
    id: 'cccc3333a1b2c3d4',
    zeitpunkt: new Date(Date.now() - 60_000).toISOString(),
    vorher: true,
    fuer: { art: 'bereich', id: 'projekte' },
    geschrieben: 1_000,
    inhaltBekannt: true,
    apps: [{ id: 'belege', name: 'Belege' }],
    appDatenbanken: ['arasul_app_belege_live'],
    bereiche: [{ kennung: 'projekte', name: 'Projekte', vorhanden: true }],
  },
  {
    id: 'bbbb2222a1b2c3d4',
    zeitpunkt: nachts(1),
    vorher: false,
    fuer: null,
    geschrieben: 2_200_000,
    inhaltBekannt: true,
    apps: [{ id: 'belege', name: 'Belege' }],
    appDatenbanken: ['arasul_app_belege_live'],
    bereiche: [
      { kennung: 'projekte', name: 'Projekte', vorhanden: true },
      { kennung: 'alt', name: null, vorhanden: false },
    ],
  },
  {
    id: 'aaaa1111a1b2c3d4',
    zeitpunkt: nachts(3),
    vorher: false,
    fuer: null,
    geschrieben: 415_000_000,
    inhaltBekannt: true,
    apps: [],
    appDatenbanken: [],
    bereiche: [{ kennung: 'projekte', name: 'Projekte', vorhanden: true }],
  },
];

function antworte(
  status = STATUS,
  dateien: Sicherungsdatei[] = [DATEI],
  inhalt: object = KEIN_INHALT,
  staende: Stand[] = STAENDE
) {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/backup/status') return { data: status };
    if (pfad === '/backup/extern/inhalt') return { data: inhalt };
    if (pfad.startsWith('/backup/staende')) return { data: staende };
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

  it('nennt die Staende in Worten, ohne Kennung', async () => {
    antworte();
    render(<Sicherung />, { wrapper: huelle() });

    const liste = await screen.findByTestId('staende-liste');
    expect(liste.textContent).toContain(`Gestern, 2:00 Uhr`);
    expect(liste.textContent).toContain(standInWorten(STAENDE[2]!.zeitpunkt));
    expect(screen.getByTestId('stand-cccc3333').textContent).toContain(
      'vor dem Zurückholen des Bereichs „Projekte“'
    );
    expect(liste.textContent).not.toMatch(/[0-9a-f]{8}/);
  });

  it('zeigt die Dateien mit Datum und Groesse unter den technischen Angaben', async () => {
    antworte();
    render(<Sicherung />, { wrapper: huelle() });

    expect(screen.queryByTestId(`sicherung-${DATEI.name}`)).not.toBeInTheDocument();
    fireEvent.click(await screen.findByTestId('sicherung-technik-knopf'));
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

    fireEvent.click(await screen.findByTestId('sicherung-technik-knopf'));
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

  describe('Zurueckholen', () => {
    // Radix' Select braucht zwei Dinge, die jsdom nicht hat.
    beforeEach(() => {
      Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
      Element.prototype.releasePointerCapture = vi.fn();
    });

    async function waehle(zelle: string, eintrag: string) {
      fireEvent.keyDown(await screen.findByTestId(zelle), { key: 'Enter' });
      fireEvent.keyDown(await screen.findByTestId(`${zelle}-${eintrag}`), { key: 'Enter' });
    }

    it('einen Bereich: Stand in Worten, Passwort, der Stand davor im Bericht', async () => {
      antworte();
      apiMock.post.mockResolvedValue({
        data: {
          erfolg: true,
          bereich: { kennung: 'projekte', name: 'Projekte' },
          stand: { id: STAENDE[1]!.id, zeitpunkt: STAENDE[1]!.zeitpunkt },
          vorher: { erfolg: true, id: 'dddd', zeitpunkt: new Date().toISOString() },
          zahlen: { geschrieben: 2, entfernt: 1, ordnerNeu: 0 },
          bericht: [
            { schritt: 'vorher', erfolg: true, text: 'Der jetzige Stand ist vorher gesichert.' },
            {
              schritt: 'bereich',
              erfolg: true,
              text: 'Die Dateien des Bereichs „Projekte“ sind zurückgeholt: 2 Dateien zurückgeschrieben, 1 entfernt, die seitdem dazukamen.',
            },
          ],
        },
      });
      render(<Sicherung />, { wrapper: huelle() });

      fireEvent.click(await screen.findByTestId('zurueck-was-bereich'));
      // Nur Bereiche, die es am Gerät noch gibt.
      fireEvent.keyDown(await screen.findByTestId('zurueck-ziel'), { key: 'Enter' });
      expect(await screen.findByTestId('zurueck-ziel-projekte')).toBeInTheDocument();
      expect(screen.queryByTestId('zurueck-ziel-alt')).not.toBeInTheDocument();
      fireEvent.keyDown(screen.getByTestId('zurueck-ziel-projekte'), { key: 'Enter' });

      // Ohne Stand geht es nicht weiter.
      expect(screen.getByTestId('zurueck-weiter')).toBeDisabled();
      const gestern = await screen.findByTestId('zurueck-stand-bbbb2222');
      expect(gestern.textContent).toContain('Gestern, 2:00 Uhr');
      expect(gestern.textContent).not.toContain('bbbb2222');
      fireEvent.click(gestern);
      fireEvent.click(screen.getByTestId('zurueck-weiter'));

      expect((await screen.findByTestId('zurueck-dialog-text')).textContent).toContain(
        'Bereich „Projekte“ werden auf den Stand von Gestern, 2:00 Uhr zurückgeholt'
      );
      const absenden = screen.getByTestId('zurueck-absenden');
      expect(absenden).toBeDisabled();
      fireEvent.change(screen.getByTestId('zurueck-passwort'), { target: { value: 'geheim' } });
      expect(absenden).toBeEnabled();
      fireEvent.click(absenden);

      const bericht = await screen.findByTestId('zurueck-bericht');
      expect(bericht.textContent).toContain('Der Bereich „Projekte“ ist auf den Stand von Gestern');
      expect(bericht.textContent).toContain('2 Dateien zurückgeschrieben, 1 entfernt');
      expect(screen.getByTestId('zurueck-rueckgaengig').textContent).toMatch(
        /Rückgängig machen: Wählen Sie den Stand „Heute, /
      );
      expect(apiMock.post).toHaveBeenCalledWith(
        '/backup/wiederherstellung/bereich/projekte',
        { passwort: 'geheim', stand_id: STAENDE[1]!.id, quelle: 'lokal' },
        expect.objectContaining({ showError: false })
      );
    });

    it('eine App: nur die Staende, in denen sie steht; ein falsches Passwort steht im Dialog', async () => {
      antworte();
      apiMock.post.mockRejectedValueOnce(
        Object.assign(
          new Error(
            'Das Passwort stimmt nicht. Geben Sie das Passwort ein, mit dem Sie sich anmelden.'
          ),
          { status: 403, code: 'PASSWORT_FALSCH' }
        )
      );
      render(<Sicherung />, { wrapper: huelle() });

      await waehle('zurueck-ziel', 'belege');
      expect(await screen.findByTestId('zurueck-stand-bbbb2222')).toBeInTheDocument();
      expect(screen.queryByTestId('zurueck-stand-aaaa1111')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('zurueck-stand-bbbb2222'));
      fireEvent.click(screen.getByTestId('zurueck-weiter'));
      fireEvent.change(await screen.findByTestId('zurueck-passwort'), {
        target: { value: 'falsch' },
      });
      fireEvent.click(screen.getByTestId('zurueck-absenden'));

      expect((await screen.findByTestId('zurueck-fehler')).textContent).toContain(
        'Das Passwort stimmt nicht'
      );
      expect(apiMock.post).toHaveBeenCalledWith(
        '/backup/wiederherstellung/app/belege',
        { passwort: 'falsch', stand_id: STAENDE[1]!.id, quelle: 'lokal', paket: true },
        expect.objectContaining({ showError: false })
      );
    });

    it('nimmt das Ergebnis aus einer 500-Antwort, damit der Bericht nicht verloren geht', async () => {
      antworte();
      apiMock.post.mockRejectedValue(
        Object.assign(new Error('HTTP 500'), {
          data: {
            data: {
              erfolg: false,
              app: 'belege',
              quelle: 'lokal',
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

      await waehle('zurueck-ziel', 'belege');
      fireEvent.click(await screen.findByTestId('zurueck-stand-bbbb2222'));
      fireEvent.click(screen.getByTestId('zurueck-weiter'));
      fireEvent.change(await screen.findByTestId('zurueck-passwort'), {
        target: { value: 'x' },
      });
      fireEvent.click(screen.getByTestId('zurueck-absenden'));

      const bericht = await screen.findByTestId('zurueck-bericht');
      expect(bericht.textContent).toContain('nicht vollständig');
      expect(bericht.textContent).toContain('ließen sich nicht zurückholen');
    });

    it('vom Datentraeger: Quelle waehlbar, der Code geht mit', async () => {
      antworte(mitTraeger(), [DATEI], INHALT);
      apiMock.post.mockResolvedValue({
        data: { erfolg: true, app: 'belege', quelle: 'extern', bericht: [] },
      });
      render(<Sicherung />, { wrapper: huelle() });

      fireEvent.click(await screen.findByTestId('zurueck-quelle-extern'));
      await waitFor(() =>
        expect(apiMock.get).toHaveBeenCalledWith('/backup/staende?quelle=extern', expect.anything())
      );
      await waehle('zurueck-ziel', 'belege');
      fireEvent.click(await screen.findByTestId('zurueck-stand-bbbb2222'));
      fireEvent.click(screen.getByTestId('zurueck-weiter'));
      fireEvent.click(await screen.findByTestId('zurueck-code-oeffnen'));
      fireEvent.change(screen.getByTestId('zurueck-code'), { target: { value: ' ABCD-1234 ' } });
      fireEvent.change(screen.getByTestId('zurueck-passwort'), { target: { value: 'x' } });
      fireEvent.click(screen.getByTestId('zurueck-absenden'));

      await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
      expect(apiMock.post.mock.calls[0]?.[1]).toMatchObject({
        quelle: 'extern',
        wiederherstellungscode: 'ABCD-1234',
      });
    });

    it('das ganze Geraet: Wort UND Passwort, der Bericht nennt Tabellen und Apps', async () => {
      antworte();
      apiMock.post.mockResolvedValue({
        data: {
          erfolg: false,
          bericht: { status: 'fertig', tabellen: 96 },
          vorher: { erfolg: true, id: 'dddd', zeitpunkt: new Date().toISOString() },
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

      fireEvent.click(await screen.findByTestId('zurueck-was-geraet'));
      expect(screen.getByTestId('zurueck-geraet-warnung')).toBeInTheDocument();
      fireEvent.click(await screen.findByTestId('zurueck-stand-aaaa1111'));
      fireEvent.click(screen.getByTestId('zurueck-weiter'));

      const absenden = await screen.findByTestId('zurueck-absenden');
      fireEvent.change(screen.getByTestId('zurueck-passwort'), { target: { value: 'x' } });
      expect(absenden).toBeDisabled();
      fireEvent.change(screen.getByTestId('zurueck-wort'), { target: { value: 'wiederher' } });
      expect(absenden).toBeDisabled();
      fireEvent.change(screen.getByTestId('zurueck-wort'), {
        target: { value: 'wiederherstellen' },
      });
      fireEvent.click(absenden);

      const bericht = await screen.findByTestId('zurueck-bericht');
      expect(bericht.textContent).toContain('vorher gesichert');
      expect(bericht.textContent).toContain('96 Tabellen');
      expect(bericht.textContent).toContain('„belege“ läuft wieder');
      expect(bericht.textContent).toContain('läuft nicht wieder');
      expect(apiMock.post).toHaveBeenCalledWith(
        '/backup/wiederherstellung',
        {
          bestaetigung: 'wiederherstellen',
          stand: STAENDE[2]!.id,
          passwort: 'x',
          quelle: 'lokal',
        },
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
