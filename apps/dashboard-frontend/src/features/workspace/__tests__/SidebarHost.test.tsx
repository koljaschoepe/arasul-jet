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
const DB: WorkspaceTab = { id: 'database', type: 'database', title: 'Datenbank' };

function reset(tabs: WorkspaceTab[], activeTabId: string) {
  useWorkspaceStore.setState({ tabs, activeTabId, sidebarVisible: true });
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

  it('App-Tab klappt die Sidebar automatisch zu und stellt sie beim Verlassen wieder her', () => {
    reset([DASH, DB], 'dashboard');
    render(<SidebarHost />);
    // Start: nicht-App-Tab, Sidebar sichtbar bleibt Nutzer-Präferenz
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);

    // Wechsel auf App-Tab → Auto-Collapse
    act(() => useWorkspaceStore.setState({ activeTabId: 'database' }));
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);

    // Zurück auf Dashboard → vorheriger Zustand wiederhergestellt
    act(() => useWorkspaceStore.setState({ activeTabId: 'dashboard' }));
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);
  });

  it('Toggle bleibt auf einem App-Tab bedienbar (kann die Sidebar wieder aufziehen)', () => {
    reset([DASH, DB], 'database');
    render(<SidebarHost />);
    // Mount auf App-Tab → eingeklappt
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
    // Nutzer zieht die Sidebar manuell wieder auf — bleibt erhalten
    act(() => useWorkspaceStore.getState().toggleSidebar());
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);
  });
});
