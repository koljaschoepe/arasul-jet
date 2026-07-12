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
    terminalVisible: false,
    chatVisible: true,
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
