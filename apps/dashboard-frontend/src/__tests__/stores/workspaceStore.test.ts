import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore, tabId, tabToPath, pathToTabSpec } from '@/stores/workspaceStore';

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    explorerVisible: true,
    llmVisible: true,
    chatScope: null,
  });
  localStorage.removeItem('arasul_workspace');
}

describe('workspaceStore', () => {
  beforeEach(resetStore);

  it('öffnet einen Tab und aktiviert ihn', () => {
    useWorkspaceStore.getState().openTab({ type: 'dashboard' });
    const { tabs, activeTabId } = useWorkspaceStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.type).toBe('dashboard');
    expect(activeTabId).toBe('dashboard');
  });

  it('dedupliziert Tabs über die Identität (type + payload)', () => {
    const { openTab } = useWorkspaceStore.getState();
    openTab({ type: 'document', documentId: '42', title: 'a.pdf' });
    openTab({ type: 'dashboard' });
    openTab({ type: 'document', documentId: '42', title: 'a.pdf' });
    const { tabs, activeTabId } = useWorkspaceStore.getState();
    expect(tabs).toHaveLength(2);
    expect(activeTabId).toBe('document:42');
  });

  it('unterschiedliche Dokumente ergeben unterschiedliche Tabs', () => {
    const { openTab } = useWorkspaceStore.getState();
    openTab({ type: 'document', documentId: '1' });
    openTab({ type: 'document', documentId: '2' });
    expect(useWorkspaceStore.getState().tabs).toHaveLength(2);
  });

  it('schließt den aktiven Tab und aktiviert den Nachbarn', () => {
    const { openTab } = useWorkspaceStore.getState();
    openTab({ type: 'dashboard' });
    openTab({ type: 'settings' });
    openTab({ type: 'store' });
    useWorkspaceStore.getState().activateTab('settings');
    useWorkspaceStore.getState().closeTab('settings');
    const { tabs, activeTabId } = useWorkspaceStore.getState();
    expect(tabs.map(t => t.id)).toEqual(['dashboard', 'store']);
    expect(activeTabId).toBe('store');
  });

  it('schließt den letzten Tab → kein aktiver Tab', () => {
    useWorkspaceStore.getState().openTab({ type: 'dashboard' });
    useWorkspaceStore.getState().closeTab('dashboard');
    const { tabs, activeTabId } = useWorkspaceStore.getState();
    expect(tabs).toHaveLength(0);
    expect(activeTabId).toBeNull();
  });

  it('inaktiven Tab schließen lässt den aktiven unverändert', () => {
    const { openTab } = useWorkspaceStore.getState();
    openTab({ type: 'dashboard' });
    openTab({ type: 'settings' });
    useWorkspaceStore.getState().closeTab('dashboard');
    expect(useWorkspaceStore.getState().activeTabId).toBe('settings');
  });

  it('moveTab ordnet Tabs um', () => {
    const { openTab } = useWorkspaceStore.getState();
    openTab({ type: 'dashboard' });
    openTab({ type: 'settings' });
    openTab({ type: 'store' });
    useWorkspaceStore.getState().moveTab(0, 2);
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual([
      'settings',
      'store',
      'dashboard',
    ]);
  });

  it('updateTabTitle ändert den Titel', () => {
    useWorkspaceStore.getState().openTab({ type: 'document', documentId: '7' });
    useWorkspaceStore.getState().updateTabTitle('document:7', 'rechnung.pdf');
    expect(useWorkspaceStore.getState().tabs[0]?.title).toBe('rechnung.pdf');
  });

  it('setChatScope blendet das KI-Panel ein', () => {
    useWorkspaceStore.setState({ llmVisible: false });
    useWorkspaceStore.getState().setChatScope({ spaceIds: ['a'], label: 'Ordner' });
    const state = useWorkspaceStore.getState();
    expect(state.llmVisible).toBe(true);
    expect(state.chatScope?.spaceIds).toEqual(['a']);
    useWorkspaceStore.getState().setChatScope(null);
    expect(useWorkspaceStore.getState().chatScope).toBeNull();
    // Panel bleibt sichtbar — Scope aufheben blendet nichts aus
    expect(useWorkspaceStore.getState().llmVisible).toBe(true);
  });

  it('persistiert Tabs in localStorage (Reload-Restore)', () => {
    useWorkspaceStore.getState().openTab({ type: 'dashboard' });
    const raw = localStorage.getItem('arasul_workspace');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? '{}');
    expect(parsed.state.tabs).toHaveLength(1);
    expect(parsed.state.activeTabId).toBe('dashboard');
    // chatScope ist ephemer und wird nicht persistiert
    expect(parsed.state.chatScope).toBeUndefined();
  });
});

describe('URL-Mapping (tabToPath / pathToTabSpec)', () => {
  it('bildet jeden Tab-Typ auf einen Pfad ab und zurück', () => {
    const specs = [
      { type: 'dashboard' as const },
      { type: 'documents' as const },
      { type: 'document' as const, documentId: '42' },
      { type: 'chat' as const, chatId: '7' },
      { type: 'chat' as const },
      { type: 'settings' as const },
      { type: 'store' as const },
      { type: 'sandbox' as const },
      { type: 'telegram' as const },
      { type: 'database' as const },
      { type: 'database-table' as const, slug: 'users' },
    ];
    for (const spec of specs) {
      const tab = { id: tabId(spec), title: 'x', ...spec };
      const path = tabToPath(tab);
      expect(path.startsWith('/workspace')).toBe(true);
      const roundTripped = pathToTabSpec(path.replace(/^\/workspace/, ''));
      expect(roundTripped).not.toBeNull();
      expect(tabId(roundTripped!)).toBe(tab.id);
    }
  });

  it('unbekannte Pfade ergeben null', () => {
    expect(pathToTabSpec('/unbekannt')).toBeNull();
    expect(pathToTabSpec('')).toBeNull();
  });
});
