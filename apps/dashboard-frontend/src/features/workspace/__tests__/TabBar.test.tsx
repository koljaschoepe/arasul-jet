import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from '../TabBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';

function reset() {
  useWorkspaceStore.setState({ tabs: [], activeTabId: null });
}

describe('TabBar', () => {
  beforeEach(reset);

  it('zeigt jeden offenen Tab und markiert den aktiven', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'settings' });
    s.openTab({ type: 'modelle' });
    render(<TabBar />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(['Einstellungen', 'Modelle']);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('ein Klick aktiviert den Tab', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'settings' });
    s.openTab({ type: 'modelle' });
    render(<TabBar />);
    fireEvent.click(screen.getByRole('tab', { name: /Einstellungen/ }));
    expect(useWorkspaceStore.getState().activeTabId).toBe('settings');
  });

  it('das × schließt den Tab ohne Rückfrage (seit B2 gibt es keine Editoren mehr)', () => {
    useWorkspaceStore.getState().openTab({ type: 'settings' });
    render(<TabBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Tab Einstellungen schließen' }));
    expect(useWorkspaceStore.getState().tabs).toHaveLength(0);
  });

  it('Mittelklick schließt den Tab', () => {
    useWorkspaceStore.getState().openTab({ type: 'automationen' });
    render(<TabBar />);
    fireEvent(
      screen.getByRole('tab', { name: /Automationen/ }),
      new MouseEvent('auxclick', { button: 1, bubbles: true })
    );
    expect(useWorkspaceStore.getState().tabs).toHaveLength(0);
  });
});
