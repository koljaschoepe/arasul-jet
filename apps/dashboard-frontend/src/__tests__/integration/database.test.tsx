/**
 * Integration tests for the Database feature.
 *
 * Tests the DatabaseOverview and DatabaseTable components as users experience them:
 *   - Table list rendering
 *   - Search/filter
 *   - Empty state
 *   - Loading skeleton
 *   - View mode toggle (grid/list)
 *   - Create table button
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DatabaseOverview from '../../features/database/DatabaseOverview';
import { createMockApi, createMockToast } from '../helpers/renderWithProviders';

// ---- Mocks ----

const mockApi = createMockApi();
const mockToast = createMockToast();

vi.mock('../../hooks/useApi', () => ({
  useApi: () => mockApi,
  default: () => mockApi,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => mockToast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin' },
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    checkAuth: vi.fn(),
    setLoadingComplete: vi.fn(),
  }),
}));

// Mock Modal to keep it simple
vi.mock('../../components/ui/Modal', () => ({
  default: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
  }) =>
    isOpen ? (
      <div data-testid="modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

// ---- Sample data ----

const sampleTables = [
  {
    id: 1,
    name: 'Kunden',
    slug: 'kunden',
    description: 'Kundenstammdaten',
    icon: '👥',
    color: '#45ADFF',
    row_count: 150,
    field_count: 8,
    updated_at: '2026-03-13T10:00:00Z',
  },
  {
    id: 2,
    name: 'Produkte',
    slug: 'produkte',
    description: 'Produktkatalog',
    icon: '📦',
    color: '#22C55E',
    row_count: 42,
    field_count: 12,
    updated_at: '2026-03-12T15:30:00Z',
  },
  {
    id: 3,
    name: 'Bestellungen',
    slug: 'bestellungen',
    icon: '🛒',
    color: '#F59E0B',
    row_count: 0,
    field_count: 5,
    updated_at: '2026-03-10T08:00:00Z',
  },
];

// ---- Helpers ----

function renderDatabaseOverview() {
  return render(
    <MemoryRouter initialEntries={['/database']}>
      <DatabaseOverview />
    </MemoryRouter>
  );
}

// ---- Tests ----

describe('Database integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: sampleTables });
  });

  it('renders the database page title', async () => {
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText('Datenbank')).toBeInTheDocument();
    });
  });

  it('renders list of tables', async () => {
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText('Kunden')).toBeInTheDocument();
      expect(screen.getByText('Produkte')).toBeInTheDocument();
      expect(screen.getByText('Bestellungen')).toBeInTheDocument();
    });
  });

  it('shows table count', async () => {
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText(/3 tabellen/i)).toBeInTheDocument();
    });
  });

  it('shows row and field counts', async () => {
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText(/150 einträge/i)).toBeInTheDocument();
      expect(screen.getByText(/8 felder/i)).toBeInTheDocument();
    });
  });

  it('shows table descriptions', async () => {
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText('Kundenstammdaten')).toBeInTheDocument();
      expect(screen.getByText('Produktkatalog')).toBeInTheDocument();
    });
  });

  it('renders table icons', async () => {
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText('Kunden')).toBeInTheDocument();
    });
  });

  it('renders search input', async () => {
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByLabelText(/tabellen durchsuchen/i)).toBeInTheDocument();
    });
  });

  it('search filters tables client-side', async () => {
    const user = userEvent.setup();
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText('Kunden')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/tabellen durchsuchen/i), 'Kunden');

    // Only Kunden should be visible
    expect(screen.getByText('Kunden')).toBeInTheDocument();
    expect(screen.queryByText('Produkte')).not.toBeInTheDocument();
    expect(screen.queryByText('Bestellungen')).not.toBeInTheDocument();
  });

  it('shows "no tables found" when search has no matches', async () => {
    const user = userEvent.setup();
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText('Kunden')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/tabellen durchsuchen/i), 'zzzzzzz');

    expect(screen.getByText(/keine tabellen gefunden/i)).toBeInTheDocument();
  });

  it('shows empty state when no tables exist', async () => {
    mockApi.get.mockResolvedValue({ data: [] });

    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText(/noch keine tabellen/i)).toBeInTheDocument();
    });
  });

  it('shows create table button in empty state', async () => {
    mockApi.get.mockResolvedValue({ data: [] });

    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText(/erste tabelle erstellen/i)).toBeInTheDocument();
    });
  });

  it('shows loading skeleton while loading', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));

    renderDatabaseOverview();

    // Should not show table names
    expect(screen.queryByText('Kunden')).not.toBeInTheDocument();
    // Loading skeleton should be rendered (with role status)
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error state on API failure', async () => {
    mockApi.get.mockRejectedValue(new Error('Server Error'));

    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText(/fehler beim laden/i)).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockApi.get.mockRejectedValue(new Error('Server Error'));

    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText(/erneut versuchen/i)).toBeInTheDocument();
    });
  });

  it('renders view mode toggle buttons', async () => {
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByLabelText(/kachelansicht/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/listenansicht/i)).toBeInTheDocument();
    });
  });

  it('grid view is active by default', async () => {
    renderDatabaseOverview();

    await waitFor(() => {
      const gridBtn = screen.getByLabelText(/kachelansicht/i);
      expect(gridBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('switching to list view updates toggle state', async () => {
    const user = userEvent.setup();
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText('Kunden')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText(/listenansicht/i));

    expect(screen.getByLabelText(/listenansicht/i)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/kachelansicht/i)).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders "Neue Tabelle" button', async () => {
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText(/neue tabelle/i)).toBeInTheDocument();
    });
  });

  it('opens create table modal on button click', async () => {
    const user = userEvent.setup();
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText(/neue tabelle/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/neue tabelle/i));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/neue tabelle erstellen/i)).toBeInTheDocument();
    });
  });

  it('table cards are links to table detail', async () => {
    renderDatabaseOverview();

    await waitFor(() => {
      const kundenLink = screen.getByText('Kunden').closest('a');
      expect(kundenLink).toHaveAttribute('href', '/database/kunden');
    });
  });

  it('search can also match descriptions', async () => {
    const user = userEvent.setup();
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText('Kunden')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/tabellen durchsuchen/i), 'Produktkatalog');

    expect(screen.getByText('Produkte')).toBeInTheDocument();
    expect(screen.queryByText('Kunden')).not.toBeInTheDocument();
  });

  it('filter reset button clears search', async () => {
    const user = userEvent.setup();
    renderDatabaseOverview();

    await waitFor(() => {
      expect(screen.getByText('Kunden')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/tabellen durchsuchen/i), 'xyz');
    expect(screen.getByText(/keine tabellen gefunden/i)).toBeInTheDocument();

    await user.click(screen.getByText(/filter zurücksetzen/i));

    // All tables should be visible again
    expect(screen.getByText('Kunden')).toBeInTheDocument();
    expect(screen.getByText('Produkte')).toBeInTheDocument();
  });
});
