/**
 * Login Component Tests
 *
 * Tests für die Login-Komponente:
 * - Rendering
 * - Form Validation
 * - Authentication Flow
 * - Error Handling
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../Login';
import { PLATFORM_NAME } from '@/config/branding';

// Mock useApi (replaces axios — Login uses useApi internally)
const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('../../../hooks/useApi', () => ({ useApi: () => mockApi, default: () => mockApi }));

describe('Login Component', () => {
  const mockOnLoginSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Rendering', () => {
    test('rendert Login-Formular korrekt', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      expect(screen.getByRole('heading', { name: PLATFORM_NAME })).toBeInTheDocument();
      expect(screen.getByLabelText(/benutzername/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/passwort/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /anmelden/i })).toBeInTheDocument();
    });

    // Auftrag anmeldung-ohne-slogan (30.08.2026): ueber dem Formular steht
    // der Name des Unternehmens aus den Einstellungen, kein Slogan; der
    // Hersteller klein in der Fusszeile.
    test('zeigt den Firmennamen statt eines Slogans', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} firmenname="Muster GmbH" />);

      expect(screen.getByRole('heading', { name: 'Muster GmbH' })).toBeInTheDocument();
      expect(screen.getByText(`Betrieben mit ${PLATFORM_NAME}`)).toBeInTheDocument();
      expect(screen.queryByText(/eure apps/i)).not.toBeInTheDocument();
    });

    test('ohne Firmenname steht der Produktname da, und zwar nur einmal', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} firmenname={null} />);

      expect(screen.getByRole('heading', { name: PLATFORM_NAME })).toBeInTheDocument();
      expect(screen.queryByText(/betrieben mit/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/eure apps/i)).not.toBeInTheDocument();
    });

    // F-01: Weder als Fusszeile noch als Platzhalter. Der frueheste Bildschirm
    // des Produkts nannte den Standardnamen im Klartext.
    test('nennt keinen Benutzernamen, auch nicht als Platzhalter', () => {
      const { container } = render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      expect(screen.queryByText(/standard-benutzername/i)).not.toBeInTheDocument();
      expect(container.innerHTML).not.toMatch(/\badmin\b/i);
      expect(screen.getByLabelText(/benutzername/i)).not.toHaveAttribute('placeholder');
    });

    test('bietet weiter einen Weg bei vergessenem Passwort', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      expect(screen.getByText(/passwort vergessen/i)).toBeInTheDocument();
    });

    test('Username-Feld hat Autofocus', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      const usernameInput = screen.getByLabelText(/benutzername/i);
      expect(usernameInput).toHaveFocus();
    });
  });

  describe('Form Validation', () => {
    test('Login-Button ist deaktiviert wenn Felder leer sind', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      const loginButton = screen.getByRole('button', { name: /anmelden/i });
      expect(loginButton).toBeDisabled();
    });

    test('Login-Button ist aktiviert wenn beide Felder ausgefüllt sind', async () => {
      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/benutzername/i), 'admin');
      await user.type(screen.getByLabelText(/passwort/i), 'password123');

      const loginButton = screen.getByRole('button', { name: /anmelden/i });
      expect(loginButton).not.toBeDisabled();
    });

    test('Login-Button ist deaktiviert wenn nur Username ausgefüllt', async () => {
      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/benutzername/i), 'admin');

      const loginButton = screen.getByRole('button', { name: /anmelden/i });
      expect(loginButton).toBeDisabled();
    });

    test('Login-Button ist deaktiviert wenn nur Passwort ausgefüllt', async () => {
      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/passwort/i), 'password123');

      const loginButton = screen.getByRole('button', { name: /anmelden/i });
      expect(loginButton).toBeDisabled();
    });
  });

  describe('Authentication Flow', () => {
    test('erfolgreicher Login speichert Token und ruft Callback auf', async () => {
      const mockToken = 'test-jwt-token';
      const mockUser = { id: 1, username: 'admin', role: 'admin' };

      mockApi.post.mockResolvedValueOnce({
        token: mockToken,
        user: mockUser,
      });

      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/benutzername/i), 'admin');
      await user.type(screen.getByLabelText(/passwort/i), 'password123');
      await user.click(screen.getByRole('button', { name: /anmelden/i }));

      await waitFor(() => {
        expect(localStorage.getItem('arasul_token')).toBe(mockToken);
        expect(JSON.parse(localStorage.getItem('arasul_user') ?? 'null')).toEqual(mockUser);
        expect(mockOnLoginSuccess).toHaveBeenCalledWith({
          token: mockToken,
          user: mockUser,
        });
      });
    });

    test('zeigt Ladezustand während Login', async () => {
      mockApi.post.mockImplementation(() => new Promise(() => {})); // Never resolves

      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/benutzername/i), 'admin');
      await user.type(screen.getByLabelText(/passwort/i), 'password123');
      await user.click(screen.getByRole('button', { name: /anmelden/i }));

      expect(screen.getByText(/anmeldung/i)).toBeInTheDocument();
    });

    test('API wird mit korrekten Daten aufgerufen', async () => {
      mockApi.post.mockResolvedValueOnce({ token: 'token', user: {} });

      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/benutzername/i), 'testuser');
      await user.type(screen.getByLabelText(/passwort/i), 'testpass');
      await user.click(screen.getByRole('button', { name: /anmelden/i }));

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith(
          '/auth/login',
          { username: 'testuser', password: 'testpass' },
          expect.anything()
        );
      });
    });
  });

  describe('Error Handling', () => {
    test('zeigt spezifische deutsche Fehlermeldung bei falschem Passwort', async () => {
      // Der /auth/login-401 erreicht die Komponente mit status=401.
      const err = new Error('Invalid username or password') as Error & { status?: number };
      err.status = 401;
      mockApi.post.mockRejectedValueOnce(err);

      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/benutzername/i), 'admin');
      await user.type(screen.getByLabelText(/passwort/i), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /anmelden/i }));

      await waitFor(() => {
        expect(screen.getByText('Benutzername oder Passwort ist falsch.')).toBeInTheDocument();
      });
    });

    test('zeigt Netzwerk-Fehlermeldung wenn keine Serverantwort kommt', async () => {
      // Ein echter Netzwerkfehler wirft ohne HTTP-Status.
      mockApi.post.mockRejectedValueOnce(new Error('Failed to fetch'));

      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/benutzername/i), 'admin');
      await user.type(screen.getByLabelText(/passwort/i), 'password');
      await user.click(screen.getByRole('button', { name: /anmelden/i }));

      await waitFor(() => {
        expect(screen.getByText(/netzwerkverbindung/i)).toBeInTheDocument();
      });
    });

    test('Fehlermeldung wird bei neuer Eingabe nicht sofort gelöscht', async () => {
      const err = new Error('Invalid username or password') as Error & { status?: number };
      err.status = 401;
      mockApi.post.mockRejectedValueOnce(err);

      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/benutzername/i), 'admin');
      await user.type(screen.getByLabelText(/passwort/i), 'wrong');
      await user.click(screen.getByRole('button', { name: /anmelden/i }));

      await waitFor(() => {
        expect(screen.getByText('Benutzername oder Passwort ist falsch.')).toBeInTheDocument();
      });

      // Fehlermeldung sollte noch sichtbar sein während neuer Eingabe
      await user.type(screen.getByLabelText(/passwort/i), 'new');
      // Fehlermeldung ist noch da (wird erst bei Submit gelöscht)
      expect(screen.queryByText('Benutzername oder Passwort ist falsch.')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('Formularlabels sind korrekt mit Inputs verknüpft', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      const usernameInput = screen.getByLabelText(/benutzername/i);
      const passwordInput = screen.getByLabelText(/passwort/i);

      expect(usernameInput).toHaveAttribute('id', 'username');
      expect(passwordInput).toHaveAttribute('id', 'password');
    });

    test('Passwort-Feld hat type="password"', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      const passwordInput = screen.getByLabelText(/passwort/i);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    test('Autocomplete-Attribute sind korrekt gesetzt', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      const usernameInput = screen.getByLabelText(/benutzername/i);
      const passwordInput = screen.getByLabelText(/passwort/i);

      expect(usernameInput).toHaveAttribute('autocomplete', 'username');
      expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    });
  });

  describe('Security', () => {
    test('Token wird nicht in console.log ausgegeben', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      mockApi.post.mockResolvedValueOnce({ token: 'secret-token', user: {} });

      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/benutzername/i), 'admin');
      await user.type(screen.getByLabelText(/passwort/i), 'password');
      await user.click(screen.getByRole('button', { name: /anmelden/i }));

      await waitFor(() => {
        expect(mockOnLoginSuccess).toHaveBeenCalled();
      });

      // Prüfe, dass der Token nicht geloggt wurde
      const allLogs = consoleSpy.mock.calls.flat().join(' ');
      expect(allLogs).not.toContain('secret-token');

      consoleSpy.mockRestore();
    });
  });
});
