/**
 * Die App-Verwaltung (Phase D4).
 *
 * Gemessen wird, was die Phase verlangt: die Liste der Apps steht, eine App
 * zeigt ihre Stände mit Version und Backend-Gesundheit, der Teststand lässt
 * sich live schalten, die Flows nennen ihr Modell, das Modell lässt sich auf
 * eines aus der Kurzliste umstellen und wieder zurücknehmen, und ein Lauf
 * zeigt seine Schritte samt Gedankengang.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { FASSUNG } from '@marken';
import { AppsSettings } from '../AppsSettings';
import { terminInWorten } from '../apps/AppFlows';

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

const DATEIEN = { manifest: true, frontend: true };
const APP_ZEILE = {
  id: 'beispielapp',
  name: 'Beispielapp',
  beschreibung: 'Die kleinste App.',
  staende: {
    test: { version: '1.1.0', marken: FASSUNG, dateien: DATEIEN },
    live: { version: '1.0.0', marken: FASSUNG, dateien: DATEIEN },
  },
};

const FLOW = {
  name: 'freigabe',
  beschreibung: 'Holt vor dem Versand eine Freigabe ein.',
  argumente: [],
  modell: 'aus-dem-paket',
  modell_ueberschrieben: false,
  extern: null,
  arten: ['autonom', 'ergebnis_bestaetigen'],
  art: 'ergebnis_bestaetigen',
  art_ueberschrieben: false,
  version: '1.0.0',
  registriert_am: '2026-08-28T09:00:00.000Z',
};

const APP_DETAIL = {
  id: 'beispielapp',
  name: 'Beispielapp',
  beschreibung: 'Die kleinste App.',
  versionen: ['1.0.0', '1.1.0'],
  staende: {
    live: {
      version: '1.0.0',
      vorige_version: null,
      eingespielt_am: '2026-08-28T08:00:00.000Z',
      pfad: '/apps/beispielapp/',
      api: '/apps/beispielapp/api/',
      backend: { laeuft: true, status: 'running', gesundheit: 'healthy', seit: null, image: null },
      dateien: { manifest: true, frontend: true },
      lieferbar: true,
      mangel: null,
      marken: FASSUNG,
      modelle: [],
      flows: [FLOW],
    },
    test: {
      version: '1.1.0',
      vorige_version: null,
      eingespielt_am: '2026-08-28T09:00:00.000Z',
      pfad: '/apps/beispielapp/test/',
      api: '/apps/beispielapp/test/api/',
      backend: { laeuft: true, status: 'running', gesundheit: null, seit: null, image: null },
      dateien: { manifest: true, frontend: true },
      lieferbar: true,
      mangel: null,
      marken: FASSUNG,
      modelle: [],
      flows: [FLOW],
    },
  },
};

/** Der Befund vom Orin: Container healthy, Dateien weg. */
const LEICHE_ZEILE = {
  ...APP_ZEILE,
  staende: {
    test: null,
    live: {
      version: '1.0.0',
      lieferbar: false,
      mangel: 'Das Frontend fehlt am Geraet.',
      marken: FASSUNG,
      dateien: { manifest: false, frontend: false },
    },
  },
};
const LEICHE_DETAIL = {
  ...APP_DETAIL,
  staende: {
    test: null,
    live: {
      ...APP_DETAIL.staende.live,
      dateien: { manifest: false, frontend: false },
      lieferbar: false,
      mangel: 'Das Frontend fehlt am Geraet.',
    },
  },
};

const LAUF = {
  id: 42,
  flow_name: 'freigabe',
  stand: 'live' as const,
  status: 'fertig' as const,
  steps_used: 2,
  created_at: '2026-08-28T09:30:00.000Z',
  finished_at: '2026-08-28T09:31:00.000Z',
  arguments: { woche: '35' },
  error: null,
};

const LAUF_DETAIL = {
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

const KATALOG = [
  { id: 'gemma4:e4b', name: 'Gemma 4 e4b', install_status: 'available', model_type: 'chat' },
  { id: 'llava-phi3', name: 'LLaVA Phi3', install_status: 'not_installed', model_type: 'vision' },
];

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function antworte(zusatz: Record<string, unknown> = {}) {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad in zusatz) return zusatz[pfad];
    if (pfad === '/apps') return { data: [APP_ZEILE] };
    if (pfad === '/apps/beispielapp') return { data: APP_DETAIL };
    if (pfad.startsWith('/apps/beispielapp/laeufe/')) return { data: LAUF_DETAIL };
    if (pfad.startsWith('/apps/beispielapp/laeufe')) return { data: [LAUF] };
    if (pfad.startsWith('/apps/beispielapp/flows/')) {
      return {
        data: {
          ...FLOW,
          app_id: 'beispielapp',
          stand: 'live',
          prompt: 'Tu dies.',
          paket_modell: 'aus-dem-paket',
        },
      };
    }
    if (pfad === '/models/catalog') return { models: KATALOG };
    if (pfad === '/benutzer') return { data: [] };
    if (pfad === '/freigaben') return { data: [] };
    return {};
  });
}

/** Die Liste öffnen und in die Beispielapp klicken. */
async function oeffneApp() {
  render(<AppsSettings />, { wrapper: huelle() });
  fireEvent.click(await screen.findByTestId('app-oeffnen-beispielapp'));
  return screen.findByTestId('app-ansicht-beispielapp');
}

/** Schritte, Modell und Datei eines Flows aufklappen (M5: Technik nur aufgeklappt). */
async function flowAufklappen(name = 'freigabe') {
  fireEvent.click(await screen.findByTestId(`flow-mehr-${name}-knopf`));
}

describe('AppsSettings', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.put.mockReset();
    apiMock.del.mockReset();
    toast.success.mockReset();
  });

  it('nennt einen Stand, dessen Dateien fehlen, rot, trotz gesundem Container', async () => {
    // Auftrag app-leiche: der Container meldete healthy, das Frontend gab es
    // nicht, und niemand sah es. Jetzt steht es in der Liste und in der Karte.
    antworte({ '/apps': { data: [LEICHE_ZEILE] }, '/apps/beispielapp': { data: LEICHE_DETAIL } });
    render(<AppsSettings />, { wrapper: huelle() });

    expect(await screen.findByTestId('app-mangel-beispielapp')).toHaveTextContent(
      'nicht lieferbar'
    );
    fireEvent.click(screen.getByTestId('app-oeffnen-beispielapp'));
    await screen.findByTestId('app-ansicht-beispielapp');
    expect(screen.getByTestId('stand-mangel')).toHaveTextContent('Das Frontend fehlt am Geraet.');
  });

  /**
   * J35: ein Aufruf von `document/extract-structured` ist kein Flow und stand
   * deshalb unter keinem Lauf. Er steht jetzt mit Mensch, Modell und Dauer in
   * der App -- und ohne Inhalt, denn das Backend kennt keinen.
   */
  it('zeigt die Modellaufrufe der App, auch ohne Flow', async () => {
    antworte({
      '/apps/beispielapp/ki-aufrufe?limit=50': {
        data: [
          {
            id: 7,
            begonnen_am: '2026-09-26T09:30:05.000Z',
            beendet_am: '2026-09-26T09:30:17.400Z',
            dauer_ms: 12400,
            stand: 'live',
            benutzer_id: 5,
            benutzer_name: 'anna',
            endpunkt: 'document/extract-structured',
            modell: 'qwen3.8:27b-q4_K_M',
            job_id: '0b7c2c1e-0000-4000-8000-000000000001',
            lauf_id: null,
            status: 'fertig',
            fehler: null,
            antwort_sha256: 'ab'.repeat(32),
            datei_typ: 'application/pdf',
            datei_bytes: 120000,
          },
        ],
      },
    });
    await oeffneApp();
    fireEvent.click(screen.getByTestId('ki-aufrufe-schalter'));
    const zeile = await screen.findByTestId('ki-aufruf-7');
    expect(zeile).toHaveTextContent('document/extract-structured');
    expect(zeile).toHaveTextContent('qwen3.8:27b-q4_K_M');
    expect(zeile).toHaveTextContent('für anna');
    expect(zeile).toHaveTextContent('12,4 s');
    expect(zeile).toHaveTextContent('PDF, 120 KB');
  });

  /**
   * J35, Migration 189: auch der Modellschritt eines Flows steht hier, mit
   * seinem Lauf -- der Satz nach einer Freigabe ist ein Vorschlag wie jeder.
   */
  it('zeigt den Modellschritt eines Flows mit seinem Lauf', async () => {
    antworte({
      '/apps/beispielapp/ki-aufrufe?limit=50': {
        data: [
          {
            id: 8,
            begonnen_am: '2026-09-26T09:31:00.000Z',
            beendet_am: '2026-09-26T09:31:08.000Z',
            dauer_ms: 8000,
            stand: 'live',
            benutzer_id: 5,
            benutzer_name: 'anna',
            endpunkt: 'flows/bescheid',
            modell: 'qwen3.8:27b-q4_K_M',
            job_id: null,
            lauf_id: 12,
            status: 'fertig',
            fehler: null,
            antwort_sha256: 'cd'.repeat(32),
            datei_typ: null,
            datei_bytes: null,
          },
        ],
      },
    });
    await oeffneApp();
    fireEvent.click(screen.getByTestId('ki-aufrufe-schalter'));
    const zeile = await screen.findByTestId('ki-aufruf-8');
    expect(zeile).toHaveTextContent('flows/bescheid');
    expect(zeile).toHaveTextContent('für anna');
    expect(zeile).toHaveTextContent('Lauf 12');
    expect(zeile.textContent).not.toMatch(/Auftrag/);
  });

  it('sagt, wenn eine App noch kein Modell gefragt hat', async () => {
    antworte();
    await oeffneApp();
    fireEvent.click(screen.getByTestId('ki-aufrufe-schalter'));
    expect(await screen.findByTestId('ki-aufrufe-leer')).toBeInTheDocument();
  });

  /**
   * Phase H6: eine App traegt die Bibliothek als Kopie, und eine Kopie
   * veraltet lautlos. Die drei Faelle, die ein Betreiber auseinanderhalten
   * koennen muss -- gleich, aelter, gar nicht genannt.
   */
  it('nennt die Fassung des Designsystems, auf der ein Stand steht', async () => {
    antworte();
    await oeffneApp();
    // Gleiche Fassung heisst: keine Meldung, die Zahl ist Technik und steht
    // aufgeklappt (M5).
    expect(screen.queryAllByTestId('marken-fassung')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('stand-live-technik-knopf'));
    expect(await screen.findByTestId('stand-live-technik')).toHaveTextContent(FASSUNG);
  });

  it('meldet eine App, die auf einer aelteren Bibliothek steht', async () => {
    antworte({
      '/apps': { data: [APP_ZEILE] },
      '/apps/beispielapp': {
        data: {
          ...APP_DETAIL,
          staende: {
            ...APP_DETAIL.staende,
            live: { ...APP_DETAIL.staende.live, marken: '1.0.0' },
          },
        },
      },
    });
    await oeffneApp();
    const live = within(screen.getByTestId('stand-live')).getByTestId('marken-fassung');
    expect(live).toHaveTextContent('1.0.0');
    expect(live).toHaveTextContent(`älter als das Gerät (${FASSUNG})`);
    expect(live).toHaveAttribute('data-warnung', 'true');
    // Der Teststand daneben steht auf der Fassung des Geräts und sagt nichts.
    expect(within(screen.getByTestId('stand-test')).queryByTestId('marken-fassung')).toBeNull();
  });

  /**
   * Kontrakt 9 (M5): nur die Hauptzahl heisst, die App laedt die Bibliothek
   * zur Laufzeit vom Geraet und traegt keine Kopie. Keine Warnung, solange die
   * Hauptzahl die des Geraets ist; eine fremde Hauptzahl ist eine.
   */
  it('zeigt eine App, die die Bibliothek zur Laufzeit laedt, ohne Warnung', async () => {
    const haupt = FASSUNG.split('.')[0] ?? '';
    antworte({
      '/apps': { data: [APP_ZEILE] },
      '/apps/beispielapp': {
        data: {
          ...APP_DETAIL,
          staende: {
            live: { ...APP_DETAIL.staende.live, marken: haupt },
            test: { ...APP_DETAIL.staende.test, marken: String(Number(haupt) - 1) },
          },
        },
      },
    });
    await oeffneApp();
    // Ohne Warnung steht die Bibliothek nur aufgeklappt.
    expect(within(screen.getByTestId('stand-live')).queryByTestId('marken-fassung')).toBeNull();
    const test = within(screen.getByTestId('stand-test')).getByTestId('marken-fassung');
    expect(test).toHaveAttribute('data-befund', 'laufzeit-fremd');
    expect(test).toHaveAttribute('data-warnung', 'true');
  });

  it('meldet eine App, die gar keine Fassung nennt', async () => {
    // Jede App, die vor H6 gebaut wurde. Sie laeuft -- man weiss nur nicht,
    // wie alt ihr Erscheinungsbild ist, und genau das steht da.
    antworte({
      '/apps': { data: [APP_ZEILE] },
      '/apps/beispielapp': {
        data: {
          ...APP_DETAIL,
          staende: {
            ...APP_DETAIL.staende,
            live: { ...APP_DETAIL.staende.live, marken: null },
          },
        },
      },
    });
    await oeffneApp();
    const live = within(screen.getByTestId('stand-live')).getByTestId('marken-fassung');
    expect(live).toHaveTextContent('nicht genannt');
    expect(live).toHaveAttribute('data-warnung', 'true');
  });

  /**
   * M5 (Auftrag verwaltung-app-seite): die Liste trägt höchstens ein Tag,
   * „(Test)". Die Bibliothek steht auf der Seite der App, offen nur, wenn sie
   * warnt (sie stand seit dem Auftrag geraet-zeigt-bibliotheksstand in der
   * Liste; das Zielbild vom 02.10.2026 legt alles einer App auf ihre Seite).
   */
  it('trägt in der Liste höchstens ein Tag, „(Test)", und keine Bibliothek', async () => {
    antworte({
      '/apps': {
        data: [
          {
            ...APP_ZEILE,
            staende: {
              ...APP_ZEILE.staende,
              live: { ...APP_ZEILE.staende.live, marken: '1.0.0' },
            },
          },
        ],
      },
    });
    render(<AppsSettings />, { wrapper: huelle() });
    const zeile = await screen.findByTestId('app-oeffnen-beispielapp');
    expect(within(zeile).getByTestId('app-tag-test-beispielapp')).toHaveTextContent('(Test)');
    expect(zeile).not.toHaveTextContent('Bibliothek');
    expect(zeile.querySelector('[data-warnung]')).toBeNull();
    expect(screen.queryByTestId('app-mangel-beispielapp')).toBeNull();
  });

  it('warnt nicht bei einem fremden Container ohne Frontend', async () => {
    // Ein Backend ohne Oberflaeche hat kein Erscheinungsbild und braucht keine
    // Bibliothek. `dateien.frontend: null` heisst: das Manifest nennt keines.
    const ohneFrontend = { manifest: true, frontend: null };
    antworte({
      '/apps': {
        data: [
          {
            ...APP_ZEILE,
            staende: {
              test: null,
              live: { ...APP_ZEILE.staende.live, marken: null, dateien: ohneFrontend },
            },
          },
        ],
      },
      '/apps/beispielapp': {
        data: {
          ...APP_DETAIL,
          staende: {
            test: null,
            live: {
              ...APP_DETAIL.staende.live,
              pfad: null,
              marken: null,
              dateien: ohneFrontend,
            },
          },
        },
      },
    });
    await oeffneApp();
    expect(within(screen.getByTestId('stand-live')).queryByTestId('marken-fassung')).toBeNull();
    fireEvent.click(screen.getByTestId('stand-live-technik-knopf'));
    expect(await screen.findByTestId('stand-live-technik')).toHaveTextContent('ohne Oberfläche');
  });

  it('entfernt eine App erst, wenn ihre Kennung eingetippt ist, samt Dateien', async () => {
    antworte();
    apiMock.del.mockResolvedValue({ data: { id: 'beispielapp' } });
    await oeffneApp();

    fireEvent.click(screen.getByTestId('app-entfernen'));
    const absenden = await screen.findByTestId('app-entfernen-absenden');
    expect(absenden).toBeDisabled();

    fireEvent.change(screen.getByTestId('app-entfernen-kennung'), {
      target: { value: 'beispiel' },
    });
    expect(absenden).toBeDisabled();
    expect(apiMock.del).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('app-entfernen-kennung'), {
      target: { value: 'beispielapp' },
    });
    expect(absenden).toBeEnabled();
    fireEvent.click(absenden);

    await waitFor(() => expect(apiMock.del).toHaveBeenCalledWith('/apps/beispielapp?dateien=true'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    // Danach steht die Liste wieder da, nicht die Ansicht einer App, die es nicht mehr gibt.
    await screen.findByTestId('app-liste');
  });

  it('zeigt die Apps des Geraets mit beiden Fassungen', async () => {
    antworte();
    render(<AppsSettings />, { wrapper: huelle() });

    const zeile = await screen.findByTestId('app-oeffnen-beispielapp');
    expect(zeile).toHaveTextContent('Live 1.0.0, im Test 1.1.0');
    expect(zeile).toHaveTextContent('(Test)');
  });

  it('nennt je Stand die Version und den Zustand des Backends', async () => {
    antworte();
    await oeffneApp();

    expect(screen.getByTestId('version-live')).toHaveTextContent('1.0.0');
    expect(screen.getByTestId('version-test')).toHaveTextContent('1.1.0');
    expect(screen.getByTestId('stand-live')).toHaveTextContent('läuft, gesund');
    // Ein Container ohne Gesundheitsprüfung im Manifest ist kein Fehler.
    expect(screen.getByTestId('stand-test')).toHaveTextContent('läuft');
  });

  it('schaltet den Teststand live, nach einer Rückfrage (M5)', async () => {
    antworte();
    apiMock.post.mockResolvedValue({ data: { stand: 'live', version: '1.1.0' } });
    await oeffneApp();

    fireEvent.click(screen.getByTestId('schalten-live'));
    // Erst der Dialog, noch kein Aufruf.
    expect(await screen.findByTestId('live-schalten-dialog')).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(screen.getByTestId('live-schalten-ohne-text')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('live-schalten-bestaetigen'));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        '/apps/beispielapp/schalten',
        { ziel: 'live' },
        expect.objectContaining({ showError: false })
      )
    );
  });

  it('zeigt beim Live-Schalten, was der Entwickler zur Fassung schrieb (M5)', async () => {
    antworte({
      '/apps/beispielapp': {
        data: {
          ...APP_DETAIL,
          staende: {
            ...APP_DETAIL.staende,
            test: { ...APP_DETAIL.staende.test, aenderungstext: 'Neu: Spalte Kostenstelle.' },
          },
        },
      },
    });
    await oeffneApp();

    expect(screen.getByTestId('aenderungstext-test')).toHaveTextContent('Spalte Kostenstelle');
    fireEvent.click(screen.getByTestId('schalten-live'));
    expect(await screen.findByTestId('live-schalten-aenderungstext')).toHaveTextContent(
      'Neu: Spalte Kostenstelle.'
    );
  });

  it('nennt einen Rückfall in einem Satz, den zweiten darunter, Technik zugeklappt (M5)', async () => {
    antworte({
      '/apps/beispielapp': {
        data: {
          ...APP_DETAIL,
          letzte_schaltung: {
            id: 3,
            von_version: '1.0.0',
            nach_version: '1.1.0',
            ergebnis: 'zurueckgeschaltet',
            sicherung_id: 'a1b2c3d4e5f6',
            satz: 'Die neue Fassung 1.1.0 ließ sich nicht starten, deshalb läuft Beispiel wieder mit Fassung 1.0.0 und den Daten von vorher.',
            hilfe: 'Geben Sie die technischen Angaben an den Entwickler weiter.',
            technik: { grund: 'abgestürzt', exit_code: 1, letzte_zeilen: 'column exists' },
            begonnen_am: '2026-10-04T08:00:00.000Z',
            beendet_am: '2026-10-04T08:02:00.000Z',
          },
        },
      },
    });
    await oeffneApp();

    const hinweis = screen.getByTestId('schaltung-hinweis');
    expect(within(screen.getByTestId('stand-live')).getByTestId('schaltung-hinweis')).toBe(hinweis);
    expect(screen.getByTestId('schaltung-satz')).toHaveTextContent(
      /1\.1\.0 ließ sich nicht starten/
    );
    expect(screen.getByTestId('schaltung-hilfe')).toHaveTextContent(/Entwickler/);
    // Die Technik nur aufgeklappt.
    expect(screen.queryByText('column exists')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('schaltung-technik-knopf'));
    expect(await screen.findByText('column exists')).toBeInTheDocument();
    expect(screen.getByText('Exit-Code')).toBeInTheDocument();
    // Ohne Daten-Rückfall in der Technik steht die Zeile gar nicht da, nicht als „—".
    expect(screen.queryByText('Daten zurück')).not.toBeInTheDocument();
  });

  it('zeigt nach einem glatten Live-Schalten keinen Hinweis', async () => {
    antworte({
      '/apps/beispielapp': {
        data: {
          ...APP_DETAIL,
          letzte_schaltung: {
            id: 4,
            von_version: '1.0.0',
            nach_version: '1.1.0',
            ergebnis: 'live',
            sicherung_id: 'a1b2c3d4e5f6',
            satz: 'Beispiel ist live mit Fassung 1.1.0.',
            hilfe: null,
            technik: null,
            begonnen_am: '2026-10-04T08:00:00.000Z',
            beendet_am: '2026-10-04T08:02:00.000Z',
          },
        },
      },
    });
    await oeffneApp();
    expect(screen.queryByTestId('schaltung-hinweis')).not.toBeInTheDocument();
  });

  it('bietet „Zurueck" nicht an, wenn im Livestand nie etwas anderes lief', async () => {
    // Ein Knopf, der sicher mit 409 antwortet, ist eine Sackgasse.
    antworte();
    await oeffneApp();
    expect(screen.queryByTestId('schalten-zurueck')).not.toBeInTheDocument();
  });

  it('stellt das Modell eines Flows auf eines aus der Kurzliste um', async () => {
    antworte();
    apiMock.put.mockResolvedValue({ data: {} });
    await oeffneApp();

    await flowAufklappen();
    fireEvent.click(await screen.findByTestId('flow-modell-freigabe'));
    fireEvent.click(await screen.findByTestId('modell-quelle-lokal'));
    fireEvent.change(screen.getByTestId('modell-lokal'), { target: { value: 'gemma4:e4b' } });
    fireEvent.click(screen.getByTestId('modell-absenden'));

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/apps/beispielapp/flows/freigabe/modell', {
        modell: 'gemma4:e4b',
      })
    );
  });

  it('schaltet die Art eines Flows zwischen den Arten, die der Kopf nennt', async () => {
    antworte();
    apiMock.put.mockResolvedValue({ data: {} });
    await oeffneApp();

    expect(await screen.findByTestId('flow-art-freigabe')).toHaveTextContent('Ergebnis bestätigen');
    fireEvent.click(screen.getByTestId('flow-art-freigabe'));
    fireEvent.click(await screen.findByTestId('flow-art-freigabe-autonom'));

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/apps/beispielapp/flows/freigabe/art', {
        art: 'autonom',
      })
    );
  });

  it('nimmt die Ueberschreibung mit „aus dem Paket" wieder zurueck', async () => {
    antworte();
    apiMock.put.mockResolvedValue({ data: {} });
    await oeffneApp();

    await flowAufklappen();
    fireEvent.click(await screen.findByTestId('flow-modell-freigabe'));
    fireEvent.click(screen.getByTestId('modell-quelle-paket'));
    fireEvent.click(screen.getByTestId('modell-absenden'));

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/apps/beispielapp/flows/freigabe/modell', {
        modell: null,
      })
    );
  });

  it('schickt ein externes Modell samt Schluessel, ohne ihn je zu zeigen', async () => {
    antworte();
    apiMock.put.mockResolvedValue({ data: {} });
    await oeffneApp();

    await flowAufklappen();
    fireEvent.click(await screen.findByTestId('flow-modell-freigabe'));
    fireEvent.click(screen.getByTestId('modell-quelle-extern'));
    fireEvent.change(screen.getByLabelText('Anbieter'), { target: { value: 'OpenAI' } });
    fireEvent.change(screen.getByLabelText('Modell beim Anbieter'), {
      target: { value: 'gpt-4o' },
    });
    fireEvent.change(screen.getByLabelText('Adresse (OpenAI-kompatibel)'), {
      target: { value: 'https://api.openai.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('Schlüssel'), { target: { value: 'sk-geheim' } });
    fireEvent.click(screen.getByTestId('modell-absenden'));

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/apps/beispielapp/flows/freigabe/modell', {
        extern: {
          anbieter: 'OpenAI',
          modell: 'gpt-4o',
          basis_url: 'https://api.openai.com/v1',
          schluessel: 'sk-geheim',
        },
      })
    );
  });

  it('weist eine halbe externe Angabe ab, bevor sie das Geraet erreicht', async () => {
    antworte();
    await oeffneApp();

    await flowAufklappen();
    fireEvent.click(await screen.findByTestId('flow-modell-freigabe'));
    fireEvent.click(screen.getByTestId('modell-quelle-extern'));
    fireEvent.change(screen.getByLabelText('Anbieter'), { target: { value: 'OpenAI' } });
    expect(screen.getByTestId('modell-absenden')).toBeDisabled();
  });

  it('liest einen Lauf mit Schritten UND Gedankengang', async () => {
    antworte();
    await oeffneApp();

    fireEvent.click(screen.getByTestId('laeufe-schalter'));
    fireEvent.click(await screen.findByTestId('lauf-oeffnen-42'));

    const schritte = await screen.findByTestId('lauf-schritte');
    expect(schritte).toHaveAttribute('data-schritte', '2');
    // Der Gedankengang ist ein Schritt der Art `modell` und steht offen da:
    // er ist der Satz, der die Werkzeug-Kette erklärt.
    expect(screen.getByTestId('schritt-1')).toHaveAttribute('data-schritt-art', 'modell');
    expect(screen.getByTestId('schritt-1-ausgabe')).toHaveTextContent(
      'Ich hole zuerst die Freigabe ein.'
    );
    expect(screen.getByTestId('lauf-ergebnis')).toHaveTextContent('Der Bericht ist freigegeben.');
    // Vorschlag der KI und Änderung des Menschen nebeneinander (M5).
    expect(screen.getByTestId('lauf-feld-5-datum')).toHaveTextContent('nicht erkannt');
    expect(screen.getByTestId('lauf-feld-5-datum-neu')).toHaveTextContent('01.10.2026');
    expect(screen.getByTestId('lauf-feld-5-datum-neu')).toHaveTextContent('mia');
    expect(screen.getByTestId('lauf-feld-5-betrag-neu')).toHaveTextContent('nein');
  });

  it('bietet bei einem nicht uebergebenen Lauf „erneut" an und uebergibt ohne neue Schritte', async () => {
    const offen = {
      ...LAUF,
      status: 'nicht_uebergeben' as const,
      error: 'Die App antwortete 503',
      abschluss: { route: '/abschluss/freigabe', versuche: 1, fehler: 'Die App antwortete 503' },
    };
    antworte({ '/apps/beispielapp/laeufe?limit=50': { data: [offen] } });
    apiMock.get.mockImplementation(async (pfad: string) => {
      if (pfad === '/apps') return { data: [APP_ZEILE] };
      if (pfad === '/apps/beispielapp') return { data: APP_DETAIL };
      if (pfad.startsWith('/apps/beispielapp/laeufe/'))
        return { data: { ...LAUF_DETAIL, ...offen } };
      if (pfad.startsWith('/apps/beispielapp/laeufe')) return { data: [offen] };
      return {};
    });
    apiMock.post.mockResolvedValue({ data: { ...offen, status: 'fertig' } });
    await oeffneApp();

    fireEvent.click(screen.getByTestId('laeufe-schalter'));
    expect(await screen.findByText('nicht übergeben')).toBeInTheDocument();
    fireEvent.click(await screen.findByTestId('lauf-erneut-42'));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/apps/beispielapp/laeufe/42/erneut', {})
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('markiert einen Lauf aus einem Ereignis der App (Kontrakt 13)', async () => {
    const ausEreignis = { ...LAUF, ausloeser: 'ereignis' as const, ereignis: 'beleg.eingegangen' };
    apiMock.get.mockImplementation(async (pfad: string) => {
      if (pfad === '/apps') return { data: [APP_ZEILE] };
      if (pfad === '/apps/beispielapp') return { data: APP_DETAIL };
      if (pfad.startsWith('/apps/beispielapp/laeufe/'))
        return { data: { ...LAUF_DETAIL, ...ausEreignis } };
      if (pfad.startsWith('/apps/beispielapp/laeufe')) return { data: [ausEreignis] };
      return {};
    });
    await oeffneApp();
    fireEvent.click(screen.getByTestId('laeufe-schalter'));
    const marke = await screen.findByTestId('lauf-ereignis-42');
    expect(marke).toHaveTextContent('Ereignis');
    expect(marke).toHaveAttribute('title', 'Ereignis „beleg.eingegangen“');
  });

  it('bietet „erneut" bei einem uebergebenen Lauf nicht an', async () => {
    antworte();
    await oeffneApp();
    fireEvent.click(screen.getByTestId('laeufe-schalter'));
    await screen.findByTestId('lauf-oeffnen-42');
    expect(screen.queryByTestId('lauf-erneut-42')).toBeNull();
  });

  it('zeigt die Flow-Datei samt Auftrag an das Modell', async () => {
    antworte();
    await oeffneApp();

    await flowAufklappen();
    fireEvent.click(await screen.findByTestId('flow-oeffnen-freigabe'));

    expect(await screen.findByTestId('flow-prompt')).toHaveTextContent('Tu dies.');
  });

  it('holt die Logs erst auf Klick', async () => {
    antworte();
    await oeffneApp();

    expect(apiMock.get).not.toHaveBeenCalledWith(expect.stringContaining('/logs'));
    fireEvent.click(screen.getByTestId('logs-schalter'));
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith(expect.stringContaining('/apps/beispielapp/logs'))
    );
  });

  it('ein Fehler ist kein Leerzustand', async () => {
    apiMock.get.mockRejectedValue(new Error('weg'));
    render(<AppsSettings />, { wrapper: huelle() });
    expect(await screen.findByTestId('apps-fehler')).toBeInTheDocument();
  });
});

/**
 * Die eine Seite je App (M5, Auftrag verwaltung-app-seite): Blöcke in fester
 * Reihenfolge, „aktiv" je Flow, Personen mit Testpersonen, Verbindungen
 * lesbar benannt und rot nur bei echter Störung.
 */
describe('Die Seite einer App (M5)', () => {
  const ANNA = {
    id: 5,
    username: 'anna',
    vorname: 'Anna',
    nachname: 'Berg',
    role: 'mitarbeiter',
    is_active: true,
  };
  const BEN = { ...ANNA, id: 6, username: 'ben', vorname: 'Ben', nachname: 'Kurz' };
  const FLOW_M5 = {
    ...FLOW,
    aktiv: true,
    schritte: [
      { name: 'lesen', typ: 'werkzeug', werkzeug: 'bild_lesen' },
      { name: 'pruefen', typ: 'subagent', rolle: 'pruefer' },
    ],
    ausloeser: [{ typ: 'zeitplan', zeitplan: '0 6 * * 1-5' }],
    stufen: [{ name: 'pruefung', bezeichnung: 'Prüfung' }],
  };
  const DETAIL_M5 = {
    ...APP_DETAIL,
    staende: {
      live: { ...APP_DETAIL.staende.live, flows: [FLOW_M5] },
      test: { ...APP_DETAIL.staende.test, flows: [FLOW_M5] },
    },
  };
  const AUSGANG = {
    data: {
      apps: [
        {
          id: 'beispielapp',
          name: 'Beispielapp',
          eingetragen: [
            { host: 'api.example.org', staende: ['live', 'test'] },
            { host: 'api.openai.com', staende: ['live'] },
          ],
          genutzt: [
            {
              host: 'api.example.org',
              anzahl: 4,
              zuletzt: '2026-10-04T08:00:00Z',
              staende: ['live'],
            },
          ],
          abgewiesen: [
            {
              host: 'api.openai.com',
              anzahl: 2,
              zuletzt: '2026-10-04T09:00:00Z',
              staende: ['live'],
              stoerung: true,
            },
            {
              host: 'boese.example',
              anzahl: 3,
              zuletzt: '2026-10-04T09:30:00Z',
              staende: ['live'],
              stoerung: false,
            },
          ],
        },
      ],
      plattform: { genutzt: [] },
    },
  };

  function antworteM5(zusatz: Record<string, unknown> = {}) {
    antworte({
      '/apps/beispielapp': { data: DETAIL_M5 },
      '/benutzer': { data: [ANNA, BEN] },
      '/freigaben': {
        data: [
          { app_id: 'beispielapp', user_id: '5', stand: 'test' },
          { app_id: 'beispielapp', user_id: '6', stand: 'live' },
        ],
      },
      '/ausgang': AUSGANG,
      ...zusatz,
    });
  }

  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.put.mockReset();
    apiMock.del.mockReset();
    toast.success.mockReset();
  });

  it('zeigt die Blöcke in der Reihenfolge des Auftrags', async () => {
    antworteM5();
    const seite = await oeffneApp();
    const titel = within(seite)
      .getAllByRole('heading', { level: 2 })
      .map(h => h.textContent?.trim());
    expect(titel).toEqual([
      'Zustand',
      'Fassungen',
      'Personen',
      'Freigabestufen',
      'Flows',
      'Verbindungen',
      'Läufe',
      'KI-Aufrufe',
      'Protokoll',
    ]);
  });

  it('sagt den Zustand in einem Satz, mit Personen und aktiven Flows', async () => {
    antworteM5();
    await oeffneApp();
    expect(screen.getByTestId('app-zustand-satz')).toHaveTextContent(
      'Läuft mit Fassung 1.0.0. Im Test wartet Fassung 1.1.0.'
    );
    await waitFor(() =>
      expect(screen.getByTestId('app-zustand-zahlen')).toHaveTextContent(
        '2 Personen mit Zugang, davon 1 Testperson · 1 von 1 Flow aktiv'
      )
    );
    // Die abgewiesene, eingetragene Verbindung hindert die App: rot, ein Satz.
    await waitFor(() =>
      expect(screen.getByTestId('app-zustand-stoerung')).toHaveTextContent(
        'Die Verbindung zu OpenAI wird abgewiesen.'
      )
    );
  });

  it('schaltet einen Flow mit „aktiv" aus', async () => {
    antworteM5();
    apiMock.put.mockResolvedValue({ data: { aktiv: false } });
    await oeffneApp();
    const schalter = await screen.findByTestId('flow-aktiv-freigabe');
    expect(schalter).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(schalter);
    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/apps/beispielapp/flows/freigabe/aktiv', {
        aktiv: false,
      })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/startet nicht/))
    );
  });

  it('zeigt einen ausgeschalteten Flow als aus', async () => {
    antworteM5({
      '/apps/beispielapp': {
        data: {
          ...DETAIL_M5,
          staende: {
            live: { ...DETAIL_M5.staende.live, flows: [{ ...FLOW_M5, aktiv: false }] },
            test: null,
          },
        },
      },
    });
    await oeffneApp();
    expect(await screen.findByTestId('flow-freigabe')).toHaveAttribute('data-aktiv', 'false');
    expect(screen.getByTestId('flow-aus-freigabe')).toHaveTextContent('aus, startet nicht');
    expect(screen.getByTestId('flow-aktiv-freigabe')).toHaveAttribute('aria-checked', 'false');
  });

  it('nennt Auslöser und Schritte in einem Satz, die Schritte klappen auf', async () => {
    antworteM5();
    await oeffneApp();
    expect(await screen.findByTestId('flow-ablauf-freigabe')).toHaveTextContent(
      'Startet werktags um 06:00 · 2 Schritte'
    );
    expect(screen.queryByTestId('flow-schritte-freigabe')).toBeNull();
    await flowAufklappen();
    const schritte = await screen.findByTestId('flow-schritte-freigabe');
    expect(schritte).toHaveTextContent('1. lesen (Werkzeug bild_lesen)');
    expect(schritte).toHaveTextContent('2. pruefen (Rolle pruefer)');
    expect(screen.getByTestId('flow-mehr-freigabe')).toHaveTextContent('Prüfung');
  });

  describe('Termine in Worten', () => {
    const jetzt = new Date('2026-10-04T12:00:00Z'); // Sonntag, 14:00 in Berlin
    it('heute, morgen, sonst mit Wochentag und Datum, in der Zeitzone des Geräts', () => {
      expect(terminInWorten('2026-10-04T16:30:00Z', 'Europe/Berlin', jetzt)).toBe(
        'heute um 18:30 Uhr'
      );
      expect(terminInWorten('2026-10-05T04:00:00Z', 'Europe/Berlin', jetzt)).toBe(
        'morgen um 06:00 Uhr'
      );
      expect(terminInWorten('2026-10-12T04:00:00Z', 'Europe/Berlin', jetzt)).toBe(
        'Montag, 12. Oktober, um 06:00 Uhr'
      );
    });
    it('rechnet in der Zone, nicht in der des Browsers: 22:30 UTC ist in Berlin schon morgen', () => {
      expect(terminInWorten('2026-10-04T22:30:00Z', 'Europe/Berlin', jetzt)).toBe(
        'morgen um 00:30 Uhr'
      );
    });
  });

  describe('Zeitplan je Flow', () => {
    const ZEITPLAN = {
      ausdruecke: ['0 6 * * 1-5'],
      zeitzone: 'Europe/Berlin',
      pausiert: false,
      laeuft_nicht: null,
      naechster_termin: '2099-01-05T05:00:00.000Z',
      letzter_termin: null,
    };
    const mitZeitplan = (zeitplan: Record<string, unknown>) =>
      antworteM5({
        '/apps/beispielapp': {
          data: {
            ...DETAIL_M5,
            staende: {
              live: {
                ...DETAIL_M5.staende.live,
                flows: [{ ...FLOW_M5, zeitplan: { ...ZEITPLAN, ...zeitplan } }],
              },
              test: null,
            },
          },
        },
      });

    it('nennt den nächsten Lauf in Worten und pausiert auf Knopfdruck', async () => {
      mitZeitplan({});
      apiMock.put.mockResolvedValue({ data: {} });
      await oeffneApp();
      expect(await screen.findByTestId('flow-zeitplan-freigabe')).toHaveTextContent(
        /Nächster Lauf: .*5\. Januar, um 06:00 Uhr/
      );
      fireEvent.click(screen.getByTestId('flow-zeitplan-knopf-freigabe'));
      await waitFor(() =>
        expect(apiMock.put).toHaveBeenCalledWith('/apps/beispielapp/flows/freigabe/zeitplan', {
          pausiert: true,
        })
      );
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/nicht nachgeholt/))
      );
    });

    it('zeigt einen pausierten Zeitplan und setzt ihn fort', async () => {
      mitZeitplan({ pausiert: true, laeuft_nicht: 'pausiert', naechster_termin: null });
      apiMock.put.mockResolvedValue({ data: {} });
      await oeffneApp();
      const satz = await screen.findByTestId('flow-zeitplan-freigabe');
      expect(satz).toHaveTextContent('Zeitplan pausiert');
      expect(satz).toHaveAttribute('data-pausiert', 'true');
      // Die Pause trifft nur den Zeitplan: der Schalter „aktiv" bleibt an.
      expect(screen.getByTestId('flow-aktiv-freigabe')).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(screen.getByTestId('flow-zeitplan-knopf-freigabe'));
      await waitFor(() =>
        expect(apiMock.put).toHaveBeenCalledWith('/apps/beispielapp/flows/freigabe/zeitplan', {
          pausiert: false,
        })
      );
    });

    it('sagt einen übersprungenen Termin mit seinem Grund', async () => {
      mitZeitplan({
        letzter_termin: {
          termin: '2026-10-04T04:00:00.000Z',
          ergebnis: 'uebersprungen',
          grund: 'Verpasst: Sonntag, 4. Oktober, 06:00 Uhr. Das Gerät lief zu der Zeit nicht.',
          run_id: null,
        },
      });
      await oeffneApp();
      expect(await screen.findByTestId('flow-zeitplan-letzter-freigabe')).toHaveTextContent(
        'Verpasst: Sonntag, 4. Oktober, 06:00 Uhr.'
      );
    });
  });

  it('nennt Personen beim Namen und schaltet Zugang und Testperson', async () => {
    antworteM5();
    apiMock.post.mockResolvedValue({ data: {} });
    await oeffneApp();
    const anna = await screen.findByTestId('person-beispielapp-anna');
    expect(anna).toHaveTextContent('Anna Berg');
    expect(screen.getByTestId('person-test-beispielapp-anna')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    fireEvent.click(screen.getByTestId('person-test-beispielapp-ben'));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/freigaben', {
        app_id: 'beispielapp',
        benutzer_id: 6,
        stand: 'test',
      })
    );
  });

  it('benennt Verbindungen lesbar, Adressen aufgeklappt, rot nur bei Störung', async () => {
    antworteM5();
    await oeffneApp();
    const example = await screen.findByTestId('verbindung-api.example.org');
    expect(example).toHaveTextContent('Example');
    expect(example).toHaveTextContent('4× genutzt');
    // Die Adresse ist Technik: erst aufgeklappt.
    expect(example).not.toHaveTextContent('api.example.org');
    expect(example).not.toHaveAttribute('data-stoerung');
    fireEvent.click(screen.getByTestId('verbindung-mehr-api.example.org-knopf'));
    expect(await screen.findByTestId('verbindung-mehr-api.example.org')).toHaveTextContent(
      'api.example.org'
    );

    const openai = screen.getByTestId('verbindung-api.openai.com');
    expect(openai).toHaveAttribute('data-stoerung', 'true');
    expect(screen.getByTestId('verbindung-stoerung-api.openai.com')).toHaveClass(
      'text-destructive'
    );

    // Ein nicht eingetragener, abgewiesener Name ist die Aufgabe des Proxys:
    // grau und zugeklappt, nicht rot.
    expect(screen.queryByTestId('abgewiesen-boese.example')).toBeNull();
    const knopf = screen.getByTestId('verbindungen-abgewiesen-knopf');
    expect(knopf).toHaveTextContent('Abgewiesen: 1 Adresse');
    expect(knopf).not.toHaveClass('text-destructive');
    fireEvent.click(knopf);
    expect(await screen.findByTestId('abgewiesen-boese.example')).toHaveTextContent('3×');
  });
  describe('Modell je Schritt', () => {
    const SCHRITTE = {
      data: {
        standard: 'qwen',
        modelle: [
          {
            id: 'qwen',
            name: 'Qwen 27B',
            ist_standard: true,
            faehigkeiten: { text: true, bild: false, werkzeuge: true, kontext: 262144 },
          },
          {
            id: 'gemma',
            name: 'Gemma Kompakt',
            ist_standard: false,
            faehigkeiten: { text: true, bild: true, werkzeuge: true, kontext: 131072 },
          },
        ],
        flows: [
          {
            name: 'freigabe',
            schritte: [
              {
                name: 'erkennen',
                rolle: 'leser',
                faehigkeiten: { bild: true, werkzeuge: true },
                original: 'llama9:70b',
                original_vorhanden: false,
                gewaehlt: null,
                gilt: 'qwen',
                gilt_ist_standard: true,
                herkunft: 'standard_weil_fehlt',
                hinweis:
                  'Schritt „erkennen": Das Modell „llama9:70b" liegt nicht am Gerät, der Schritt läuft mit dem Standardmodell.',
                moegliche: ['gemma'],
              },
            ],
          },
        ],
      },
    };

    it('zeigt Original und Geltendes, bietet nur passende Modelle an und meldet den Hinweis', async () => {
      antworteM5({ '/apps/beispielapp/schritt-modelle': SCHRITTE });
      apiMock.put.mockResolvedValue({ data: {} });
      await oeffneApp();
      const zeile = await screen.findByTestId('schritt-modell-freigabe-erkennen');
      expect(zeile).toHaveAttribute('data-herkunft', 'standard_weil_fehlt');
      expect(screen.getByTestId('schritt-original-freigabe-erkennen')).toHaveTextContent(
        'Original: llama9:70b'
      );
      expect(zeile).toHaveTextContent('Braucht: Bild, Werkzeuge');
      expect(screen.getByTestId('schritt-hinweis-freigabe-erkennen')).toHaveTextContent(
        'liegt nicht am Gerät'
      );
      // Qwen läuft, erfüllt aber nicht alle Fähigkeiten: steht nur gesperrt da.
      fireEvent.click(screen.getByTestId('schritt-modell-wahl-freigabe-erkennen'));
      expect(
        (await screen.findAllByText(/Qwen 27B \(erfüllt nicht alle Fähigkeiten\)/)).length
      ).toBeGreaterThan(0);
      fireEvent.click(await screen.findByTestId('schritt-modell-freigabe-erkennen-gemma'));
      await waitFor(() =>
        expect(apiMock.put).toHaveBeenCalledWith(
          '/apps/beispielapp/flows/freigabe/schritte/erkennen/modell',
          { modell: 'gemma' }
        )
      );
    });

    it('ohne Schritt mit Modell steht ein Satz da', async () => {
      antworteM5({
        '/apps/beispielapp/schritt-modelle': {
          data: { standard: 'qwen', modelle: [], flows: [] },
        },
      });
      await oeffneApp();
      expect(await screen.findByTestId('schritt-modelle-leer')).toBeTruthy();
    });
  });
});
