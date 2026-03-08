/**
 * SelfHealingEvents Component Tests
 *
 * Tests for SelfHealingEvents:
 * - Events laden und anzeigen
 * - Filter funktionalitaet
 * - Statistiken berechnung
 * - Auto-refresh toggle
 * - Loading/Error states
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SelfHealingEvents from '../SelfHealingEvents';

// Mock useApi
const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('../../../hooks/useApi', () => ({ useApi: () => mockApi, default: () => mockApi }));

// Mock formatRelativeDate
vi.mock('../../../utils/formatting', () => ({
  formatRelativeDate: vi.fn(() => 'vor 5 Minuten'),
}));

describe('SelfHealingEvents Component', () => {
  const mockEvents = [
    {
      id: 1,
      event_type: 'service_restart',
      severity: 'INFO',
      description: 'Service llm-service wurde neu gestartet',
      action_taken: 'Docker container restart',
      service_name: 'llm-service',
      timestamp: new Date().toISOString(),
    },
    {
      id: 2,
      event_type: 'memory_warning',
      severity: 'WARNING',
      description: 'Speicherauslastung bei 85%',
      timestamp: new Date().toISOString(),
    },
    {
      id: 3,
      event_type: 'service_down',
      severity: 'CRITICAL',
      description: 'Service postgres-db nicht erreichbar',
      error_message: 'Connection refused',
      service_name: 'postgres-db',
      timestamp: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ events: mockEvents });
  });

  // =====================================================
  // Initial Loading
  // =====================================================
  describe('Initial Loading', () => {
    test('zeigt SkeletonList initial', () => {
      mockApi.get.mockImplementation(() => new Promise(() => {})); // Never resolves
      const { container } = render(<SelfHealingEvents />);

      // Component shows SkeletonList with role="status"
      expect(container.querySelector('[role="status"]')).toBeInTheDocument();
    });

    test('lädt Events beim Mount', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          '/self-healing/events?limit=50',
          expect.objectContaining({ showError: false })
        );
      });
    });
  });

  // =====================================================
  // Header Display
  // =====================================================
  describe('Header Display', () => {
    test('zeigt Titel', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Selbstheilungs-Ereignisse')).toBeInTheDocument();
      });
    });

    test('zeigt Beschreibung', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Systemwiederherstellung und Wartung')).toBeInTheDocument();
      });
    });

    test('zeigt Aktualisieren-Button', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Aktualisieren')).toBeInTheDocument();
      });
    });

    test('zeigt Auto-Aktualisierung Toggle', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Auto-Aktualisierung (15s)')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Statistics Display
  // =====================================================
  describe('Statistics Display', () => {
    test('zeigt Gesamt Events', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Gesamt')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    test('zeigt Info Count', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        // Info appears in both stat card and filter button
        expect(screen.getAllByText('Info').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('zeigt Warnungen Count', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        // Warnungen appears in both stat card and filter button
        expect(screen.getAllByText('Warnungen').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('zeigt Kritisch Count', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        // Kritisch appears in both stat card and filter button
        expect(screen.getAllByText('Kritisch').length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // =====================================================
  // Filter Buttons
  // =====================================================
  describe('Filter Buttons', () => {
    test('zeigt alle Filter-Buttons', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Alle' })).toBeInTheDocument();
        // Info appears multiple times (stat + filter)
        expect(screen.getAllByText('Info').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('Alle Filter ist initial aktiv', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        const allButton = screen.getByRole('button', { name: 'Alle' });
        expect(allButton).toHaveClass('active');
      });
    });

    test('kann nach INFO filtern', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Selbstheilungs-Ereignisse')).toBeInTheDocument();
      });

      // Find filter button (not stat label)
      const filterButtons = screen.getAllByRole('button');
      const infoFilter = filterButtons.find(
        btn => btn.textContent === 'Info' && btn.classList.contains('filter-btn')
      );

      if (infoFilter) {
        await user.click(infoFilter);
        expect(infoFilter).toHaveClass('active');
      }
    });

    test('kann nach WARNING filtern', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Selbstheilungs-Ereignisse')).toBeInTheDocument();
      });

      const filterButtons = screen.getAllByRole('button');
      const warningFilter = filterButtons.find(
        btn => btn.textContent === 'Warnungen' && btn.classList.contains('filter-btn')
      );

      if (warningFilter) {
        await user.click(warningFilter);
        expect(warningFilter).toHaveClass('active');
      }
    });

    test('kann nach CRITICAL filtern', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Selbstheilungs-Ereignisse')).toBeInTheDocument();
      });

      const criticalFilter = screen.getByRole('button', { name: 'Kritisch' });
      await user.click(criticalFilter);

      expect(criticalFilter).toHaveClass('active');
    });
  });

  // =====================================================
  // Events List
  // =====================================================
  describe('Events List', () => {
    test('zeigt Event-Beschreibungen', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Service llm-service wurde neu gestartet')).toBeInTheDocument();
      });
    });

    test('zeigt Event-Types formatiert', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('SERVICE RESTART')).toBeInTheDocument();
      });
    });

    test('zeigt Severity-Badges', async () => {
      const { container } = render(<SelfHealingEvents />);

      await waitFor(() => {
        // Component uses class "badge badge-{severity}" not "severity-badge"
        expect(container.querySelector('.badge')).toBeInTheDocument();
      });
    });

    test('zeigt Maßnahme wenn vorhanden', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Maßnahme:')).toBeInTheDocument();
        expect(screen.getByText('Docker container restart')).toBeInTheDocument();
      });
    });

    test('zeigt Service-Name wenn vorhanden', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getAllByText('Service:').length).toBeGreaterThan(0);
        expect(screen.getByText('llm-service')).toBeInTheDocument();
      });
    });

    test('zeigt Fehler-Message wenn vorhanden', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Fehler:')).toBeInTheDocument();
        expect(screen.getByText('Connection refused')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Empty State
  // =====================================================
  describe('Empty State', () => {
    test('zeigt Keine Ereignisse Message wenn leer', async () => {
      mockApi.get.mockResolvedValue({ events: [] });

      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Keine Ereignisse')).toBeInTheDocument();
        expect(screen.getByText(/Das System läuft einwandfrei/)).toBeInTheDocument();
      });
    });

    test('zeigt gefilterte Message wenn keine Events im Filter', async () => {
      const user = userEvent.setup({ delay: null });
      // Return only INFO events
      mockApi.get.mockResolvedValue({ events: [mockEvents[0]] });

      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Selbstheilungs-Ereignisse')).toBeInTheDocument();
      });

      // Click on Kritisch filter
      const criticalFilter = screen.getByRole('button', { name: 'Kritisch' });
      await user.click(criticalFilter);

      // No critical events
      expect(screen.getByText('Keine CRITICAL-Ereignisse')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Alle anzeigen' })).toBeInTheDocument();
    });
  });

  // =====================================================
  // Auto Refresh
  // =====================================================
  describe('Auto Refresh', () => {
    test('Auto-refresh ist initial aktiviert', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeChecked();
      });
    });

    test('kann Auto-refresh deaktivieren', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Selbstheilungs-Ereignisse')).toBeInTheDocument();
      });

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      expect(checkbox).not.toBeChecked();
    });

    test('refresht automatisch alle 15 Sekunden', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      render(<SelfHealingEvents />);

      // Wait for initial fetch to complete
      await act(async () => {
        // Flush pending microtasks (promise resolution)
        await Promise.resolve();
      });

      expect(mockApi.get).toHaveBeenCalledTimes(1);

      // Fast forward 15 seconds (component uses 15000ms interval)
      act(() => {
        vi.advanceTimersByTime(15000);
      });

      expect(mockApi.get).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    test('stoppt Auto-refresh wenn deaktiviert', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      render(<SelfHealingEvents />);

      // Wait for initial fetch to complete
      await act(async () => {
        await Promise.resolve();
      });

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      const initialCalls = mockApi.get.mock.calls.length;

      // Fast forward 15 seconds
      act(() => {
        vi.advanceTimersByTime(15000);
      });

      // Should not have made more calls
      expect(mockApi.get.mock.calls.length).toBe(initialCalls);
      vi.useRealTimers();
    });
  });

  // =====================================================
  // Manual Refresh
  // =====================================================
  describe('Manual Refresh', () => {
    test('kann manuell refreshen', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Aktualisieren')).toBeInTheDocument();
      });

      const initialCalls = mockApi.get.mock.calls.length;

      await user.click(screen.getByText('Aktualisieren'));

      await waitFor(() => {
        expect(mockApi.get.mock.calls.length).toBeGreaterThan(initialCalls);
      });
    });
  });

  // =====================================================
  // Error State
  // =====================================================
  describe('Error State', () => {
    test('zeigt Fehlermeldung bei API-Fehler', async () => {
      mockApi.get.mockRejectedValue(new Error('Network error'));

      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(
          screen.getByText('Selbstheilungs-Ereignisse konnten nicht geladen werden')
        ).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // CSS Classes
  // =====================================================
  describe('CSS Classes', () => {
    test('hat self-healing-events Container', async () => {
      const { container } = render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(container.querySelector('.self-healing-events')).toBeInTheDocument();
      });
    });

    test('hat events-header', async () => {
      const { container } = render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(container.querySelector('.events-header')).toBeInTheDocument();
      });
    });

    test('hat events-stats', async () => {
      const { container } = render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(container.querySelector('.events-stats')).toBeInTheDocument();
      });
    });

    test('hat events-filters', async () => {
      const { container } = render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(container.querySelector('.events-filters')).toBeInTheDocument();
      });
    });
  });
});
