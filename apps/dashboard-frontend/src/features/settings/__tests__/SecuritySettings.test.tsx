/**
 * Der Weg zum Gerätezertifikat (Phase C10).
 *
 * Warum genau diese drei Fälle: das CA-Zertifikat ist die einzige Antwort auf
 * die Warnung, die jeder Mitarbeiter beim ersten Aufruf sieht. Ein Knopf, der
 * stillschweigend nichts tut, wäre schlimmer als kein Knopf — dann sucht der
 * Admin den Fehler beim Browser.
 *
 * 1. Der Knopf holt die Datei und legt sie als `arasul-ca.crt` ab.
 * 2. Ein Gerät ohne CA (404) sagt das, statt eine leere Datei zu speichern.
 * 3. Ohne Adminrechte (403) steht der Grund da.
 */

import React from 'react';
import type { Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../../contexts/ToastContext';
import { SecuritySettings } from '../SecuritySettings';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn(() => Promise.resolve()) }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Die Passwortverwaltung hat eine eigene Abnahme; hier steht sie nur im Weg
// (sie holt beim Aufbau ihre Passwortregeln).
vi.mock('../PasswordManagement', () => ({
  default: () => <div data-testid="passwortverwaltung" />,
}));

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
let fetchMock: Mock<FetchImpl>;

function aufbauen() {
  return render(
    <ToastProvider>
      <SecuritySettings handleLogout={vi.fn()} loggingOutAll={false} onLogoutAll={vi.fn()} />
    </ToastProvider>
  );
}

describe('SecuritySettings: Gerätezertifikat', () => {
  let angelegt: HTMLAnchorElement | null;

  beforeEach(() => {
    angelegt = null;
    fetchMock = vi.fn() as Mock<FetchImpl>;
    global.fetch = fetchMock as unknown as typeof fetch;

    // jsdom kennt weder createObjectURL noch einen echten Download.
    global.URL.createObjectURL = vi.fn(() => 'blob:zertifikat');
    global.URL.revokeObjectURL = vi.fn();

    const echtesAnlegen = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = echtesAnlegen(tag);
      if (tag === 'a') {
        angelegt = element as HTMLAnchorElement;
        (element as HTMLAnchorElement).click = vi.fn();
      }
      return element;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lädt das CA-Zertifikat als arasul-ca.crt', async () => {
    fetchMock.mockResolvedValue(
      new Response('-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n', {
        status: 200,
      })
    );

    aufbauen();
    await userEvent.click(screen.getByRole('button', { name: /Zertifikat herunterladen/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/system/ca-zertifikat');
    await waitFor(() => {
      expect(angelegt?.download).toBe('arasul-ca.crt');
    });
    expect(angelegt?.click).toHaveBeenCalled();
  });

  it('sagt es, wenn das Gerät noch keine CA hat', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'keine CA' } }), {
        status: 404,
      })
    );

    aufbauen();
    await userEvent.click(screen.getByRole('button', { name: /Zertifikat herunterladen/i }));

    expect(await screen.findByText(/noch kein CA-Zertifikat/i)).toBeInTheDocument();
    expect(angelegt).toBeNull();
  });

  it('nennt den Grund, wenn die Rolle nicht reicht', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'nur Admins' } }), {
        status: 403,
      })
    );

    aufbauen();
    await userEvent.click(screen.getByRole('button', { name: /Zertifikat herunterladen/i }));

    expect(await screen.findByText(/Nur Admins/i)).toBeInTheDocument();
  });
});
