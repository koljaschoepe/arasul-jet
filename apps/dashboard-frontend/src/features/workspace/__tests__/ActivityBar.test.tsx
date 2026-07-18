import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityBar } from '../ActivityBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';

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

describe('ActivityBar — Drei-Bereiche-Navigation (Plan 008)', () => {
  beforeEach(() => {
    resetStore();
  });

  it('rendert die festen Bereiche Chat, Wissen, Automation, Extensions und Einstellungen', () => {
    render(<ActivityBar />);
    expect(screen.getByLabelText('Chat')).toBeInTheDocument();
    expect(screen.getByLabelText('Wissen')).toBeInTheDocument();
    expect(screen.getByLabelText('Automation')).toBeInTheDocument();
    expect(screen.getByLabelText('Extensions')).toBeInTheDocument();
    expect(screen.getByLabelText('Einstellungen')).toBeInTheDocument();
  });

  it('zeigt keine Explorer-/Chats-/Terminal-/Dashboard-Icons (leben in Panel/Sidebar-Toggles)', () => {
    render(<ActivityBar />);
    expect(screen.queryByLabelText(/Explorer/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Terminal/)).not.toBeInTheDocument();
  });

  it('Chat schaltet das rechte Panel auf den Chat-Modus', () => {
    useWorkspaceStore.setState({ rightPanelVisible: false, rightPanelMode: 'terminal' });
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Chat'));
    const state = useWorkspaceStore.getState();
    expect(state.rightPanelVisible).toBe(true);
    expect(state.rightPanelMode).toBe('chat');
  });

  it('Wissen blendet die Sidebar (Dateien/Explorer) um', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Wissen'));
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
  });

  it('Automation ist ein fester Bereich und öffnet den Automationen-Tab', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Automation'));
    const state = useWorkspaceStore.getState();
    expect(state.activeTabId).toBe('automationen');
    expect(state.tabs.map(t => t.type)).toEqual(['automationen']);
  });

  it('Extensions öffnet den Store-Tab', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Extensions'));
    const state = useWorkspaceStore.getState();
    expect(state.activeTabId).toBe('store');
    expect(state.tabs.map(t => t.type)).toEqual(['store']);
  });

  it('Einstellungen öffnet den Einstellungen-Tab', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Einstellungen'));
    const state = useWorkspaceStore.getState();
    expect(state.activeTabId).toBe('settings');
    expect(state.tabs.map(t => t.type)).toEqual(['settings']);
  });
});
