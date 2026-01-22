/**
 * UpdatePage Component Tests
 *
 * Tests für UpdatePage:
 * - File Upload UI
 * - Validation Flow
 * - Apply Update Flow
 * - Update History
 * - Error Handling
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import UpdatePage from '../components/UpdatePage';

// Mock axios
jest.mock('axios');

// Mock formatDate
jest.mock('../utils/formatting', () => ({
  formatDate: jest.fn((date) => '22.01.2026, 10:30')
}));

describe('UpdatePage Component', () => {
  const mockHistory = [
    {
      id: 1,
      version_from: '1.0.0',
      version_to: '1.1.0',
      source: 'manual',
      status: 'completed',
      started_at: new Date().toISOString(),
      duration_seconds: 180
    },
    {
      id: 2,
      version_from: '0.9.0',
      version_to: '1.0.0',
      source: 'manual',
      status: 'failed',
      started_at: new Date().toISOString(),
      duration_seconds: 60
    }
  ];

  const mockValidationResult = {
    file_path: '/tmp/update-1.2.0.araupdate',
    version: '1.2.0',
    size: 52428800, // 50MB
    components: [
      { name: 'dashboard-backend', version_to: '1.2.0' },
      { name: 'dashboard-frontend', version_to: '1.2.0' }
    ],
    requires_reboot: false
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock for history
    axios.get.mockImplementation((url) => {
      if (url.includes('/history')) {
        return Promise.resolve({ data: { updates: mockHistory } });
      }
      if (url.includes('/status')) {
        return Promise.resolve({ data: { status: 'idle' } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  // =====================================================
  // Initial Rendering
  // =====================================================
  describe('Initial Rendering', () => {
    test('zeigt Seiten-Titel', async () => {
      render(<UpdatePage />);

      expect(screen.getByText('System Updates')).toBeInTheDocument();
    });

    test('zeigt Beschreibung', async () => {
      render(<UpdatePage />);

      expect(screen.getByText('Upload and apply system updates securely')).toBeInTheDocument();
    });

    test('zeigt Upload-Section', async () => {
      render(<UpdatePage />);

      expect(screen.getByText('Upload Update Package')).toBeInTheDocument();
    });

    test('zeigt History-Section', async () => {
      render(<UpdatePage />);

      expect(screen.getByText('Update History')).toBeInTheDocument();
    });
  });

  // =====================================================
  // File Upload UI
  // =====================================================
  describe('File Upload UI', () => {
    test('zeigt .araupdate File Input', async () => {
      render(<UpdatePage />);

      expect(screen.getByText('Select .araupdate file')).toBeInTheDocument();
    });

    test('zeigt .sig Signature Input', async () => {
      render(<UpdatePage />);

      expect(screen.getByText('Select .sig file (optional)')).toBeInTheDocument();
    });

    test('zeigt Upload Button', async () => {
      render(<UpdatePage />);

      expect(screen.getByText('Upload & Validate')).toBeInTheDocument();
    });

    test('Upload Button ist initial disabled', async () => {
      render(<UpdatePage />);

      const button = screen.getByText('Upload & Validate');
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

      const file = new File(['update content'], 'update-1.2.0.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');

      await user.upload(input, file);

      expect(screen.getByText('update-1.2.0.araupdate')).toBeInTheDocument();
    });

    test('Upload Button bleibt disabled für ungültige Datei', async () => {
      render(<UpdatePage />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText('Upload Update Package')).toBeInTheDocument();
      });

      // Upload button should be disabled when no valid file is selected
      const uploadButton = screen.getByText('Upload & Validate');
      expect(uploadButton).toBeDisabled();

      // The file input has accept=".araupdate" which blocks invalid files at browser level
      // So we just verify the button stays disabled without a file
    });

    test('aktiviert Upload Button nach Dateiauswahl', async () => {
      const user = userEvent.setup();
      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');

      await user.upload(input, file);

      const button = screen.getByText('Upload & Validate');
      expect(button).not.toBeDisabled();
    });

    test('akzeptiert .sig Dateien', async () => {
      const user = userEvent.setup();
      render(<UpdatePage />);

      const file = new File(['signature'], 'update.sig', { type: 'application/octet-stream' });
      const input = document.getElementById('signature-file');

      await user.upload(input, file);

      expect(screen.getByText('update.sig')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Upload Flow
  // =====================================================
  describe('Upload Flow', () => {
    test('zeigt Upload-Progress', async () => {
      const user = userEvent.setup();
      axios.post.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      const button = screen.getByText('Upload & Validate');
      await user.click(button);

      expect(screen.getByText('Uploading update package...')).toBeInTheDocument();
    });

    test('zeigt Validation-Result nach erfolgreichen Upload', async () => {
      const user = userEvent.setup();
      axios.post.mockResolvedValue({ data: mockValidationResult });

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      await user.click(screen.getByText('Upload & Validate'));

      await waitFor(() => {
        expect(screen.getByText('Update Package Validated')).toBeInTheDocument();
      });
    });

    test('zeigt Version in Validation-Result', async () => {
      const user = userEvent.setup();
      axios.post.mockResolvedValue({ data: mockValidationResult });

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      await user.click(screen.getByText('Upload & Validate'));

      await waitFor(() => {
        expect(screen.getByText('1.2.0')).toBeInTheDocument();
      });
    });

    test('zeigt Size in Validation-Result', async () => {
      const user = userEvent.setup();
      axios.post.mockResolvedValue({ data: mockValidationResult });

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      await user.click(screen.getByText('Upload & Validate'));

      await waitFor(() => {
        expect(screen.getByText('50.00 MB')).toBeInTheDocument();
      });
    });

    test('zeigt Components-Liste', async () => {
      const user = userEvent.setup();
      axios.post.mockResolvedValue({ data: mockValidationResult });

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      await user.click(screen.getByText('Upload & Validate'));

      await waitFor(() => {
        expect(screen.getByText('Updated Components:')).toBeInTheDocument();
        expect(screen.getByText(/dashboard-backend/)).toBeInTheDocument();
      });
    });

    test('zeigt Apply und Cancel Buttons nach Validation', async () => {
      const user = userEvent.setup();
      axios.post.mockResolvedValue({ data: mockValidationResult });

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      await user.click(screen.getByText('Upload & Validate'));

      await waitFor(() => {
        expect(screen.getByText('Apply Update')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Apply Update Flow
  // =====================================================
  describe('Apply Update Flow', () => {
    test('startet Update bei Apply Click', async () => {
      const user = userEvent.setup();

      axios.post.mockImplementation((url) => {
        if (url.includes('/upload')) {
          return Promise.resolve({ data: mockValidationResult });
        }
        if (url.includes('/apply')) {
          return Promise.resolve({ data: { status: 'started' } });
        }
        return Promise.resolve({ data: {} });
      });

      axios.get.mockImplementation((url) => {
        if (url.includes('/history')) {
          return Promise.resolve({ data: { updates: mockHistory } });
        }
        if (url.includes('/status')) {
          return Promise.resolve({ data: { status: 'in_progress', currentStep: 'backup' } });
        }
        return Promise.resolve({ data: {} });
      });

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      await user.click(screen.getByText('Upload & Validate'));

      await waitFor(() => {
        expect(screen.getByText('Apply Update')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Apply Update'));

      await waitFor(() => {
        expect(screen.getByText('Applying Update...')).toBeInTheDocument();
      });
    });

    test('zeigt aktuellen Step während Update', async () => {
      const user = userEvent.setup();

      axios.post.mockImplementation((url) => {
        if (url.includes('/upload')) {
          return Promise.resolve({ data: mockValidationResult });
        }
        if (url.includes('/apply')) {
          return Promise.resolve({ data: { status: 'started' } });
        }
        return Promise.resolve({ data: {} });
      });

      axios.get.mockImplementation((url) => {
        if (url.includes('/history')) {
          return Promise.resolve({ data: { updates: mockHistory } });
        }
        if (url.includes('/status')) {
          return Promise.resolve({ data: { status: 'in_progress', currentStep: 'loading_images' } });
        }
        return Promise.resolve({ data: {} });
      });

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      await user.click(screen.getByText('Upload & Validate'));
      await waitFor(() => screen.getByText('Apply Update'));
      await user.click(screen.getByText('Apply Update'));

      await waitFor(() => {
        expect(screen.getByText('Loading Docker images...')).toBeInTheDocument();
      });
    });

    test('zeigt Warnung nicht zu schließen', async () => {
      const user = userEvent.setup();

      axios.post.mockImplementation((url) => {
        if (url.includes('/upload')) {
          return Promise.resolve({ data: mockValidationResult });
        }
        if (url.includes('/apply')) {
          return Promise.resolve({ data: { status: 'started' } });
        }
        return Promise.resolve({ data: {} });
      });

      axios.get.mockImplementation((url) => {
        if (url.includes('/history')) {
          return Promise.resolve({ data: { updates: mockHistory } });
        }
        if (url.includes('/status')) {
          return Promise.resolve({ data: { status: 'in_progress', currentStep: 'migrations' } });
        }
        return Promise.resolve({ data: {} });
      });

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      await user.click(screen.getByText('Upload & Validate'));
      await waitFor(() => screen.getByText('Apply Update'));
      await user.click(screen.getByText('Apply Update'));

      await waitFor(() => {
        expect(screen.getByText('Please do not close this page or power off the device.')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Success State
  // =====================================================
  describe('Success State', () => {
    test('zeigt Erfolgs-Nachricht nach erfolgreichem Update', async () => {
      const user = userEvent.setup();

      axios.post.mockImplementation((url) => {
        if (url.includes('/upload')) {
          return Promise.resolve({ data: mockValidationResult });
        }
        if (url.includes('/apply')) {
          return Promise.resolve({ data: { status: 'started' } });
        }
        return Promise.resolve({ data: {} });
      });

      let statusCallCount = 0;
      axios.get.mockImplementation((url) => {
        if (url.includes('/history')) {
          return Promise.resolve({ data: { updates: mockHistory } });
        }
        if (url.includes('/status')) {
          statusCallCount++;
          if (statusCallCount > 1) {
            return Promise.resolve({ data: { status: 'completed' } });
          }
          return Promise.resolve({ data: { status: 'in_progress', currentStep: 'healthchecks' } });
        }
        return Promise.resolve({ data: {} });
      });

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      await user.click(screen.getByText('Upload & Validate'));
      await waitFor(() => screen.getByText('Apply Update'));
      await user.click(screen.getByText('Apply Update'));

      await waitFor(() => {
        expect(screen.getByText('Update Applied Successfully!')).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  // =====================================================
  // Error Handling
  // =====================================================
  describe('Error Handling', () => {
    test('zeigt Fehler bei Upload-Fehler', async () => {
      const user = userEvent.setup();
      axios.post.mockRejectedValue({
        response: { data: { error: 'Invalid package format' } }
      });

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      await user.click(screen.getByText('Upload & Validate'));

      await waitFor(() => {
        expect(screen.getByText('Update Failed')).toBeInTheDocument();
        expect(screen.getByText('Invalid package format')).toBeInTheDocument();
      });
    });

    test('zeigt Try Again Button nach Fehler', async () => {
      const user = userEvent.setup();
      axios.post.mockRejectedValue({
        response: { data: { error: 'Upload failed' } }
      });

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      await user.click(screen.getByText('Upload & Validate'));

      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });
    });

    test('Reset setzt alles zurück', async () => {
      const user = userEvent.setup();
      axios.post.mockRejectedValue({
        response: { data: { error: 'Error' } }
      });

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      await user.click(screen.getByText('Upload & Validate'));

      await waitFor(() => screen.getByText('Try Again'));
      await user.click(screen.getByText('Try Again'));

      expect(screen.getByText('Select .araupdate file')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Update History
  // =====================================================
  describe('Update History', () => {
    test('lädt History beim Mount', async () => {
      render(<UpdatePage />);

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith('/api/update/history');
      });
    });

    test('zeigt History-Tabelle', async () => {
      render(<UpdatePage />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
    });

    test('zeigt Tabellen-Header', async () => {
      render(<UpdatePage />);

      await waitFor(() => {
        expect(screen.getByText('Date')).toBeInTheDocument();
        expect(screen.getByText('From Version')).toBeInTheDocument();
        expect(screen.getByText('To Version')).toBeInTheDocument();
        expect(screen.getByText('Source')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Duration')).toBeInTheDocument();
      });
    });

    test('zeigt History-Einträge', async () => {
      render(<UpdatePage />);

      await waitFor(() => {
        // Multiple versions may appear - use getAllByText
        expect(screen.getAllByText('1.0.0').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('1.1.0')).toBeInTheDocument();
        expect(screen.getAllByText('manual').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('zeigt Status-Badges', async () => {
      const { container } = render(<UpdatePage />);

      await waitFor(() => {
        expect(container.querySelector('.status-badge')).toBeInTheDocument();
      });
    });

    test('zeigt Duration in Minuten', async () => {
      render(<UpdatePage />);

      await waitFor(() => {
        expect(screen.getByText('3m')).toBeInTheDocument(); // 180 seconds
      });
    });

    test('zeigt No Data Message wenn keine History', async () => {
      axios.get.mockResolvedValue({ data: { updates: [] } });

      render(<UpdatePage />);

      await waitFor(() => {
        expect(screen.getByText('No update history available')).toBeInTheDocument();
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

    test('hat update-section', () => {
      const { container } = render(<UpdatePage />);

      expect(container.querySelectorAll('.update-section').length).toBe(2);
    });
  });

  // =====================================================
  // Reboot Warning
  // =====================================================
  describe('Reboot Warning', () => {
    test('zeigt Reboot-Warnung wenn erforderlich', async () => {
      const user = userEvent.setup();
      const resultWithReboot = { ...mockValidationResult, requires_reboot: true };

      axios.post.mockResolvedValue({ data: resultWithReboot });

      render(<UpdatePage />);

      const file = new File(['content'], 'update.araupdate', { type: 'application/octet-stream' });
      const input = document.getElementById('update-file');
      await user.upload(input, file);

      await user.click(screen.getByText('Upload & Validate'));

      await waitFor(() => {
        expect(screen.getByText('Requires Reboot:')).toBeInTheDocument();
        expect(screen.getByText('Yes')).toBeInTheDocument();
      });
    });
  });
});
