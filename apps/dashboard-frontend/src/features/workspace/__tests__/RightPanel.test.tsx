/**
 * Tests: die rechte Spalte nach B2.
 *
 * Agent-Chat und Terminal, die hier als eine Fläche mit zwei Modi lebten, sind
 * gefallen. Die Spalte bleibt als leere Fläche mit Schließen-Knopf, damit das
 * Dreispalten-Raster steht, bis D2 sie füllt.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { RightPanel } from '../RightPanel';

describe('RightPanel, leere rechte Spalte', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ tabs: [], activeTabId: null, rightPanelVisible: true });
  });

  it('zeigt eine leere Fläche ohne Chat- oder Terminal-Umschalter', () => {
    render(<RightPanel />);
    expect(screen.getByTestId('workspace-right-panel-leer')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Terminal' })).not.toBeInTheDocument();
  });

  it('der Schließen-Button blendet das Panel aus', () => {
    render(<RightPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Panel ausblenden' }));
    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(false);
  });
});
