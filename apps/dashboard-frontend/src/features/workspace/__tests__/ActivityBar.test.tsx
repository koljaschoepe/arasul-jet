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
    terminalVisible: false,
    chatVisible: true,
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

  it('rendert die festen Einträge Explorer, Chats, Dashboard, Extensions und Terminal', () => {
    render(<ActivityBar />);
    expect(screen.getByLabelText('Explorer ausblenden')).toBeInTheDocument();
    expect(screen.getByLabelText('Chats ausblenden')).toBeInTheDocument();
    expect(screen.getByLabelText('Dashboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Extensions')).toBeInTheDocument();
    expect(screen.getByLabelText('Terminal einblenden')).toBeInTheDocument();
  });

  it('App-Einträge erscheinen nur, wenn die Extension aktiviert ist', () => {
    enabledApps.add('n8n');
    render(<ActivityBar />);
    expect(screen.getByLabelText('Automationen')).toBeInTheDocument();
    expect(screen.queryByLabelText('Telegram')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Datenbank')).not.toBeInTheDocument();
  });

  it('Terminal-Eintrag toggelt nur das Panel und öffnet NIE einen Tab', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Terminal einblenden'));

    const state = useWorkspaceStore.getState();
    expect(state.terminalVisible).toBe(true);
    expect(state.tabs).toHaveLength(0);

    fireEvent.click(screen.getByLabelText('Terminal ausblenden'));
    expect(useWorkspaceStore.getState().terminalVisible).toBe(false);
  });

  it('Chats-Eintrag toggelt das Chat-Panel', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Chats ausblenden'));
    expect(useWorkspaceStore.getState().chatVisible).toBe(false);
    expect(useWorkspaceStore.getState().tabs).toHaveLength(0);
  });

  it('Dashboard-Eintrag öffnet den Dashboard-Tab', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Dashboard'));
    const state = useWorkspaceStore.getState();
    expect(state.activeTabId).toBe('dashboard');
    expect(state.tabs.map(t => t.type)).toEqual(['dashboard']);
  });
});
