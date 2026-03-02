/**
 * Login Component Tests
 *
 * Tests für die Login-Komponente:
 * - Rendering
 * - Form Validation
 * - Authentication Flow
 * - Error Handling
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../Login';

// Mock useApi (replaces axios — Login uses useApi internally)
const mockApi = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  request: jest.fn(),
};
jest.mock('../../../hooks/useApi', () => ({ useApi: () => mockApi, default: () => mockApi }));

describe('Login Component', () => {
  const mockOnLoginSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('Rendering', () => {
    test('rendert Login-Formular korrekt', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      expect(screen.getByText('Arasul Platform')).toBeInTheDocument();
      expect(screen.getByText('Edge AI Management System')).toBeInTheDocument();
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
    });

    test('zeigt Hilfetext für Standard-Credentials', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      expect(screen.getByText(/default username/i)).toBeInTheDocument();
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    test('Username-Feld hat Autofocus', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      const usernameInput = screen.getByLabelText(/username/i);
      expect(usernameInput).toHaveFocus();
    });
  });

  describe('Form Validation', () => {
    test('Login-Button ist deaktiviert wenn Felder leer sind', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      const loginButton = screen.getByRole('button', { name: /login/i });
      expect(loginButton).toBeDisabled();
    });

    test('Login-Button ist aktiviert wenn beide Felder ausgefüllt sind', async () => {
      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/username/i), 'admin');
      await user.type(screen.getByLabelText(/password/i), 'password123');

      const loginButton = screen.getByRole('button', { name: /login/i });
      expect(loginButton).not.toBeDisabled();
    });

    test('Login-Button ist deaktiviert wenn nur Username ausgefüllt', async () => {
      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/username/i), 'admin');

      const loginButton = screen.getByRole('button', { name: /login/i });
      expect(loginButton).toBeDisabled();
    });

    test('Login-Button ist deaktiviert wenn nur Passwort ausgefüllt', async () => {
      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/password/i), 'password123');

      const loginButton = screen.getByRole('button', { name: /login/i });
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

      await user.type(screen.getByLabelText(/username/i), 'admin');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(localStorage.getItem('arasul_token')).toBe(mockToken);
        expect(JSON.parse(localStorage.getItem('arasul_user'))).toEqual(mockUser);
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

      await user.type(screen.getByLabelText(/username/i), 'admin');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /login/i }));

      expect(screen.getByText(/logging in/i)).toBeInTheDocument();
    });

    test('API wird mit korrekten Daten aufgerufen', async () => {
      mockApi.post.mockResolvedValueOnce({ token: 'token', user: {} });

      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/username/i), 'testuser');
      await user.type(screen.getByLabelText(/password/i), 'testpass');
      await user.click(screen.getByRole('button', { name: /login/i }));

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
    test('zeigt Fehlermeldung bei falschem Passwort', async () => {
      const err = new Error('Invalid credentials');
      err.data = { error: 'Invalid credentials' };
      mockApi.post.mockRejectedValueOnce(err);

      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/username/i), 'admin');
      await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });

    test('zeigt generische Fehlermeldung bei Netzwerkfehler', async () => {
      mockApi.post.mockRejectedValueOnce(new Error('Network Error'));

      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/username/i), 'admin');
      await user.type(screen.getByLabelText(/password/i), 'password');
      await user.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });

    test('Fehlermeldung wird bei neuer Eingabe nicht sofort gelöscht', async () => {
      const err = new Error('Error message');
      err.data = { error: 'Error message' };
      mockApi.post.mockRejectedValueOnce(err);

      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/username/i), 'admin');
      await user.type(screen.getByLabelText(/password/i), 'wrong');
      await user.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(screen.getByText('Error message')).toBeInTheDocument();
      });

      // Fehlermeldung sollte noch sichtbar sein während neuer Eingabe
      await user.type(screen.getByLabelText(/password/i), 'new');
      // Fehlermeldung ist noch da (wird erst bei Submit gelöscht)
      expect(screen.queryByText('Error message')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('Formularlabels sind korrekt mit Inputs verknüpft', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      const usernameInput = screen.getByLabelText(/username/i);
      const passwordInput = screen.getByLabelText(/password/i);

      expect(usernameInput).toHaveAttribute('id', 'username');
      expect(passwordInput).toHaveAttribute('id', 'password');
    });

    test('Passwort-Feld hat type="password"', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    test('Autocomplete-Attribute sind korrekt gesetzt', () => {
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      const usernameInput = screen.getByLabelText(/username/i);
      const passwordInput = screen.getByLabelText(/password/i);

      expect(usernameInput).toHaveAttribute('autocomplete', 'username');
      expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    });
  });

  describe('Security', () => {
    test('Token wird nicht in console.log ausgegeben', async () => {
      const consoleSpy = jest.spyOn(console, 'log');

      mockApi.post.mockResolvedValueOnce({ token: 'secret-token', user: {} });

      const user = userEvent.setup();
      render(<Login onLoginSuccess={mockOnLoginSuccess} />);

      await user.type(screen.getByLabelText(/username/i), 'admin');
      await user.type(screen.getByLabelText(/password/i), 'password');
      await user.click(screen.getByRole('button', { name: /login/i }));

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
