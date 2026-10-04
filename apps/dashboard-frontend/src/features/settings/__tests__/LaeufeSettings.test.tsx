/**
 * Läufe über alle Apps (M5, Karte verwaltung-laeufe).
 *
 * Gemessen wird, was die Karte verlangt: die Liste nennt Läufe aller Apps,
 * Filter wirken und stehen in der Adresse (hier: in der Abfrage ans Gerät und
 * in der Rückmeldung an die Shell), eine Zeile klappt auf und zeigt Schritte
 * bis zu Ein- und Ausgabe, mehrere zugleich, ein Lauf hat eine eigene Seite,
 * und der Administrator bricht auch einen Lauf ohne Person ab.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LaeufeSettings } from '../LaeufeSettings';
import { filterAusAbfrage, filterZuAbfrage } from '../laeufe/useLaeufe';
import { laeufeFilterSaeubern, pfadZuAnsicht, ansichtZuPfad } from '@/stores/workspaceStore';

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

const LAUF = {
  id: 42,
  flow_name: 'freigabe',
  app_id: 'beispielapp',
  stand: 'live' as const,
  status: 'fertig' as const,
  steps_used: 2,
  created_at: '2026-08-28T09:30:00.000Z',
  finished_at: '2026-08-28T09:31:00.000Z',
  arguments: { woche: '35' },
  error: null,
  ausloeser: 'hand' as const,
  ereignis: null,
  person_id: 7,
  person_name: 'Mia Muster',
  person_konto: 'mia@firma.de',
};

const FEHLER = {
  ...LAUF,
  id: 43,
  app_id: 'zweiteapp',
  flow_name: 'abgleich',
  status: 'fehler' as const,
  error: 'Das Modell antwortete nicht.',
  person_id: null,
  person_name: null,
  person_konto: null,
  ausloeser: 'zeitplan' as const,
};

const LAUFEND = {
  ...LAUF,
  id: 44,
  status: 'laeuft' as const,
  finished_at: null,
  ausloeser: 'ereignis' as const,
  ereignis: 'beleg.eingegangen',
  person_id: null,
  person_name: null,
  person_konto: null,
};

const DETAIL = {
  ...LAUF,
  result: 'Der Bericht ist freigegeben.',
  steps: [
    {
      id: 1,
      position: 0,
      kind: 'modell' as const,
      name: 'Gedankengang',
      input: null,
      output: 'Ich hole zuerst die Freigabe ein.',
      status: 'fertig',
      created_at: '2026-08-28T09:30:10.000Z',
      finished_at: '2026-08-28T09:30:10.000Z',
      parent_step_id: null,
      modell: 'gemma4:e4b',
    },
    {
      id: 2,
      position: 1,
      kind: 'werkzeug' as const,
      name: 'freigabe_anfordern',
      input: { titel: 'Wochenbericht' },
      output: 'Bestätigt von mia.',
      status: 'fertig',
      created_at: '2026-08-28T09:30:20.000Z',
      finished_at: '2026-08-28T09:31:00.000Z',
      parent_step_id: null,
      modell: null,
    },
  ],
  freigaben: [
    {
      id: 5,
      titel: 'Erkennung unsicher: Feld datum',
      stufe: null,
      status: 'bestaetigt' as const,
      angefragt_am: '2026-08-28T09:30:20.000Z',
      entschieden_am: '2026-08-28T09:31:00.000Z',
      entschieden_von: 'mia',
      begruendung: null,
      felder_schritt: 'lesen',
      felder: [
        { name: 'datum', vorschlag: '', unsicher: false, fehlend: true },
        { name: 'betrag', vorschlag: '12,50', unsicher: false, fehlend: false },
      ],
      korrekturen: [
        {
          feld: 'datum',
          vorschlag: '',
          wert: '01.10.2026',
          von: 'mia',
          am: '2026-08-28T09:31:00.000Z',
        },
      ],
    },
  ],
};

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function antworte(liste: unknown[] = [FEHLER, LAUFEND, LAUF], detail: unknown = DETAIL) {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/apps') {
      return {
        data: [
          { id: 'beispielapp', name: 'Beispielapp', staende: { test: null, live: null } },
          { id: 'zweiteapp', name: 'Zweite App', staende: { test: null, live: null } },
        ],
      };
    }
    if (pfad === '/benutzer') {
      return { data: [{ id: 7, username: 'mia@firma.de', vorname: 'Mia', nachname: 'Muster' }] };
    }
    if (pfad.startsWith('/laeufe?')) return { data: liste, gesamt: liste.length };
    if (pfad.startsWith('/laeufe/')) return { data: detail };
    return {};
  });
}

function zeige(props: Partial<Parameters<typeof LaeufeSettings>[0]> = {}) {
  const onOeffnen = vi.fn();
  render(<LaeufeSettings onOeffnen={onOeffnen} {...props} />, { wrapper: huelle() });
  return onOeffnen;
}

const letzteListenAbfrage = () =>
  String(
    apiMock.get.mock.calls
      .map(c => c[0] as string)
      .filter(p => p.startsWith('/laeufe?'))
      .at(-1)
  );

describe('Läufe der Verwaltung', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it('listet Läufe aller Apps mit App, Person und Auslöser', async () => {
    antworte();
    zeige();
    await screen.findByTestId('lauf-zeile-42');
    expect(screen.getByTestId('lauf-app-42')).toHaveTextContent('Beispielapp');
    expect(screen.getByTestId('lauf-app-43')).toHaveTextContent('Zweite App');
    expect(screen.getByTestId('lauf-wer-42')).toHaveTextContent('Mia Muster');
    expect(screen.getByTestId('lauf-wer-43')).toHaveTextContent('Zeitplan');
    expect(screen.getByTestId('lauf-wer-44')).toHaveTextContent('Ereignis „beleg.eingegangen“');
    expect(screen.getByTestId('laeufe-zahl')).toHaveTextContent('3 Läufe');
    // Die Reihenfolge bestimmt das Gerät: ein Fehler steht oben.
    const zeilen = screen.getAllByTestId(/^lauf-zeile-/);
    expect(zeilen[0]).toHaveAttribute('data-lauf-status', 'fehler');
  });

  it('übersetzt die Filter in die Abfrage ans Gerät und meldet sie der Adresse', async () => {
    antworte();
    const onOeffnen = zeige({
      filter: 'app=zweiteapp&status=fehler&person=ohne&von=2026-10-01&bis=2026-10-02',
    });
    await screen.findByTestId('lauf-zeile-43');
    const q = new URLSearchParams(letzteListenAbfrage().split('?')[1]);
    expect(q.get('app')).toBe('zweiteapp');
    expect(q.get('status')).toBe('fehler');
    expect(q.get('person')).toBe('ohne');
    // Der Zeitraum ist ein Tag in der Zeit des Browsers; „bis" zählt mit.
    expect(new Date(q.get('von')!).getTime()).toBe(new Date('2026-10-01T00:00:00').getTime());
    expect(new Date(q.get('bis')!).getTime()).toBe(new Date('2026-10-03T00:00:00').getTime());

    fireEvent.click(screen.getByTestId('laeufe-filter-zuruecksetzen'));
    expect(onOeffnen).toHaveBeenCalledWith({ filter: '' });
  });

  it('ein Datum im Filter geht als Filter in die Adresse', async () => {
    antworte();
    const onOeffnen = zeige({ filter: 'app=beispielapp' });
    await screen.findByTestId('lauf-zeile-42');
    fireEvent.change(screen.getByTestId('laeufe-filter-von'), { target: { value: '2026-10-04' } });
    expect(onOeffnen).toHaveBeenCalledWith({ filter: 'app=beispielapp&von=2026-10-04' });
  });

  it('klappt mehrere Läufe zugleich auf, bis zu Ein- und Ausgabe', async () => {
    antworte();
    zeige();
    fireEvent.click(await screen.findByTestId('lauf-aufklappen-42'));
    fireEvent.click(screen.getByTestId('lauf-aufklappen-44'));
    const schritte = await screen.findAllByTestId('lauf-schritte');
    expect(schritte.length).toBeGreaterThanOrEqual(1);
    // Beide Zeilen haben ihren Inhalt geholt (die Attrappe liefert für beide dasselbe).
    expect(await screen.findAllByTestId('lauf-detail-42')).toHaveLength(2);
    // Ausgabe des Gedankengangs offen; Eingabe und Ausgabe des Werkzeugs nach Klick.
    expect(screen.getAllByTestId('schritt-1-ausgabe')[0]).toHaveTextContent(
      'Ich hole zuerst die Freigabe ein.'
    );
    fireEvent.click(screen.getAllByTestId('schritt-2')[0]?.querySelector('button') as HTMLElement);
    expect(screen.getAllByTestId('schritt-2-ausgabe')[0]).toHaveTextContent('Bestätigt von mia.');
    expect(screen.getAllByText(/Wochenbericht/).length).toBeGreaterThan(0);
    // Vorschlag der KI und Änderung des Menschen nebeneinander.
    expect(screen.getAllByTestId('lauf-feld-5-datum-neu')[0]).toHaveTextContent('01.10.2026');
    // Beide Zeilen bleiben offen.
    expect(screen.getByTestId('lauf-aufklappen-42')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('lauf-aufklappen-44')).toHaveAttribute('aria-expanded', 'true');
  });

  it('hat je Lauf einen Link auf seine eigene Adresse', async () => {
    antworte();
    const onOeffnen = zeige({ filter: 'app=beispielapp' });
    const link = await screen.findByTestId('lauf-link-42');
    expect(link).toHaveAttribute('href', '/workspace/verwaltung/laeufe/42?app=beispielapp');
    fireEvent.click(link);
    expect(onOeffnen).toHaveBeenCalledWith({ abschnitt: '42', filter: 'app=beispielapp' });
  });

  it('zeigt einen Lauf auf seiner eigenen Seite mit Auslöser und Person', async () => {
    antworte();
    const onOeffnen = zeige({ abschnitt: '42', filter: 'status=fehler' });
    await screen.findByTestId('lauf-seite');
    expect(await screen.findByTestId('lauf-ausloeser-42')).toHaveTextContent(
      'Von Hand, Mia Muster'
    );
    expect(screen.getByTestId('lauf-ergebnis')).toHaveTextContent('Der Bericht ist freigegeben.');
    expect(screen.getByTestId('lauf-seite-app')).toHaveTextContent('Beispielapp, Live');
    fireEvent.click(screen.getByTestId('lauf-zurueck'));
    expect(onOeffnen).toHaveBeenCalledWith({ filter: 'status=fehler' });
  });

  it('sagt es, wenn es den Lauf nicht gibt', async () => {
    antworte();
    apiMock.get.mockImplementation(async (pfad: string) => {
      if (pfad.startsWith('/laeufe/')) throw Object.assign(new Error('HTTP 404'), { status: 404 });
      return {};
    });
    zeige({ abschnitt: '999' });
    expect(await screen.findByTestId('lauf-fehler')).toHaveTextContent(
      'Einen Lauf 999 gibt es nicht.'
    );
  });

  it('bricht einen Lauf ohne Person ab, nach Rückfrage', async () => {
    antworte();
    apiMock.post.mockResolvedValue({ data: { ...LAUFEND, status: 'abgebrochen' } });
    zeige();
    fireEvent.click(await screen.findByTestId('lauf-aufklappen-44'));
    fireEvent.click(await screen.findByTestId('lauf-abbrechen-44'));
    expect(apiMock.post).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Lauf abbrechen' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/laeufe/44/abbrechen', {}));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('bietet Abbrechen nur bei einem Lauf an, der noch läuft', async () => {
    antworte();
    zeige();
    fireEvent.click(await screen.findByTestId('lauf-aufklappen-42'));
    await screen.findByTestId('lauf-detail-42');
    expect(screen.queryByTestId('lauf-abbrechen-42')).toBeNull();
  });

  it('bietet bei einem nicht übergebenen Lauf „erneut" an und übergibt ohne neue Schritte', async () => {
    const offen = {
      ...LAUF,
      status: 'nicht_uebergeben' as const,
      error: 'Die App antwortete 503',
      abschluss: { route: '/abschluss/freigabe', versuche: 1, fehler: 'Die App antwortete 503' },
    };
    antworte([offen], { ...DETAIL, ...offen });
    apiMock.post.mockResolvedValue({ data: { ...offen, status: 'fertig' } });
    zeige();
    fireEvent.click(await screen.findByTestId('lauf-aufklappen-42'));
    fireEvent.click(await screen.findByTestId('lauf-erneut-42'));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/apps/beispielapp/laeufe/42/erneut', {})
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('sagt bei einer leeren Auswahl, was zu tun ist', async () => {
    antworte([]);
    zeige({ filter: 'status=abgelaufen' });
    expect(await screen.findByText('Kein Lauf mit dieser Auswahl')).toBeInTheDocument();
  });
});

describe('Adresse der Läufe', () => {
  it('liest und schreibt die Filter in fester Reihenfolge', () => {
    const f = filterAusAbfrage('bis=2026-10-02&app=x&status=fehler');
    expect(f).toMatchObject({ app: 'x', status: 'fehler', bis: '2026-10-02', von: '' });
    expect(filterZuAbfrage(f)).toBe('app=x&status=fehler&bis=2026-10-02');
  });

  it('verwirft unbekannte Filter und ein Datum, das keines ist', () => {
    expect(laeufeFilterSaeubern('app=x&boese=1&von=<script>')).toBe('app=x');
    expect(filterAusAbfrage('von=gestern').von).toBe('');
  });

  it('jeder Lauf hat eine Adresse, auch frisch geladen', () => {
    const a = pfadZuAnsicht('/verwaltung/laeufe/42', '?app=beispielapp&status=fehler');
    expect(a).toEqual({
      type: 'verwaltung',
      bereich: 'laeufe',
      abschnitt: '42',
      filter: 'app=beispielapp&status=fehler',
    });
    expect(ansichtZuPfad(a!)).toBe('/workspace/verwaltung/laeufe/42?app=beispielapp&status=fehler');
    // Eine Nummer, die keine ist, wird nicht zur Ansicht eines Laufs.
    expect(pfadZuAnsicht('/verwaltung/laeufe/abc', '')).toEqual({
      type: 'verwaltung',
      bereich: 'laeufe',
    });
  });
});
