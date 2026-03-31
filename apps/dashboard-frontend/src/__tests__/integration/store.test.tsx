/**
 * Integration tests for the Store feature.
 *
 * Tests the Store component as users experience it:
 *   - Tab navigation (Start, Modelle, Apps)
 *   - Search functionality
 *   - Model and app card rendering
 *   - Install/activate actions
 *   - Loading and error states
 *   - Detail modal
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Store from '../../features/store/Store';
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

vi.mock('../../contexts/DownloadContext', () => ({
  useDownloads: () => ({
    activeDownloads: {},
    activeDownloadCount: 0,
    activeDownloadsList: [],
    startDownload: vi.fn(),
    cancelDownload: vi.fn(),
    isDownloading: vi.fn().mockReturnValue(false),
    getDownloadState: vi.fn().mockReturnValue(null),
    onDownloadComplete: vi.fn().mockReturnValue(() => {}),
  }),
  DownloadProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/useDebouncedSearch', () => ({
  useDebouncedSearch: (_query: string, _searcher: unknown, opts?: { initialResults: unknown }) => ({
    results: opts?.initialResults ?? { models: [], apps: [] },
    searching: false,
  }),
}));

// ---- Sample data ----

const sampleRecommendations = {
  models: [
    {
      id: 'qwen3-14b',
      name: 'Qwen3 14B',
      description: 'High-quality multilingual model',
      size_bytes: 14000000000,
      ram_required_gb: 16,
      capabilities: ['chat', 'coding', 'reasoning'],
      install_status: 'available',
      is_default: true,
    },
    {
      id: 'llama3-8b',
      name: 'Llama 3 8B',
      description: 'Fast and efficient model',
      size_bytes: 8000000000,
      ram_required_gb: 8,
      capabilities: ['chat', 'general'],
      install_status: 'not_installed',
    },
  ],
  apps: [
    {
      id: 'n8n',
      name: 'n8n',
      description: 'Workflow Automation',
      version: '1.30',
      category: 'Automation',
      status: 'running',
      featured: true,
    },
    {
      id: 'code-server',
      name: 'Code Server',
      description: 'VS Code in the Browser',
      version: '4.90',
      category: 'Development',
      status: 'available',
    },
  ],
};

const sampleModelStatus = {
  loaded_model: { model_id: 'qwen3-14b', ram_usage_mb: 14000 },
};

// ---- Helpers ----

function renderStore(route = '/store') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/store/*" element={<Store />} />
      </Routes>
    </MemoryRouter>
  );
}

function setupDefaultApiResponses() {
  mockApi.get.mockImplementation((path: string) => {
    if (path === '/store/info') {
      return Promise.resolve({ llmRamGB: 38, totalRamGB: 64, availableDiskGB: 200 });
    }
    if (path === '/store/recommendations') {
      return Promise.resolve(sampleRecommendations);
    }
    if (path === '/models/status') {
      return Promise.resolve(sampleModelStatus);
    }
    if (path.startsWith('/store/search')) {
      return Promise.resolve({ models: [], apps: [] });
    }
    return Promise.resolve({});
  });
}

// ---- Tests ----

describe('Store integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultApiResponses();
  });

  it('renders store with tab navigation', async () => {
    renderStore();

    expect(screen.getByText('Store')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /start/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /modelle/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /apps/i })).toBeInTheDocument();
  });

  it('shows recommended models on home tab', async () => {
    renderStore();

    await waitFor(() => {
      expect(screen.getByText('Qwen3 14B')).toBeInTheDocument();
      expect(screen.getByText('Llama 3 8B')).toBeInTheDocument();
    });
  });

  it('shows recommended apps on home tab', async () => {
    renderStore();

    await waitFor(() => {
      expect(screen.getByText('n8n')).toBeInTheDocument();
      expect(screen.getByText('Code Server')).toBeInTheDocument();
    });
  });

  it('shows loaded model banner when model is active', async () => {
    renderStore();

    await waitFor(() => {
      expect(screen.getByText(/aktuell geladen/i)).toBeInTheDocument();
      expect(screen.getByText('qwen3-14b')).toBeInTheDocument();
    });
  });

  it('shows "Standard" badge for default model', async () => {
    renderStore();

    await waitFor(() => {
      expect(screen.getByText('Standard')).toBeInTheDocument();
    });
  });

  it('shows "Aktiv" badge for running app', async () => {
    renderStore();

    await waitFor(() => {
      const aktivBadges = screen.getAllByText('Aktiv');
      expect(aktivBadges.length).toBeGreaterThan(0);
    });
  });

  it('shows install button for non-installed model', async () => {
    renderStore();

    await waitFor(() => {
      expect(screen.getByText('Herunterladen')).toBeInTheDocument();
    });
  });

  it('shows install button for available app', async () => {
    renderStore();

    await waitFor(() => {
      expect(screen.getByText('Installieren')).toBeInTheDocument();
    });
  });

  it('shows search input', () => {
    renderStore();

    expect(screen.getByLabelText(/store durchsuchen/i)).toBeInTheDocument();
  });

  it('renders model specs (size and RAM)', async () => {
    renderStore();

    await waitFor(() => {
      expect(screen.getByText('16 GB')).toBeInTheDocument();
    });
  });

  it('shows model capabilities', async () => {
    renderStore();

    await waitFor(() => {
      // "chat" capability appears on multiple model cards
      expect(screen.getAllByText('chat').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('coding')).toBeInTheDocument();
    });
  });

  it('shows loading skeleton while fetching recommendations', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));

    renderStore();

    // Should not show model names yet
    expect(screen.queryByText('Qwen3 14B')).not.toBeInTheDocument();
  });

  it('shows error state on API failure', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/store/info') return Promise.resolve({});
      if (path === '/store/recommendations') {
        return Promise.reject(new Error('Connection failed'));
      }
      return Promise.resolve({});
    });

    renderStore();

    await waitFor(() => {
      expect(screen.getByText(/fehler/i)).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/store/info') return Promise.resolve({});
      if (path === '/store/recommendations') {
        return Promise.reject(new Error('Connection failed'));
      }
      return Promise.resolve({});
    });

    renderStore();

    await waitFor(() => {
      expect(screen.getByText(/erneut versuchen/i)).toBeInTheDocument();
    });
  });

  it('shows "Alle Modelle" link', async () => {
    renderStore();

    await waitFor(() => {
      expect(screen.getByText(/alle modelle/i)).toBeInTheDocument();
    });
  });

  it('shows "Alle Apps" link', async () => {
    renderStore();

    await waitFor(() => {
      expect(screen.getByText(/alle apps/i)).toBeInTheDocument();
    });
  });

  it('shows no-model banner when no model is loaded', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/store/info') return Promise.resolve({ llmRamGB: 38, totalRamGB: 64 });
      if (path === '/store/recommendations') return Promise.resolve(sampleRecommendations);
      if (path === '/models/status') return Promise.resolve({});
      return Promise.resolve({});
    });

    renderStore();

    await waitFor(() => {
      expect(screen.getByText(/kein modell geladen/i)).toBeInTheDocument();
    });
  });
});
