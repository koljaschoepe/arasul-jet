import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarFooter } from '../SidebarFooter';
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

describe('SidebarFooter — Einstellungen-Zahnrad unten links (Cursor-Stil)', () => {
  beforeEach(() => {
    resetStore();
  });

  it('zeigt das Einstellungen-Zahnrad', () => {
    render(<SidebarFooter />);
    expect(screen.getByLabelText('Einstellungen')).toBeInTheDocument();
  });

  it('öffnet den Einstellungen-Tab', () => {
    render(<SidebarFooter />);
    fireEvent.click(screen.getByLabelText('Einstellungen'));
    expect(useWorkspaceStore.getState().activeTabId).toBe('settings');
  });
});
