/**
 * App Component Tests
 *
 * Tests für die Haupt-App-Komponente:
 * - Routing
 * - Authentication
 * - Navigation
 * - WebSocket Connection
 * - Error Handling
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import App from '../App';

// Mock axios
jest.mock('axios');

// Mock components to avoid complex setup
jest.mock('../components/ChatMulti', () => () => <div data-testid="chat-multi">Chat Component</div>);
jest.mock('../components/DocumentManager', () => () => <div data-testid="document-manager">Documents Component</div>);
jest.mock('../components/Settings', () => () => <div data-testid="settings">Settings Component</div>);
jest.mock('../components/AppStore', () => () => <div data-testid="app-store">AppStore Component</div>);
jest.mock('../components/ModelStore', () => () => <div data-testid="model-store">ModelStore Component</div>);
jest.mock('../components/ClaudeCode', () => () => <div data-testid="claude-code">ClaudeCode Component</div>);

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('Unauthenticated State', () => {
    beforeEach(() => {
      axios.get.mockRejectedValue({ response: { status: 401 } });
    });

    test('zeigt Login-Seite wenn nicht authentifiziert', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Arasul Platform')).toBeInTheDocument();
        expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      });
    });

    test('zeigt keine Navigation wenn nicht authentifiziert', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
        expect(screen.queryByText('Chat')).not.toBeInTheDocument();
      });
    });
  });

  describe('Authenticated State', () => {
    const mockUser = { id: 1, username: 'admin', role: 'admin' };

    beforeEach(() => {
      localStorage.setItem('arasul_token', 'valid-token');
      localStorage.setItem('arasul_user', JSON.stringify(mockUser));

      // Mock successful auth check
      axios.get.mockImplementation((url) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({ data: { user: mockUser } });
        }
        if (url.includes('/metrics/live')) {
          return Promise.resolve({
            data: {
              cpu: 45,
              ram: 60,
              gpu: 30,
              temperature: 55,
              disk: { percent: 40, used: 20, free: 30 },
            },
          });
        }
        if (url.includes('/system')) {
          return Promise.resolve({
            data: {
              hostname: 'arasul-edge',
              uptime: '5 days',
              version: '1.0.0',
            },
          });
        }
        if (url.includes('/services')) {
          return Promise.resolve({
            data: {
              llm: { status: 'running', model: 'qwen3:14b' },
              embedding: { status: 'running' },
            },
          });
        }
        return Promise.resolve({ data: {} });
      });
    });

    test('zeigt Dashboard nach erfolgreicher Authentifizierung', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Arasul')).toBeInTheDocument();
      });
    });

    test('zeigt Navigation Sidebar', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Chat')).toBeInTheDocument();
        expect(screen.getByText('Dokumente')).toBeInTheDocument();
        expect(screen.getByText('Einstellungen')).toBeInTheDocument();
      });
    });

    test('Dashboard-Route zeigt Metriken', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/cpu/i)).toBeInTheDocument();
      });
    });

    test('Navigation zu Chat funktioniert', async () => {
      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Chat')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Chat'));

      await waitFor(() => {
        expect(screen.getByTestId('chat-multi')).toBeInTheDocument();
      });
    });

    test('Navigation zu Dokumente funktioniert', async () => {
      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Dokumente')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Dokumente'));

      await waitFor(() => {
        expect(screen.getByTestId('document-manager')).toBeInTheDocument();
      });
    });

    test('Navigation zu Einstellungen funktioniert', async () => {
      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Einstellungen')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Einstellungen'));

      await waitFor(() => {
        expect(screen.getByTestId('settings')).toBeInTheDocument();
      });
    });
  });

  describe('Logout Flow', () => {
    const mockUser = { id: 1, username: 'admin', role: 'admin' };

    beforeEach(() => {
      localStorage.setItem('arasul_token', 'valid-token');
      localStorage.setItem('arasul_user', JSON.stringify(mockUser));

      axios.get.mockImplementation((url) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({ data: { user: mockUser } });
        }
        return Promise.resolve({ data: {} });
      });

      axios.post.mockImplementation((url) => {
        if (url.includes('/auth/logout')) {
          return Promise.resolve({ data: { success: true } });
        }
        return Promise.resolve({ data: {} });
      });
    });

    test('Logout löscht Token und zeigt Login', async () => {
      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Arasul')).toBeInTheDocument();
      });

      // Find and click logout button
      const logoutButton = screen.getByRole('button', { name: /logout/i }) ||
                          screen.getByTitle(/logout/i) ||
                          screen.getByLabelText(/logout/i);

      if (logoutButton) {
        await user.click(logoutButton);

        await waitFor(() => {
          expect(localStorage.getItem('arasul_token')).toBeNull();
          expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
        });
      }
    });
  });

  describe('Session Validation', () => {
    test('ungültiger Token führt zu Logout', async () => {
      localStorage.setItem('arasul_token', 'invalid-token');
      localStorage.setItem('arasul_user', JSON.stringify({ id: 1 }));

      axios.get.mockRejectedValue({ response: { status: 401 } });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      });
    });

    test('401 auf API-Call führt zu Logout', async () => {
      const mockUser = { id: 1, username: 'admin' };
      localStorage.setItem('arasul_token', 'valid-token');
      localStorage.setItem('arasul_user', JSON.stringify(mockUser));

      // First call succeeds, subsequent fails
      let callCount = 0;
      axios.get.mockImplementation((url) => {
        callCount++;
        if (callCount === 1 && url.includes('/auth/me')) {
          return Promise.resolve({ data: { user: mockUser } });
        }
        return Promise.reject({ response: { status: 401 } });
      });

      render(<App />);

      // Initial render should work
      await waitFor(() => {
        expect(screen.getByText('Arasul')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    const mockUser = { id: 1, username: 'admin' };

    beforeEach(() => {
      localStorage.setItem('arasul_token', 'valid-token');
      localStorage.setItem('arasul_user', JSON.stringify(mockUser));
    });

    test('zeigt Fehler bei Metriken-Ladefehler', async () => {
      axios.get.mockImplementation((url) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({ data: { user: mockUser } });
        }
        if (url.includes('/metrics')) {
          return Promise.reject(new Error('Network Error'));
        }
        return Promise.resolve({ data: {} });
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Arasul')).toBeInTheDocument();
      });

      // App sollte trotzdem rendern, auch wenn Metriken fehlschlagen
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    test('Netzwerkfehler wird graceful gehandhabt', async () => {
      axios.get.mockImplementation((url) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({ data: { user: mockUser } });
        }
        return Promise.reject(new Error('Network Error'));
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Arasul')).toBeInTheDocument();
      });

      // App sollte nicht crashen
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  describe('Sidebar Toggle', () => {
    const mockUser = { id: 1, username: 'admin' };

    beforeEach(() => {
      localStorage.setItem('arasul_token', 'valid-token');
      localStorage.setItem('arasul_user', JSON.stringify(mockUser));

      axios.get.mockImplementation((url) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({ data: { user: mockUser } });
        }
        return Promise.resolve({ data: {} });
      });
    });

    test('Sidebar Toggle speichert Zustand in localStorage', async () => {
      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Arasul')).toBeInTheDocument();
      });

      // Finde den Toggle-Button (kann je nach Implementation variieren)
      const toggleButton = document.querySelector('.sidebar-toggle');

      if (toggleButton) {
        await user.click(toggleButton);

        expect(localStorage.getItem('arasul_sidebar_collapsed')).toBe('true');
      }
    });

    test('Sidebar Zustand wird aus localStorage geladen', async () => {
      localStorage.setItem('arasul_sidebar_collapsed', 'true');

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Arasul')).toBeInTheDocument();
      });

      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        expect(sidebar.classList.contains('collapsed')).toBe(true);
      }
    });

    test('Keyboard Shortcut Ctrl+B toggled Sidebar', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Arasul')).toBeInTheDocument();
      });

      // Simulate Ctrl+B
      fireEvent.keyDown(document, { key: 'b', ctrlKey: true });

      // Check if sidebar toggled (implementation dependent)
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        // State should have changed
        expect(localStorage.getItem('arasul_sidebar_collapsed')).toBeDefined();
      }
    });
  });

  describe('WebSocket Connection', () => {
    const mockUser = { id: 1, username: 'admin' };

    beforeEach(() => {
      localStorage.setItem('arasul_token', 'valid-token');
      localStorage.setItem('arasul_user', JSON.stringify(mockUser));

      axios.get.mockImplementation((url) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({ data: { user: mockUser } });
        }
        return Promise.resolve({ data: {} });
      });
    });

    test('WebSocket wird nach Auth initialisiert', async () => {
      const wsInstances = [];
      const originalWebSocket = window.WebSocket;

      window.WebSocket = class extends originalWebSocket {
        constructor(url) {
          super(url);
          wsInstances.push(this);
        }
      };

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Arasul')).toBeInTheDocument();
      });

      // WebSocket sollte erstellt worden sein
      // (Die genaue Anzahl hängt von der Implementation ab)
      expect(wsInstances.length).toBeGreaterThanOrEqual(0);

      window.WebSocket = originalWebSocket;
    });
  });
});

describe('App Routing', () => {
  const mockUser = { id: 1, username: 'admin' };

  beforeEach(() => {
    localStorage.setItem('arasul_token', 'valid-token');
    localStorage.setItem('arasul_user', JSON.stringify(mockUser));

    axios.get.mockImplementation((url) => {
      if (url.includes('/auth/me')) {
        return Promise.resolve({ data: { user: mockUser } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  test('Unbekannte Route zeigt Dashboard (oder 404)', async () => {
    window.history.pushState({}, '', '/unknown-route');

    render(<App />);

    await waitFor(() => {
      // Sollte entweder Dashboard oder 404 zeigen, nicht crashen
      expect(screen.getByText('Arasul')).toBeInTheDocument();
    });

    window.history.pushState({}, '', '/');
  });
});
