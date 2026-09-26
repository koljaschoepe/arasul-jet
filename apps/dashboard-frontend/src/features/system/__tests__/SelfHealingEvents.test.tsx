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

import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
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
      dienst_anzeige: 'KI-Modelle',
      duration_ms: 2500,
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
        expect(screen.getByText('Selbstheilung')).toBeInTheDocument();
      });
    });

    test('zeigt Beschreibung', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(
          screen.getByText('Was das Gerät selbst repariert hat, und wann')
        ).toBeInTheDocument();
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
        expect(screen.getByText('Selbst aktualisieren')).toBeInTheDocument();
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
      });

      // Stats section: total count is rendered as a separate span
      const gesamtLabel = screen.getByText('Gesamt');
      const statsContainer = gesamtLabel.closest('div');
      expect(statsContainer).toHaveTextContent('3');
    });

    test('zeigt Hinweise Count', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        // Hinweise appears in both stat section and filter button
        expect(screen.getAllByText('Hinweise').length).toBeGreaterThanOrEqual(2);
      });
    });

    test('zeigt Warnungen Count', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        // Warnungen appears in both stat section and filter button
        expect(screen.getAllByText('Warnungen').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('zeigt Kritisch Count', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        // Kritisch appears in both stat section and filter button
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
        expect(screen.getByRole('button', { name: 'Hinweise' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Warnungen' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Kritisch' })).toBeInTheDocument();
      });
    });

    test('Alle Filter ist initial aktiv (aria-pressed)', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        const allButton = screen.getByRole('button', { name: 'Alle' });
        expect(allButton).toHaveAttribute('aria-pressed', 'true');
      });
    });

    test('kann nach INFO filtern', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Selbstheilung')).toBeInTheDocument();
      });

      // Find filter buttons by aria-pressed attribute
      const filterButtons = screen.getAllByRole('button');
      const infoFilter = filterButtons.find(
        btn => btn.textContent === 'Hinweise' && btn.hasAttribute('aria-pressed')
      );

      expect(infoFilter).toBeDefined();
      if (infoFilter) {
        await user.click(infoFilter);
        expect(infoFilter).toHaveAttribute('aria-pressed', 'true');
      }
    });

    test('kann nach WARNING filtern', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Selbstheilung')).toBeInTheDocument();
      });

      const filterButtons = screen.getAllByRole('button');
      const warningFilter = filterButtons.find(
        btn => btn.textContent === 'Warnungen' && btn.hasAttribute('aria-pressed')
      );

      expect(warningFilter).toBeDefined();
      if (warningFilter) {
        await user.click(warningFilter);
        expect(warningFilter).toHaveAttribute('aria-pressed', 'true');
      }
    });

    test('kann nach CRITICAL filtern', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Selbstheilung')).toBeInTheDocument();
      });

      const filterButtons = screen.getAllByRole('button');
      const criticalFilter = filterButtons.find(
        btn => btn.textContent === 'Kritisch' && btn.hasAttribute('aria-pressed')
      );

      expect(criticalFilter).toBeDefined();
      if (criticalFilter) {
        await user.click(criticalFilter);
        expect(criticalFilter).toHaveAttribute('aria-pressed', 'true');
      }
    });
  });

  // =====================================================
  // Events List
  // =====================================================
  describe('Events List', () => {
    // Seit J35 steht der englische Satz des Agenten nicht mehr vorn, sondern
    // zugeklappt unter „Technische Angaben" -- erst nach dem Klick zu sehen.
    test('zeigt Event-Beschreibungen erst unter Technische Angaben', async () => {
      render(<SelfHealingEvents />);

      const knopf = await screen.findByTestId('ereignis-1-technisch-knopf');
      expect(screen.queryByText('Service llm-service wurde neu gestartet')).not.toBeInTheDocument();

      fireEvent.click(knopf);
      const angaben = screen.getByTestId('ereignis-1-technisch');
      expect(within(angaben).getByText('Meldung')).toBeInTheDocument();
      expect(
        within(angaben).getByText('Service llm-service wurde neu gestartet')
      ).toBeInTheDocument();
    });

    test('zeigt Event-Types als deutsches Wort', async () => {
      render(<SelfHealingEvents />);

      expect(await screen.findByText('Dienst neu gestartet')).toBeInTheDocument();
      expect(screen.getByText('Arbeitsspeicher knapp')).toBeInTheDocument();
      expect(screen.getByText('Dienst ausgefallen')).toBeInTheDocument();
      expect(screen.queryByText('service restart')).not.toBeInTheDocument();
      expect(screen.queryByText('service_restart')).not.toBeInTheDocument();
    });

    test('zeigt einen unbekannten Event-Type als „Ereignis" statt roh', async () => {
      mockApi.get.mockResolvedValue({
        events: [{ ...mockEvents[1], id: 9, event_type: 'etwas_neues' }],
      });
      render(<SelfHealingEvents />);

      expect(await screen.findByText('Ereignis')).toBeInTheDocument();
      expect(screen.queryByText('etwas_neues')).not.toBeInTheDocument();
    });

    test('zeigt Severity als deutsches Wort', async () => {
      render(<SelfHealingEvents />);

      expect(await screen.findByText('Hinweis')).toBeInTheDocument();
      expect(screen.getByText('Warnung')).toBeInTheDocument();
      // „Kritisch" steht auch in der Statistik und am Filter.
      expect(screen.getAllByText('Kritisch').length).toBeGreaterThanOrEqual(3);
      expect(screen.queryByText('INFO')).not.toBeInTheDocument();
      expect(screen.queryByText('WARNING')).not.toBeInTheDocument();
      expect(screen.queryByText('CRITICAL')).not.toBeInTheDocument();
    });

    test('zeigt Massnahme unter Technische Angaben', async () => {
      render(<SelfHealingEvents />);

      fireEvent.click(await screen.findByTestId('ereignis-1-technisch-knopf'));
      const angaben = screen.getByTestId('ereignis-1-technisch');
      expect(within(angaben).getByText('Maßnahme')).toBeInTheDocument();
      expect(within(angaben).getByText('Docker container restart')).toBeInTheDocument();
    });

    test('zeigt den deutschen Dienstnamen, sonst die Kennung', async () => {
      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getAllByText(/Dienst:/).length).toBe(2);
      });
      // Ereignis 1 bringt `dienst_anzeige` mit, Ereignis 3 nur `service_name`.
      expect(screen.getByText('KI-Modelle')).toBeInTheDocument();
      expect(screen.queryByText('llm-service')).not.toBeInTheDocument();
      expect(screen.getByText('postgres-db')).toBeInTheDocument();
    });

    test('zeigt die Dauer in Sekunden', async () => {
      render(<SelfHealingEvents />);

      expect(await screen.findByText(/2,5\s+Sekunden/)).toBeInTheDocument();
    });

    test('zeigt Fehler-Message unter Technische Angaben', async () => {
      render(<SelfHealingEvents />);

      const knopf = await screen.findByTestId('ereignis-3-technisch-knopf');
      expect(screen.queryByText('Connection refused')).not.toBeInTheDocument();

      fireEvent.click(knopf);
      const angaben = screen.getByTestId('ereignis-3-technisch');
      expect(within(angaben).getByText('Fehler')).toBeInTheDocument();
      expect(within(angaben).getByText('Connection refused')).toBeInTheDocument();
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
        expect(screen.getByText(/Das Gerät läuft einwandfrei/)).toBeInTheDocument();
      });
    });

    test('zeigt gefilterte Message wenn keine Events im Filter', async () => {
      const user = userEvent.setup({ delay: null });
      // Return only INFO events
      mockApi.get.mockResolvedValue({ events: [mockEvents[0]] });

      render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(screen.getByText('Selbstheilung')).toBeInTheDocument();
      });

      // Click on Kritisch filter
      const filterButtons = screen.getAllByRole('button');
      const criticalFilter = filterButtons.find(
        btn => btn.textContent === 'Kritisch' && btn.hasAttribute('aria-pressed')
      );
      expect(criticalFilter).toBeDefined();
      await user.click(criticalFilter!);

      // Keine kritischen Ereignisse -- in Worten, nicht mit dem Rohwert
      expect(screen.getByText('Keine kritischen Ereignisse')).toBeInTheDocument();
      expect(screen.getByText('Es gibt gerade keine kritischen Ereignisse.')).toBeInTheDocument();
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
        expect(screen.getByText('Selbstheilung')).toBeInTheDocument();
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
  // Layout structure (Tailwind classes, no BEM)
  // =====================================================
  describe('Layout Structure', () => {
    test('hat animate-in fade-in Container', async () => {
      const { container } = render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(container.querySelector('.animate-in.fade-in')).toBeInTheDocument();
      });
    });

    // Der Seitenkopf kommt seit D7 aus `@marken` (`Kopf`): die Trennlinie
    // steht dort in `marken.css` an `.ara-kopf` und nicht mehr als
    // Tailwind-Klassenkette an einem `div`. Gefragt wird deshalb nach dem
    // Baustein und nicht nach seinem fruehren Innenleben.
    test('hat einen Seitenkopf aus dem Designsystem', async () => {
      const { container } = render(<SelfHealingEvents />);

      await waitFor(() => {
        expect(container.querySelector('.ara-kopf')).toBeInTheDocument();
      });
    });

    test('hat stats section', async () => {
      const { container } = render(<SelfHealingEvents />);

      await waitFor(() => {
        // Stats: flex gap-6 mb-6 text-sm
        expect(container.querySelector('.flex.gap-6.mb-6')).toBeInTheDocument();
      });
    });

    test('hat filter section', async () => {
      const { container } = render(<SelfHealingEvents />);

      await waitFor(() => {
        // Filters: flex gap-1.5 mb-6
        const filterSection = container.querySelector('.flex.mb-6');
        expect(filterSection).toBeInTheDocument();
      });
    });
  });
});
