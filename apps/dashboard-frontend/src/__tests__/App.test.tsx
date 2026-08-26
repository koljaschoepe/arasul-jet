/**
 * App Component Tests
 *
 * Tests für die Haupt-App-Komponente:
 * - Login-Gating (unauthentifiziert → Login, sonst Workspace-Shell)
 * - "/" leitet immer auf die Workspace-Shell um (Plan 008; der frühere
 *   Legacy/Workspace-Umschalter ist entfernt)
 * - Session-Validierung
 * - Routing (Alt-Routen leiten in den Arbeitsbereich, Unbekanntes zeigt den
 *   Weg zurück; die Legacy-Shell ist mit Plan 023 B1 entfernt)
 */

import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

// Mock useApi hook
const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('../hooks/useApi', () => ({ useApi: () => mockApi, default: () => mockApi }));

// Die Workspace-Shell ist die Startseite; ihre schweren Abhängigkeiten werden
// hier durch einen Stub ersetzt — getestet wird nur das App-Level-Routing.
vi.mock('../features/workspace', () => ({
  default: () => <div data-testid="workspace-shell">Workspace</div>,
}));

// Mock secondary route components (jetzt im Arbeitsbereich, nicht mehr hier)
vi.mock('../features/settings/Settings', () => ({
  default: () => <div data-testid="settings">Settings Component</div>,
}));

interface MockUser {
  id: number;
  username: string;
  role?: string;
}

// Ein Token, wie ihn der Server ausstellt: drei Teile, base64url-Nutzlast, Ablauf
// in der Zukunft. Die alte Attrappe 'valid-token' hat `getValidToken` nie
// bestanden und wurde deshalb schon immer aus dem Authorization-Header
// geworfen; die Tests liefen unbemerkt ueber den Cookie-Weg der Attrappe.
// Aufgefallen ist das in Plan 023 C3.
const gueltigerToken = (): string => {
  const nutzlast = btoa(JSON.stringify({ sub: 1, exp: Math.floor(Date.now() / 1000) + 3600 }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `kopf.${nutzlast}.unterschrift`;
};

// Minimal Response stand-in for fetch mocks (AuthContext only reads ok/status/json).
const fetchResponse = (body: unknown, init: { ok?: boolean; status?: number } = {}): Response =>
  ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

// Helper to create fetch mock for auth endpoints (AuthContext uses raw fetch)
const createFetchMock = (mockUser: MockUser): typeof fetch => {
  return (input: RequestInfo | URL) => {
    const url = String(input);
    // Plan 023 C3: AuthContext fragt /auth/session, einen Pruefpunkt, der in
    // beiden Faellen mit 200 antwortet (F-02). /auth/me bleibt die geschuetzte
    // Route und wird von der Oberflaeche nicht mehr aufgerufen.
    if (url.includes('/auth/session')) {
      return Promise.resolve(fetchResponse({ authenticated: true, user: mockUser }));
    }
    if (url.includes('/auth/logout')) {
      return Promise.resolve(fetchResponse({ success: true }));
    }
    // Default fetch response
    return Promise.resolve(fetchResponse({}));
  };
};

// Helper to create comprehensive useApi mock
const createApiMock = (_mockUser: MockUser, overrides: Record<string, Promise<unknown>> = {}) => {
  return (url: string): Promise<unknown> => {
    if (url.includes('/metrics/live')) {
      return Promise.resolve({
        cpu: 45,
        ram: 60,
        gpu: 30,
        temperature: 55,
        disk: { percent: 40, used: 20000000000, free: 30000000000 },
      });
    }
    if (url.includes('/metrics/history')) {
      return Promise.resolve({
        timestamps: [new Date().toISOString()],
        cpu: [45],
        ram: [60],
        gpu: [30],
        temperature: [55],
      });
    }
    if (url.includes('/system/setup-status')) {
      return Promise.resolve({
        setupComplete: true,
        setupStep: 5,
      });
    }
    if (url.includes('/system/info')) {
      return Promise.resolve({
        hostname: 'arasul-edge',
        uptime_seconds: 432000,
        version: '1.0.0',
      });
    }
    if (url.includes('/system/network')) {
      return Promise.resolve({
        internet_reachable: true,
        mdns: 'arasul.local',
      });
    }
    if (url.includes('/system/thresholds')) {
      return Promise.resolve({
        thresholds: {
          cpu: { warning: 70, critical: 90 },
          ram: { warning: 70, critical: 90 },
          gpu: { warning: 80, critical: 95 },
          storage: { warning: 70, critical: 85 },
          temperature: { warning: 65, critical: 80 },
        },
        device: { name: 'Jetson AGX Orin' },
      });
    }
    if (url.includes('/services')) {
      return Promise.resolve({
        llm: { status: 'healthy', model: 'qwen3:14b' },
        embeddings: { status: 'healthy' },
      });
    }
    if (url.includes('/apps')) {
      return Promise.resolve({ apps: [] });
    }
    // Apply overrides
    const override = overrides[url];
    if (override) {
      return override;
    }
    return Promise.resolve({});
  };
};

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Jede Suite startet auf "/" (Standard-Einstieg → Workspace-Shell).
    window.history.pushState({}, '', '/');
    // useApi contract: every method returns a Promise. Components call e.g.
    // api.post('/auth/refresh-cookie').catch(...) on mount, so bare vi.fn()
    // mocks (returning undefined) would crash a route.
    mockApi.get.mockResolvedValue({});
    mockApi.post.mockResolvedValue({});
    mockApi.put.mockResolvedValue({});
    mockApi.patch.mockResolvedValue({});
    mockApi.del.mockResolvedValue({});
    mockApi.request.mockResolvedValue({});
  });

  describe('Unauthenticated State', () => {
    beforeEach(() => {
      // /auth/session antwortet auch ohne Sitzung mit 200. Genau das ist der
      // Sinn des Pruefpunkts: keine 401 auf dem Weg zur Anmeldeseite (F-02).
      global.fetch = vi.fn(() =>
        Promise.resolve(fetchResponse({ authenticated: false, user: null }))
      );
      mockApi.get.mockRejectedValue({ status: 401 });
    });

    test('zeigt Login-Seite wenn nicht authentifiziert', async () => {
      render(<App />);

      await waitFor(() => {
        // Login-Titel ist seit B1 nur noch der Marken-Name (Maskottchen darüber).
        expect(screen.getByRole('heading', { name: 'Arasul' })).toBeInTheDocument();
        expect(screen.getByLabelText(/benutzername/i)).toBeInTheDocument();
      });
    });

    test('zeigt keine Workspace-Shell wenn nicht authentifiziert', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByLabelText(/benutzername/i)).toBeInTheDocument();
      });
      expect(screen.queryByTestId('workspace-shell')).not.toBeInTheDocument();
    });
  });

  describe('Authenticated State', () => {
    const mockUser = { id: 1, username: 'admin', role: 'admin' };

    beforeEach(() => {
      localStorage.setItem('arasul_token', gueltigerToken());
      localStorage.setItem('arasul_user', JSON.stringify(mockUser));
      global.fetch = vi.fn(createFetchMock(mockUser));
      mockApi.get.mockImplementation(createApiMock(mockUser));
    });

    test('landet nach erfolgreicher Authentifizierung in der Workspace-Shell', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });
    });

    test('"/" leitet auf /workspace um', async () => {
      window.history.pushState({}, '', '/');
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });
      expect(window.location.pathname).toBe('/workspace');
    });
  });

  describe('Session Validation', () => {
    test('ungültiger Token führt zu Logout', async () => {
      localStorage.setItem('arasul_token', 'invalid-token');
      localStorage.setItem('arasul_user', JSON.stringify({ id: 1 }));

      // AuthContext uses raw fetch - return 401
      global.fetch = vi.fn(() =>
        Promise.resolve(fetchResponse({ message: 'Unauthorized' }, { ok: false, status: 401 }))
      );
      mockApi.get.mockRejectedValue({ status: 401 });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByLabelText(/benutzername/i)).toBeInTheDocument();
      });
    });

    test('App bleibt stabil, wenn Datenendpunkte fehlschlagen', async () => {
      const mockUser = { id: 1, username: 'admin' };
      localStorage.setItem('arasul_token', gueltigerToken());
      localStorage.setItem('arasul_user', JSON.stringify(mockUser));

      // Auth succeeds via fetch
      global.fetch = vi.fn(createFetchMock(mockUser));

      // Auth-relevante Endpunkte liefern gültige Daten, alles andere schlägt fehl
      mockApi.get.mockImplementation(url => {
        if (url.includes('/system/setup-status')) {
          return Promise.resolve({ setupComplete: true, setupStep: 5 });
        }
        if (url.includes('/apps')) {
          return Promise.resolve({ apps: [] });
        }
        return Promise.reject({ status: 401 });
      });

      render(<App />);

      // Die Shell rendert trotzdem (kein Crash)
      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });
    });
  });
});

describe('App Routing', () => {
  const mockUser = { id: 1, username: 'admin' };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('arasul_token', gueltigerToken());
    localStorage.setItem('arasul_user', JSON.stringify(mockUser));
    global.fetch = vi.fn(createFetchMock(mockUser));
    mockApi.get.mockImplementation(createApiMock(mockUser));
    mockApi.post.mockResolvedValue({});
  });

  test('Unbekannte Route zeigt den Weg zurueck, ohne Absturz', async () => {
    window.history.pushState({}, '', '/unknown-route');

    render(<App />);

    // Seit Plan 023 B1 gibt es keine zweite Shell mehr, in der eine unbekannte
    // Adresse landen koennte. Uebrig bleibt die Komponente mit einem Weg zurueck.
    await waitFor(() => {
      expect(screen.getByText('Diese Adresse gibt es nicht.')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Zum Arbeitsbereich' })).toBeInTheDocument();

    window.history.pushState({}, '', '/');
  });
});
