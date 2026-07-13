import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceMenuBar } from '../WorkspaceMenuBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';

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

  it('rendert Marke, Menüs und den Settings-Button rechts', () => {
    render(<WorkspaceMenuBar themeControls={themeControls} onLeaveWorkspace={vi.fn()} />);
    expect(screen.getByText('Arasul')).toBeInTheDocument();
    expect(screen.getByLabelText('Datei-Menü')).toBeInTheDocument();
    expect(screen.getByLabelText('Ansicht-Menü')).toBeInTheDocument();
    expect(screen.getByLabelText('Einstellungen')).toBeInTheDocument();
  });

  it('»Neuer Ordner…« stellt eine Explorer-Anfrage', async () => {
    const user = userEvent.setup();
    render(<WorkspaceMenuBar themeControls={themeControls} onLeaveWorkspace={vi.fn()} />);
    await user.click(screen.getByLabelText('Datei-Menü'));
    await user.click(await screen.findByText('Neuer Ordner…'));
    expect(useWorkspaceStore.getState().explorerRequest).toBe('create-folder');
  });

  it('Settings-Button öffnet den Einstellungen-Tab', () => {
    render(<WorkspaceMenuBar themeControls={themeControls} onLeaveWorkspace={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Einstellungen'));
    expect(useWorkspaceStore.getState().activeTabId).toBe('settings');
  });

  it('»Zur klassischen Ansicht« ruft onLeaveWorkspace', async () => {
    const user = userEvent.setup();
    const leave = vi.fn();
    render(<WorkspaceMenuBar themeControls={themeControls} onLeaveWorkspace={leave} />);
    await user.click(screen.getByLabelText('Datei-Menü'));
    await user.click(await screen.findByText('Zur klassischen Ansicht'));
    expect(leave).toHaveBeenCalled();
  });

  it('zeigt genau zwei Layout-Toggles rechts, die den Store spiegeln und schalten', () => {
    render(<WorkspaceMenuBar themeControls={themeControls} onLeaveWorkspace={vi.fn()} />);

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
    render(<WorkspaceMenuBar themeControls={themeControls} onLeaveWorkspace={vi.fn()} />);
    await user.click(screen.getByLabelText('Datei-Menü'));
    await user.click(await screen.findByText('Neue Terminal-Umgebung…'));
    const state = useWorkspaceStore.getState();
    expect(state.rightPanelVisible).toBe(true);
    expect(state.rightPanelMode).toBe('terminal');
  });

  it('Ansicht-Menü enthält keine Panel-Toggles mehr (nur Design)', async () => {
    const user = userEvent.setup();
    render(<WorkspaceMenuBar themeControls={themeControls} onLeaveWorkspace={vi.fn()} />);
    await user.click(screen.getByLabelText('Ansicht-Menü'));

    expect(await screen.findByText('Design')).toBeInTheDocument();
    expect(screen.queryByText(/Explorer ausblenden|Explorer einblenden/)).not.toBeInTheDocument();
    expect(screen.queryByText(/KI-Panel/)).not.toBeInTheDocument();
  });

  it('Ansicht-Menü zeigt drei Design-Optionen, aktiv ist Schwarz (Default)', async () => {
    const user = userEvent.setup();
    render(<WorkspaceMenuBar themeControls={themeControls} onLeaveWorkspace={vi.fn()} />);
    await user.click(screen.getByLabelText('Ansicht-Menü'));

    const black = await screen.findByRole('menuitemradio', { name: /Schwarz/ });
    const dark = screen.getByRole('menuitemradio', { name: /Dunkel/ });
    const light = screen.getByRole('menuitemradio', { name: /Hell/ });

    expect(black).toHaveAttribute('aria-checked', 'true');
    expect(dark).toHaveAttribute('aria-checked', 'false');
    expect(light).toHaveAttribute('aria-checked', 'false');
  });

  it('Design-Auswahl »Hell« setzt Theme, Klasse und localStorage', async () => {
    const user = userEvent.setup();
    render(<WorkspaceMenuBar themeControls={themeControls} onLeaveWorkspace={vi.fn()} />);
    await user.click(screen.getByLabelText('Ansicht-Menü'));
    await user.click(await screen.findByRole('menuitemradio', { name: /Hell/ }));

    expect(localStorage.getItem('arasul_theme')).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
