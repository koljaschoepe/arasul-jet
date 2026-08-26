import { describe, it, expect, beforeEach } from 'vitest';
import {
  useWorkspaceStore,
  tabId,
  tabToPath,
  pathToTabSpec,
  type WorkspaceTabSpec,
} from '../workspaceStore';

/**
 * Der Store nach B2: Tabs, Sidebar-Ansicht, Sichtbarkeit der beiden
 * Seitenspalten. Terminal-Sessions, Chat-Scope, Dirty-Register und die Tabs
 * für Dokumente, Projektdateien und Projekte sind gefallen; die Migration auf
 * v7 wirft alte Reste davon weg, ohne die verbliebenen Tabs zu verlieren.
 */

function reset() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeView: null,
    sidebarVisible: true,
    rightPanelVisible: true,
  });
  localStorage.clear();
}

describe('workspaceStore, Tabs', () => {
  beforeEach(reset);

  it('öffnet einen Tab und aktiviert ihn', () => {
    useWorkspaceStore.getState().openTab({ type: 'settings' });
    const s = useWorkspaceStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]?.title).toBe('Einstellungen');
    expect(s.activeTabId).toBe('settings');
  });

  it('dedupliziert Tabs über die Identität (type + payload)', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'modelle' });
    s.openTab({ type: 'settings' });
    s.openTab({ type: 'modelle' });
    expect(useWorkspaceStore.getState().tabs).toHaveLength(2);
    expect(useWorkspaceStore.getState().activeTabId).toBe('modelle');
  });

  it('eine App-Erweiterung ist ein eigener Tab je Id (kein Singleton)', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'extension', extensionId: 'a', title: 'A' });
    s.openTab({ type: 'extension', extensionId: 'b', title: 'B' });
    s.openTab({ type: 'extension', extensionId: 'a', title: 'A' });
    const tabs = useWorkspaceStore.getState().tabs;
    expect(tabs.map(t => t.id)).toEqual(['extension:a', 'extension:b']);
    expect(useWorkspaceStore.getState().activeTabId).toBe('extension:a');
  });

  it('schließt den aktiven Tab und aktiviert den Nachbarn', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'settings' });
    s.openTab({ type: 'modelle' });
    s.openTab({ type: 'flow' });
    s.activateTab('modelle');
    s.closeTab('modelle');
    expect(useWorkspaceStore.getState().activeTabId).toBe('flow');
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['settings', 'flow']);
  });

  it('schließt den letzten Tab → kein aktiver Tab', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'settings' });
    s.closeTab('settings');
    expect(useWorkspaceStore.getState().activeTabId).toBeNull();
  });

  it('inaktiven Tab schließen lässt den aktiven unverändert', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'settings' });
    s.openTab({ type: 'modelle' });
    s.closeTab('settings');
    expect(useWorkspaceStore.getState().activeTabId).toBe('modelle');
  });

  it('moveTab ordnet Tabs um (stabile Reihenfolge)', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'settings' });
    s.openTab({ type: 'modelle' });
    s.openTab({ type: 'flow' });
    s.moveTab(0, 2);
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual([
      'modelle',
      'flow',
      'settings',
    ]);
    s.moveTab(5, 0);
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual([
      'modelle',
      'flow',
      'settings',
    ]);
  });

  it('der Flow-Editor ist ein Singleton-Tab mit Default-Titel', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'flow' });
    s.openTab({ type: 'flow' });
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
    expect(useWorkspaceStore.getState().tabs[0]?.title).toBe('Neuer Flow');
  });

  it('updateTabTitle ändert den Titel', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'flow' });
    s.updateTabTitle('flow', 'angebot');
    expect(useWorkspaceStore.getState().tabs[0]?.title).toBe('angebot');
  });

  it('persistiert Tabs in localStorage (Reload-Restore)', () => {
    useWorkspaceStore.getState().openTab({ type: 'settings' });
    const raw = localStorage.getItem('arasul_workspace');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as { state: { tabs: unknown[] }; version: number };
    expect(parsed.version).toBe(7);
    expect(parsed.state.tabs).toHaveLength(1);
  });
});

describe('workspaceStore, Sidebar + rechte Spalte', () => {
  beforeEach(reset);

  it('Defaults: Sidebar an ohne Ansicht, rechte Spalte sichtbar', () => {
    const s = useWorkspaceStore.getState();
    expect(s.sidebarVisible).toBe(true);
    expect(s.activeView).toBeNull();
    expect(s.rightPanelVisible).toBe(true);
  });

  it('toggleRightPanel und toggleSidebar wirken unabhängig voneinander', () => {
    const s = useWorkspaceStore.getState();
    s.toggleRightPanel();
    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(false);
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);
    s.toggleSidebar();
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(false);
  });

  it('selectView wählt eine Ansicht und zieht die Sidebar auf', () => {
    useWorkspaceStore.setState({ sidebarVisible: false });
    useWorkspaceStore.getState().selectView('flows');
    expect(useWorkspaceStore.getState().activeView).toBe('flows');
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);
  });

  it('selectView auf die aktive Ansicht bei offener Sidebar klappt ein (VS-Code)', () => {
    useWorkspaceStore.setState({ activeView: 'flows', sidebarVisible: true });
    useWorkspaceStore.getState().selectView('flows');
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
    expect(useWorkspaceStore.getState().activeView).toBe('flows');
  });

  it('setActiveView setzt nur die Ansicht, ohne die Sidebar zu schalten', () => {
    useWorkspaceStore.setState({ sidebarVisible: false });
    useWorkspaceStore.getState().setActiveView('models');
    expect(useWorkspaceStore.getState().activeView).toBe('models');
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
  });
});

describe('workspaceStore, Migration auf v7', () => {
  beforeEach(reset);

  async function migriere(state: Record<string, unknown>, version: number) {
    localStorage.setItem('arasul_workspace', JSON.stringify({ state, version }));
    await useWorkspaceStore.persist.rehydrate();
    return useWorkspaceStore.getState();
  }

  it('wirft Tabs der gefallenen Typen weg und behält die übrigen samt aktivem Tab', async () => {
    const s = await migriere(
      {
        tabs: [
          { id: 'settings', type: 'settings', title: 'Einstellungen' },
          { id: 'projektdatei:p:a.md', type: 'projektdatei', title: 'a.md', projectId: 'p' },
          { id: 'document:1', type: 'document', title: 'Doku' },
          { id: 'projekte', type: 'projekte', title: 'Projekte' },
          { id: 'flow', type: 'flow', title: 'angebot' },
        ],
        activeTabId: 'flow',
        activeView: 'files',
        sidebarVisible: true,
        rightPanelVisible: true,
        rightPanelMode: 'terminal',
        terminalSessions: [{ id: 't1', title: 'Shell 1' }],
        activeTerminalSessionId: 't1',
      },
      6
    );
    expect(s.tabs.map(t => t.id)).toEqual(['settings', 'flow']);
    expect(s.activeTabId).toBe('flow');
    // 'files' gibt es nicht mehr → keine Ansicht.
    expect(s.activeView).toBeNull();
    expect(s.rightPanelVisible).toBe(true);
    expect('terminalSessions' in s).toBe(false);
    expect('rightPanelMode' in s).toBe(false);
  });

  it('der alte store-Tab wird zu erweiterungen umgeschrieben (Plan 023 B7)', async () => {
    const s = await migriere(
      {
        tabs: [{ id: 'store', type: 'store', title: 'Extensions' }],
        activeTabId: 'store',
        activeView: 'extensions',
      },
      6
    );
    expect(s.tabs.map(t => t.id)).toEqual(['erweiterungen']);
    expect(s.activeTabId).toBe('erweiterungen');
    expect(s.activeView).toBe('extensions');
  });

  it('v3: zwei Flächen (Chat/Terminal) falten sich zur Sichtbarkeit der rechten Spalte', async () => {
    const zu = await migriere({ tabs: [], chatVisible: false, terminalVisible: false }, 3);
    expect(zu.rightPanelVisible).toBe(false);
    reset();
    const auf = await migriere({ tabs: [], chatVisible: false, terminalVisible: true }, 3);
    expect(auf.rightPanelVisible).toBe(true);
  });

  it('v2: explorerVisible und llmVisible werden zur Sichtbarkeit der Spalten', async () => {
    const s = await migriere({ tabs: [], explorerVisible: false, llmVisible: false }, 2);
    expect(s.sidebarVisible).toBe(false);
    expect(s.rightPanelVisible).toBe(false);
  });

  it('schreibt den migrierten Stand als version 7 zurück', async () => {
    await migriere({ tabs: [{ id: 'settings', type: 'settings', title: 'E' }] }, 6);
    useWorkspaceStore.getState().toggleSidebar();
    const parsed = JSON.parse(localStorage.getItem('arasul_workspace') as string) as {
      version: number;
      state: Record<string, unknown>;
    };
    expect(parsed.version).toBe(7);
    expect(Object.keys(parsed.state).sort()).toEqual(
      ['activeTabId', 'activeView', 'rightPanelVisible', 'sidebarVisible', 'tabs'].sort()
    );
  });
});

describe('URL-Mapping (tabToPath / pathToTabSpec)', () => {
  it('bildet jeden Tab-Typ auf einen Pfad ab und zurück', () => {
    const specs: WorkspaceTabSpec[] = [
      { type: 'settings' },
      { type: 'modelle' },
      { type: 'erweiterungen' },
      { type: 'automationen' },
      { type: 'flow' },
      { type: 'extension', extensionId: 'meine-app' },
    ];
    for (const spec of specs) {
      const tab = { id: tabId(spec), type: spec.type, title: 'x', extensionId: spec.extensionId };
      const zurueck = pathToTabSpec(tabToPath(tab).replace(/^\/workspace/, ''));
      expect(zurueck).toEqual(
        spec.extensionId ? { type: spec.type, extensionId: spec.extensionId } : { type: spec.type }
      );
    }
  });

  it('der alte /store-Pfad landet bei den Erweiterungen', () => {
    expect(pathToTabSpec('/store')).toEqual({ type: 'erweiterungen' });
  });

  it('die gefallenen Pfade (Terminal, Dokumente, Projektdateien, Projekte) ergeben null', () => {
    for (const p of ['/terminal', '/doc/1', '/pfile/p/a.md', '/kunden', '/projekte', '/projekt']) {
      expect(pathToTabSpec(p)).toBeNull();
    }
  });

  it('unbekannte Pfade ergeben null', () => {
    expect(pathToTabSpec('/gibt-es-nicht')).toBeNull();
    expect(pathToTabSpec('')).toBeNull();
    expect(pathToTabSpec('/ext')).toBeNull();
  });
});
