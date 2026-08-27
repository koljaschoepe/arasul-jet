/**
 * Tests: die rechte Spalte nach D1.
 *
 * Agent-Chat und Terminal, die hier als eine Fläche mit zwei Modi lebten, sind
 * mit B2 gefallen; seither stand die Spalte leer. D1 füllt sie mit den Notizen
 * (Zielbild aus Beschluss 10 vom 26.08.2026). Geprüft wird die Spalte, nicht
 * das Innenleben der Notizen — dafür gibt es deren eigenen Test.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { RightPanel } from '../RightPanel';

vi.mock('@/features/notizen/Notizen', () => ({
  Notizen: () => <div data-testid="mock-notizen" />,
}));

describe('RightPanel, die Notizen-Spalte', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ tabs: [], activeTabId: null, rightPanelVisible: true });
  });

  it('trägt die Notizen und keinen Chat-/Terminal-Umschalter mehr', () => {
    render(<RightPanel />);
    expect(screen.getByTestId('mock-notizen')).toBeInTheDocument();
    expect(screen.getByText('Notizen')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Terminal' })).not.toBeInTheDocument();
  });

  it('der Schließen-Button blendet das Panel aus', () => {
    render(<RightPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Panel ausblenden' }));
    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(false);
  });
});
