import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceMenuBar } from '../WorkspaceMenuBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeView: null,
    sidebarVisible: true,
    rightPanelVisible: true,
  });
}

describe('WorkspaceMenuBar', () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.removeAttribute('data-theme');
  });

  it('rendert Marke und den Settings-Button rechts', () => {
    render(<WorkspaceMenuBar />);
    expect(screen.getByText('Arasul')).toBeInTheDocument();
    expect(screen.getByLabelText('Einstellungen')).toBeInTheDocument();
  });

  it('hat kein Datei-Menü mehr (Explorer und Terminal sind mit B2 gefallen)', () => {
    render(<WorkspaceMenuBar />);
    expect(screen.queryByLabelText('Datei-Menü')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ansicht-Menü')).not.toBeInTheDocument();
  });

  it('Settings-Button öffnet den Einstellungen-Tab und die Bereiche links', () => {
    render(<WorkspaceMenuBar />);
    fireEvent.click(screen.getByLabelText('Einstellungen'));
    expect(useWorkspaceStore.getState().activeTabId).toBe('settings');
    expect(useWorkspaceStore.getState().activeView).toBe('settings');
  });

  it('zeigt genau zwei Layout-Toggles rechts, die den Store spiegeln und schalten', () => {
    render(<WorkspaceMenuBar />);

    const layoutGroup = screen.getByRole('group', { name: 'Layout' });
    expect(layoutGroup.querySelectorAll('button')).toHaveLength(2);

    const sidebar = screen.getByLabelText('Sidebar ausblenden');
    const panel = screen.getByLabelText('Panel ausblenden');
    expect(sidebar).toHaveAttribute('aria-pressed', 'true');
    expect(panel).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(sidebar);
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);

    fireEvent.click(panel);
    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(false);

    fireEvent.click(screen.getByLabelText('Panel einblenden'));
    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(true);
  });

  it('bietet keine Design-/Theme-Auswahl in der Menüleiste', () => {
    render(<WorkspaceMenuBar />);
    expect(
      screen.queryByRole('menuitemradio', { name: /Schwarz|Dunkel|Hell/ })
    ).not.toBeInTheDocument();
  });
});
