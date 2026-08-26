/**
 * PasswordManagement Component Tests
 *
 * Tests für PasswordManagement:
 * - Nur das Dashboard-Passwort (MinIO ist seit Phase B4 weg, der n8n-Hinweis seit B5)
 * - Formular-Rendering
 * - Password-Validierung
 * - Toggle-Sichtbarkeit
 * - Submit-Flow
 * - Fehlermeldungen
 */

import React from 'react';
import type { Mock } from 'vitest';
import { ToastProvider } from '../../../contexts/ToastContext';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordManagement from '../PasswordManagement';

// Mock AuthContext - useApi now requires AuthProvider.
// logout() must return a Promise: the dashboard flow calls logout().finally(...)
// inside a 2s setTimeout after a successful change.
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn(() => Promise.resolve()) }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const DASHBOARD_CURRENT_PLACEHOLDER = 'Dashboard-Passwort eingeben';
const NEW_PLACEHOLDER = 'Neues Passwort eingeben';
const CONFIRM_PLACEHOLDER = 'Neues Passwort bestätigen';

interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

const mockRequirements: PasswordRequirements = {
  minLength: 4,
  requireUppercase: false,
  requireLowercase: false,
  requireNumbers: false,
  requireSpecialChars: false,
};

// Typed fetch mock (assigned fresh in beforeEach), mirrors Settings.test.tsx
type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
let fetchMock: Mock<FetchImpl>;

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

/** Default fetch: password-requirements on GET, configurable POST result. */
function mockPasswordFetch(
  options: {
    requirements?: PasswordRequirements;
    postBody?: unknown;
    postStatus?: number;
  } = {}
) {
  const {
    requirements = mockRequirements,
    postBody = { message: 'Passwort erfolgreich geändert' },
    postStatus = 200,
  } = options;

  fetchMock.mockImplementation((_url, init) => {
    if (init?.method === 'POST') {
      return jsonResponse(postBody, postStatus);
    }
    return jsonResponse({ requirements });
  });
}

function renderPasswordManagement(props: { onDirtyChange?: (d: boolean) => void } = {}) {
  return render(
    <ToastProvider>
      <PasswordManagement {...props} />
    </ToastProvider>
  );
}

describe('PasswordManagement Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('arasul_token', 'test-token');
    fetchMock = vi.fn<FetchImpl>();
    global.fetch = fetchMock;
    mockPasswordFetch();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // =====================================================
  // Initial Rendering
  // =====================================================
  describe('Initial Rendering', () => {
    test('rendert Header mit Titel', async () => {
      renderPasswordManagement();

      expect(screen.getByText('Passwortverwaltung')).toBeInTheDocument();
    });

    test('rendert Beschreibung', async () => {
      renderPasswordManagement();

      expect(screen.getByText(/Ändere das Passwort für das Dashboard/)).toBeInTheDocument();
    });

    test('zeigt Lock-Icon', async () => {
      renderPasswordManagement();

      // Die Überschrift ist seit Plan 023 C1 ein Section-Baustein und damit
      // ein h2 unter dem einen h1 der Seite, vorher ein h3 ohne h2 darüber.
      const title = screen.getByRole('heading', { name: /Passwortverwaltung/ });
      expect(title.tagName).toBe('H2');
      expect(title.querySelector('svg')).toBeInTheDocument();
    });

    test('lädt Passwort-Anforderungen beim Mount', async () => {
      renderPasswordManagement();

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/settings/password-requirements',
          expect.objectContaining({
            headers: expect.any(Object),
          })
        );
      });
    });
  });

  // =====================================================
  // Ungespeicherte Aenderungen (F-41)
  // =====================================================
  // Bis Plan 023 C6 hat nur der KI-Bereich gemeldet, dass etwas im Formular
  // steht. Die Passwortverwaltung hielt eingetippte Felder ueber einen
  // Bereichswechsel hinweg, ohne dass die Kopfzeile davon wusste: wer die Seite
  // wechselte, verlor die Eingabe wortlos.
  describe('Ungespeicherte Änderungen', () => {
    test('meldet beim Laden, dass nichts eingetippt ist', async () => {
      const gemeldet = vi.fn();
      renderPasswordManagement({ onDirtyChange: gemeldet });
      await waitFor(() => expect(gemeldet).toHaveBeenCalledWith(false));
    });

    test('meldet eine Eingabe nach oben', async () => {
      const gemeldet = vi.fn();
      renderPasswordManagement({ onDirtyChange: gemeldet });
      const felder = await screen.findAllByPlaceholderText(/Passwort/i);
      await userEvent.type(felder[0]!, 'a');
      await waitFor(() => expect(gemeldet).toHaveBeenCalledWith(true));
    });

    test('meldet beim Verlassen wieder ab', async () => {
      const gemeldet = vi.fn();
      const { unmount } = renderPasswordManagement({ onDirtyChange: gemeldet });
      const felder = await screen.findAllByPlaceholderText(/Passwort/i);
      await userEvent.type(felder[0]!, 'a');
      await waitFor(() => expect(gemeldet).toHaveBeenCalledWith(true));
      gemeldet.mockClear();
      unmount();
      expect(gemeldet).toHaveBeenCalledWith(false);
    });
  });

  // =====================================================
  // Nur ein Dienst
  // =====================================================
  describe('Nur ein Dienst', () => {
    test('zeigt keinen Dienst-Selektor und keinen Fremddienst-Hinweis mehr', async () => {
      renderPasswordManagement();

      // Seit Phase B4 gibt es nur das Dashboard-Passwort: keine Tabs, kein MinIO.
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
      expect(screen.queryByText(/MinIO/)).not.toBeInTheDocument();
      expect(screen.queryByText(/n8n/)).not.toBeInTheDocument();
    });
  });

  // =====================================================
  // Form Fields
  // =====================================================
  describe('Form Fields', () => {
    test('zeigt Aktuelles-Passwort Feld', async () => {
      renderPasswordManagement();

      expect(screen.getByPlaceholderText(DASHBOARD_CURRENT_PLACEHOLDER)).toBeInTheDocument();
    });

    test('zeigt Neues-Passwort Feld', async () => {
      renderPasswordManagement();

      expect(screen.getByPlaceholderText(NEW_PLACEHOLDER)).toBeInTheDocument();
    });

    test('zeigt Passwort-Bestätigung Feld', async () => {
      renderPasswordManagement();

      expect(screen.getByPlaceholderText(CONFIRM_PLACEHOLDER)).toBeInTheDocument();
    });

    test('Felder sind initiell leer', async () => {
      renderPasswordManagement();

      expect(screen.getByPlaceholderText(DASHBOARD_CURRENT_PLACEHOLDER)).toHaveValue('');
      expect(screen.getByPlaceholderText(NEW_PLACEHOLDER)).toHaveValue('');
      expect(screen.getByPlaceholderText(CONFIRM_PLACEHOLDER)).toHaveValue('');
    });

    test('zeigt Hinweis für aktuelles Passwort', async () => {
      renderPasswordManagement();

      expect(
        screen.getByText(/Zur Sicherheit wird dein aktuelles Passwort benötigt/)
      ).toBeInTheDocument();
    });
  });

  // =====================================================
  // Password Visibility Toggle
  // =====================================================
  describe('Password Visibility Toggle', () => {
    test('Passwörter sind initial versteckt', async () => {
      renderPasswordManagement();

      const currentField = screen.getByPlaceholderText(DASHBOARD_CURRENT_PLACEHOLDER);
      expect(currentField).toHaveAttribute('type', 'password');
    });

    test('kann Aktuelles-Passwort sichtbar machen', async () => {
      const user = userEvent.setup();
      const { container } = renderPasswordManagement();

      const passwordFields = container.querySelectorAll('.relative');
      const toggleButtons = Array.from(passwordFields)
        .map(field => field.querySelector('button'))
        .filter((btn): btn is HTMLButtonElement => btn !== null);
      await user.click(toggleButtons[0]!);

      const currentField = screen.getByPlaceholderText(DASHBOARD_CURRENT_PLACEHOLDER);
      expect(currentField).toHaveAttribute('type', 'text');
    });

    test('kann Passwort wieder verstecken', async () => {
      const user = userEvent.setup();
      const { container } = renderPasswordManagement();

      const passwordFields = container.querySelectorAll('.relative');
      const toggleButtons = Array.from(passwordFields)
        .map(field => field.querySelector('button'))
        .filter((btn): btn is HTMLButtonElement => btn !== null);
      await user.click(toggleButtons[0]!); // Show
      await user.click(toggleButtons[0]!); // Hide

      const currentField = screen.getByPlaceholderText(DASHBOARD_CURRENT_PLACEHOLDER);
      expect(currentField).toHaveAttribute('type', 'password');
    });
  });

  // =====================================================
  // Password Requirements Display
  // =====================================================
  describe('Password Requirements Display', () => {
    test('zeigt Anforderungen wenn neues Passwort eingegeben', async () => {
      const user = userEvent.setup();
      renderPasswordManagement();

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      await user.type(screen.getByPlaceholderText(NEW_PLACEHOLDER), 'test');

      expect(screen.getByText('Passwortanforderungen')).toBeInTheDocument();
    });

    test('zeigt Mindestlänge-Anforderung', async () => {
      const user = userEvent.setup();
      renderPasswordManagement();

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      await user.type(screen.getByPlaceholderText(NEW_PLACEHOLDER), 'test');

      expect(screen.getByText(/Mindestens 4 Zeichen/)).toBeInTheDocument();
    });

    test('zeigt Übereinstimmungs-Anforderung', async () => {
      const user = userEvent.setup();
      renderPasswordManagement();

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      await user.type(screen.getByPlaceholderText(NEW_PLACEHOLDER), 'test');

      expect(screen.getByText(/Passwörter stimmen überein/)).toBeInTheDocument();
    });
  });

  // =====================================================
  // Password Validation
  // =====================================================
  describe('Password Validation', () => {
    test('markiert erfüllte Anforderungen als valid', async () => {
      const user = userEvent.setup();
      const { container } = renderPasswordManagement();

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      await user.type(screen.getByPlaceholderText(NEW_PLACEHOLDER), 'TestPass123!');

      const validItems = container.querySelectorAll('li.text-primary');
      expect(validItems.length).toBeGreaterThan(0);
    });

    test('markiert nicht-erfüllte Anforderungen als invalid', async () => {
      const user = userEvent.setup();
      const { container } = renderPasswordManagement();

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      await user.type(screen.getByPlaceholderText(NEW_PLACEHOLDER), 'ab');

      // Unfulfilled requirements use text-muted-foreground class
      const invalidItems = container.querySelectorAll('li.text-muted-foreground');
      expect(invalidItems.length).toBeGreaterThan(0);
    });
  });

  // =====================================================
  // Submit Button
  // =====================================================
  describe('Submit Button', () => {
    test('zeigt Submit-Button', async () => {
      renderPasswordManagement();

      expect(screen.getByRole('button', { name: 'Passwort ändern' })).toBeInTheDocument();
    });

    test('Submit-Button ist initial disabled', async () => {
      renderPasswordManagement();

      expect(screen.getByRole('button', { name: 'Passwort ändern' })).toBeDisabled();
    });
  });

  // =====================================================
  // Warning Messages
  // =====================================================
  describe('Warning Messages', () => {
    test('zeigt Dashboard-Logout Warnung', async () => {
      renderPasswordManagement();

      expect(
        screen.getByText(/Nach dem Ändern des Dashboard-Passworts wirst du automatisch abgemeldet/)
      ).toBeInTheDocument();
    });
  });

  // =====================================================
  // Form Submission
  // =====================================================
  describe('Form Submission', () => {
    test('sendet POST-Request mit korrekten Daten', async () => {
      const user = userEvent.setup();
      mockPasswordFetch();

      renderPasswordManagement();

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      await user.type(screen.getByPlaceholderText(DASHBOARD_CURRENT_PLACEHOLDER), 'OldPass1x');
      await user.type(screen.getByPlaceholderText(NEW_PLACEHOLDER), 'NewPass1x');
      await user.type(screen.getByPlaceholderText(CONFIRM_PLACEHOLDER), 'NewPass1x');

      const submitButton = screen.getByRole('button', { name: 'Passwort ändern' });
      expect(submitButton).not.toBeDisabled();
      await user.click(submitButton);

      await waitFor(() => {
        const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
        expect(postCall).toBeDefined();
      });

      const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
      expect(postCall[0]).toBe('/api/settings/password/dashboard');
      expect(JSON.parse(String(postCall[1]?.body))).toEqual({
        currentPassword: 'OldPass1x',
        newPassword: 'NewPass1x',
      });
    });

    test('zeigt Erfolgs-Nachricht nach erfolgreicher Änderung', async () => {
      const user = userEvent.setup();
      mockPasswordFetch({ postBody: { message: 'Passwort erfolgreich geändert' } });

      renderPasswordManagement();

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      await user.type(screen.getByPlaceholderText(DASHBOARD_CURRENT_PLACEHOLDER), 'OldPass1x');
      await user.type(screen.getByPlaceholderText(NEW_PLACEHOLDER), 'NewPass1x');
      await user.type(screen.getByPlaceholderText(CONFIRM_PLACEHOLDER), 'NewPass1x');

      const submitButton = screen.getByRole('button', { name: 'Passwort ändern' });
      expect(submitButton).not.toBeDisabled();
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Passwort erfolgreich geändert')).toBeInTheDocument();
      });
    });

    test('zeigt Fehler-Nachricht bei API-Fehler', async () => {
      const user = userEvent.setup();
      mockPasswordFetch({
        postBody: { error: 'Aktuelles Passwort ist falsch' },
        postStatus: 400,
      });

      renderPasswordManagement();

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      await user.type(screen.getByPlaceholderText(DASHBOARD_CURRENT_PLACEHOLDER), 'WrongPass1');
      await user.type(screen.getByPlaceholderText(NEW_PLACEHOLDER), 'NewPass1x');
      await user.type(screen.getByPlaceholderText(CONFIRM_PLACEHOLDER), 'NewPass1x');

      const submitButton = screen.getByRole('button', { name: 'Passwort ändern' });
      expect(submitButton).not.toBeDisabled();
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Aktuelles Passwort ist falsch')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Error Handling
  // =====================================================
  describe('Error Handling', () => {
    test('behandelt fehlgeschlagene Anforderungs-Abfrage', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderPasswordManagement();

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });
});
