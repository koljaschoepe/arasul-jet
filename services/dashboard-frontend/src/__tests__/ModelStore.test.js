/**
 * ModelStore Component Tests
 *
 * Tests für den Model Store:
 * - Katalog-Anzeige
 * - Download-Funktionalität
 * - Aktivierung/Deaktivierung
 * - Default Model Auswahl
 * - Progress Tracking
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelStore from '../components/ModelStore';
import { DownloadProvider } from '../contexts/DownloadContext';

// Helper to render with DownloadProvider
const renderWithProvider = (ui) => {
  return render(
    <DownloadProvider>
      {ui}
    </DownloadProvider>
  );
};

describe('ModelStore Component', () => {
  const mockCatalog = {
    models: [
      {
        id: 'qwen3:1.5b',
        name: 'qwen3:1.5b',
        size_bytes: 1073741824,
        category: 'small',
        description: 'Fast small model',
        ram_required_gb: 4,
        capabilities: ['chat'],
        install_status: 'not_installed',
      },
      {
        id: 'qwen3:7b',
        name: 'qwen3:7b',
        size_bytes: 4294967296,
        category: 'medium',
        description: 'Balanced model',
        ram_required_gb: 8,
        capabilities: ['chat', 'code'],
        install_status: 'available',
      },
      {
        id: 'qwen3:14b',
        name: 'qwen3:14b',
        size_bytes: 8589934592,
        category: 'large',
        description: 'High quality model',
        ram_required_gb: 16,
        capabilities: ['chat', 'code', 'reasoning'],
        install_status: 'not_installed',
      },
    ],
    total: 3,
  };

  const mockStatus = {
    loaded_model: { model_id: 'qwen3:7b', ram_usage_mb: 8192 },
    queue_by_model: [],
  };

  const mockDefaultResponse = {
    default_model: 'qwen3:7b',
  };

  // Helper to setup fetch mock with custom responses
  const setupFetchMock = (customResponses = {}) => {
    const responses = {
      catalog: customResponses.catalog || mockCatalog,
      status: customResponses.status || mockStatus,
      default: customResponses.default || mockDefaultResponse,
    };

    global.fetch = jest.fn((url, options) => {
      if (url.includes('/models/catalog')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(responses.catalog),
        });
      }
      if (url.includes('/models/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(responses.status),
        });
      }
      if (url.includes('/models/default')) {
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(responses.default),
        });
      }
      if (url.includes('/models/') && url.includes('/activate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      }
      if (url.includes('/models/download')) {
        return Promise.resolve({
          ok: true,
          body: {
            getReader: () => ({
              read: jest.fn()
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode('data: {"progress": 50, "status": "downloading"}\n'),
                })
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode('data: {"progress": 100, "done": true, "success": true}\n'),
                })
                .mockResolvedValueOnce({ done: true }),
            }),
          },
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupFetchMock();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Rendering', () => {
    test('rendert ModelStore korrekt', async () => {
      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('KI-Modelle')).toBeInTheDocument();
      });
    });

    test('zeigt Katalog-Kategorien', async () => {
      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('Klein')).toBeInTheDocument();
        expect(screen.getByText('Mittel')).toBeInTheDocument();
        expect(screen.getByText('Gross')).toBeInTheDocument();
      });
    });

    test('zeigt Modell-Karten', async () => {
      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        // Use getAllByText since qwen3:7b appears in loaded banner and card
        expect(screen.getAllByText('qwen3:7b').length).toBeGreaterThan(0);
        expect(screen.getByText('qwen3:1.5b')).toBeInTheDocument();
        expect(screen.getByText('qwen3:14b')).toBeInTheDocument();
      });
    });

    test('zeigt RAM-Anforderungen', async () => {
      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('4 GB')).toBeInTheDocument();
        expect(screen.getByText('8 GB')).toBeInTheDocument();
        expect(screen.getByText('16 GB')).toBeInTheDocument();
      });
    });
  });

  describe('Installed Models', () => {
    test('zeigt aktives Modell Banner', async () => {
      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        // Check for loaded model banner - text includes colon
        const banner = document.querySelector('.loaded-model-banner');
        expect(banner).toBeInTheDocument();
        expect(screen.getByText('qwen3:7b')).toBeInTheDocument();
      });
    });

    test('zeigt Aktiv Badge für geladenes Modell', async () => {
      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        // Badge text may include icon, use regex matcher
        const badges = document.querySelectorAll('.badge-loaded');
        expect(badges.length).toBeGreaterThan(0);
      });
    });

    test('zeigt Standard Badge für Default-Modell', async () => {
      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        // Badge text may include icon, use class selector
        const badges = document.querySelectorAll('.badge-default');
        expect(badges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Model Download', () => {
    test('Download-Button ist sichtbar für nicht installierte Modelle', async () => {
      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        const downloadButtons = screen.getAllByText('Herunterladen');
        expect(downloadButtons.length).toBeGreaterThan(0);
      });
    });

    test('Download startet bei Button-Click', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('qwen3:14b')).toBeInTheDocument();
      });

      const downloadButtons = screen.getAllByText('Herunterladen');
      await user.click(downloadButtons[0]);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/models/download'),
          expect.objectContaining({
            method: 'POST',
          })
        );
      });
    });
  });

  describe('Model Activation', () => {
    test('Aktivieren-Button für installierte aber nicht geladene Modelle', async () => {
      // Konfiguriere Mock für ein installiertes aber nicht geladenes Modell
      const modifiedCatalog = {
        ...mockCatalog,
        models: mockCatalog.models.map(m =>
          m.id === 'qwen3:1.5b' ? { ...m, install_status: 'available' } : m
        ),
      };
      const modifiedStatus = {
        loaded_model: null,
        queue_by_model: [],
      };

      setupFetchMock({ catalog: modifiedCatalog, status: modifiedStatus });

      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        const activateButtons = screen.getAllByText('Aktivieren');
        expect(activateButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Set Default Model', () => {
    test('Als Standard Button ist sichtbar', async () => {
      // Setup: qwen3:7b is loaded but qwen3:1.5b is installed and could be set as default
      const modifiedCatalog = {
        ...mockCatalog,
        models: mockCatalog.models.map(m =>
          m.id === 'qwen3:1.5b' ? { ...m, install_status: 'available' } : m
        ),
      };
      const modifiedDefault = { default_model: 'qwen3:14b' }; // Different default

      setupFetchMock({ catalog: modifiedCatalog, default: modifiedDefault });

      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        // Buttons mit Star-Icon für "Als Standard setzen"
        const buttons = screen.getAllByTitle('Als Standard setzen');
        expect(buttons.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Error Handling', () => {
    test('zeigt Fehler bei Katalog-Ladefehler', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network Error'));

      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText(/fehler/i)).toBeInTheDocument();
      });
    });

    test('zeigt spezifischen Fehler bei API-Fehler', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText(/fehler beim laden/i)).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    test('zeigt Loading während Katalog geladen wird', () => {
      global.fetch = jest.fn(() => new Promise(() => {})); // Never resolves

      renderWithProvider(<ModelStore />);

      expect(screen.getByText(/lade modell-katalog/i)).toBeInTheDocument();
    });
  });

  describe('No Model Loaded', () => {
    test('zeigt Hinweis wenn kein Modell geladen', async () => {
      const noModelStatus = {
        loaded_model: null,
        queue_by_model: [],
      };

      setupFetchMock({ status: noModelStatus });

      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText(/kein modell geladen/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe('Model Capabilities', () => {
    test('zeigt Modell-Fähigkeiten', async () => {
      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        // Look for capability tags with 'chat' text
        const capabilityTags = document.querySelectorAll('.capability-tag');
        const hasChat = Array.from(capabilityTags).some(tag => tag.textContent === 'chat');
        expect(hasChat).toBe(true);
      });
    });
  });
});
