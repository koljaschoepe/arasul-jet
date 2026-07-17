/**
 * SidebarHost — kontextabhängige Sidebar (Plan 003 · Schritt 6).
 * Der aktive Tab-Typ bestimmt den Inhalt; App-Tabs klappen die Sidebar
 * automatisch zu und stellen die vorherige Nutzer-Präferenz beim Verlassen
 * wieder her.
 */
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { WorkspaceTab } from '@/stores/workspaceStore';
import { SidebarHost } from '../SidebarHost';

vi.mock('../explorer/ExplorerPanel', () => ({
  ExplorerPanel: () => <div data-testid="explorer" />,
}));
vi.mock('@/components/extensions/ExtensionsSidebarList', () => ({
  ExtensionsSidebarList: () => <div data-testid="ext-list" />,
}));

const DASH: WorkspaceTab = { id: 'dashboard', type: 'dashboard', title: 'Dashboard' };
const STORE: WorkspaceTab = { id: 'store', type: 'store', title: 'Extensions' };
const N8N: WorkspaceTab = { id: 'automationen', type: 'automationen', title: 'Automation' };

function reset(tabs: WorkspaceTab[], activeTabId: string) {
  useWorkspaceStore.setState({ tabs, activeTabId, sidebarVisible: true, sidebarRestore: null });
}

describe('SidebarHost — Kontext-Mapping', () => {
  beforeEach(() => {
    reset([DASH], 'dashboard');
  });

  it('Dashboard-Tab → ExplorerPanel', () => {
    render(<SidebarHost />);
    expect(screen.getByTestId('explorer')).toBeInTheDocument();
    expect(screen.queryByTestId('ext-list')).not.toBeInTheDocument();
  });

  it('Extensions-Tab → ExtensionsSidebarList', () => {
    reset([STORE], 'store');
    render(<SidebarHost />);
    expect(screen.getByTestId('ext-list')).toBeInTheDocument();
    expect(screen.queryByTestId('explorer')).not.toBeInTheDocument();
  });

  it('Automation/n8n-Tab → ExplorerPanel bleibt, Sidebar wird NICHT eingeklappt', () => {
    reset([DASH, N8N], 'dashboard');
    render(<SidebarHost />);
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);

    // Wechsel auf den n8n-Tab → Explorer bleibt sichtbar, kein Auto-Collapse
    act(() => useWorkspaceStore.setState({ activeTabId: 'automationen' }));
    expect(screen.getByTestId('explorer')).toBeInTheDocument();
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);
  });
});
