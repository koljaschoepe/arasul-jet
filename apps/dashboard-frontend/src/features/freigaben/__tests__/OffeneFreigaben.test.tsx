/**
 * „Für Sie" auf der Startseite (D2, seit M5 als Zeilen): je Zeile App,
 * Gegenstand und seit wann; darunter Weitergeben und Übernehmen. Ein Klick
 * öffnet eine App, die ihre Freigaben selbst zeigt (`zeigt_freigaben`),
 * beim Vorgang; jede andere öffnet die Freigabe in Arasul (Rückfall).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { OffeneFreigaben } from '../OffeneFreigaben';
import { useWorkspaceStore } from '@/stores/workspaceStore';

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
  app_id: 'rechnungen',
  app_name: 'Rechnungen',
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

  it('nennt je Zeile App, Gegenstand und seit wann', async () => {
    listen([EINE]);
    render(<OffeneFreigaben />, { wrapper: huelle() });
    expect(await screen.findByText(EINE.titel)).toBeInTheDocument();
    const zeile = screen.getByTestId('freigabe-7');
    expect(zeile).toHaveTextContent('Beispielapp');
    expect(zeile).toHaveTextContent('wartet seit 3 Stunden');
    expect(screen.getByTestId('fuer-sie-zahl')).toHaveTextContent('1 Freigabe');
  });

  it('ein Klick öffnet eine App, die ihre Freigaben selbst zeigt, beim Vorgang', async () => {
    listen([
      { ...EINE, app_zeigt_freigaben: true },
      { ...EINE, id: 8, stand: 'test' as const, app_zeigt_freigaben: true },
    ]);
    render(<OffeneFreigaben />, { wrapper: huelle() });
    fireEvent.click(await screen.findByTestId('freigabe-8-oeffnen'));
    expect(useWorkspaceStore.getState().ansicht).toMatchObject({
      type: 'app',
      appId: 'beispielapp',
      stand: 'test',
      vorgang: 8,
    });
  });

  it('ohne die Erklärung der App öffnet ein Klick die Freigabe in Arasul, nicht die App', async () => {
    useWorkspaceStore.getState().oeffne({ type: 'dashboard' });
    listen([EINE]);
    render(<OffeneFreigaben />, { wrapper: huelle() });
    fireEvent.click(await screen.findByTestId('freigabe-7-oeffnen'));
    expect(await screen.findByTestId('freigabe-im-geraet')).toBeInTheDocument();
    expect(screen.getByTestId('freigabe-einzeln')).toHaveTextContent(EINE.titel);
    expect(useWorkspaceStore.getState().ansicht.type).not.toBe('app');
  });

  it('bestätigt im Gerät mit dem geänderten Feld und steht danach wieder in der Liste', async () => {
    const mitFeld = {
      ...EINE,
      felder: [
        { name: 'betrag', vorschlag: '119,00', unsicher: true, fehlend: false, aenderbar: true },
      ],
    };
    listen([mitFeld], []);
    apiMock.post.mockResolvedValue({
      data: { id: 7, titel: EINE.titel, status: 'bestaetigt', fortgesetzt: true, korrekturen: [] },
    });
    render(<OffeneFreigaben />, { wrapper: huelle() });
    fireEvent.click(await screen.findByTestId('freigabe-7-oeffnen'));
    const feld = await screen.findByDisplayValue('119,00');
    fireEvent.change(feld, { target: { value: '191,00' } });
    fireEvent.click(screen.getByRole('button', { name: /bestätigen/i }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/freigabe-anfragen/7/bestaetigen', {
        felder: { betrag: '191,00' },
      })
    );
    await waitFor(() => expect(screen.queryByTestId('freigabe-im-geraet')).not.toBeInTheDocument());
    expect(await screen.findByTestId('offene-freigaben')).toHaveAttribute('data-leer', 'true');
  });

  it('lehnt im Gerät nur mit Begründung ab', async () => {
    listen([EINE], []);
    apiMock.post.mockResolvedValue({
      data: { id: 7, titel: EINE.titel, status: 'abgelehnt', fortgesetzt: true },
    });
    render(<OffeneFreigaben />, { wrapper: huelle() });
    fireEvent.click(await screen.findByTestId('freigabe-7-oeffnen'));
    fireEvent.click(await screen.findByRole('button', { name: /ablehnen/i }));
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Betrag falsch' } });
    fireEvent.click(screen.getByRole('button', { name: /ablehnen/i }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/freigabe-anfragen/7/ablehnen', {
        begruendung: 'Betrag falsch',
      })
    );
  });

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
      'Ihr Vorgang „Rechnung 4711 buchen“ (Rechnungen) wartet seit 5 Minuten auf admin oder bernd. ' +
        'Vier-Augen-Prinzip: Sie entscheiden nicht mit.'
    );
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
});
