/**
 * Der Bereich Daten der Verwaltung (M5): Auskunft je Person, Person löschen mit
 * Bestätigung durch den Namen, und rot nur im abgesetzten Teil.
 *
 * Gemessen wird, was der Auftrag verlangt: die Auskunft geht an
 * `GET /api/gdpr/export?benutzer=<id>`; „Person löschen" bleibt gesperrt, bis
 * der Name genau getippt ist, und geht an `DELETE /api/benutzer/:id`; das
 * eigene Konto steht in der Löschliste nicht; kein roter Knopf außerhalb des
 * abgesetzten Teils. Sicherung und Werksreset haben eigene Tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DatenSettings } from '../DatenSettings';
import type { Benutzer } from '../personen/usePersonen';

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

// Die Sicherung hat ihren eigenen Test; hier steht sie nur als Platz.
vi.mock('../../system/sicherung/Sicherung', () => ({
  Sicherung: () => <div data-testid="sicherung-seite">Sicherung</div>,
}));

const person = (id: string, username: string, vorname: string, nachname: string): Benutzer => ({
  id,
  username,
  email: username,
  role: 'mitarbeiter',
  is_active: true,
  passwort_vom_admin: false,
  created_at: '2026-08-27T10:00:00.000Z',
  last_login: null,
  vorname,
  nachname,
  funktion: null,
  kuerzel: null,
  hat_bild: false,
});

// Der angemeldete Administrator aus dem authMock hat die Kennung 1.
const ADMIN = { ...person('1', 'admin', 'Ada', 'Admin'), role: 'admin' as const };
const MIA = person('7', 'mia@firma.de', 'Mia', 'Muster');

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function antworte() {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/benutzer') return { data: [ADMIN, MIA] };
    if (pfad.startsWith('/gdpr/categories')) {
      return {
        categories: [
          { name: 'Profil', description: 'Benutzername, E-Mail', count: 1 },
          { name: 'Flow-Läufe', description: 'Selbst gestartete Flows', count: 12 },
        ],
      };
    }
    if (pfad === '/gdpr/ziele')
      return { data: { medien: [], hinweis: 'Keine Platte angesteckt.' } };
    if (pfad.startsWith('/werksreset/vorschau')) return {};
    return {};
  });
}

/** Wählt in einem Radix-Select die Person mit diesem Namen. */
async function waehle(testid: string, name: RegExp) {
  const nutzer = userEvent.setup();
  await nutzer.click(await screen.findByTestId(testid));
  await nutzer.click(await screen.findByRole('option', { name }));
  return nutzer;
}

describe('DatenSettings', () => {
  beforeEach(() => {
    Object.values(apiMock).forEach(f => f.mockReset());
    Object.values(toast).forEach(f => f.mockReset());
    antworte();
  });

  it('zeigt Sicherung, Auskunft und abgesetzt Löschen und Werksreset', async () => {
    render(<DatenSettings />, { wrapper: huelle() });

    expect(screen.getByRole('heading', { level: 1, name: 'Daten' })).toBeInTheDocument();
    expect(screen.getByTestId('sicherung-seite')).toBeInTheDocument();
    expect(screen.getByTestId('auskunft')).toBeInTheDocument();
    const gefahr = screen.getByTestId('daten-gefahr');
    expect(within(gefahr).getByTestId('person-loeschen')).toBeInTheDocument();
    expect(within(gefahr).getByTestId('werksreset')).toBeInTheDocument();
    // Die Auskunft steht NICHT im abgesetzten Teil.
    expect(within(gefahr).queryByTestId('auskunft')).not.toBeInTheDocument();
  });

  it('die Auskunft zählt je Kategorie und lädt über die gewählte Person', async () => {
    render(<DatenSettings />, { wrapper: huelle() });

    // Vorgewählt ist der Angemeldete.
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith('/gdpr/categories?benutzer=1', expect.anything())
    );
    const nutzer = await waehle('auskunft-person', /Mia Muster/);
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith('/gdpr/categories?benutzer=7', expect.anything())
    );
    expect(await screen.findByText('Flow-Läufe')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    URL.createObjectURL = vi.fn().mockReturnValue('blob:x');
    URL.revokeObjectURL = vi.fn();
    apiMock.get.mockImplementation(async (pfad: string) =>
      pfad.startsWith('/gdpr/export')
        ? { blob: async () => new Blob(['{}']) }
        : pfad === '/benutzer'
          ? { data: [ADMIN, MIA] }
          : {}
    );
    await nutzer.click(screen.getByTestId('auskunft-herunterladen'));
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith(
        '/gdpr/export?benutzer=7',
        expect.objectContaining({ raw: true })
      )
    );
  });

  it('das eigene Konto steht in der Löschliste nicht', async () => {
    render(<DatenSettings />, { wrapper: huelle() });
    const nutzer = userEvent.setup();
    await nutzer.click(await screen.findByTestId('loeschen-person'));
    expect(await screen.findByRole('option', { name: /Mia Muster/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Ada Admin/ })).not.toBeInTheDocument();
  });

  it('Person löschen bleibt gesperrt, bis der Name genau getippt ist', async () => {
    apiMock.del.mockResolvedValue({ deleted: true, zugangBleibt: false });
    render(<DatenSettings />, { wrapper: huelle() });

    expect(screen.getByTestId('loeschen-oeffnen')).toBeDisabled();
    const nutzer = await waehle('loeschen-person', /Mia Muster/);
    await nutzer.click(screen.getByTestId('loeschen-oeffnen'));

    const bestaetigen = await screen.findByTestId('loeschen-bestaetigen');
    expect(bestaetigen).toBeDisabled();
    fireEvent.change(screen.getByTestId('loeschen-eingabe'), { target: { value: 'Mia Muste' } });
    expect(bestaetigen).toBeDisabled();
    fireEvent.change(screen.getByTestId('loeschen-eingabe'), { target: { value: 'Mia Muster' } });
    expect(bestaetigen).toBeEnabled();
    expect(apiMock.del).not.toHaveBeenCalled();

    await nutzer.click(bestaetigen);
    await waitFor(() => expect(apiMock.del).toHaveBeenCalledWith('/benutzer/7'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Mia Muster gelöscht'));
  });

  it('rot ist im Ruhezustand nur der abgesetzte Teil', async () => {
    const { container } = render(<DatenSettings />, { wrapper: huelle() });
    await screen.findByTestId('auskunft');
    const gefahr = screen.getByTestId('daten-gefahr');
    // Nur Klassen, die im Ruhezustand färben: `bg-destructive`, nicht
    // `aria-invalid:ring-destructive` oder `hover:bg-destructive/90`.
    const rot = Array.from(container.querySelectorAll('*')).filter(el =>
      Array.from(el.classList).some(k => /^(bg|text|border)-destructive/.test(k))
    );
    expect(rot.length).toBeGreaterThan(0);
    const ausserhalb = rot.filter(el => !gefahr.contains(el));
    expect(ausserhalb).toEqual([]);
  });
});
