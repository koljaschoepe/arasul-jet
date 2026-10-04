/**
 * Die Verwaltung der Personen (M5, ersetzt die der Mitarbeiter aus Phase D3).
 *
 * Gemessen wird, was der Auftrag verlangt: die Liste steht und sagt, wer sein
 * STARTPASSWORT noch trägt; das eigene Konto trägt keine Knöpfe; eine neue
 * Person (Vorname, Nachname, E-Mail) geht an `POST /api/benutzer`, ihr
 * Startpasswort steht einmal im Dialog; der Schalter „Verwaltung" geht an
 * `PUT /api/benutzer/:id/verwaltung` und fehlt beim letzten Administrator;
 * Freigaben sind zwei Tabellen, Apps (Schalter) und Ordner (Stufe).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PersonenSettings } from '../PersonenSettings';
import type { Benutzer } from '../personen/usePersonen';

// Radix' Select braucht zwei Dinge, die jsdom nicht hat.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.releasePointerCapture = vi.fn();
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
vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));

/**
 * Die Kennungen kommen als ZEICHENKETTE aus der Datenbank (`int8` über
 * node-postgres). Genau so stehen sie hier, sonst misst der Test etwas
 * anderes als das Gerät liefert.
 */
const ADMIN: Benutzer = {
  id: '1',
  username: 'admin',
  email: null,
  role: 'admin' as const,
  is_active: true,
  passwort_vom_admin: false,
  created_at: '2026-08-01T10:00:00.000Z',
  last_login: '2026-08-28T08:00:00.000Z',
  vorname: 'Ada',
  nachname: 'Admin',
  funktion: 'Geschäftsführung',
  kuerzel: 'AA',
  hat_bild: false,
};
const MIA: Benutzer = {
  id: '7',
  username: 'mia',
  email: 'mia@firma.de',
  role: 'mitarbeiter' as const,
  is_active: true,
  passwort_vom_admin: true,
  created_at: '2026-08-27T10:00:00.000Z',
  last_login: null,
  vorname: 'Mia',
  nachname: 'Muster',
  funktion: null,
  kuerzel: null,
  hat_bild: false,
};

const APPS = [
  {
    id: 'urlaubsantrag',
    name: 'Urlaubsantrag',
    beschreibung: null,
    staende: { test: null, live: { version: '1.0.0' } },
  },
];

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Alle drei Abfragen der Seite auf einmal bedienen. */
const ORDNER = [
  {
    id: '2',
    kennung: 'projekte',
    name: 'Projekte',
    ebene: 1,
    eltern_id: null,
    eltern_kennung: null,
    art: 'geteilt',
    raum_id: 'r-p',
    pfad: 'projekte',
    angelegt_am: '2026-09-22T10:00:00.000Z',
    rechte_anzahl: 0,
  },
];

function antworte({
  benutzer = [ADMIN, MIA],
  freigaben = [] as unknown[],
  ordner = [] as unknown[],
  firmenordnerAn = false,
} = {}) {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/benutzer') return { data: benutzer };
    if (pfad === '/apps') return { data: APPS };
    if (pfad === '/freigaben') return { data: freigaben };
    if (pfad === '/firmenordner/ordner') return { data: ordner, zustand: { an: firmenordnerAn } };
    if (pfad === '/firmenordner/rechte') return { data: [] };
    return {};
  });
}

describe('PersonenSettings', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.put.mockReset();
    apiMock.del.mockReset();
    toast.success.mockReset();
  });

  it('zeigt die Menschen und sagt, wer sein Startpasswort noch traegt', async () => {
    antworte();
    render(<PersonenSettings />, { wrapper: huelle() });

    expect(await screen.findByTestId('person-mia')).toBeInTheDocument();
    expect(screen.getByTestId('startpasswort-mia')).toHaveTextContent('Startpasswort');
    // Der Administrator hat sein Passwort selbst gewählt.
    expect(screen.queryByTestId('startpasswort-admin')).not.toBeInTheDocument();
  });

  /**
   * Das eigene Konto trägt keine Knöpfe: alle drei Wege lehnt das Backend für
   * einen selbst ab. Ein Knopf, der sicher scheitert, ist eine Sackgasse.
   */
  it('bietet fuer das eigene Konto keine Aktionen an', async () => {
    antworte();
    render(<PersonenSettings />, { wrapper: huelle() });

    await screen.findByTestId('person-admin');
    expect(screen.queryByTestId('loeschen-admin')).not.toBeInTheDocument();
    // Löschen gibt es nur im Bereich Daten, nicht mehr in der Liste.
    expect(screen.queryByTestId('loeschen-mia')).not.toBeInTheDocument();
  });

  it('zeigt Vor- und Nachname statt der E-Mail und die Funktion darunter', async () => {
    antworte();
    render(<PersonenSettings />, { wrapper: huelle() });

    const zeile = await screen.findByTestId('person-admin');
    expect(zeile).toHaveTextContent('Ada Admin');
    expect(zeile).toHaveTextContent('Geschäftsführung');
    expect(screen.getByTestId('person-mia')).toHaveTextContent('Mia Muster');
  });

  it('legt eine Person an, schickt sie an POST /benutzer und zeigt das Startpasswort einmal', async () => {
    antworte();
    apiMock.post.mockResolvedValue({
      data: { ...MIA, id: '8', username: 'noah@firma.de', email: 'noah@firma.de', vorname: 'Noah' },
      startpasswort: 'k4mt-x9ra-hw3e',
    });
    render(<PersonenSettings />, { wrapper: huelle() });

    await screen.findByTestId('person-mia');
    fireEvent.click(screen.getByTestId('person-anlegen-oeffnen'));

    fireEvent.change(await screen.findByLabelText('Vorname'), { target: { value: 'Noah' } });
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Nord' } });
    fireEvent.change(screen.getByLabelText('E-Mail'), { target: { value: 'noah@firma.de' } });
    fireEvent.click(screen.getByTestId('person-anlegen-absenden'));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/benutzer', {
        vorname: 'Noah',
        nachname: 'Nord',
        email: 'noah@firma.de',
      })
    );
    expect(await screen.findByTestId('startpasswort-wert')).toHaveTextContent('k4mt-x9ra-hw3e');
    // Es gibt den Zettel zum Drucken, und der Dialog schliesst nur mit „Fertig".
    expect(screen.getByTestId('startpasswort-drucken')).toBeInTheDocument();
    expect(screen.getByTestId('startpasswort-zettel')).toHaveTextContent('k4mt-x9ra-hw3e');
    fireEvent.click(screen.getByTestId('startpasswort-fertig'));
    await waitFor(() => expect(screen.queryByTestId('startpasswort-wert')).not.toBeInTheDocument());
  });

  it('verlangt Vorname, Nachname und eine E-Mail, bevor angelegt wird', async () => {
    antworte();
    render(<PersonenSettings />, { wrapper: huelle() });

    await screen.findByTestId('person-mia');
    fireEvent.click(screen.getByTestId('person-anlegen-oeffnen'));
    fireEvent.change(await screen.findByLabelText('Vorname'), { target: { value: 'Noah' } });
    expect(screen.getByTestId('person-anlegen-absenden')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Nord' } });
    fireEvent.change(screen.getByLabelText('E-Mail'), { target: { value: 'keine-adresse' } });
    expect(screen.getByTestId('person-anlegen-absenden')).toBeDisabled();
  });

  it('erzeugt ein neues Startpasswort ueber PUT /benutzer/:id/passwort', async () => {
    antworte();
    apiMock.put.mockResolvedValue({
      data: { id: '7', username: 'mia' },
      startpasswort: 'abcd-efgh-jkmn',
    });
    render(<PersonenSettings />, { wrapper: huelle() });

    fireEvent.click(await screen.findByTestId('startpasswort-neu-mia'));
    fireEvent.click(await screen.findByRole('button', { name: 'Neu erzeugen' }));

    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith('/benutzer/7/passwort', {}));
    expect(await screen.findByTestId('startpasswort-wert')).toHaveTextContent('abcd-efgh-jkmn');
  });

  it('schaltet „Verwaltung" ueber PUT /benutzer/:id/verwaltung', async () => {
    antworte();
    apiMock.put.mockResolvedValue({ data: { ...MIA, role: 'admin' } });
    render(<PersonenSettings />, { wrapper: huelle() });

    const schalter = await screen.findByTestId('verwaltung-mia');
    expect(schalter).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(schalter);

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/benutzer/7/verwaltung', { verwaltung: true })
    );
  });

  it('laesst dem letzten Administrator das Recht: sein Schalter steht fest', async () => {
    antworte();
    render(<PersonenSettings />, { wrapper: huelle() });

    const schalter = await screen.findByTestId('verwaltung-admin');
    expect(schalter).toHaveAttribute('aria-checked', 'true');
    expect(schalter).toBeDisabled();
  });

  it('gibt dem zweiten Administrator einen Schalter, der etwas darf', async () => {
    antworte({ benutzer: [ADMIN, { ...MIA, role: 'admin' as const }] });
    render(<PersonenSettings />, { wrapper: huelle() });

    expect(await screen.findByTestId('verwaltung-mia')).toBeEnabled();
    expect(screen.getByTestId('verwaltung-admin')).toBeEnabled();
  });

  it('sperrt eine Person ueber PUT /benutzer/:id/aktiv, nach Bestaetigung', async () => {
    antworte();
    apiMock.put.mockResolvedValue({ data: { ...MIA, is_active: false } });
    render(<PersonenSettings />, { wrapper: huelle() });

    fireEvent.click(await screen.findByTestId('aktiv-mia'));
    fireEvent.click(await screen.findByRole('button', { name: 'Sperren' }));

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/benutzer/7/aktiv', { aktiv: false })
    );
  });

  it('zeigt die Freigaben der Apps mit fester erster Spalte und keine Ordnerrechte', async () => {
    antworte({ ordner: ORDNER, firmenordnerAn: true });
    render(<PersonenSettings />, { wrapper: huelle() });

    const apps = await screen.findByTestId('freigabe-matrix');
    const kopf = within(apps).getAllByRole('columnheader')[0];
    expect(kopf?.className).toMatch(/sticky/);
    const zeile = within(apps).getAllByRole('rowheader')[0];
    expect(zeile?.className).toMatch(/sticky/);
    expect(within(apps).getAllByRole('switch').length).toBeGreaterThan(0);
    // Die Stufen auf den Ordnern stehen genau einmal, im Bereich Firmenordner.
    expect(screen.queryByTestId('rechte-matrix')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recht-projekte-mia')).not.toBeInTheDocument();
    expect(screen.queryByText('Freigaben: Ordner')).not.toBeInTheDocument();
  });

  it('gibt eine App ueber die Matrix frei', async () => {
    antworte();
    apiMock.post.mockResolvedValue({});
    render(<PersonenSettings />, { wrapper: huelle() });

    const zelle = await screen.findByTestId('freigabe-urlaubsantrag-mia');
    // Ueber die Rolle und nicht ueber `querySelector('input')`: das Haekchen
    // ist seit H3 das Primitiv der Bibliothek (Radix), und das ist ein
    // `<button role="checkbox">` -- ein `<input>` legt Radix nur in einem
    // Formular an. Die Rolle ist ohnehin das, was der Mensch bedient.
    fireEvent.click(within(zelle).getByRole('switch'));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/freigaben', {
        app_id: 'urlaubsantrag',
        benutzer_id: '7',
        stand: 'live',
      })
    );
  });

  /**
   * Der Stand-Schalter erscheint nur bei bestehender Freigabe. Ohne ihn machte
   * ein Klick auf ein gesetztes Häkchen aus einem Tester still einen
   * gewöhnlichen Nutzer.
   */
  it('nimmt eine bestehende Freigabe zurueck und zeigt ihren Stand', async () => {
    antworte({
      freigaben: [
        {
          app_id: 'urlaubsantrag',
          user_id: '7',
          stand: 'test',
          app_name: 'Urlaubsantrag',
          username: 'mia',
          freigegeben_am: '2026-08-27T12:00:00.000Z',
        },
      ],
    });
    apiMock.del.mockResolvedValue({});
    render(<PersonenSettings />, { wrapper: huelle() });

    expect(await screen.findByTestId('freigabe-stand-urlaubsantrag-mia')).toHaveTextContent('Test');

    const zelle = screen.getByTestId('freigabe-urlaubsantrag-mia');
    // Ueber die Rolle und nicht ueber `querySelector('input')`: das Haekchen
    // ist seit H3 das Primitiv der Bibliothek (Radix), und das ist ein
    // `<button role="checkbox">` -- ein `<input>` legt Radix nur in einem
    // Formular an. Die Rolle ist ohnehin das, was der Mensch bedient.
    fireEvent.click(within(zelle).getByRole('switch'));

    await waitFor(() => expect(apiMock.del).toHaveBeenCalledWith('/freigaben/urlaubsantrag/7'));
  });
  /**
   * Phase D5, Fund der D4-Abnahme: bei 390 px stand die Verwaltung nicht. Die
   * Tabelle mit ihren sechs Spalten weicht dort einer Liste, und die Matrix
   * wird zu einer Gruppe je App. Dieselben Kennungen, dieselben Wege, nur
   * untereinander.
   */
  it('steht am Telefon als Liste, nicht als Tabelle', async () => {
    const echt = window.matchMedia;
    window.matchMedia = ((abfrage: string) =>
      ({
        matches: true,
        media: abfrage,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      antworte();
      render(<PersonenSettings />, { wrapper: huelle() });

      const liste = await screen.findByTestId('personen-liste');
      expect(liste.tagName).toBe('UL');
      expect(screen.getByTestId('person-mia')).toBeInTheDocument();
      expect(screen.getByTestId('startpasswort-mia')).toBeInTheDocument();

      // Die Matrix steht als Gruppe je App, und die Zelle heisst weiter gleich.
      const matrix = await screen.findByTestId('freigabe-matrix');
      expect(matrix.querySelector('table')).toBeNull();
      expect(screen.getByTestId('freigabe-urlaubsantrag-mia')).toBeInTheDocument();
    } finally {
      window.matchMedia = echt;
    }
  });
});
