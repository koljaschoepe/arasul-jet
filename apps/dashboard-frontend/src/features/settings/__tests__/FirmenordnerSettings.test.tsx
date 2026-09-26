/**
 * Der Firmenordner in den Einstellungen (Auftrag
 * firmenordner-rechte-im-frontend, 22.09.2026).
 *
 * Gemessen wird, was der Auftrag verlangt: der Baum steht mit Kennung, Name
 * und Art; ein Ordner am Gerät hat keine Rechtespalte, die Wurzel auch nicht;
 * eine Stufe in der Matrix geht als dieselbe Zeile an
 * `POST /api/firmenordner/rechte`, „keine" als DELETE; ein 409 des Backends
 * steht als Satz mit dem Ausweg unter der Matrix; ein Gerät ohne
 * Firmenordner sagt das, statt eine leere Liste zu zeigen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { FirmenordnerSettings } from '../FirmenordnerSettings';

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

// Radix' Select braucht zwei Dinge, die jsdom nicht hat.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.releasePointerCapture = vi.fn();
});

const ADMIN = {
  id: '1',
  username: 'admin',
  email: null,
  role: 'admin' as const,
  is_active: true,
  passwort_vom_admin: false,
  created_at: '2026-08-01T10:00:00.000Z',
  last_login: null,
};
const MIA = { ...ADMIN, id: '7', username: 'mia', role: 'mitarbeiter' as const };

const WURZEL = {
  id: '1',
  kennung: 'firma',
  name: 'Firma',
  ebene: 0,
  eltern_id: null,
  eltern_kennung: null,
  art: 'wurzel',
  raum_id: 'r-w',
  pfad: '',
  angelegt_am: '2026-09-22T10:00:00.000Z',
  rechte_anzahl: 0,
};
const PROJEKTE = {
  ...WURZEL,
  id: '2',
  kennung: 'projekte',
  name: 'Projekte',
  ebene: 1,
  art: 'geteilt',
  raum_id: 'r-p',
};
const VICONA = {
  ...PROJEKTE,
  id: '3',
  kennung: 'vicona',
  name: 'Vicona',
  ebene: 2,
  eltern_id: '2',
  eltern_kennung: 'projekte',
  pfad: 'vicona',
};
const GERAET = {
  ...PROJEKTE,
  id: '4',
  kennung: 'geraet',
  name: 'Am Gerät',
  art: 'am_geraet',
  raum_id: 'r-g',
};

const ZUSTAND = {
  an: true,
  erreichbar: true,
  grund: null,
  adresse: 'https://arasul:8443',
  ordner: 4,
  am_geraet: 1,
  nutzer: 2,
  nutzer_offen: 0,
  rechte: 0,
  rechte_offen: 0,
  wurzel: 'firma',
};

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function antworte({
  ordner = [WURZEL, PROJEKTE, VICONA, GERAET] as unknown[],
  zustand = ZUSTAND as unknown,
  rechte = [] as unknown[],
} = {}) {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/firmenordner/ordner') return { data: ordner, zustand };
    if (pfad === '/firmenordner/rechte') return { data: rechte };
    if (pfad === '/benutzer') return { data: [ADMIN, MIA] };
    if (pfad.endsWith('/aenderungen')) {
      return {
        data: {
          ordner: 'projekte',
          aenderungen: [
            {
              wann: '2026-09-22T17:59:22Z',
              wer: 'mia',
              text: 'mia added angebot.md to projekte',
              datei: 'angebot.md',
            },
          ],
        },
      };
    }
    return {};
  });
}

/** Ein Auswahlfeld von Radix öffnen und einen Eintrag wählen — über die Tastatur, jsdom kennt keine Zeiger. */
async function waehle(zelle: string, eintrag: string) {
  const trigger = screen.getByTestId(zelle);
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const option = await screen.findByTestId(`${zelle}-${eintrag}`);
  fireEvent.keyDown(option, { key: 'Enter' });
}

describe('FirmenordnerSettings', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.del.mockReset();
    toast.success.mockReset();
  });

  it('zeigt den Baum mit Kennung, Name und Art -- die Wurzel zuerst', async () => {
    antworte();
    render(<FirmenordnerSettings />, { wrapper: huelle() });

    const baum = await screen.findByTestId('ordner-baum');
    const zeilen = within(baum).getAllByTestId(/^ordner-(firma|projekte|vicona|geraet)$/);
    expect(zeilen.map(z => z.getAttribute('data-testid'))).toEqual([
      'ordner-firma',
      'ordner-projekte',
      'ordner-vicona',
      'ordner-geraet',
    ]);
    expect(within(baum).getByTestId('ordner-vicona')).toHaveTextContent('projekte/vicona');
    expect(within(baum).getByTestId('ordner-art-geraet')).toHaveTextContent('am Gerät');
    expect(within(baum).getByTestId('ordner-art-firma')).toHaveTextContent('Hauptordner');
  });

  it('gibt einem Ordner am Geraet und der Wurzel keine Rechtespalte', async () => {
    antworte();
    render(<FirmenordnerSettings />, { wrapper: huelle() });

    await screen.findByTestId('rechte-matrix');
    expect(screen.getByTestId('recht-projekte-mia')).toBeInTheDocument();
    expect(screen.getByTestId('recht-vicona-mia')).toBeInTheDocument();
    expect(screen.queryByTestId('recht-geraet-mia')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recht-firma-mia')).not.toBeInTheDocument();
  });

  it('schickt eine Stufe als dieselbe Zeile an POST /firmenordner/rechte', async () => {
    antworte();
    apiMock.post.mockResolvedValue({ data: { neu: true } });
    render(<FirmenordnerSettings />, { wrapper: huelle() });

    await screen.findByTestId('rechte-matrix');
    await waehle('recht-projekte-mia', 'lesen');

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        '/firmenordner/rechte',
        { ordner_id: '2', benutzer_id: '7', recht: 'lesen' },
        { showError: false }
      )
    );
  });

  it('nimmt „keine" als DELETE zurueck', async () => {
    antworte({
      rechte: [
        {
          ordner_id: '2',
          user_id: '7',
          recht: 'lesen',
          erteilt_am: '',
          abgleich_offen: null,
          ordner_kennung: 'projekte',
          ebene: 1,
          art: 'geteilt',
          eltern_kennung: null,
          username: 'mia',
        },
      ],
    });
    apiMock.del.mockResolvedValue({});
    render(<FirmenordnerSettings />, { wrapper: huelle() });

    await screen.findByTestId('rechte-matrix');
    // Vererbt: das Projekt darunter sagt „wie oben: lesen".
    fireEvent.keyDown(screen.getByTestId('recht-vicona-mia'), { key: 'Enter' });
    expect(await screen.findByTestId('recht-vicona-mia-keine')).toHaveTextContent(
      'wie oben: lesen'
    );
    fireEvent.keyDown(screen.getByTestId('recht-vicona-mia-keine'), { key: 'Escape' });

    await waehle('recht-projekte-mia', 'keine');
    await waitFor(() =>
      expect(apiMock.del).toHaveBeenCalledWith('/firmenordner/rechte/2/7', { showError: false })
    );
  });

  it('zeigt die 409-Antwort des Backends als Satz mit dem Ausweg', async () => {
    antworte({
      rechte: [
        {
          ordner_id: '2',
          user_id: '7',
          recht: 'schreiben',
          erteilt_am: '',
          abgleich_offen: null,
          ordner_kennung: 'projekte',
          ebene: 1,
          art: 'geteilt',
          eltern_kennung: null,
          username: 'mia',
        },
      ],
    });
    const fehler = Object.assign(
      new Error(
        'mia hat auf „projekte" schon „schreiben", und ein Recht wird nie unterhalb wieder entzogen. „lesen" auf „vicona" waere weniger. Nehmen Sie stattdessen das Recht auf „projekte" zurueck und vergeben Sie die Ordner darunter einzeln.'
      ),
      { status: 409, code: 'CONFLICT' }
    );
    apiMock.post.mockRejectedValue(fehler);
    render(<FirmenordnerSettings />, { wrapper: huelle() });

    await screen.findByTestId('rechte-matrix');
    await waehle('recht-vicona-mia', 'lesen');

    const meldung = await screen.findByTestId('rechte-fehler');
    expect(meldung).toHaveTextContent('nie unterhalb wieder entzogen');
    expect(meldung).toHaveTextContent('einzeln');
  });

  it('legt einen Bereich ueber POST /firmenordner/ordner an', async () => {
    antworte();
    apiMock.post.mockResolvedValue({ data: { ...PROJEKTE, kennung: 'kunden', name: 'Kunden' } });
    render(<FirmenordnerSettings />, { wrapper: huelle() });

    await screen.findByTestId('ordner-baum');
    fireEvent.click(screen.getByTestId('ordner-anlegen-oeffnen'));
    fireEvent.change(await screen.findByTestId('ordner-kennung'), { target: { value: 'Kunden' } });
    fireEvent.change(screen.getByTestId('ordner-name'), { target: { value: 'Kunden' } });
    fireEvent.click(screen.getByTestId('ordner-anlegen-absenden'));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/firmenordner/ordner', {
        kennung: 'kunden',
        name: 'Kunden',
        ebene: 1,
        art: 'geteilt',
      })
    );
  });

  it('wirft nur mit abgetippter Kennung weg, und die geht als Abfrage mit', async () => {
    antworte();
    apiMock.del.mockResolvedValue({});
    render(<FirmenordnerSettings />, { wrapper: huelle() });

    await screen.findByTestId('ordner-baum');
    fireEvent.click(screen.getByTestId('ordner-wegwerfen-vicona'));
    const knopf = await screen.findByTestId('ordner-wegwerfen-absenden');
    expect(knopf).toBeDisabled();
    fireEvent.change(screen.getByTestId('ordner-wegwerfen-kennung'), {
      target: { value: 'vicona' },
    });
    expect(knopf).toBeEnabled();
    fireEvent.click(knopf);

    await waitFor(() =>
      expect(apiMock.del).toHaveBeenCalledWith(
        '/firmenordner/ordner/3?kennung=vicona',
        expect.objectContaining({ showError: false })
      )
    );
  });

  it('zeigt je Ordner, wer zuletzt wann etwas geaendert hat', async () => {
    antworte();
    render(<FirmenordnerSettings />, { wrapper: huelle() });

    await screen.findByTestId('ordner-baum');
    fireEvent.click(screen.getByTestId('ordner-aenderungen-projekte'));
    const liste = await screen.findByTestId('ordner-aenderungen');
    expect(await within(liste).findByTestId('aenderung')).toHaveTextContent('mia');
    expect(within(liste).getByTestId('aenderung')).toHaveTextContent('angebot.md');
    expect(apiMock.get).toHaveBeenCalledWith('/firmenordner/ordner/2/aenderungen');
  });

  it('bietet die Wurzel an, solange es keine gibt', async () => {
    antworte({ ordner: [PROJEKTE], zustand: { ...ZUSTAND, wurzel: null } });
    apiMock.post.mockResolvedValue({ data: WURZEL });
    render(<FirmenordnerSettings />, { wrapper: huelle() });

    fireEvent.click(await screen.findByTestId('wurzel-anlegen'));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/firmenordner/ordner', {
        kennung: 'firma',
        name: 'Firma',
        ebene: 0,
        art: 'wurzel',
      })
    );
  });

  it('sagt „kein Firmenordner" statt eine leere Liste zu zeigen', async () => {
    antworte({ ordner: [], zustand: { ...ZUSTAND, an: false, erreichbar: false } });
    render(<FirmenordnerSettings />, { wrapper: huelle() });

    expect(await screen.findByText(/läuft kein Firmenordner/)).toBeInTheDocument();
    expect(screen.queryByTestId('ordner-anlegen-oeffnen')).not.toBeInTheDocument();
    // J35: kein Befehl, keine Umgebungsvariable, kein Pfad vor dem Menschen.
    expect(screen.getByTestId('firmenordner-seite').textContent).not.toMatch(
      /COMPOSE_PROFILES|docker|\.env|docs\//
    );
  });

  /**
   * J35: ein leerer Firmenordner zeigt die Einrichtung als nummerierte
   * Schritte, in der Reihenfolge, in der sie gehen -- und ohne die Woerter
   * Wurzel, Skills, Agents, CLI.
   */
  it('zeigt einem leeren Firmenordner drei nummerierte Schritte', async () => {
    antworte({ ordner: [], zustand: { ...ZUSTAND, wurzel: null, ordner: 0, am_geraet: 0 } });
    render(<FirmenordnerSettings />, { wrapper: huelle() });

    const schritte = await screen.findByTestId('firmenordner-schritte');
    expect(schritte.tagName).toBe('OL');
    const punkte = within(schritte).getAllByRole('listitem');
    expect(punkte.map(p => p.getAttribute('data-testid'))).toEqual([
      'schritt-hauptordner',
      'schritt-bereich',
      'schritt-rechte',
    ]);
    expect(punkte[0]).toHaveTextContent('1');
    expect(punkte[2]).toHaveTextContent('3');
    expect(screen.getByTestId('firmenordner-seite').textContent).not.toMatch(
      /Wurzel|Skills|Agents|CLI|Dateidienst/
    );
  });

  it('hakt den Hauptordner ab und laesst die Schritte weg, wenn alles steht', async () => {
    antworte({ ordner: [WURZEL] });
    const { unmount } = render(<FirmenordnerSettings />, { wrapper: huelle() });
    expect(await screen.findByTestId('schritt-hauptordner')).toHaveAttribute('data-erledigt', 'ja');
    expect(screen.queryByTestId('wurzel-anlegen')).not.toBeInTheDocument();
    unmount();

    antworte();
    render(<FirmenordnerSettings />, { wrapper: huelle() });
    await screen.findByTestId('ordner-baum');
    expect(screen.queryByTestId('firmenordner-schritte')).not.toBeInTheDocument();
  });

  /** J35: „Nachholen" steht nur da, wenn etwas offen ist -- und sagt, was. */
  it('bietet das Nachholen nur an, wenn etwas offen ist', async () => {
    antworte();
    const { unmount } = render(<FirmenordnerSettings />, { wrapper: huelle() });
    await screen.findByTestId('ordner-baum');
    expect(screen.queryByTestId('firmenordner-abgleich')).not.toBeInTheDocument();
    unmount();

    antworte({ zustand: { ...ZUSTAND, rechte_offen: 2 } });
    apiMock.post.mockResolvedValue({
      data: { an: true, nutzer: 0, raeume: 0, rechte: 2, offen: [] },
    });
    render(<FirmenordnerSettings />, { wrapper: huelle() });
    expect(await screen.findByTestId('firmenordner-offen')).toHaveTextContent('2 Änderungen');
    fireEvent.click(screen.getByTestId('firmenordner-abgleich'));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/firmenordner/abgleich'));
  });
});
