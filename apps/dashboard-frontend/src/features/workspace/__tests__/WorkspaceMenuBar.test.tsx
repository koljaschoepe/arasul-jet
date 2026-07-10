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
    explorerVisible: true,
    llmVisible: true,
    chatScope: null,
    explorerRequest: null,
  });
}

describe('WorkspaceMenuBar', () => {
  beforeEach(resetStore);

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
});
