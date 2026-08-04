import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TabBar } from '../TabBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';

// Confirm-Dialog steuerbar machen: Ergebnis + Aufrufzähler über einen
// gehoisteten Halter, damit jeder Test das Verhalten setzen kann.
const h = vi.hoisted(() => ({ result: true, calls: 0 }));
vi.mock('@/hooks/useConfirm', () => ({
  default: () => ({
    confirm: () => {
      h.calls++;
      return Promise.resolve(h.result);
    },
    ConfirmDialog: null,
  }),
}));

function reset() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    dirtyTabs: new Set<string>(),
  });
  h.result = true;
  h.calls = 0;
}

describe('TabBar — Schließen-Rückfrage bei ungespeicherten Änderungen', () => {
  beforeEach(reset);

  it('schließt einen sauberen Tab ohne Rückfrage', async () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'projektdatei', projectId: 'p', filePath: 'a.md', title: 'a.md' });
    render(<TabBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Tab a.md schließen' }));
    await waitFor(() => expect(useWorkspaceStore.getState().tabs).toHaveLength(0));
    expect(h.calls).toBe(0);
  });

  it('fragt vor dem Schließen eines dirty Tabs und behält ihn bei Abbruch', async () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'projektdatei', projectId: 'p', filePath: 'b.md', title: 'b.md' });
    s.setTabDirty('projektdatei:p:b.md', true);
    h.result = false; // Nutzer bricht ab
    render(<TabBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Tab b.md schließen' }));
    await waitFor(() => expect(h.calls).toBe(1));
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
  });

  it('verwirft den dirty Tab bei Bestätigung', async () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'projektdatei', projectId: 'p', filePath: 'c.md', title: 'c.md' });
    s.setTabDirty('projektdatei:p:c.md', true);
    h.result = true; // Nutzer bestätigt „Verwerfen"
    render(<TabBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Tab c.md schließen' }));
    await waitFor(() => expect(useWorkspaceStore.getState().tabs).toHaveLength(0));
    expect(h.calls).toBe(1);
  });

  it('zeigt den Ungespeichert-Punkt am dirty Tab', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'projektdatei', projectId: 'p', filePath: 'd.md', title: 'd.md' });
    s.setTabDirty('projektdatei:p:d.md', true);
    render(<TabBar />);
    expect(screen.getByTestId('tab-dirty-dot')).toBeInTheDocument();
  });
});
