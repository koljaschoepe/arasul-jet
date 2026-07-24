import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore, tabId, tabToPath, pathToTabSpec } from '@/stores/workspaceStore';

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeView: 'files',
    sidebarVisible: true,
    sidebarRestore: null,
    rightPanelVisible: true,
    rightPanelMode: 'chat',
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
    useWorkspaceStore.getState().openTab({ type: 'automationen' });
    const { tabs, activeTabId } = useWorkspaceStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.type).toBe('automationen');
    expect(activeTabId).toBe('automationen');
  });

  it('dedupliziert Tabs über die Identität (type + payload)', () => {
    const { openTab } = useWorkspaceStore.getState();
    openTab({ type: 'document', documentId: '42', title: 'a.pdf' });
    openTab({ type: 'automationen' });
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
    openTab({ type: 'automationen' });
    openTab({ type: 'settings' });
    openTab({ type: 'store' });
    useWorkspaceStore.getState().activateTab('settings');
    useWorkspaceStore.getState().closeTab('settings');
    const { tabs, activeTabId } = useWorkspaceStore.getState();
    expect(tabs.map(t => t.id)).toEqual(['automationen', 'store']);
    expect(activeTabId).toBe('store');
  });

  it('schließt den letzten Tab → kein aktiver Tab', () => {
    useWorkspaceStore.getState().openTab({ type: 'automationen' });
    useWorkspaceStore.getState().closeTab('automationen');
    const { tabs, activeTabId } = useWorkspaceStore.getState();
    expect(tabs).toHaveLength(0);
    expect(activeTabId).toBeNull();
  });

  it('inaktiven Tab schließen lässt den aktiven unverändert', () => {
    const { openTab } = useWorkspaceStore.getState();
    openTab({ type: 'automationen' });
    openTab({ type: 'settings' });
    useWorkspaceStore.getState().closeTab('automationen');
    expect(useWorkspaceStore.getState().activeTabId).toBe('settings');
  });

  it('moveTab ordnet Tabs um (stabile Reihenfolge)', () => {
    const { openTab } = useWorkspaceStore.getState();
    openTab({ type: 'automationen' });
    openTab({ type: 'settings' });
    openTab({ type: 'store' });
    useWorkspaceStore.getState().moveTab(0, 2);
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual([
      'settings',
      'store',
      'automationen',
    ]);
  });

  it('der Skill-Editor ist ein Singleton-Tab mit Default-Titel', () => {
    const { openTab } = useWorkspaceStore.getState();
    openTab({ type: 'skill' });
    openTab({ type: 'skill' });
    const { tabs, activeTabId } = useWorkspaceStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.id).toBe('skill');
    expect(tabs[0]?.title).toBe('Neuer Skill');
    expect(activeTabId).toBe('skill');
  });

  it('updateTabTitle ändert den Titel', () => {
    useWorkspaceStore.getState().openTab({ type: 'document', documentId: '7' });
    useWorkspaceStore.getState().updateTabTitle('document:7', 'rechnung.pdf');
    expect(useWorkspaceStore.getState().tabs[0]?.title).toBe('rechnung.pdf');
  });

  it('eine App-Erweiterung ist ein eigener Tab je Id (kein Singleton)', () => {
    const { openTab } = useWorkspaceStore.getState();
    openTab({ type: 'extension', extensionId: 'notiz-app', title: 'Notiz-App' });
    openTab({ type: 'extension', extensionId: 'kalender', title: 'Kalender' });
    const { tabs, activeTabId } = useWorkspaceStore.getState();
    expect(tabs.map(t => t.id)).toEqual(['extension:notiz-app', 'extension:kalender']);
    expect(tabs[0]?.extensionId).toBe('notiz-app');
    expect(tabs[0]?.title).toBe('Notiz-App');
    expect(activeTabId).toBe('extension:kalender');
  });

  it('persistiert Tabs in localStorage (Reload-Restore)', () => {
    useWorkspaceStore.getState().openTab({ type: 'automationen' });
    const raw = localStorage.getItem('arasul_workspace');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? '{}');
    expect(parsed.version).toBe(6);
    expect(parsed.state.tabs).toHaveLength(1);
    expect(parsed.state.activeTabId).toBe('automationen');
    // chatScope ist ephemer und wird nicht persistiert
    expect(parsed.state.chatScope).toBeUndefined();
  });
});

describe('workspaceStore — Sidebar + rechtes Panel (Sichtbarkeit + Modus)', () => {
  beforeEach(resetStore);

  it('Defaults: Sidebar an, rechtes Panel sichtbar im Chat-Modus', () => {
    const s = useWorkspaceStore.getState();
    expect(s.sidebarVisible).toBe(true);
    expect(s.rightPanelVisible).toBe(true);
    expect(s.rightPanelMode).toBe('chat');
  });

  it('setRightPanelMode wechselt den Modus und blendet das Panel ein', () => {
    // Panel zuerst ausblenden, dann per Modus-Wahl wieder einblenden
    useWorkspaceStore.getState().toggleRightPanel();
    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(false);

    useWorkspaceStore.getState().setRightPanelMode('terminal');
    let s = useWorkspaceStore.getState();
    expect(s.rightPanelVisible).toBe(true);
    expect(s.rightPanelMode).toBe('terminal');

    useWorkspaceStore.getState().setRightPanelMode('chat');
    s = useWorkspaceStore.getState();
    expect(s.rightPanelVisible).toBe(true);
    expect(s.rightPanelMode).toBe('chat');
  });

  it('toggleRightPanel schaltet nur die Sichtbarkeit, Modus bleibt erhalten', () => {
    useWorkspaceStore.getState().setRightPanelMode('terminal');
    useWorkspaceStore.getState().toggleRightPanel();
    let s = useWorkspaceStore.getState();
    expect(s.rightPanelVisible).toBe(false);
    expect(s.rightPanelMode).toBe('terminal');

    useWorkspaceStore.getState().toggleRightPanel();
    s = useWorkspaceStore.getState();
    expect(s.rightPanelVisible).toBe(true);
    expect(s.rightPanelMode).toBe('terminal');
  });

  it('toggleSidebar wirkt unabhängig vom rechten Panel', () => {
    useWorkspaceStore.getState().setRightPanelMode('terminal');
    useWorkspaceStore.getState().toggleSidebar();
    const s = useWorkspaceStore.getState();
    expect(s.sidebarVisible).toBe(false);
    expect(s.rightPanelVisible).toBe(true);
    expect(s.rightPanelMode).toBe('terminal');
  });

  it('persistiert Sichtbarkeit + Modus des rechten Panels in localStorage', () => {
    useWorkspaceStore.getState().setRightPanelMode('terminal');
    useWorkspaceStore.getState().toggleRightPanel();
    const parsed = JSON.parse(localStorage.getItem('arasul_workspace') ?? '{}');
    expect(parsed.state.rightPanelVisible).toBe(false);
    expect(parsed.state.rightPanelMode).toBe('terminal');
    expect(parsed.state.sidebarVisible).toBe(true);
  });

  it('setChatScope blendet das Chat-Panel ein (Sichtbarkeit + Chat-Modus)', () => {
    // Panel im Terminal-Modus versteckt → Scope setzen schaltet auf Chat + zeigt
    useWorkspaceStore.setState({ rightPanelVisible: false, rightPanelMode: 'terminal' });
    useWorkspaceStore.getState().setChatScope({ spaceIds: ['a'], label: 'Ordner' });
    let state = useWorkspaceStore.getState();
    expect(state.rightPanelVisible).toBe(true);
    expect(state.rightPanelMode).toBe('chat');
    expect(state.chatScope?.spaceIds).toEqual(['a']);
    useWorkspaceStore.getState().setChatScope(null);
    state = useWorkspaceStore.getState();
    expect(state.chatScope).toBeNull();
    // Panel bleibt sichtbar — Scope aufheben blendet nichts aus
    expect(state.rightPanelVisible).toBe(true);
    expect(state.rightPanelMode).toBe('chat');
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

describe('workspaceStore — Sidebar-Auto-Collapse (syncSidebarForTab)', () => {
  beforeEach(resetStore);

  it('Eintritt in App-Tab sichert die Präferenz und klappt ein; Austritt stellt wieder her', () => {
    const { syncSidebarForTab } = useWorkspaceStore.getState();
    // Nicht-App-Tab mit offener Sidebar
    syncSidebarForTab(false);
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);
    expect(useWorkspaceStore.getState().sidebarRestore).toBeNull();
    // App-Tap betreten → eingeklappt, Präferenz gesichert
    syncSidebarForTab(true);
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
    expect(useWorkspaceStore.getState().sidebarRestore).toBe(true);
    // Verlassen → wiederhergestellt, Merker geleert
    syncSidebarForTab(false);
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);
    expect(useWorkspaceStore.getState().sidebarRestore).toBeNull();
  });

  it('erneuter sync auf demselben App-Tab revidiert einen manuellen Toggle NICHT', () => {
    const { syncSidebarForTab, toggleSidebar } = useWorkspaceStore.getState();
    syncSidebarForTab(true); // eingeklappt, restore=true
    toggleSidebar(); // Nutzer zieht auf App-Tab manuell wieder auf
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);
    syncSidebarForTab(true); // kein Eintritts-Übergang (restore !== null) → no-op
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);
  });

  it('kollabierte Präferenz bleibt kollabiert: Austritt öffnet die Sidebar nicht ungefragt', () => {
    useWorkspaceStore.setState({ sidebarVisible: false });
    const { syncSidebarForTab } = useWorkspaceStore.getState();
    syncSidebarForTab(true); // restore=false, bleibt eingeklappt
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
    syncSidebarForTab(false); // stellt false wieder her → bleibt zu
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
  });

  it('Reload auf App-Tab: persistierte Präferenz (sidebarRestore) überlebt und wird beim Verlassen wiederhergestellt', () => {
    // Simulierter rehydrierter Stand nach einem Reload auf einem App-Tab:
    // die Sidebar ist eingeklappt (persistiert), die echte Präferenz (offen)
    // liegt in sidebarRestore.
    useWorkspaceStore.setState({ sidebarVisible: false, sidebarRestore: true });
    const { syncSidebarForTab } = useWorkspaceStore.getState();
    // Mount-sync auf dem App-Tab darf die gesicherte Präferenz nicht überschreiben
    syncSidebarForTab(true);
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
    expect(useWorkspaceStore.getState().sidebarRestore).toBe(true);
    // Wechsel zurück auf Nicht-App-Tab → echte Präferenz (offen) wiederhergestellt
    syncSidebarForTab(false);
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);
    expect(useWorkspaceStore.getState().sidebarRestore).toBeNull();
  });

  it('persistiert sidebarRestore in localStorage', () => {
    useWorkspaceStore.getState().syncSidebarForTab(true);
    const parsed = JSON.parse(localStorage.getItem('arasul_workspace') ?? '{}');
    expect(parsed.state.sidebarRestore).toBe(true);
    expect(parsed.state.sidebarVisible).toBe(false);
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
    expect(s.rightPanelVisible).toBe(true);
    expect(s.rightPanelMode).toBe('terminal');
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

describe('workspaceStore — Migration v2 → v4', () => {
  beforeEach(resetStore);

  /** Echter v2-Persist-Stand (Terminal als Mitte-Tab, rechtes Panel im Terminal-Modus). */
  const V2_TERMINAL_MODE = {
    state: {
      tabs: [
        { id: 'automationen', type: 'automationen', title: 'Dashboard' },
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
        { id: 'document:99', type: 'document', title: 'Doc', documentId: '99' },
      ],
      activeTabId: 'document:99',
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

  it('mappt llmPanelMode=terminal → rightPanel sichtbar im Terminal-Modus und entfernt sandbox-Tabs', async () => {
    await rehydrateFrom(V2_TERMINAL_MODE);
    const s = useWorkspaceStore.getState();
    expect(s.sidebarVisible).toBe(false); // explorerVisible → sidebarVisible
    // v2 hatte schon EIN Panel mit Modus: llmVisible=true → sichtbar,
    // llmPanelMode='terminal' bildet 1:1 auf rightPanelMode ab (kein Verlust
    // des zuletzt genutzten Terminal-Modus durch eine Zwei-Flächen-Faltung).
    expect(s.rightPanelVisible).toBe(true);
    expect(s.rightPanelMode).toBe('terminal');
    expect(s.tabs.map(t => t.id)).toEqual(['automationen', 'document:42']);
    // aktiver Tab war der entfernte sandbox-Tab → Fallback auf ersten Tab
    expect(s.activeTabId).toBe('automationen');
    expect(s.terminalSessions).toEqual([]);
    expect(s.activeTerminalSessionId).toBeNull();
  });

  it('llmVisible=false → rechtes Panel bleibt zu (Panel-Zustand erhalten)', async () => {
    // v2: rechtes Panel bewusst ausgeblendet, letzter Modus war Terminal —
    // nach dem Update darf sich das rechte Panel NICHT ungefragt öffnen.
    await rehydrateFrom({
      state: {
        tabs: [{ id: 'automationen', type: 'automationen', title: 'Dashboard' }],
        activeTabId: 'automationen',
        explorerVisible: true,
        llmVisible: false,
        llmPanelMode: 'terminal',
      },
      version: 2,
    });
    const s = useWorkspaceStore.getState();
    expect(s.rightPanelVisible).toBe(false);
    expect(s.sidebarVisible).toBe(true);
  });

  it('mappt llmVisible=false/Chat-Modus → Panel zu und erhält Tabs + aktiven Tab', async () => {
    await rehydrateFrom(V2_CHAT_MODE);
    const s = useWorkspaceStore.getState();
    expect(s.sidebarVisible).toBe(true);
    expect(s.rightPanelVisible).toBe(false);
    expect(s.rightPanelMode).toBe('chat');
    expect(s.tabs.map(t => t.id)).toEqual(['store', 'document:99']);
    expect(s.activeTabId).toBe('document:99');
  });

  it('schreibt den migrierten Stand als version 6 zurück (Alt-Felder weg)', async () => {
    await rehydrateFrom(V2_TERMINAL_MODE);
    // Ein Write triggert die Persistierung des migrierten Stands
    useWorkspaceStore.getState().toggleSidebar();
    const parsed = JSON.parse(localStorage.getItem('arasul_workspace') ?? '{}');
    expect(parsed.version).toBe(6);
    // v6 ergänzt additiv die Activity-Bar-Ansicht (Default 'files').
    expect(parsed.state.activeView).toBe('files');
    expect(parsed.state.rightPanelVisible).toBe(true);
    expect(parsed.state.rightPanelMode).toBe('terminal');
    expect(parsed.state.llmPanelMode).toBeUndefined();
    expect(parsed.state.explorerVisible).toBeUndefined();
    expect(parsed.state.llmVisible).toBeUndefined();
    expect(parsed.state.chatVisible).toBeUndefined();
    expect(parsed.state.terminalVisible).toBeUndefined();
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

describe('workspaceStore — Migration v3 → v4', () => {
  beforeEach(resetStore);

  async function rehydrateFrom(persisted: unknown) {
    localStorage.setItem('arasul_workspace', JSON.stringify(persisted));
    await useWorkspaceStore.persist.rehydrate();
  }

  /** v3: nur Terminal sichtbar → rechtes Panel sichtbar im Terminal-Modus. */
  it('terminalVisible=true, chatVisible=false → visible + Terminal-Modus', async () => {
    await rehydrateFrom({
      state: {
        tabs: [{ id: 'automationen', type: 'automationen', title: 'Dashboard' }],
        activeTabId: 'automationen',
        sidebarVisible: true,
        chatVisible: false,
        terminalVisible: true,
        terminalSessions: [{ id: 'p1', projectId: 'p1', title: 'proj' }],
        activeTerminalSessionId: 'p1',
      },
      version: 3,
    });
    const s = useWorkspaceStore.getState();
    expect(s.rightPanelVisible).toBe(true);
    expect(s.rightPanelMode).toBe('terminal');
    expect(s.sidebarVisible).toBe(true);
    // Session-Registry überlebt die Migration
    expect(s.terminalSessions).toEqual([{ id: 'p1', projectId: 'p1', title: 'proj' }]);
    expect(s.activeTerminalSessionId).toBe('p1');
  });

  /** v3: beide sichtbar → visible, Modus fällt auf Chat zurück. */
  it('chatVisible=true, terminalVisible=true → visible + Chat-Modus (Vorrang Chat)', async () => {
    await rehydrateFrom({
      state: {
        tabs: [{ id: 'automationen', type: 'automationen', title: 'Dashboard' }],
        activeTabId: 'automationen',
        sidebarVisible: false,
        chatVisible: true,
        terminalVisible: true,
        terminalSessions: [],
        activeTerminalSessionId: null,
      },
      version: 3,
    });
    const s = useWorkspaceStore.getState();
    expect(s.rightPanelVisible).toBe(true);
    expect(s.rightPanelMode).toBe('chat');
    expect(s.sidebarVisible).toBe(false);
  });

  /** v3: beide aus → rechtes Panel bleibt zu, Modus Chat (Default). */
  it('chatVisible=false, terminalVisible=false → Panel zu', async () => {
    await rehydrateFrom({
      state: {
        tabs: [{ id: 'settings', type: 'settings', title: 'Einstellungen' }],
        activeTabId: 'settings',
        sidebarVisible: true,
        chatVisible: false,
        terminalVisible: false,
        terminalSessions: [],
        activeTerminalSessionId: null,
      },
      version: 3,
    });
    const s = useWorkspaceStore.getState();
    expect(s.rightPanelVisible).toBe(false);
    expect(s.rightPanelMode).toBe('chat');
  });

  it('schreibt den migrierten v3-Stand als version 4 zurück (v3-Felder weg)', async () => {
    await rehydrateFrom({
      state: {
        tabs: [{ id: 'automationen', type: 'automationen', title: 'Dashboard' }],
        activeTabId: 'automationen',
        sidebarVisible: true,
        chatVisible: false,
        terminalVisible: true,
        terminalSessions: [],
        activeTerminalSessionId: null,
      },
      version: 3,
    });
    useWorkspaceStore.getState().toggleSidebar();
    const parsed = JSON.parse(localStorage.getItem('arasul_workspace') ?? '{}');
    expect(parsed.version).toBe(6);
    expect(parsed.state.rightPanelVisible).toBe(true);
    expect(parsed.state.rightPanelMode).toBe('terminal');
    expect(parsed.state.chatVisible).toBeUndefined();
    expect(parsed.state.terminalVisible).toBeUndefined();
  });

  /**
   * v4 → v5 (Plan 011): der 'agenten'-Tab ist entfallen. Ohne den
   * Versionssprung liefe die Migration für v4-Nutzer nie an und sie behielten
   * einen Tab, für den es keine Komponente und keinen Pfad mehr gibt.
   */
  it('entfernt den entfallenen agenten-Tab aus einem v4-Stand', async () => {
    await rehydrateFrom({
      state: {
        tabs: [
          { id: 'agenten', type: 'agenten', title: 'Agenten' },
          { id: 'automationen', type: 'automationen', title: 'Dashboard' },
        ],
        activeTabId: 'agenten',
        sidebarVisible: true,
        rightPanelVisible: true,
        rightPanelMode: 'terminal',
        terminalSessions: [],
        activeTerminalSessionId: null,
      },
      version: 4,
    });
    const s = useWorkspaceStore.getState();
    expect(s.tabs.map(t => t.type)).toEqual(['automationen']);
    // Der aktive Tab zeigte auf den entfernten Tab → rückt auf den ersten weiter.
    expect(s.activeTabId).toBe('automationen');
  });

  /** v4 → v5 darf den Panel-Zustand nicht verlieren (kein Umweg über v3). */
  it('reicht den Panel-Zustand eines v4-Stands unverändert durch', async () => {
    await rehydrateFrom({
      state: {
        tabs: [{ id: 'automationen', type: 'automationen', title: 'Dashboard' }],
        activeTabId: 'automationen',
        sidebarVisible: false,
        rightPanelVisible: false,
        rightPanelMode: 'terminal',
        terminalSessions: [{ id: 'p1', projectId: 'p1', title: 'proj' }],
        activeTerminalSessionId: 'p1',
      },
      version: 4,
    });
    const s = useWorkspaceStore.getState();
    expect(s.rightPanelVisible).toBe(false);
    expect(s.rightPanelMode).toBe('terminal');
    expect(s.sidebarVisible).toBe(false);
    expect(s.terminalSessions).toEqual([{ id: 'p1', projectId: 'p1', title: 'proj' }]);
    expect(s.activeTerminalSessionId).toBe('p1');
  });
});

describe('workspaceStore — Activity-Bar-Ansicht (selectView, Plan 012 Phase B)', () => {
  beforeEach(resetStore);

  it('Default-Ansicht ist »files«', () => {
    expect(useWorkspaceStore.getState().activeView).toBe('files');
  });

  it('selectView wählt eine andere Ansicht und zieht die Sidebar auf', () => {
    useWorkspaceStore.setState({ sidebarVisible: false });
    useWorkspaceStore.getState().selectView('models');
    const s = useWorkspaceStore.getState();
    expect(s.activeView).toBe('models');
    expect(s.sidebarVisible).toBe(true);
  });

  it('selectView auf die aktive Ansicht bei offener Sidebar klappt ein (VS-Code)', () => {
    // files ist aktiv + sichtbar → erneuter Klick klappt ein
    useWorkspaceStore.getState().selectView('files');
    const s = useWorkspaceStore.getState();
    expect(s.sidebarVisible).toBe(false);
    // Ansicht bleibt erhalten, nur zugeklappt
    expect(s.activeView).toBe('files');
  });

  it('selectView auf die aktive, aber eingeklappte Ansicht zieht wieder auf', () => {
    useWorkspaceStore.setState({ activeView: 'search', sidebarVisible: false });
    useWorkspaceStore.getState().selectView('search');
    const s = useWorkspaceStore.getState();
    expect(s.activeView).toBe('search');
    expect(s.sidebarVisible).toBe(true);
  });

  it('requestExplorerAction erzwingt die Datei-Ansicht', () => {
    useWorkspaceStore.setState({ activeView: 'skills', sidebarVisible: false });
    useWorkspaceStore.getState().requestExplorerAction('upload-files');
    const s = useWorkspaceStore.getState();
    expect(s.activeView).toBe('files');
    expect(s.sidebarVisible).toBe(true);
  });
});

describe('workspaceStore — Migration v5 → v6 (activeView)', () => {
  beforeEach(resetStore);

  async function rehydrateFrom(persisted: unknown) {
    localStorage.setItem('arasul_workspace', JSON.stringify(persisted));
    await useWorkspaceStore.persist.rehydrate();
  }

  it('ergänzt activeView=»files« und lässt das Panel-Layout unberührt', async () => {
    await rehydrateFrom({
      state: {
        tabs: [{ id: 'automationen', type: 'automationen', title: 'Dashboard' }],
        activeTabId: 'automationen',
        sidebarVisible: false,
        rightPanelVisible: false,
        rightPanelMode: 'terminal',
        terminalSessions: [],
        activeTerminalSessionId: null,
      },
      version: 5,
    });
    const s = useWorkspaceStore.getState();
    expect(s.activeView).toBe('files');
    // Layout (Sichtbarkeit + Modus) darf NICHT zurückgesetzt werden.
    expect(s.sidebarVisible).toBe(false);
    expect(s.rightPanelVisible).toBe(false);
    expect(s.rightPanelMode).toBe('terminal');
  });
});

describe('URL-Mapping (tabToPath / pathToTabSpec)', () => {
  it('bildet jeden Tab-Typ auf einen Pfad ab und zurück', () => {
    const specs = [
      { type: 'document' as const, documentId: '42' },
      { type: 'settings' as const },
      { type: 'automationen' as const },
      { type: 'store' as const },
      { type: 'skill' as const },
      { type: 'extension' as const, extensionId: 'notiz-app' },
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
