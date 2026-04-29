/**
 * Integration tests for sidebar navigation.
 *
 * Tests navigation as users experience it:
 *   - All nav items render
 *   - Active route highlighting
 *   - Sidebar collapse/expand
 *   - Toggle button behavior
 *   - Download badge
 *   - ARIA roles
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Mock the download context before importing SidebarWithDownloads
const mockUseDownloads = vi.fn().mockReturnValue({
  activeDownloadCount: 0,
  activeDownloadsList: [],
  activeDownloads: {},
  startDownload: vi.fn(),
  cancelDownload: vi.fn(),
  purgeDownload: vi.fn().mockResolvedValue(undefined),
  resumeDownload: vi.fn().mockResolvedValue(undefined),
  isDownloading: vi.fn().mockReturnValue(false),
  getDownloadState: vi.fn().mockReturnValue(null),
  onDownloadComplete: vi.fn().mockReturnValue(() => {}),
});

vi.mock('@/contexts/DownloadContext', () => ({
  useDownloads: () => mockUseDownloads(),
}));

import { SidebarWithDownloads } from '../../components/layout/Sidebar';

// ---- Helpers ----

function renderSidebar(props: { collapsed?: boolean; route?: string; onToggle?: () => void } = {}) {
  const { collapsed = false, route = '/', onToggle = vi.fn() } = props;

  return {
    onToggle,
    ...render(
      <MemoryRouter initialEntries={[route]}>
        <SidebarWithDownloads collapsed={collapsed} onToggle={onToggle} />
      </MemoryRouter>
    ),
  };
}

// ---- Tests ----

describe('Sidebar navigation integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDownloads.mockReturnValue({
      activeDownloadCount: 0,
      activeDownloadsList: [],
      activeDownloads: {},
      startDownload: vi.fn(),
      cancelDownload: vi.fn(),
      purgeDownload: vi.fn().mockResolvedValue(undefined),
      resumeDownload: vi.fn().mockResolvedValue(undefined),
      isDownloading: vi.fn().mockReturnValue(false),
      getDownloadState: vi.fn().mockReturnValue(null),
      onDownloadComplete: vi.fn().mockReturnValue(() => {}),
    });
  });

  it('renders all primary navigation items', () => {
    renderSidebar();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Daten')).toBeInTheDocument();
    expect(screen.getByText('Store')).toBeInTheDocument();
  });

  it('renders settings link in footer', () => {
    renderSidebar();

    expect(screen.getByText('Einstellungen')).toBeInTheDocument();
  });

  it('highlights active route - Dashboard', () => {
    renderSidebar({ route: '/' });

    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink?.className).toContain('active');
  });

  it('highlights active route - Chat', () => {
    renderSidebar({ route: '/chat' });

    const chatLink = screen.getByText('Chat').closest('a');
    expect(chatLink?.className).toContain('active');
  });

  it('highlights active route - Store', () => {
    renderSidebar({ route: '/store' });

    const storeLink = screen.getByText('Store').closest('a');
    expect(storeLink?.className).toContain('active');
  });

  it('highlights settings when on settings route', () => {
    renderSidebar({ route: '/settings' });

    const settingsLink = screen.getByText('Einstellungen').closest('a');
    expect(settingsLink?.className).toContain('active');
  });

  it('renders sidebar in expanded state by default', () => {
    renderSidebar({ collapsed: false });

    const sidebar = screen.getByLabelText('Hauptnavigation');
    expect(sidebar.className).toContain('expanded');
  });

  it('renders sidebar in collapsed state', () => {
    renderSidebar({ collapsed: true });

    const sidebar = screen.getByLabelText('Hauptnavigation');
    expect(sidebar.className).toContain('collapsed');
  });

  it('calls onToggle when toggle button is clicked', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderSidebar();

    const toggleButton = screen.getByLabelText(/sidebar minimieren/i);
    await user.click(toggleButton);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('toggle button label changes based on collapsed state', () => {
    const { rerender } = render(
      <MemoryRouter>
        <SidebarWithDownloads collapsed={false} onToggle={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/sidebar minimieren/i)).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <SidebarWithDownloads collapsed={true} onToggle={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/sidebar erweitern/i)).toBeInTheDocument();
  });

  it('uses proper ARIA roles for navigation', () => {
    renderSidebar();

    expect(screen.getByRole('menubar')).toBeInTheDocument();

    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems.length).toBeGreaterThanOrEqual(4);
  });

  it('sets aria-current on active route', () => {
    renderSidebar({ route: '/' });

    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toHaveAttribute('aria-current', 'page');
  });

  it('does not set aria-current on inactive routes', () => {
    renderSidebar({ route: '/' });

    const chatLink = screen.getByText('Chat').closest('a');
    expect(chatLink).not.toHaveAttribute('aria-current');
  });
});

describe('Sidebar with active downloads', () => {
  it('shows download indicator when downloads are active', () => {
    mockUseDownloads.mockReturnValue({
      activeDownloadCount: 2,
      activeDownloadsList: [
        {
          modelId: 'm1',
          modelName: 'Model 1',
          progress: 50,
          status: 'downloading',
          phase: 'download',
          error: null,
        },
        {
          modelId: 'm2',
          modelName: 'Model 2',
          progress: 30,
          status: 'downloading',
          phase: 'download',
          error: null,
        },
      ],
      activeDownloads: {},
      startDownload: vi.fn(),
      cancelDownload: vi.fn(),
      purgeDownload: vi.fn().mockResolvedValue(undefined),
      resumeDownload: vi.fn().mockResolvedValue(undefined),
      isDownloading: vi.fn().mockReturnValue(false),
      getDownloadState: vi.fn().mockReturnValue(null),
      onDownloadComplete: vi.fn().mockReturnValue(() => {}),
    });

    render(
      <MemoryRouter>
        <SidebarWithDownloads collapsed={false} onToggle={vi.fn()} />
      </MemoryRouter>
    );

    // Store link should have has-downloads class
    const storeLink = screen.getByText('Store').closest('a');
    expect(storeLink?.className).toContain('has-downloads');
  });

  it('shows downloads section in expanded sidebar', () => {
    mockUseDownloads.mockReturnValue({
      activeDownloadCount: 1,
      activeDownloadsList: [
        {
          modelId: 'm1',
          modelName: 'Test Model',
          progress: 65,
          status: 'downloading',
          phase: 'download',
          error: null,
        },
      ],
      activeDownloads: {},
      startDownload: vi.fn(),
      cancelDownload: vi.fn(),
      purgeDownload: vi.fn().mockResolvedValue(undefined),
      resumeDownload: vi.fn().mockResolvedValue(undefined),
      isDownloading: vi.fn().mockReturnValue(false),
      getDownloadState: vi.fn().mockReturnValue(null),
      onDownloadComplete: vi.fn().mockReturnValue(() => {}),
    });

    render(
      <MemoryRouter>
        <SidebarWithDownloads collapsed={false} onToggle={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByText('Downloads')).toBeInTheDocument();
    expect(screen.getByText('Test Model')).toBeInTheDocument();
  });

  it('hides downloads section when sidebar is collapsed', () => {
    mockUseDownloads.mockReturnValue({
      activeDownloadCount: 1,
      activeDownloadsList: [
        {
          modelId: 'm1',
          modelName: 'Test Model',
          progress: 65,
          status: 'downloading',
          phase: 'download',
          error: null,
        },
      ],
      activeDownloads: {},
      startDownload: vi.fn(),
      cancelDownload: vi.fn(),
      purgeDownload: vi.fn().mockResolvedValue(undefined),
      resumeDownload: vi.fn().mockResolvedValue(undefined),
      isDownloading: vi.fn().mockReturnValue(false),
      getDownloadState: vi.fn().mockReturnValue(null),
      onDownloadComplete: vi.fn().mockReturnValue(() => {}),
    });

    render(
      <MemoryRouter>
        <SidebarWithDownloads collapsed={true} onToggle={vi.fn()} />
      </MemoryRouter>
    );

    // Downloads section should not be shown when collapsed
    expect(screen.queryByText('Downloads')).not.toBeInTheDocument();
  });
});
