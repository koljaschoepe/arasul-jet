import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityBar } from '../ActivityBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';

// App-Gating deterministisch mocken (echte Datenbasis: GET /workspace-apps)
const enabledApps = new Set<string>();
vi.mock('@/hooks/useWorkspaceApps', () => ({
  useWorkspaceApps: () => ({
    apps: [],
    isLoading: false,
    isAppEnabled: (id: string) => enabledApps.has(id),
    setAppEnabled: vi.fn(),
  }),
}));

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

describe('ActivityBar', () => {
  beforeEach(() => {
    resetStore();
    enabledApps.clear();
  });

  it('rendert den Mitte-Tab-Eintrag Extensions (Dashboard ist entfernt)', () => {
    render(<ActivityBar />);
    expect(screen.getByLabelText('Extensions')).toBeInTheDocument();
    expect(screen.queryByLabelText('Dashboard')).not.toBeInTheDocument();
  });

  it('zeigt keine Explorer-/Chats-/Terminal-Icons mehr (leben in den Layout-Toggles)', () => {
    render(<ActivityBar />);
    expect(screen.queryByLabelText(/Explorer/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Chats/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Terminal/)).not.toBeInTheDocument();
  });

  it('App-Einträge erscheinen nur, wenn die Extension aktiviert ist', () => {
    render(<ActivityBar />);
    expect(screen.queryByLabelText('Automationen')).not.toBeInTheDocument();

    enabledApps.add('n8n');
    render(<ActivityBar />);
    expect(screen.getByLabelText('Automationen')).toBeInTheDocument();
  });

  it('Aktivieren/Deaktivieren wirkt ohne Reload — der nächste Render genügt', () => {
    const { rerender } = render(<ActivityBar />);
    expect(screen.queryByLabelText('Automationen')).not.toBeInTheDocument();

    enabledApps.add('n8n');
    rerender(<ActivityBar />);
    expect(screen.getByLabelText('Automationen')).toBeInTheDocument();

    enabledApps.delete('n8n');
    rerender(<ActivityBar />);
    expect(screen.queryByLabelText('Automationen')).not.toBeInTheDocument();
  });

  it('Extensions-Eintrag öffnet den Extensions-Tab', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Extensions'));
    const state = useWorkspaceStore.getState();
    expect(state.activeTabId).toBe('store');
    expect(state.tabs.map(t => t.type)).toEqual(['store']);
  });
});
