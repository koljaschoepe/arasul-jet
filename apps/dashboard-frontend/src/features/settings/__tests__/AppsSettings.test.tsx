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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AppsSettings } from '../AppsSettings';

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

const APP_ZEILE = {
  id: 'beispielapp',
  name: 'Beispielapp',
  beschreibung: 'Die kleinste App.',
  staende: { test: { version: '1.1.0' }, live: { version: '1.0.0' } },
};

const FLOW = {
  name: 'freigabe',
  beschreibung: 'Holt vor dem Versand eine Freigabe ein.',
  argumente: [],
  modell: 'aus-dem-paket',
  modell_ueberschrieben: false,
  extern: null,
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
    live: { version: '1.0.0', lieferbar: false, mangel: 'Das Frontend fehlt am Geraet.' },
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
    expect(zeile).toHaveTextContent('live 1.0.0');
    expect(zeile).toHaveTextContent('test 1.1.0');
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

  it('schaltet den Teststand live', async () => {
    antworte();
    apiMock.post.mockResolvedValue({ data: { stand: 'live', version: '1.1.0' } });
    await oeffneApp();

    fireEvent.click(screen.getByTestId('schalten-live'));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/apps/beispielapp/schalten', { ziel: 'live' })
    );
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

  it('nimmt die Ueberschreibung mit „aus dem Paket" wieder zurueck', async () => {
    antworte();
    apiMock.put.mockResolvedValue({ data: {} });
    await oeffneApp();

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

    fireEvent.click(await screen.findByTestId('flow-modell-freigabe'));
    fireEvent.click(screen.getByTestId('modell-quelle-extern'));
    fireEvent.change(screen.getByLabelText('Anbieter'), { target: { value: 'OpenAI' } });
    expect(screen.getByTestId('modell-absenden')).toBeDisabled();
  });

  it('liest einen Lauf mit Schritten UND Gedankengang', async () => {
    antworte();
    await oeffneApp();

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
  });

  it('zeigt die Flow-Datei samt Auftrag an das Modell', async () => {
    antworte();
    await oeffneApp();

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
