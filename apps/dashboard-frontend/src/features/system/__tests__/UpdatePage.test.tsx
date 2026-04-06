/**
 * UpdatePage Component Tests
 *
 * Tests für UpdatePage:
 * - Initial Rendering (German UI)
 * - File Upload UI
 * - USB Device Detection
 * - Validation Flow
 * - Apply Update Flow
 * - Update History
 * - Error Handling
 */

import React from 'react';
import { ToastProvider } from '../../../contexts/ToastContext';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpdatePage from '../UpdatePage';

// Mock AuthContext - useApi now requires AuthProvider
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock formatDate
vi.mock('../../../utils/formatting', () => ({
  formatDate: vi.fn(() => '22.01.2026, 10:30'),
}));

// Mock config/api
vi.mock('../../../config/api', () => ({
  API_BASE: '/api',
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
}));

// Mock token utility (used by getAuthHeaders)
vi.mock('../../../utils/token', () => ({
  getValidToken: () => 'test-token',
}));

// Mock csrf utility
vi.mock('../../../utils/csrf', () => ({
  getCsrfToken: () => 'mock-csrf-token',
}));

const mockHistory = [
  {
    id: 1,
    version_from: '1.0.0',
    version_to: '1.1.0',
    source: 'dashboard',
    status: 'completed',
    timestamp: new Date().toISOString(),
    duration_seconds: 180,
  },
  {
    id: 2,
    version_from: '0.9.0',
    version_to: '1.0.0',
    source: 'usb',
    status: 'failed',
    timestamp: new Date().toISOString(),
    duration_seconds: 60,
  },
];

// Mock useApi — the component uses useApi(), not raw fetch
const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};

vi.mock('../../../hooks/useApi', () => ({
  useApi: () => mockApi,
  default: () => mockApi,
}));

/**
 * Configure mock API responses based on URL patterns.
 */
function setupMockApi(
  overrides: {
    history?: typeof mockHistory;
    usbDevices?: Array<{
      path: string;
      name: string;
      size: number;
      device: string;
      modified?: string;
    }>;
    systemInfo?: Record<string, unknown>;
  } = {}
) {
  mockApi.get.mockImplementation((url: string) => {
    if (url.includes('/update/history')) {
      return Promise.resolve({ updates: overrides.history ?? mockHistory });
    }
    if (url.includes('/update/usb-devices')) {
      return Promise.resolve({ devices: overrides.usbDevices ?? [] });
    }
    if (url.includes('/system/info')) {
      return Promise.resolve(overrides.systemInfo ?? { version: '1.0.0' });
    }
    if (url.includes('/update/status')) {
      return Promise.resolve({ status: 'idle' });
    }
    return Promise.resolve({});
  });
}

describe('UpdatePage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMockApi();
  });

  // =====================================================
  // Initial Rendering (German UI)
  // =====================================================
  describe('Initial Rendering', () => {
    test('zeigt deutschen Seiten-Titel', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      expect(screen.getByText('System-Updates')).toBeInTheDocument();
    });

    test('zeigt deutsche Beschreibung', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      expect(screen.getByText('Updates sicher hochladen und installieren')).toBeInTheDocument();
    });

    test('zeigt Upload-Section', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      expect(screen.getByText('Update-Paket hochladen')).toBeInTheDocument();
    });

    test('zeigt USB-Section', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      expect(screen.getByText(/USB-Update erkennen/)).toBeInTheDocument();
    });

    test('zeigt History-Section', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      expect(screen.getByText('Update-Verlauf')).toBeInTheDocument();
    });
  });

  // =====================================================
  // File Upload UI
  // =====================================================
  describe('File Upload UI', () => {
    test('zeigt .araupdate File Input', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      expect(screen.getByText('.araupdate Datei auswählen')).toBeInTheDocument();
    });

    test('zeigt .sig Signature Input als erforderlich', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      expect(screen.getByText('.sig Signaturdatei auswählen (erforderlich)')).toBeInTheDocument();
    });

    test('zeigt Upload Button', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      expect(screen.getByText('Hochladen & Validieren')).toBeInTheDocument();
    });

    test('Upload Button ist initial disabled', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      const button = screen.getByText('Hochladen & Validieren');
      expect(button).toBeDisabled();
    });
  });

  // =====================================================
  // File Selection
  // =====================================================
  describe('File Selection', () => {
    test('akzeptiert .araupdate Dateien', async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );

      const file = new File(['update content'], 'update-1.2.0.araupdate', {
        type: 'application/octet-stream',
      });
      const input = document.getElementById('update-file');
      await user.upload(input!, file);

      expect(screen.getByText('update-1.2.0.araupdate')).toBeInTheDocument();
    });

    test('akzeptiert .sig Dateien', async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );

      const file = new File(['signature'], 'update.sig', { type: 'application/octet-stream' });
      const input = document.getElementById('signature-file');
      await user.upload(input!, file);

      expect(screen.getByText('update.sig')).toBeInTheDocument();
    });

    test('Upload Button bleibt disabled ohne Signaturdatei', async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );

      const file = new File(['content'], 'update.araupdate', {
        type: 'application/octet-stream',
      });
      const input = document.getElementById('update-file');
      await user.upload(input!, file);

      // Button still disabled because signature is required
      const button = screen.getByText('Hochladen & Validieren');
      expect(button).toBeDisabled();
    });

    test('aktiviert Upload Button nach beiden Dateiauswahlen', async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );

      const updateFile = new File(['content'], 'update.araupdate', {
        type: 'application/octet-stream',
      });
      const sigFile = new File(['sig'], 'update.sig', { type: 'application/octet-stream' });

      await user.upload(document.getElementById('update-file')!, updateFile);
      await user.upload(document.getElementById('signature-file')!, sigFile);

      const button = screen.getByText('Hochladen & Validieren');
      expect(button).not.toBeDisabled();
    });
  });

  // =====================================================
  // USB Device Detection
  // =====================================================
  describe('USB Device Detection', () => {
    test('zeigt Scan-Button (ghost icon button)', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      // The USB scan button is a ghost variant icon-only button with a RefreshCw icon
      const buttons = screen.getAllByRole('button');
      const scanButton = buttons.find(
        btn => btn.getAttribute('data-variant') === 'ghost' && btn.querySelector('svg')
      );
      expect(scanButton).toBeDefined();
    });

    test('zeigt Keine-Geräte-Nachricht', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      await waitFor(() => {
        expect(screen.getByText(/Kein USB-Gerät gefunden/)).toBeInTheDocument();
      });
    });

    test('zeigt gefundene USB-Geräte', async () => {
      setupMockApi({
        usbDevices: [
          {
            path: '/media/usb/update-1.2.0.araupdate',
            name: 'update-1.2.0.araupdate',
            size: 52428800,
            device: 'usb-stick',
            modified: new Date().toISOString(),
          },
        ],
      });

      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('update-1.2.0.araupdate')).toBeInTheDocument();
        expect(screen.getByText('Installieren')).toBeInTheDocument();
      });
    });

    test('ruft api.get für USB-Scan auf', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          '/update/usb-devices',
          expect.objectContaining({ showError: false })
        );
      });
    });
  });

  // =====================================================
  // Update History
  // =====================================================
  describe('Update History', () => {
    test('lädt History beim Mount', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          '/update/history',
          expect.objectContaining({ showError: false })
        );
      });
    });

    test('zeigt History-Einträge als div-basierte Liste', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );

      await waitFor(() => {
        // History uses div-based layout: "version_from → version_to"
        expect(screen.getAllByText(/→/).length).toBeGreaterThanOrEqual(1);
      });
    });

    test('zeigt Versionen in History-Einträgen', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );

      // version_from and version_to displayed together: "1.0.0 → 1.1.0"
      await waitFor(() => {
        expect(screen.getByText(/1\.0\.0 → 1\.1\.0/)).toBeInTheDocument();
      });
    });

    test('zeigt Status-Badges auf Deutsch', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Abgeschlossen')).toBeInTheDocument();
        expect(screen.getByText('Fehlgeschlagen')).toBeInTheDocument();
      });
    });

    test('zeigt Quellen auf Deutsch', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText('USB')).toBeInTheDocument();
      });
    });

    test('zeigt Duration in Minuten', async () => {
      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('3m')).toBeInTheDocument();
        expect(screen.getByText('1m')).toBeInTheDocument();
      });
    });

    test('zeigt Aktueller-Stand-Info wenn keine History vorhanden', async () => {
      setupMockApi({ history: [] });

      render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );

      await waitFor(() => {
        // When no history, shows system info card with "Aktueller Stand"
        expect(screen.getByText('Aktueller Stand')).toBeInTheDocument();
        expect(screen.getByText('Noch kein Update durchgeführt')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Layout Structure (Tailwind classes, no BEM)
  // =====================================================
  describe('Layout Structure', () => {
    test('hat animate-in fade-in Container', () => {
      const { container } = render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      expect(container.querySelector('.animate-in.fade-in')).toBeInTheDocument();
    });

    test('hat header section mit border-b', () => {
      const { container } = render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      expect(container.querySelector('.border-b.border-border')).toBeInTheDocument();
    });

    test('hat multiple sections mit border-b (USB + Upload + History)', () => {
      const { container } = render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
      // Header, USB section, Upload section all have border-b
      const borderedSections = container.querySelectorAll('.border-b');
      expect(borderedSections.length).toBeGreaterThanOrEqual(3);
    });
  });
});
