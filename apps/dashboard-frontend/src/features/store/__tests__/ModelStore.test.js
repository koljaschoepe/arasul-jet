/**
 * ModelStore Component Tests
 *
 * Tests for the StoreModels component:
 * - Katalog-Anzeige
 * - Download-Funktionalitaet
 * - Aktivierung/Deaktivierung
 * - Default Model Auswahl
 * - Progress Tracking
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StoreModels as ModelStore } from '..';
import { DownloadProvider } from '../../../contexts/DownloadContext';
import { ToastProvider } from '../../../contexts/ToastContext';

// Helper to render with required providers (Router needed for useSearchParams)
const renderWithProvider = ui => {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <DownloadProvider>{ui}</DownloadProvider>
      </ToastProvider>
    </MemoryRouter>
  );
};

describe('ModelStore Component', () => {
  const mockCatalog = {
    models: [
      {
        id: 'qwen3:1.5b',
        name: 'qwen3:1.5b',
        effective_ollama_name: 'qwen3:1.5b',
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
        effective_ollama_name: 'qwen3:7b',
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
        effective_ollama_name: 'qwen3:14b',
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
          status: 200,
          json: () => Promise.resolve(responses.catalog),
        });
      }
      if (url.includes('/models/status')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(responses.status),
        });
      }
      if (url.includes('/models/default')) {
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(responses.default),
        });
      }
      if (url.includes('/models/') && url.includes('/activate')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        });
      }
      if (url.includes('/models/download')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => 'text/event-stream' },
          body: {
            getReader: () => ({
              read: jest
                .fn()
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode(
                    'data: {"progress": 50, "status": "downloading"}\n'
                  ),
                })
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode(
                    'data: {"progress": 100, "done": true, "success": true}\n'
                  ),
                })
                .mockResolvedValueOnce({ done: true }),
            }),
          },
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    setupFetchMock();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // Helper: render and wait for loading to finish
  const renderAndWait = async customResponses => {
    if (customResponses) setupFetchMock(customResponses);
    renderWithProvider(<ModelStore />);
    // Flush pending promises and timers to let data load
    await waitFor(() => {
      expect(screen.queryByText(/lade modell-katalog/i)).not.toBeInTheDocument();
    });
  };

  describe('Rendering', () => {
    test('rendert ModelStore korrekt', async () => {
      await renderAndWait();

      // Component renders a div.store-models with model cards
      // Verify the catalog loaded by checking for a model name
      expect(screen.getByText('qwen3:1.5b')).toBeInTheDocument();
    });

    test('zeigt Katalog-Kategorien', async () => {
      await renderAndWait();

      // Size filter chips: Klein, Mittel, Gross (from sizeConfig)
      expect(screen.getAllByText('Klein').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Mittel').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Gross').length).toBeGreaterThan(0);
    });

    test('zeigt Modell-Karten', async () => {
      await renderAndWait();

      // Use getAllByText since qwen3:7b appears in loaded banner and card
      expect(screen.getAllByText('qwen3:7b').length).toBeGreaterThan(0);
      expect(screen.getByText('qwen3:1.5b')).toBeInTheDocument();
      expect(screen.getByText('qwen3:14b')).toBeInTheDocument();
    });

    test('zeigt RAM-Anforderungen', async () => {
      await renderAndWait();

      // Component renders: {model.ram_required_gb} GB in spec-value spans
      expect(screen.getByText('4 GB')).toBeInTheDocument();
      expect(screen.getByText('8 GB')).toBeInTheDocument();
      expect(screen.getByText('16 GB')).toBeInTheDocument();
    });
  });

  describe('Installed Models', () => {
    test('zeigt aktives Modell Banner', async () => {
      await renderAndWait();

      // Check for loaded model banner
      const banner = document.querySelector('.loaded-model-banner');
      expect(banner).toBeInTheDocument();
      // Model name appears in banner (strong) and in card (h3), use getAllByText
      expect(screen.getAllByText('qwen3:7b').length).toBeGreaterThan(0);
    });

    test('zeigt Aktiv Badge fuer geladenes Modell', async () => {
      await renderAndWait();

      // Badge with class .badge-loaded exists for the loaded model
      const badges = document.querySelectorAll('.badge-loaded');
      expect(badges.length).toBeGreaterThan(0);
    });

    test('zeigt Standard Badge fuer Default-Modell', async () => {
      await renderAndWait();

      // Badge with class .badge-default exists for the default model
      const badges = document.querySelectorAll('.badge-default');
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  describe('Model Download', () => {
    test('Download-Button ist sichtbar fuer nicht installierte Modelle', async () => {
      await renderAndWait();

      const downloadButtons = screen.getAllByText(/Herunterladen/);
      expect(downloadButtons.length).toBeGreaterThan(0);
    });

    test('Download startet bei Button-Click', async () => {
      jest.useRealTimers();
      const user = userEvent.setup();
      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('qwen3:14b')).toBeInTheDocument();
      });

      const downloadButtons = screen.getAllByText(/Herunterladen/);
      await user.click(downloadButtons[0]);

      // DownloadContext calls fetch directly to /models/download
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
    test('Aktivieren-Button fuer installierte aber nicht geladene Modelle', async () => {
      jest.useRealTimers();

      // qwen3:1.5b is installed, no model is loaded
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

      // Wait for loading to complete and Aktivieren buttons to appear
      await waitFor(() => {
        expect(screen.queryByText(/lade modell-katalog/i)).not.toBeInTheDocument();
      });

      // Both qwen3:1.5b and qwen3:7b are installed (available) and not loaded
      // Look for .btn-success buttons (Aktivieren buttons)
      await waitFor(() => {
        const successButtons = document.querySelectorAll('.btn-success');
        expect(successButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Set Default Model', () => {
    test('Als Standard Button ist sichtbar', async () => {
      // Setup: qwen3:7b is loaded, qwen3:1.5b is installed, default is qwen3:14b
      const modifiedCatalog = {
        ...mockCatalog,
        models: mockCatalog.models.map(m =>
          m.id === 'qwen3:1.5b' ? { ...m, install_status: 'available' } : m
        ),
      };
      const modifiedDefault = { default_model: 'qwen3:14b' }; // Different default

      await renderAndWait({ catalog: modifiedCatalog, default: modifiedDefault });

      // Buttons with title "Als Standard setzen"
      const buttons = screen.getAllByTitle('Als Standard setzen');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
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
      // useApi reads res.json() on non-ok responses, so we must provide .json()
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ message: 'Internal Server Error' }),
      });

      renderWithProvider(<ModelStore />);

      await waitFor(() => {
        // The component catches and sets: 'Fehler beim Laden der Modell-Daten'
        expect(screen.getByText(/fehler beim laden/i)).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    test('zeigt Loading waehrend Katalog geladen wird', () => {
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

      await renderAndWait({ status: noModelStatus });

      expect(screen.getByText(/kein modell geladen/i)).toBeInTheDocument();
    });
  });

  describe('Model Capabilities', () => {
    test('zeigt Modell-Faehigkeiten', async () => {
      await renderAndWait();

      // Look for capability tags with 'chat' text
      const capabilityTags = document.querySelectorAll('.capability-tag');
      const hasChat = Array.from(capabilityTags).some(tag => tag.textContent === 'chat');
      expect(hasChat).toBe(true);
    });
  });
});
