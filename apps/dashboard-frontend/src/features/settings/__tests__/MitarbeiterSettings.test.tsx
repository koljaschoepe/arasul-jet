/**
 * Die Verwaltung der Mitarbeiter (Phase D3).
 *
 * Gemessen wird, was die Phase verlangt: die Liste steht, sie sagt wer sein
 * STARTPASSWORT noch trägt, das eigene Konto trägt keine Knöpfe, ein neuer
 * Mensch geht an `POST /api/benutzer`, ein gesetztes Passwort an
 * `PUT /api/benutzer/:id/passwort`, und ein Haken in der Matrix an
 * `POST /api/freigaben`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MitarbeiterSettings } from '../MitarbeiterSettings';

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
const ADMIN = {
  id: '1',
  username: 'admin',
  email: null,
  role: 'admin' as const,
  is_active: true,
  passwort_vom_admin: false,
  created_at: '2026-08-01T10:00:00.000Z',
  last_login: '2026-08-28T08:00:00.000Z',
};
const MIA = {
  id: '7',
  username: 'mia',
  email: 'mia@firma.de',
  role: 'mitarbeiter' as const,
  is_active: true,
  passwort_vom_admin: true,
  created_at: '2026-08-27T10:00:00.000Z',
  last_login: null,
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
function antworte({ benutzer = [ADMIN, MIA], freigaben = [] as unknown[] } = {}) {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/benutzer') return { data: benutzer };
    if (pfad === '/apps') return { data: APPS };
    if (pfad === '/freigaben') return { data: freigaben };
    return {};
  });
}

describe('MitarbeiterSettings', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.put.mockReset();
    apiMock.del.mockReset();
    toast.success.mockReset();
  });

  it('zeigt die Menschen und sagt, wer sein Startpasswort noch traegt', async () => {
    antworte();
    render(<MitarbeiterSettings />, { wrapper: huelle() });

    expect(await screen.findByTestId('mitarbeiter-mia')).toBeInTheDocument();
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
    render(<MitarbeiterSettings />, { wrapper: huelle() });

    await screen.findByTestId('mitarbeiter-admin');
    expect(screen.queryByTestId('loeschen-admin')).not.toBeInTheDocument();
    expect(screen.getByTestId('loeschen-mia')).toBeInTheDocument();
  });

  it('legt einen Menschen an und schickt ihn an POST /benutzer', async () => {
    antworte();
    apiMock.post.mockResolvedValue({ data: { ...MIA, id: '8', username: 'noah' } });
    render(<MitarbeiterSettings />, { wrapper: huelle() });

    await screen.findByTestId('mitarbeiter-mia');
    fireEvent.click(screen.getByTestId('mitarbeiter-anlegen-oeffnen'));

    fireEvent.change(await screen.findByLabelText('Benutzername'), {
      target: { value: 'noah' },
    });
    fireEvent.change(screen.getByLabelText('Startpasswort'), {
      target: { value: 'geheim-genug' },
    });
    fireEvent.click(screen.getByTestId('mitarbeiter-anlegen-absenden'));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/benutzer', {
        username: 'noah',
        password: 'geheim-genug',
        rolle: 'mitarbeiter',
      })
    );
  });

  it('setzt ein Startpasswort ueber PUT /benutzer/:id/passwort', async () => {
    antworte();
    apiMock.put.mockResolvedValue({ data: { id: '7', username: 'mia' } });
    render(<MitarbeiterSettings />, { wrapper: huelle() });

    fireEvent.click(await screen.findByTestId('passwort-mia'));
    fireEvent.change(await screen.findByLabelText('Neues Startpasswort'), {
      target: { value: 'neues-startpasswort' },
    });
    fireEvent.click(screen.getByTestId('passwort-setzen-absenden'));

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/benutzer/7/passwort', {
        password: 'neues-startpasswort',
      })
    );
  });

  it('gibt eine App ueber die Matrix frei', async () => {
    antworte();
    apiMock.post.mockResolvedValue({});
    render(<MitarbeiterSettings />, { wrapper: huelle() });

    const zelle = await screen.findByTestId('freigabe-urlaubsantrag-mia');
    fireEvent.click(zelle.querySelector('input') as HTMLInputElement);

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
    render(<MitarbeiterSettings />, { wrapper: huelle() });

    expect(await screen.findByTestId('freigabe-stand-urlaubsantrag-mia')).toHaveTextContent('Test');

    const zelle = screen.getByTestId('freigabe-urlaubsantrag-mia');
    fireEvent.click(zelle.querySelector('input') as HTMLInputElement);

    await waitFor(() => expect(apiMock.del).toHaveBeenCalledWith('/freigaben/urlaubsantrag/7'));
  });
});
