import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from '../StatusBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const get = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get }),
}));

function renderStatusBar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StatusBar />
    </QueryClientProvider>
  );
}

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    sidebarVisible: true,
    rightPanelVisible: true,
    rightPanelMode: 'chat',
    terminalSessions: [],
    activeTerminalSessionId: null,
    chatScope: null,
    explorerRequest: null,
  });
}

describe('StatusBar', () => {
  beforeEach(() => {
    resetStore();
    get.mockReset();
  });

  it('zeigt Verbunden + Version, wenn /health OK meldet', async () => {
    get.mockResolvedValue({ status: 'OK', version: '1.2.3' });
    renderStatusBar();

    expect(await screen.findByText('Verbunden')).toBeInTheDocument();
    expect(await screen.findByText('v1.2.3')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/health', { showError: false });
  });

  it('zeigt Getrennt, wenn /health nicht erreichbar ist', async () => {
    get.mockRejectedValue(new Error('offline'));
    renderStatusBar();

    // Die Komponente setzt retry:1 (≈1s Backoff) — Timeout entsprechend höher
    expect(await screen.findByText('Getrennt', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('zeigt das aktive Terminal-Projekt aus der Session-Registry', async () => {
    get.mockResolvedValue({ status: 'OK', version: '1.2.3' });
    useWorkspaceStore.setState({
      terminalSessions: [{ id: 'p1', projectId: 'p1', title: 'Mein Projekt' }],
      activeTerminalSessionId: 'p1',
    });
    renderStatusBar();

    expect(await screen.findByText('Mein Projekt')).toBeInTheDocument();
  });
});
