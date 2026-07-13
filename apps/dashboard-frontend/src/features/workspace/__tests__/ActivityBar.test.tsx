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

  it('rendert nur die Mitte-Tab-Einträge Dashboard und Extensions', () => {
    render(<ActivityBar />);
    expect(screen.getByLabelText('Dashboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Extensions')).toBeInTheDocument();
  });

  it('zeigt keine Explorer-/Chats-/Terminal-Icons mehr (leben in den Layout-Toggles)', () => {
    render(<ActivityBar />);
    expect(screen.queryByLabelText(/Explorer/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Chats/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Terminal/)).not.toBeInTheDocument();
  });

  it('App-Einträge erscheinen nur, wenn die Extension aktiviert ist', () => {
    enabledApps.add('n8n');
    render(<ActivityBar />);
    expect(screen.getByLabelText('Automationen')).toBeInTheDocument();
    expect(screen.queryByLabelText('Telegram')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Datenbank')).not.toBeInTheDocument();
  });

  it('alle aktivierten Apps erscheinen gemeinsam', () => {
    enabledApps.add('n8n');
    enabledApps.add('telegram');
    enabledApps.add('database');
    render(<ActivityBar />);
    expect(screen.getByLabelText('Automationen')).toBeInTheDocument();
    expect(screen.getByLabelText('Telegram')).toBeInTheDocument();
    expect(screen.getByLabelText('Datenbank')).toBeInTheDocument();
  });

  it('Aktivieren/Deaktivieren wirkt ohne Reload — der nächste Render genügt', () => {
    const { rerender } = render(<ActivityBar />);
    expect(screen.queryByLabelText('Telegram')).not.toBeInTheDocument();

    enabledApps.add('telegram');
    rerender(<ActivityBar />);
    expect(screen.getByLabelText('Telegram')).toBeInTheDocument();

    enabledApps.delete('telegram');
    rerender(<ActivityBar />);
    expect(screen.queryByLabelText('Telegram')).not.toBeInTheDocument();
  });

  it('Dashboard-Eintrag öffnet den Dashboard-Tab', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Dashboard'));
    const state = useWorkspaceStore.getState();
    expect(state.activeTabId).toBe('dashboard');
    expect(state.tabs.map(t => t.type)).toEqual(['dashboard']);
  });
});
