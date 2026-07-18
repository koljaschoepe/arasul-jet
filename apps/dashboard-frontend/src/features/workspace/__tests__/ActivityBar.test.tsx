import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('ActivityBar — zwei feste Bereiche + aktivierte Apps (Feinschliff)', () => {
  beforeEach(() => {
    resetStore();
    enabledApps.clear();
  });

  it('zeigt nur Dateien, Extensions und Einstellungen — kein Chat-, kein festes Automation-Icon', () => {
    render(<ActivityBar />);
    expect(screen.getByLabelText('Dateien')).toBeInTheDocument();
    expect(screen.getByLabelText('Extensions')).toBeInTheDocument();
    expect(screen.getByLabelText('Einstellungen')).toBeInTheDocument();
    expect(screen.queryByLabelText('Chat')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Wissen')).not.toBeInTheDocument();
    // Automation ist kein fester Bereich mehr — nur als aktivierte Erweiterung
    expect(screen.queryByLabelText('Automation')).not.toBeInTheDocument();
  });

  it('Dateien blendet die Explorer-Sidebar um', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Dateien'));
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
  });

  it('Extensions öffnet den Store-Tab', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Extensions'));
    const s = useWorkspaceStore.getState();
    expect(s.activeTabId).toBe('store');
    expect(s.tabs.map(t => t.type)).toEqual(['store']);
  });

  it('Einstellungen öffnet den Einstellungen-Tab', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Einstellungen'));
    expect(useWorkspaceStore.getState().activeTabId).toBe('settings');
  });

  it('n8n (Automation) erscheint NUR wenn die Erweiterung aktiviert ist und öffnet den Automationen-Tab', () => {
    const { rerender } = render(<ActivityBar />);
    expect(screen.queryByLabelText('Automation')).not.toBeInTheDocument();

    enabledApps.add('n8n');
    rerender(<ActivityBar />);
    const btn = screen.getByLabelText('Automation');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(useWorkspaceStore.getState().activeTabId).toBe('automationen');
  });
});
