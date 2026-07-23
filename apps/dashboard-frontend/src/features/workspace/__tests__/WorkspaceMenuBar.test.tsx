import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceMenuBar } from '../WorkspaceMenuBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';

// Der WorkspaceSwitcher (Plan 012) liest Server-State über React Query/useApi;
// hier flach mocken, damit der MenuBar-Test auf die Menüleiste fokussiert bleibt.
vi.mock('../WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => null,
}));

const themeControls = {
  theme: 'dark',
  onToggleTheme: vi.fn(),
  onLogout: vi.fn().mockResolvedValue(undefined),
};

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    sidebarVisible: true,
    rightPanelVisible: true,
    rightPanelMode: 'chat',
    chatScope: null,
    explorerRequest: null,
  });
}

describe('WorkspaceMenuBar', () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.removeAttribute('data-theme');
  });

  it('rendert Marke, Datei-Menü und den Settings-Button rechts', () => {
    render(<WorkspaceMenuBar themeControls={themeControls} />);
    expect(screen.getByText('Arasul')).toBeInTheDocument();
    expect(screen.getByLabelText('Datei-Menü')).toBeInTheDocument();
    expect(screen.getByLabelText('Einstellungen')).toBeInTheDocument();
  });

  it('hat keinen Ansichtsmodus-/Theme-Umschalter mehr (nur noch in den Einstellungen)', () => {
    render(<WorkspaceMenuBar themeControls={themeControls} />);
    expect(screen.queryByLabelText('Ansicht-Menü')).not.toBeInTheDocument();
  });

  it('»Neuer Ordner…« stellt eine Explorer-Anfrage', async () => {
    const user = userEvent.setup();
    render(<WorkspaceMenuBar themeControls={themeControls} />);
    await user.click(screen.getByLabelText('Datei-Menü'));
    await user.click(await screen.findByText('Neuer Ordner…'));
    expect(useWorkspaceStore.getState().explorerRequest).toBe('create-folder');
  });

  it('Settings-Button öffnet den Einstellungen-Tab', () => {
    render(<WorkspaceMenuBar themeControls={themeControls} />);
    fireEvent.click(screen.getByLabelText('Einstellungen'));
    expect(useWorkspaceStore.getState().activeTabId).toBe('settings');
  });

  it('zeigt genau zwei Layout-Toggles rechts, die den Store spiegeln und schalten', () => {
    render(<WorkspaceMenuBar themeControls={themeControls} />);

    const layoutGroup = screen.getByRole('group', { name: 'Layout' });
    expect(layoutGroup.querySelectorAll('button')).toHaveLength(2);

    const sidebar = screen.getByLabelText('Sidebar ausblenden');
    const panel = screen.getByLabelText('Panel ausblenden');
    // Default: Sidebar an, rechtes Panel sichtbar
    expect(sidebar).toHaveAttribute('aria-pressed', 'true');
    expect(panel).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(sidebar);
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);

    // Der Panel-Toggle blendet nur die Sichtbarkeit um — der Modus bleibt.
    fireEvent.click(panel);
    let state = useWorkspaceStore.getState();
    expect(state.rightPanelVisible).toBe(false);
    expect(state.rightPanelMode).toBe('chat');

    fireEvent.click(screen.getByLabelText('Panel einblenden'));
    state = useWorkspaceStore.getState();
    expect(state.rightPanelVisible).toBe(true);
    expect(state.rightPanelMode).toBe('chat');
  });

  it('»Neue Terminal-Umgebung…« schaltet das rechte Panel in den Terminal-Modus', async () => {
    const user = userEvent.setup();
    render(<WorkspaceMenuBar themeControls={themeControls} />);
    await user.click(screen.getByLabelText('Datei-Menü'));
    await user.click(await screen.findByText('Neue Terminal-Umgebung…'));
    const state = useWorkspaceStore.getState();
    expect(state.rightPanelVisible).toBe(true);
    expect(state.rightPanelMode).toBe('terminal');
  });

  it('bietet keine Design-/Theme-Auswahl mehr in der Menüleiste', () => {
    render(<WorkspaceMenuBar themeControls={themeControls} />);
    // Kein Ansicht-Menü, keine Design-Optionen — Theme lebt nur in den Einstellungen.
    expect(screen.queryByLabelText('Ansicht-Menü')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitemradio', { name: /Schwarz|Dunkel|Hell/ })
    ).not.toBeInTheDocument();
  });
});
