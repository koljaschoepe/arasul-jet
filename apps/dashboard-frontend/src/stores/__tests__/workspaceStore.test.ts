import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore, tabId, tabToPath, pathToTabSpec } from '@/stores/workspaceStore';

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    sidebarVisible: true,
    terminalVisible: false,
    chatVisible: true,
    terminalSessions: [],
    activeTerminalSessionId: null,
    chatScope: null,
    explorerRequest: null,
  });
  localStorage.removeItem('arasul_workspace');
}

describe('workspaceStore — Tabs', () => {
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

  it('moveTab ordnet Tabs um (stabile Reihenfolge)', () => {
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

  it('persistiert Tabs in localStorage (Reload-Restore)', () => {
    useWorkspaceStore.getState().openTab({ type: 'dashboard' });
    const raw = localStorage.getItem('arasul_workspace');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? '{}');
    expect(parsed.version).toBe(3);
    expect(parsed.state.tabs).toHaveLength(1);
    expect(parsed.state.activeTabId).toBe('dashboard');
    // chatScope ist ephemer und wird nicht persistiert
    expect(parsed.state.chatScope).toBeUndefined();
  });
});

describe('workspaceStore — drei unabhängige Flächen', () => {
  beforeEach(resetStore);

  it('Defaults: Sidebar an, Chat an, Terminal aus', () => {
    const s = useWorkspaceStore.getState();
    expect(s.sidebarVisible).toBe(true);
    expect(s.chatVisible).toBe(true);
    expect(s.terminalVisible).toBe(false);
  });

  it('Toggles wirken unabhängig voneinander', () => {
    useWorkspaceStore.getState().toggleTerminal();
    let s = useWorkspaceStore.getState();
    expect(s.terminalVisible).toBe(true);
    expect(s.chatVisible).toBe(true);
    expect(s.sidebarVisible).toBe(true);

    useWorkspaceStore.getState().toggleChat();
    useWorkspaceStore.getState().toggleSidebar();
    s = useWorkspaceStore.getState();
    expect(s.terminalVisible).toBe(true);
    expect(s.chatVisible).toBe(false);
    expect(s.sidebarVisible).toBe(false);

    useWorkspaceStore.getState().toggleTerminal();
    expect(useWorkspaceStore.getState().terminalVisible).toBe(false);
  });

  it('persistiert die drei Flächen in localStorage', () => {
    useWorkspaceStore.getState().toggleTerminal();
    useWorkspaceStore.getState().toggleChat();
    const parsed = JSON.parse(localStorage.getItem('arasul_workspace') ?? '{}');
    expect(parsed.state.terminalVisible).toBe(true);
    expect(parsed.state.chatVisible).toBe(false);
    expect(parsed.state.sidebarVisible).toBe(true);
  });

  it('setChatScope blendet das Chat-Panel ein', () => {
    useWorkspaceStore.setState({ chatVisible: false });
    useWorkspaceStore.getState().setChatScope({ spaceIds: ['a'], label: 'Ordner' });
    const state = useWorkspaceStore.getState();
    expect(state.chatVisible).toBe(true);
    expect(state.chatScope?.spaceIds).toEqual(['a']);
    useWorkspaceStore.getState().setChatScope(null);
    expect(useWorkspaceStore.getState().chatScope).toBeNull();
    // Panel bleibt sichtbar — Scope aufheben blendet nichts aus
    expect(useWorkspaceStore.getState().chatVisible).toBe(true);
  });

  it('requestExplorerAction blendet die Sidebar ein und clearExplorerRequest räumt auf', () => {
    useWorkspaceStore.setState({ sidebarVisible: false });
    useWorkspaceStore.getState().requestExplorerAction('create-folder');
    let state = useWorkspaceStore.getState();
    expect(state.sidebarVisible).toBe(true);
    expect(state.explorerRequest).toBe('create-folder');
    useWorkspaceStore.getState().clearExplorerRequest();
    state = useWorkspaceStore.getState();
    expect(state.explorerRequest).toBeNull();
    expect(state.sidebarVisible).toBe(true);
  });
});

describe('workspaceStore — Terminal-Session-Registry', () => {
  beforeEach(resetStore);

  it('openTerminalSession registriert, aktiviert und blendet das Terminal ein', () => {
    useWorkspaceStore
      .getState()
      .openTerminalSession({ id: 'p1', projectId: 'p1', title: 'mein-projekt' });
    const s = useWorkspaceStore.getState();
    expect(s.terminalSessions).toHaveLength(1);
    expect(s.activeTerminalSessionId).toBe('p1');
    expect(s.terminalVisible).toBe(true);
  });

  it('dedupliziert Sessions über die Id und aktiviert die bestehende', () => {
    const { openTerminalSession } = useWorkspaceStore.getState();
    openTerminalSession({ id: 'p1', projectId: 'p1', title: 'a' });
    openTerminalSession({ id: 'p2', projectId: 'p2', title: 'b' });
    openTerminalSession({ id: 'p1', projectId: 'p1', title: 'a' });
    const s = useWorkspaceStore.getState();
    expect(s.terminalSessions.map(x => x.id)).toEqual(['p1', 'p2']);
    expect(s.activeTerminalSessionId).toBe('p1');
  });

  it('closeTerminalSession aktiviert den Nachbarn; letzte Session → null', () => {
    const { openTerminalSession } = useWorkspaceStore.getState();
    openTerminalSession({ id: 'p1', projectId: 'p1', title: 'a' });
    openTerminalSession({ id: 'p2', projectId: 'p2', title: 'b' });
    openTerminalSession({ id: 'p3', projectId: 'p3', title: 'c' });
    useWorkspaceStore.getState().activateTerminalSession('p2');
    useWorkspaceStore.getState().closeTerminalSession('p2');
    let s = useWorkspaceStore.getState();
    expect(s.terminalSessions.map(x => x.id)).toEqual(['p1', 'p3']);
    expect(s.activeTerminalSessionId).toBe('p3');
    useWorkspaceStore.getState().closeTerminalSession('p3');
    useWorkspaceStore.getState().closeTerminalSession('p1');
    s = useWorkspaceStore.getState();
    expect(s.terminalSessions).toHaveLength(0);
    expect(s.activeTerminalSessionId).toBeNull();
  });

  it('inaktive Session schließen lässt die aktive unverändert', () => {
    const { openTerminalSession } = useWorkspaceStore.getState();
    openTerminalSession({ id: 'p1', projectId: 'p1', title: 'a' });
    openTerminalSession({ id: 'p2', projectId: 'p2', title: 'b' });
    useWorkspaceStore.getState().closeTerminalSession('p1');
    expect(useWorkspaceStore.getState().activeTerminalSessionId).toBe('p2');
  });

  it('updateTerminalSessionTitle ändert den Titel', () => {
    useWorkspaceStore.getState().openTerminalSession({ id: 'p1', projectId: 'p1', title: 'alt' });
    useWorkspaceStore.getState().updateTerminalSessionTitle('p1', 'neu');
    expect(useWorkspaceStore.getState().terminalSessions[0]?.title).toBe('neu');
  });

  it('persistiert Sessions in localStorage (Restore nach Reload)', () => {
    useWorkspaceStore.getState().openTerminalSession({ id: 'p1', projectId: 'p1', title: 'a' });
    const parsed = JSON.parse(localStorage.getItem('arasul_workspace') ?? '{}');
    expect(parsed.state.terminalSessions).toEqual([{ id: 'p1', projectId: 'p1', title: 'a' }]);
    expect(parsed.state.activeTerminalSessionId).toBe('p1');
  });
});

describe('workspaceStore — Migration v2 → v3', () => {
  beforeEach(resetStore);

  /** Echter v2-Persist-Stand (Terminal als Mitte-Tab, rechtes Panel im Terminal-Modus). */
  const V2_TERMINAL_MODE = {
    state: {
      tabs: [
        { id: 'dashboard', type: 'dashboard', title: 'Dashboard' },
        { id: 'sandbox', type: 'sandbox', title: 'Terminal' },
        { id: 'document:42', type: 'document', title: 'rechnung.pdf', documentId: '42' },
      ],
      activeTabId: 'sandbox',
      explorerVisible: false,
      llmVisible: true,
      llmPanelMode: 'terminal',
    },
    version: 2,
  };

  /** Echter v2-Persist-Stand (Chat-Modus, Explorer sichtbar). */
  const V2_CHAT_MODE = {
    state: {
      tabs: [
        { id: 'store', type: 'store', title: 'Extensions' },
        { id: 'database-table:users', type: 'database-table', title: 'users', slug: 'users' },
      ],
      activeTabId: 'database-table:users',
      explorerVisible: true,
      llmVisible: false,
      llmPanelMode: 'chat',
    },
    version: 2,
  };

  async function rehydrateFrom(persisted: unknown) {
    localStorage.setItem('arasul_workspace', JSON.stringify(persisted));
    await useWorkspaceStore.persist.rehydrate();
  }

  it('mappt llmPanelMode=terminal → terminalVisible und entfernt sandbox-Tabs', async () => {
    await rehydrateFrom(V2_TERMINAL_MODE);
    const s = useWorkspaceStore.getState();
    expect(s.sidebarVisible).toBe(false); // explorerVisible → sidebarVisible
    expect(s.chatVisible).toBe(true); // llmVisible → chatVisible
    expect(s.terminalVisible).toBe(true); // llmPanelMode === 'terminal'
    expect(s.tabs.map(t => t.id)).toEqual(['dashboard', 'document:42']);
    // aktiver Tab war der entfernte sandbox-Tab → Fallback auf ersten Tab
    expect(s.activeTabId).toBe('dashboard');
    expect(s.terminalSessions).toEqual([]);
    expect(s.activeTerminalSessionId).toBeNull();
  });

  it('llmVisible=false + llmPanelMode=terminal → Terminal-Panel bleibt zu (Panel-Zustand erhalten)', async () => {
    // v2: rechtes Panel bewusst ausgeblendet, letzter Modus war Terminal —
    // nach dem Update darf sich das Terminal-Panel NICHT ungefragt öffnen.
    await rehydrateFrom({
      state: {
        tabs: [{ id: 'dashboard', type: 'dashboard', title: 'Dashboard' }],
        activeTabId: 'dashboard',
        explorerVisible: true,
        llmVisible: false,
        llmPanelMode: 'terminal',
      },
      version: 2,
    });
    const s = useWorkspaceStore.getState();
    expect(s.terminalVisible).toBe(false);
    expect(s.chatVisible).toBe(false);
    expect(s.sidebarVisible).toBe(true);
  });

  it('mappt llmPanelMode=chat → terminalVisible=false und erhält Tabs + aktiven Tab', async () => {
    await rehydrateFrom(V2_CHAT_MODE);
    const s = useWorkspaceStore.getState();
    expect(s.sidebarVisible).toBe(true);
    expect(s.chatVisible).toBe(false);
    expect(s.terminalVisible).toBe(false);
    expect(s.tabs.map(t => t.id)).toEqual(['store', 'database-table:users']);
    expect(s.activeTabId).toBe('database-table:users');
  });

  it('schreibt den migrierten Stand als version 3 zurück', async () => {
    await rehydrateFrom(V2_TERMINAL_MODE);
    // Ein Write triggert die Persistierung des migrierten Stands
    useWorkspaceStore.getState().toggleSidebar();
    const parsed = JSON.parse(localStorage.getItem('arasul_workspace') ?? '{}');
    expect(parsed.version).toBe(3);
    expect(parsed.state.llmPanelMode).toBeUndefined();
    expect(parsed.state.explorerVisible).toBeUndefined();
    expect(parsed.state.llmVisible).toBeUndefined();
  });

  it('filtert auch unbekannte Tab-Typen (defensiv)', async () => {
    await rehydrateFrom({
      state: {
        tabs: [
          { id: 'chat', type: 'chat', title: 'Chat' },
          { id: 'settings', type: 'settings', title: 'Einstellungen' },
        ],
        activeTabId: 'chat',
        explorerVisible: true,
        llmVisible: true,
        llmPanelMode: 'chat',
      },
      version: 2,
    });
    const s = useWorkspaceStore.getState();
    expect(s.tabs.map(t => t.id)).toEqual(['settings']);
    expect(s.activeTabId).toBe('settings');
  });
});

describe('URL-Mapping (tabToPath / pathToTabSpec)', () => {
  it('bildet jeden Tab-Typ auf einen Pfad ab und zurück', () => {
    const specs = [
      { type: 'dashboard' as const },
      { type: 'document' as const, documentId: '42' },
      { type: 'settings' as const },
      { type: 'automationen' as const },
      { type: 'store' as const },
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

  it('Terminal ist kein Tab mehr — /terminal ergibt null', () => {
    expect(pathToTabSpec('/terminal')).toBeNull();
  });

  it('unbekannte Pfade ergeben null', () => {
    expect(pathToTabSpec('/unbekannt')).toBeNull();
    expect(pathToTabSpec('')).toBeNull();
  });
});
