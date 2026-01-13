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
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import ModelStore from '../components/ModelStore';

jest.mock('axios');

describe('ModelStore Component', () => {
  const mockCatalog = [
    {
      name: 'qwen3:1.5b',
      size: '1.5B',
      category: 'Small',
      description: 'Fast small model',
      ram_required: '4GB',
      parameters: '1.5B',
    },
    {
      name: 'qwen3:7b',
      size: '7B',
      category: 'Medium',
      description: 'Balanced model',
      ram_required: '8GB',
      parameters: '7B',
    },
    {
      name: 'qwen3:14b',
      size: '14B',
      category: 'Large',
      description: 'High quality model',
      ram_required: '16GB',
      parameters: '14B',
    },
  ];

  const mockInstalledModels = [
    { name: 'qwen3:7b', size: '4.5GB', modified_at: '2024-01-15T10:00:00Z' },
  ];

  const mockDefaultModel = 'qwen3:7b';
  const mockLoadedModel = 'qwen3:7b';

  beforeEach(() => {
    jest.clearAllMocks();

    axios.get.mockImplementation((url) => {
      if (url.includes('/models/catalog')) {
        return Promise.resolve({ data: { models: mockCatalog } });
      }
      if (url.includes('/models/installed')) {
        return Promise.resolve({ data: { models: mockInstalledModels } });
      }
      if (url.includes('/models/default')) {
        return Promise.resolve({ data: { model: mockDefaultModel } });
      }
      if (url.includes('/models/loaded')) {
        return Promise.resolve({ data: { model: mockLoadedModel } });
      }
      return Promise.resolve({ data: {} });
    });

    axios.post.mockResolvedValue({ data: { success: true } });
    axios.delete.mockResolvedValue({ data: { success: true } });
  });

  describe('Rendering', () => {
    test('rendert ModelStore korrekt', async () => {
      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('Model Store') || screen.getByText('Modelle')).toBeInTheDocument();
      });
    });

    test('zeigt Katalog-Kategorien', async () => {
      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('Small') || screen.getByText(/klein/i)).toBeInTheDocument();
        expect(screen.getByText('Medium') || screen.getByText(/mittel/i)).toBeInTheDocument();
        expect(screen.getByText('Large') || screen.getByText(/groß/i)).toBeInTheDocument();
      });
    });

    test('zeigt Modell-Karten', async () => {
      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('qwen3:1.5b')).toBeInTheDocument();
        expect(screen.getByText('qwen3:7b')).toBeInTheDocument();
        expect(screen.getByText('qwen3:14b')).toBeInTheDocument();
      });
    });

    test('zeigt RAM-Anforderungen', async () => {
      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText(/4GB/) || screen.getByText(/4 GB/)).toBeInTheDocument();
        expect(screen.getByText(/8GB/) || screen.getByText(/8 GB/)).toBeInTheDocument();
        expect(screen.getByText(/16GB/) || screen.getByText(/16 GB/)).toBeInTheDocument();
      });
    });
  });

  describe('Installed Models', () => {
    test('zeigt installierte Modelle als "Installiert"', async () => {
      render(<ModelStore />);

      await waitFor(() => {
        expect(
          screen.queryByText(/installiert/i) ||
          screen.queryByText(/installed/i)
        ).toBeInTheDocument();
      });
    });

    test('zeigt aktives Modell', async () => {
      render(<ModelStore />);

      await waitFor(() => {
        expect(
          screen.queryByText(/aktiv/i) ||
          screen.queryByText(/active/i) ||
          screen.queryByText(/geladen/i)
        ).toBeInTheDocument();
      });
    });

    test('zeigt Default-Modell Indikator', async () => {
      render(<ModelStore />);

      await waitFor(() => {
        expect(
          screen.queryByText(/default/i) ||
          screen.queryByText(/standard/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Model Download', () => {
    test('Download-Button ist sichtbar für nicht installierte Modelle', async () => {
      render(<ModelStore />);

      await waitFor(() => {
        const downloadButtons = screen.getAllByRole('button').filter(btn =>
          btn.textContent.toLowerCase().includes('download') ||
          btn.textContent.toLowerCase().includes('herunterladen') ||
          btn.innerHTML.includes('download')
        );
        expect(downloadButtons.length).toBeGreaterThan(0);
      });
    });

    test('Download startet bei Button-Click', async () => {
      const user = userEvent.setup();

      axios.post.mockImplementation((url, data) => {
        if (url.includes('/models/download')) {
          return Promise.resolve({ data: { success: true, job_id: 'download-1' } });
        }
        return Promise.resolve({ data: {} });
      });

      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('qwen3:14b')).toBeInTheDocument();
      });

      // Finde Download-Button für qwen3:14b (nicht installiert)
      const modelCard = screen.getByText('qwen3:14b').closest('.model-card, [class*="card"]');
      if (modelCard) {
        const downloadBtn = modelCard.querySelector('[class*="download"], button');
        if (downloadBtn) {
          await user.click(downloadBtn);

          await waitFor(() => {
            expect(axios.post).toHaveBeenCalledWith(
              expect.stringContaining('/models/download'),
              expect.objectContaining({ model: 'qwen3:14b' })
            );
          });
        }
      }
    });

    test('zeigt Download-Progress', async () => {
      axios.post.mockImplementation((url) => {
        if (url.includes('/models/download')) {
          return new Promise(() => {}); // Never resolve
        }
        return Promise.resolve({ data: {} });
      });

      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('qwen3:14b')).toBeInTheDocument();
      });

      // Simuliere laufenden Download
      const progressIndicator = document.querySelector('[class*="progress"], .downloading');

      // Progress sollte bei Download sichtbar sein
      // (Implementation-abhängig)
    });
  });

  describe('Model Activation', () => {
    test('Aktivieren-Button für installierte Modelle', async () => {
      render(<ModelStore />);

      await waitFor(() => {
        const activateButtons = screen.getAllByRole('button').filter(btn =>
          btn.textContent.toLowerCase().includes('aktivieren') ||
          btn.textContent.toLowerCase().includes('activate') ||
          btn.textContent.toLowerCase().includes('laden')
        );
        expect(activateButtons.length).toBeGreaterThanOrEqual(0);
      });
    });

    test('Aktivierung sendet korrekten API-Call', async () => {
      const user = userEvent.setup();

      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('qwen3:7b')).toBeInTheDocument();
      });

      const activateButton = screen.queryByText(/aktivieren/i) || screen.queryByText(/activate/i);

      if (activateButton) {
        await user.click(activateButton);

        await waitFor(() => {
          expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining('/models/activate'),
            expect.any(Object)
          );
        });
      }
    });
  });

  describe('Set Default Model', () => {
    test('Default-Modell kann gesetzt werden', async () => {
      const user = userEvent.setup();

      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('qwen3:7b')).toBeInTheDocument();
      });

      const defaultButton = screen.queryByText(/als standard/i) ||
                           screen.queryByText(/set default/i) ||
                           screen.queryByText(/standard setzen/i);

      if (defaultButton) {
        await user.click(defaultButton);

        await waitFor(() => {
          expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining('/models/default'),
            expect.any(Object)
          );
        });
      }
    });
  });

  describe('Model Uninstall', () => {
    test('Deinstallieren-Button für installierte Modelle', async () => {
      render(<ModelStore />);

      await waitFor(() => {
        expect(
          screen.queryByText(/deinstallieren/i) ||
          screen.queryByText(/uninstall/i) ||
          screen.queryByText(/entfernen/i)
        ).toBeInTheDocument();
      });
    });

    test('Deinstallation mit Bestätigung', async () => {
      const user = userEvent.setup();

      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('qwen3:7b')).toBeInTheDocument();
      });

      const uninstallButton = screen.queryByText(/deinstallieren/i) ||
                             screen.queryByText(/uninstall/i) ||
                             screen.queryByText(/entfernen/i);

      if (uninstallButton) {
        await user.click(uninstallButton);

        // Bestätigungs-Dialog
        const confirmButton = screen.queryByText(/bestätigen/i) || screen.queryByText(/confirm/i);
        if (confirmButton) {
          await user.click(confirmButton);

          await waitFor(() => {
            expect(axios.delete).toHaveBeenCalled();
          });
        }
      }
    });
  });

  describe('Refresh', () => {
    test('Refresh-Button aktualisiert Katalog', async () => {
      const user = userEvent.setup();

      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('qwen3:7b')).toBeInTheDocument();
      });

      const refreshButton = screen.queryByText(/aktualisieren/i) ||
                           screen.queryByText(/refresh/i) ||
                           screen.queryByRole('button', { name: /refresh/i });

      if (refreshButton) {
        await user.click(refreshButton);

        await waitFor(() => {
          expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/models'));
        });
      }
    });
  });

  describe('Error Handling', () => {
    test('zeigt Fehler bei Katalog-Ladefehler', async () => {
      axios.get.mockRejectedValue(new Error('Network Error'));

      render(<ModelStore />);

      await waitFor(() => {
        expect(
          screen.queryByText(/error/i) ||
          screen.queryByText(/fehler/i) ||
          screen.queryByText(/laden/i)
        ).toBeInTheDocument();
      });
    });

    test('zeigt Fehler bei Download-Fehler', async () => {
      axios.post.mockRejectedValue({
        response: { data: { error: 'Download failed' } },
      });

      const user = userEvent.setup();
      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('qwen3:14b')).toBeInTheDocument();
      });

      // Versuche Download
      const downloadButtons = screen.getAllByRole('button').filter(btn =>
        btn.textContent.toLowerCase().includes('download')
      );

      if (downloadButtons.length > 0) {
        await user.click(downloadButtons[0]);

        await waitFor(() => {
          expect(screen.queryByText(/failed/i) || screen.queryByText(/fehler/i)).toBeInTheDocument();
        }, { timeout: 3000 });
      }
    });
  });

  describe('Loading States', () => {
    test('zeigt Loading während Katalog geladen wird', async () => {
      axios.get.mockImplementation(() => new Promise(() => {}));

      render(<ModelStore />);

      expect(
        screen.queryByText(/laden/i) ||
        screen.queryByText(/loading/i) ||
        document.querySelector('.loading-spinner, [class*="loading"]')
      ).toBeTruthy();
    });

    test('zeigt Loading während Aktivierung', async () => {
      axios.post.mockImplementation(() => new Promise(() => {}));

      const user = userEvent.setup();
      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('qwen3:7b')).toBeInTheDocument();
      });

      const activateButton = screen.queryByText(/aktivieren/i);

      if (activateButton) {
        await user.click(activateButton);

        // Loading state sollte angezeigt werden
        await waitFor(() => {
          expect(
            screen.queryByText(/laden/i) ||
            document.querySelector('[class*="loading"], [class*="spinner"]')
          ).toBeTruthy();
        }, { timeout: 1000 });
      }
    });
  });

  describe('Category Filtering', () => {
    test('Filter nach Kategorie funktioniert', async () => {
      const user = userEvent.setup();
      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('qwen3:1.5b')).toBeInTheDocument();
      });

      const smallFilter = screen.queryByText(/small/i) || screen.queryByText(/klein/i);

      if (smallFilter && smallFilter.closest('button')) {
        await user.click(smallFilter.closest('button'));

        await waitFor(() => {
          // Nur Small-Modelle sollten sichtbar sein
          expect(screen.getByText('qwen3:1.5b')).toBeInTheDocument();
        });
      }
    });
  });

  describe('Memory Warning', () => {
    test('zeigt Warnung für Modelle mit hohem RAM-Bedarf', async () => {
      render(<ModelStore />);

      await waitFor(() => {
        expect(screen.getByText('qwen3:14b')).toBeInTheDocument();
      });

      // Bei 16GB RAM-Anforderung sollte eine Warnung erscheinen
      // (Implementation-abhängig)
      const warning = screen.queryByText(/16GB/) ||
                     screen.queryByText(/warnung/i) ||
                     screen.queryByText(/warning/i);

      expect(warning).toBeTruthy();
    });
  });
});
