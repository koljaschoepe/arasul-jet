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

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));
import { angemeldet } from '@/__tests__/helpers/authMock';

const IN_EINER_STUNDE = new Date(Date.now() + 60 * 60_000 + 30_000).toISOString();

const EINE = {
  id: 7,
  run_id: 42,
  app_id: 'beispielapp',
  app_name: 'Beispielapp',
  stand: 'live' as const,
  flow_name: 'freigabe',
  titel: 'Wochenbericht fuer KW 34 versenden',
  zusammenhang: 'Der Bericht ist fertig und soll an die Belegschaft gehen.',
  frist: IN_EINER_STUNDE,
  angefragt_am: new Date(Date.now() - 3 * 60 * 60_000 - 60_000).toISOString(),
  einreicher: 'anna',
};

const EINGEREICHT = {
  id: 9,
  run_id: 43,
  app_id: 'faktum',
  app_name: 'Faktum',
  stand: 'live' as const,
  flow_name: 'buchen',
  titel: 'Rechnung 4711 buchen',
  frist: IN_EINER_STUNDE,
  angefragt_am: new Date(Date.now() - 5 * 60_000 - 1000).toISOString(),
  ohne_einreicher: true,
  entscheider: null,
  kreis: ['admin', 'bernd'],
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
    if (pfad === '/freigabe-anfragen/eingereicht') return { data: eingereicht };
    if (pfad === '/freigabe-anfragen/bei-anderen') return { data: beiAnderen };
    if (pfad !== '/freigabe-anfragen') return {};
    const runde = runden[Math.min(n, runden.length - 1)];
    n += 1;
    return { data: runde };
  });
}

let eingereicht: unknown[] = [];
let beiAnderen: unknown[] = [];

describe('OffeneFreigaben', () => {
  beforeEach(() => {
    angemeldet({ role: 'mitarbeiter', username: 'clara' });
    eingereicht = [];
    beiAnderen = [];
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
    // Der Name der App, nicht ihre Kennung; der Flow nicht in der Zeile.
    expect(screen.getByText('Beispielapp')).toBeInTheDocument();
    expect(screen.queryByText('beispielapp')).not.toBeInTheDocument();
    expect(screen.queryByText(/Flow freigabe/)).not.toBeInTheDocument();
    expect(screen.getByText('eingereicht von anna')).toBeInTheDocument();
    expect(screen.getByTestId('freigabe-7-seit')).toHaveTextContent('wartet seit 3 Stunden');
    expect(screen.getByTestId('freigabe-7-frist')).toHaveTextContent('noch 1 Stunde');
    expect(screen.queryByTestId('freigabe-7-regel')).not.toBeInTheDocument();
  });

  it('sagt die Vier-Augen-Regel als Satz', async () => {
    listen([{ ...EINE, ohne_einreicher: true, entscheider: { konten: ['bernd', 'clara'] } }]);
    render(<OffeneFreigaben />, { wrapper: huelle() });
    expect(await screen.findByTestId('freigabe-7-regel')).toHaveTextContent(
      'Vier-Augen-Prinzip: anna hat eingereicht und entscheidet nicht mit. ' +
        'Entscheiden dürfen nur bernd oder clara.'
    );
  });

  /**
   * Steht die Liste leer, steht dort EINE leise Zeile und kein Leerzustand:
   * wer eingereicht hat, soll die Stelle kennen, an der Freigaben stehen.
   */
  it('sagt in einer Zeile, wenn nichts wartet', async () => {
    listen([]);
    render(<OffeneFreigaben />, { wrapper: huelle() });
    const zeile = await screen.findByTestId('offene-freigaben');
    expect(zeile).toHaveAttribute('data-leer', 'true');
    expect(zeile).toHaveTextContent('Für Sie');
    expect(zeile).toHaveTextContent('Keine Freigabe liegt bei Ihnen.');
  });

  it('zeigt dem Einreicher, bei wem sein Vorgang liegt', async () => {
    eingereicht = [EINGEREICHT];
    listen([]);
    render(<OffeneFreigaben />, { wrapper: huelle() });
    expect(await screen.findByTestId('eingereicht-9')).toHaveTextContent(
      'Ihr Vorgang „Rechnung 4711 buchen“ (Faktum) wartet seit 5 Minuten auf admin oder bernd. ' +
        'Vier-Augen-Prinzip: Sie entscheiden nicht mit.'
    );
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
    // Gezählt wird nur die Liste „bei mir"; daneben holen „bei anderen" und
    // „eingereicht" ihre eigenen Listen (M5).
    const offen = () => apiMock.get.mock.calls.filter(c => c[0] === '/freigabe-anfragen').length;
    await waitFor(() => expect(offen()).toBe(2));
    await waitFor(() => expect(screen.queryByTestId('freigabe-7')).not.toBeInTheDocument());
  });
});

describe('OffeneFreigaben: Stufen, übernehmen, weitergeben (M5)', () => {
  beforeEach(() => {
    eingereicht = [];
    beiAnderen = [];
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    toast.success.mockReset();
  });

  it('nennt die Stufe und gibt an jemanden aus dem Kreis weiter', async () => {
    angemeldet({ role: 'mitarbeiter', username: 'clara' });
    listen([
      {
        ...EINE,
        stufe: 'pruefung',
        stufe_bezeichnung: 'Prüfung',
        liegt_bei: 'clara',
        kreis: ['bernd', 'clara'],
      },
    ]);
    apiMock.post.mockResolvedValue({ data: { id: 7, titel: EINE.titel, liegt_bei: 'bernd' } });
    render(<OffeneFreigaben />, { wrapper: huelle() });
    expect(await screen.findByText('Beispielapp · Stufe Prüfung')).toBeInTheDocument();
    expect(screen.getByTestId('freigabe-7-zustaendig')).toHaveTextContent('Liegt bei Ihnen.');
    expect(screen.getByTestId('fuer-sie-zahl')).toHaveTextContent('1 Freigabe');

    fireEvent.click(screen.getByTestId('freigabe-7-weitergeben'));
    // Nur der Kreis ohne mich steht zur Wahl.
    expect(screen.queryByTestId('freigabe-7-an-clara')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByTestId('freigabe-7-an-bernd'));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/freigabe-anfragen/7/weitergeben', { an: 'bernd' })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('liegt jetzt bei bernd'))
    );
  });

  it('sagt dem Admin, dass keine Standardperson gesetzt ist', async () => {
    angemeldet({ role: 'admin', username: 'probe-admin' });
    listen([{ ...EINE, stufe: 'leitung', liegt_bei: null, kreis: ['probe-admin', 'bernd'] }]);
    render(<OffeneFreigaben />, { wrapper: huelle() });
    expect(await screen.findByTestId('freigabe-7-zustaendig')).toHaveTextContent(
      'Liegt bei allen mit Zugang.'
    );
    expect(screen.getByTestId('freigabe-7-hinweis')).toHaveTextContent(
      'Keine Standardperson für die Stufe leitung'
    );
  });

  it('einem Mitarbeiter zeigt es keinen Verwaltungshinweis', async () => {
    angemeldet({ role: 'mitarbeiter', username: 'clara' });
    listen([{ ...EINE, stufe: 'leitung', liegt_bei: null, kreis: ['clara'] }]);
    render(<OffeneFreigaben />, { wrapper: huelle() });
    expect(await screen.findByTestId('freigabe-7-zustaendig')).toBeInTheDocument();
    expect(screen.queryByTestId('freigabe-7-hinweis')).not.toBeInTheDocument();
    // Niemand sonst im Kreis: nichts zum Weitergeben.
    expect(screen.queryByTestId('freigabe-7-weitergeben')).not.toBeInTheDocument();
  });

  it('klappt auf, was bei anderen liegt, und übernimmt es', async () => {
    angemeldet({ role: 'mitarbeiter', username: 'clara' });
    beiAnderen = [{ ...EINE, id: 8, liegt_bei: 'bernd', kreis: ['bernd', 'clara'] }];
    listen([]);
    apiMock.post.mockResolvedValue({ data: { id: 8, titel: EINE.titel, liegt_bei: 'clara' } });
    render(<OffeneFreigaben />, { wrapper: huelle() });
    const schalter = await screen.findByTestId('freigaben-bei-anderen-schalter');
    expect(schalter).toHaveTextContent('1 Freigabe liegt bei anderen');
    expect(screen.queryByTestId('bei-anderen-8')).not.toBeInTheDocument();
    fireEvent.click(schalter);
    expect(screen.getByTestId('bei-anderen-8')).toHaveTextContent('liegt bei bernd');
    fireEvent.click(screen.getByTestId('bei-anderen-8-uebernehmen'));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/freigabe-anfragen/8/uebernehmen', {})
    );
  });

  it('eine Erkennung: Prüfen öffnet die Felder, die Korrektur geht mit, danach die Liste', async () => {
    const ERKANNT = {
      ...EINE,
      id: 11,
      titel: 'Erkennung unsicher: Feld datum',
      felder: [
        { name: 'datum', vorschlag: '', fehlend: true, unsicher: false, aenderbar: true },
        { name: 'betrag', vorschlag: '12,50', fehlend: false, unsicher: false, aenderbar: false },
      ],
      original: '/apps/beispielapp/api/belege/4711.png',
      frueher: [],
    };
    listen([ERKANNT], []);
    apiMock.post.mockResolvedValue({
      data: {
        id: 11,
        status: 'bestaetigt',
        fortgesetzt: true,
        korrekturen: [{ feld: 'datum', vorschlag: '', wert: '01.10.2026', von: 'clara' }],
      },
    });
    render(<OffeneFreigaben />, { wrapper: huelle() });
    fireEvent.click(await screen.findByTestId('freigabe-11-pruefen'));
    expect(screen.getByTestId('freigabe-11-feld-datum-pruefen')).toHaveTextContent('prüfen');
    expect(screen.getByTestId('freigabe-11-original')).toBeInTheDocument();
    // Unter der Karte steht weiter, bei wem sie liegt.
    expect(screen.getByTestId('freigabe-11-zustaendig')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('freigabe-11-feld-datum-eingabe'), {
      target: { value: '01.10.2026' },
    });
    fireEvent.click(screen.getByTestId('freigabe-11-bestaetigen'));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/freigabe-anfragen/11/bestaetigen', {
        felder: { datum: '01.10.2026' },
      })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        '„Erkennung unsicher: Feld datum" freigegeben, 1 Feld geändert. Der Lauf läuft weiter.'
      )
    );
    await waitFor(() => expect(screen.queryByTestId('freigabe-einzeln')).not.toBeInTheDocument());
  });
});
