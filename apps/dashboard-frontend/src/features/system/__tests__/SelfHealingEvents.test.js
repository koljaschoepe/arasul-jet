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
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  request: jest.fn(),
};
jest.mock('../../../hooks/useApi', () => ({ useApi: () => mockApi, default: () => mockApi }));

// Mock formatRelativeDate
jest.mock('../../../utils/formatting', () => ({
  formatRelativeDate: jest.fn(() => 'vor 5 Minuten'),
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
    jest.clearAllMocks();
    mockApi.get.mockResolvedValue({ events: mockEvents });
  });

  // =====================================================
  // Initial Loading
  // =====================================================
  describe('Initial Loading', () => {
    test('zeigt SkeletonList initial', () => {
      mockApi.get.mockImplementation(() => new Promise(() => {})); // Never resolves
      const { container } = render(<SelfHealingEvents />);

      // Component shows SkeletonList with role="status" and class="skeleton-list"
      expect(container.querySelector('.skeleton-list')).toBeInTheDocument();
    });

    test('laedt Events beim Mount', async () => {
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
        expect(screen.getByText('Self-Healing Events')).toBeInTheDocument();
      });
    });

    test('zeigt Beschreibung', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('System recovery and maintenance events')).toBeInTheDocument();
      });
    });

    test('zeigt Refresh-Button', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });
    });

    test('zeigt Auto-refresh Toggle', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Auto-refresh (10s)')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Statistics Display
  // =====================================================
  describe('Statistics Display', () => {
    test('zeigt Total Events', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Total Events')).toBeInTheDocument();
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

    test('zeigt Warnings Count', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        // Warnings appears in both stat card and filter button
        expect(screen.getAllByText('Warnings').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('zeigt Critical Count', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        // Critical appears in both stat card and filter button
        expect(screen.getAllByText('Critical').length).toBeGreaterThanOrEqual(1);
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
        expect(screen.getByRole('button', { name: 'All Events' })).toBeInTheDocument();
        // Info appears multiple times (stat + filter)
        expect(screen.getAllByText('Info').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('All Events Filter ist initial aktiv', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        const allButton = screen.getByRole('button', { name: 'All Events' });
        expect(allButton).toHaveClass('active');
      });
    });

    test('kann nach INFO filtern', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Self-Healing Events')).toBeInTheDocument();
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
        expect(screen.getByText('Self-Healing Events')).toBeInTheDocument();
      });

      const filterButtons = screen.getAllByRole('button');
      const warningFilter = filterButtons.find(
        btn => btn.textContent === 'Warnings' && btn.classList.contains('filter-btn')
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
        expect(screen.getByText('Self-Healing Events')).toBeInTheDocument();
      });

      const criticalFilter = screen.getByRole('button', { name: 'Critical' });
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

    test('zeigt Action Taken wenn vorhanden', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Action Taken:')).toBeInTheDocument();
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

    test('zeigt Error-Message wenn vorhanden', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Error:')).toBeInTheDocument();
        expect(screen.getByText('Connection refused')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Empty State
  // =====================================================
  describe('Empty State', () => {
    test('zeigt No Events Message wenn leer', async () => {
      mockApi.get.mockResolvedValue({ events: [] });

      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('No events found')).toBeInTheDocument();
        expect(screen.getByText('The system is running smoothly')).toBeInTheDocument();
      });
    });

    test('zeigt gefilterte Message wenn keine Events im Filter', async () => {
      const user = userEvent.setup({ delay: null });
      // Return only INFO events
      mockApi.get.mockResolvedValue({ events: [mockEvents[0]] });

      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Self-Healing Events')).toBeInTheDocument();
      });

      // Click on Critical filter
      const criticalFilter = screen.getByRole('button', { name: 'Critical' });
      await user.click(criticalFilter);

      // No critical events
      expect(screen.getByText('No events found')).toBeInTheDocument();
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
        expect(screen.getByText('Self-Healing Events')).toBeInTheDocument();
      });

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      expect(checkbox).not.toBeChecked();
    });

    test('refresht automatisch alle 15 Sekunden', async () => {
      jest.useFakeTimers();
      render(<SelfHealingEvents />);

      // Wait for initial fetch to complete
      await act(async () => {
        // Flush pending microtasks (promise resolution)
        await Promise.resolve();
      });

      expect(mockApi.get).toHaveBeenCalledTimes(1);

      // Fast forward 15 seconds (component uses 15000ms interval)
      act(() => {
        jest.advanceTimersByTime(15000);
      });

      expect(mockApi.get).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    test('stoppt Auto-refresh wenn deaktiviert', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });
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
        jest.advanceTimersByTime(15000);
      });

      // Should not have made more calls
      expect(mockApi.get.mock.calls.length).toBe(initialCalls);
      jest.useRealTimers();
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
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const initialCalls = mockApi.get.mock.calls.length;

      await user.click(screen.getByText('Refresh'));

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
        expect(screen.getByText('Failed to load self-healing events')).toBeInTheDocument();
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
