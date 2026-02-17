/**
 * UpdatePage Component Tests
 *
 * Tests fuer UpdatePage:
 * - Initial Rendering (German UI)
 * - File Upload UI
 * - USB Device Detection
 * - Validation Flow
 * - Apply Update Flow
 * - Update History
 * - Error Handling
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpdatePage from '../components/UpdatePage';

// Mock formatDate
jest.mock('../utils/formatting', () => ({
  formatDate: jest.fn(() => '22.01.2026, 10:30'),
}));

// Mock config/api
jest.mock('../config/api', () => ({
  API_BASE: '/api',
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
}));

// Mock token utility (used by getAuthHeaders)
jest.mock('../utils/token', () => ({
  getValidToken: () => 'test-token',
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

// Helper to create a fetch mock
const createFetchMock = (overrides = {}) => {
  return jest.fn((url, options) => {
    if (url.includes('/update/history')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ updates: overrides.history || mockHistory }),
      });
    }
    if (url.includes('/update/status')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(overrides.status || { status: 'idle', message: 'No update in progress' }),
      });
    }
    if (url.includes('/update/usb-devices')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devices: overrides.usbDevices || [], count: 0 }),
      });
    }
    if (url.includes('/update/apply')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(overrides.apply || { status: 'started' }),
      });
    }
    if (url.includes('/update/install-from-usb')) {
      if (overrides.usbInstallError) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: overrides.usbInstallError }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            overrides.usbInstall || {
              status: 'validated',
              version: '1.2.0',
              components: [],
              file_path: '/arasul/updates/test.araupdate',
              source: 'usb',
            }
          ),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
};

describe('UpdatePage Component', () => {
  let originalFetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    global.fetch = createFetchMock();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =====================================================
  // Initial Rendering (German UI)
  // =====================================================
  describe('Initial Rendering', () => {
    test('zeigt deutschen Seiten-Titel', async () => {
      render(<UpdatePage />);
      expect(screen.getByText('System-Updates')).toBeInTheDocument();
    });

    test('zeigt deutsche Beschreibung', async () => {
      render(<UpdatePage />);
      expect(screen.getByText('Updates sicher hochladen und installieren')).toBeInTheDocument();
    });

    test('zeigt Upload-Section', async () => {
      render(<UpdatePage />);
      expect(screen.getByText('Update-Paket hochladen')).toBeInTheDocument();
    });

    test('zeigt USB-Section', async () => {
      render(<UpdatePage />);
      expect(screen.getByText(/USB-Update erkennen/)).toBeInTheDocument();
    });

    test('zeigt History-Section', async () => {
      render(<UpdatePage />);
      expect(screen.getByText('Update-Verlauf')).toBeInTheDocument();
    });
  });

  // =====================================================
  // File Upload UI
  // =====================================================
  describe('File Upload UI', () => {
    test('zeigt .araupdate File Input', async () => {
      render(<UpdatePage />);
      expect(screen.getByText('.araupdate Datei auswaehlen')).toBeInTheDocument();
    });

    test('zeigt .sig Signature Input als erforderlich', async () => {
      render(<UpdatePage />);
      expect(screen.getByText('.sig Signaturdatei auswaehlen (erforderlich)')).toBeInTheDocument();
    });

    test('zeigt Upload Button', async () => {
      render(<UpdatePage />);
      expect(screen.getByText('Hochladen & Validieren')).toBeInTheDocument();
    });

    test('Upload Button ist initial disabled', async () => {
      render(<UpdatePage />);
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
      render(<UpdatePage />);

      const file = new File(['update content'], 'update-1.2.0.araupdate', {
        type: 'application/octet-stream',
      });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      expect(screen.getByText('update-1.2.0.araupdate')).toBeInTheDocument();
    });

    test('akzeptiert .sig Dateien', async () => {
      const user = userEvent.setup();
      render(<UpdatePage />);

      const file = new File(['signature'], 'update.sig', { type: 'application/octet-stream' });
      const input = document.getElementById('signature-file');
      await user.upload(input, file);

      expect(screen.getByText('update.sig')).toBeInTheDocument();
    });

    test('Upload Button bleibt disabled ohne Signaturdatei', async () => {
      const user = userEvent.setup();
      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', {
        type: 'application/octet-stream',
      });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      // Button still disabled because signature is required
      const button = screen.getByText('Hochladen & Validieren');
      expect(button).toBeDisabled();
    });

    test('aktiviert Upload Button nach beiden Dateiauswahlen', async () => {
      const user = userEvent.setup();
      render(<UpdatePage />);

      const updateFile = new File(['content'], 'update.araupdate', {
        type: 'application/octet-stream',
      });
      const sigFile = new File(['sig'], 'update.sig', { type: 'application/octet-stream' });

      await user.upload(document.getElementById('update-file'), updateFile);
      await user.upload(document.getElementById('signature-file'), sigFile);

      const button = screen.getByText('Hochladen & Validieren');
      expect(button).not.toBeDisabled();
    });
  });

  // =====================================================
  // USB Device Detection
  // =====================================================
  describe('USB Device Detection', () => {
    test('zeigt Scan-Button', async () => {
      render(<UpdatePage />);
      expect(screen.getByTitle('Erneut scannen')).toBeInTheDocument();
    });

    test('zeigt Keine-Geraete-Nachricht', async () => {
      render(<UpdatePage />);
      await waitFor(() => {
        expect(screen.getByText(/Kein USB-Geraet mit Update-Paket gefunden/)).toBeInTheDocument();
      });
    });

    test('zeigt gefundene USB-Geraete', async () => {
      global.fetch = createFetchMock({
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

      render(<UpdatePage />);

      await waitFor(() => {
        expect(screen.getByText('update-1.2.0.araupdate')).toBeInTheDocument();
        expect(screen.getByText('Installieren')).toBeInTheDocument();
      });
    });

    test('ruft fetch fuer USB-Scan auf', async () => {
      render(<UpdatePage />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/update/usb-devices',
          expect.objectContaining({ headers: expect.objectContaining({}) })
        );
      });
    });
  });

  // =====================================================
  // Update History
  // =====================================================
  describe('Update History', () => {
    test('laedt History beim Mount', async () => {
      render(<UpdatePage />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/update/history', expect.any(Object));
      });
    });

    test('zeigt History-Tabelle', async () => {
      render(<UpdatePage />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
    });

    test('zeigt deutsche Tabellen-Header', async () => {
      render(<UpdatePage />);

      await waitFor(() => {
        expect(screen.getByText('Datum')).toBeInTheDocument();
        expect(screen.getByText('Von Version')).toBeInTheDocument();
        expect(screen.getByText('Auf Version')).toBeInTheDocument();
        expect(screen.getByText('Quelle')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Dauer')).toBeInTheDocument();
      });
    });

    test('zeigt History-Eintraege', async () => {
      render(<UpdatePage />);

      await waitFor(() => {
        expect(screen.getAllByText('1.0.0').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('1.1.0')).toBeInTheDocument();
      });
    });

    test('zeigt Status-Badges auf Deutsch', async () => {
      render(<UpdatePage />);

      await waitFor(() => {
        expect(screen.getByText('Abgeschlossen')).toBeInTheDocument();
        expect(screen.getByText('Fehlgeschlagen')).toBeInTheDocument();
      });
    });

    test('zeigt Quellen auf Deutsch', async () => {
      render(<UpdatePage />);

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText('USB')).toBeInTheDocument();
      });
    });

    test('zeigt Duration in Minuten', async () => {
      render(<UpdatePage />);

      await waitFor(() => {
        expect(screen.getByText('3m')).toBeInTheDocument();
        expect(screen.getByText('1m')).toBeInTheDocument();
      });
    });

    test('zeigt Keine-Daten-Nachricht', async () => {
      global.fetch = createFetchMock({ history: [] });

      render(<UpdatePage />);

      await waitFor(() => {
        expect(screen.getByText('Kein Update-Verlauf vorhanden')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // CSS Classes
  // =====================================================
  describe('CSS Classes', () => {
    test('hat update-page Container', () => {
      const { container } = render(<UpdatePage />);
      expect(container.querySelector('.update-page')).toBeInTheDocument();
    });

    test('hat update-header', () => {
      const { container } = render(<UpdatePage />);
      expect(container.querySelector('.update-header')).toBeInTheDocument();
    });

    test('hat update-sections (USB + Upload + History)', () => {
      const { container } = render(<UpdatePage />);
      expect(container.querySelectorAll('.update-section').length).toBe(3);
    });
  });
});
