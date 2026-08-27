import { describe, it, expect, beforeEach } from 'vitest';
import {
  useWorkspaceStore,
  tabId,
  tabToPath,
  pathToTabSpec,
  appPfad,
  nurFuerAdmin,
  type WorkspaceTabSpec,
} from '../workspaceStore';

/**
 * Der Store nach D1: Tabs (Übersicht, App, Einstellungen, Modelle),
 * Sidebar-Ansicht, Sichtbarkeit der beiden Seitenspalten. Terminal-Sessions,
 * Chat-Scope, Dirty-Register und die Tabs für Dokumente, Projektdateien und
 * Projekte sind mit B2 gefallen, die Tabs `erweiterungen`, `flow` und
 * `extension` mit B3, `automationen` mit B5; die Migration auf v10 wirft alte
 * Reste davon weg, ohne die verbliebenen Tabs zu verlieren.
 */

function reset() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeView: 'apps',
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

  it('schließt den aktiven Tab und aktiviert den Nachbarn', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'settings' });
    s.openTab({ type: 'modelle' });
    s.activateTab('settings');
    s.closeTab('settings');
    expect(useWorkspaceStore.getState().activeTabId).toBe('modelle');
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['modelle']);
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
    s.moveTab(0, 1);
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['modelle', 'settings']);
    s.moveTab(5, 0);
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['modelle', 'settings']);
  });

  it('jeder Tab-Typ ist ein Singleton mit Default-Titel', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'modelle' });
    s.openTab({ type: 'modelle' });
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
    expect(useWorkspaceStore.getState().tabs[0]?.title).toBe('Modelle');
  });

  it('ein Tab-Titel, der mitkommt, gewinnt (App-Name aus /api/apps/meine)', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'app', appId: 'urlaub', stand: 'live', title: 'Urlaub' });
    expect(useWorkspaceStore.getState().tabs[0]?.title).toBe('Urlaub');
    s.openTab({ type: 'app', appId: 'urlaub', stand: 'live', title: 'Urlaubsantrag' });
    const nachher = useWorkspaceStore.getState();
    expect(nachher.tabs).toHaveLength(1);
    expect(nachher.tabs[0]?.title).toBe('Urlaubsantrag');
  });

  it('updateTabTitle ändert den Titel', () => {
    const s = useWorkspaceStore.getState();
    s.openTab({ type: 'modelle' });
    s.updateTabTitle('modelle', 'angebot');
    expect(useWorkspaceStore.getState().tabs[0]?.title).toBe('angebot');
  });

  it('persistiert Tabs in localStorage (Reload-Restore)', () => {
    useWorkspaceStore.getState().openTab({ type: 'settings' });
    const raw = localStorage.getItem('arasul_workspace');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as { state: { tabs: unknown[] }; version: number };
    expect(parsed.version).toBe(10);
    expect(parsed.state.tabs).toHaveLength(1);
  });
});

describe('workspaceStore, Sidebar + rechte Spalte', () => {
  beforeEach(reset);

  it('Defaults: Sidebar an mit den Apps, rechte Spalte sichtbar', () => {
    const s = useWorkspaceStore.getState();
    expect(s.sidebarVisible).toBe(true);
    // Seit D1 gibt es eine Voreinstellung und damit keinen Leerzustand mehr.
    expect(s.activeView).toBe('apps');
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
    useWorkspaceStore.getState().selectView('models');
    expect(useWorkspaceStore.getState().activeView).toBe('models');
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);
  });

  it('selectView auf die aktive Ansicht bei offener Sidebar klappt ein (VS-Code)', () => {
    useWorkspaceStore.setState({ activeView: 'models', sidebarVisible: true });
    useWorkspaceStore.getState().selectView('models');
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
    expect(useWorkspaceStore.getState().activeView).toBe('models');
  });

  it('setActiveView setzt nur die Ansicht, ohne die Sidebar zu schalten', () => {
    useWorkspaceStore.setState({ sidebarVisible: false });
    useWorkspaceStore.getState().setActiveView('settings');
    expect(useWorkspaceStore.getState().activeView).toBe('settings');
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
  });
});

describe('workspaceStore, Migration auf v10', () => {
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
          { id: 'modelle', type: 'modelle', title: 'Modelle' },
        ],
        activeTabId: 'modelle',
        activeView: 'files',
        sidebarVisible: true,
        rightPanelVisible: true,
        rightPanelMode: 'terminal',
        terminalSessions: [{ id: 't1', title: 'Shell 1' }],
        activeTerminalSessionId: 't1',
      },
      6
    );
    expect(s.tabs.map(t => t.id)).toEqual(['settings', 'modelle']);
    expect(s.activeTabId).toBe('modelle');
    // 'files' gibt es nicht mehr → die Voreinstellung, nicht eine leere Spalte.
    expect(s.activeView).toBe('apps');
    expect(s.rightPanelVisible).toBe(true);
    expect('terminalSessions' in s).toBe(false);
    expect('rightPanelMode' in s).toBe(false);
  });

  it('der alte store-Tab wird zu modelle umgeschrieben, ohne ein Duplikat zu erzeugen', async () => {
    const s = await migriere(
      {
        tabs: [
          { id: 'store', type: 'store', title: 'Extensions' },
          { id: 'modelle', type: 'modelle', title: 'Modelle' },
        ],
        activeTabId: 'store',
        activeView: 'extensions',
      },
      6
    );
    expect(s.tabs.map(t => t.id)).toEqual(['modelle']);
    expect(s.activeTabId).toBe('modelle');
    // 'extensions' gibt es seit B3 nicht mehr → die Voreinstellung.
    expect(s.activeView).toBe('apps');
  });

  it('v7: die Tabs erweiterungen, flow und extension fallen, die Flow-Ansicht auch', async () => {
    const s = await migriere(
      {
        tabs: [
          { id: 'erweiterungen', type: 'erweiterungen', title: 'Erweiterungen' },
          { id: 'flow', type: 'flow', title: 'angebot' },
          {
            id: 'extension:meine-app',
            type: 'extension',
            title: 'Meine App',
            extensionId: 'meine-app',
          },
          { id: 'automationen', type: 'automationen', title: 'Automationen' },
        ],
        activeTabId: 'flow',
        activeView: 'flows',
        sidebarVisible: false,
        rightPanelVisible: true,
      },
      7
    );
    expect(s.tabs).toEqual([]);
    expect(s.activeTabId).toBeNull();
    expect(s.activeView).toBe('apps');
    expect(s.sidebarVisible).toBe(false);
  });

  it('v8: der Tab automationen (n8n) fällt, die übrigen bleiben', async () => {
    const s = await migriere(
      {
        tabs: [
          { id: 'settings', type: 'settings', title: 'Einstellungen' },
          { id: 'automationen', type: 'automationen', title: 'Automationen' },
        ],
        activeTabId: 'automationen',
        activeView: null,
        sidebarVisible: true,
        rightPanelVisible: true,
      },
      8
    );
    expect(s.tabs.map(t => t.id)).toEqual(['settings']);
    expect(s.activeTabId).toBe('settings');
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

  it('v9: ein App-Tab ohne Kennung faellt, einer mit Kennung bleibt', async () => {
    const s = await migriere(
      {
        tabs: [
          { id: 'app::live', type: 'app', title: 'Kaputt' },
          { id: 'app:urlaub:test', type: 'app', title: 'Urlaub', appId: 'urlaub', stand: 'test' },
        ],
        activeTabId: 'app:urlaub:test',
        activeView: 'apps',
      },
      9
    );
    expect(s.tabs.map(t => t.id)).toEqual(['app:urlaub:test']);
    expect(s.tabs[0]?.appId).toBe('urlaub');
    expect(s.tabs[0]?.stand).toBe('test');
    expect(s.activeTabId).toBe('app:urlaub:test');
  });

  it('schreibt den migrierten Stand als version 10 zurück', async () => {
    await migriere({ tabs: [{ id: 'settings', type: 'settings', title: 'E' }] }, 6);
    useWorkspaceStore.getState().toggleSidebar();
    const parsed = JSON.parse(localStorage.getItem('arasul_workspace') as string) as {
      version: number;
      state: Record<string, unknown>;
    };
    expect(parsed.version).toBe(10);
    expect(Object.keys(parsed.state).sort()).toEqual(
      ['activeTabId', 'activeView', 'rightPanelVisible', 'sidebarVisible', 'tabs'].sort()
    );
  });
});

describe('URL-Mapping (tabToPath / pathToTabSpec)', () => {
  it('bildet jeden Singleton-Tab-Typ auf einen Pfad ab und zurück', () => {
    const specs: WorkspaceTabSpec[] = [
      { type: 'dashboard' },
      { type: 'settings' },
      { type: 'modelle' },
    ];
    for (const spec of specs) {
      const tab = { id: tabId(spec), type: spec.type, title: 'x' };
      const zurueck = pathToTabSpec(tabToPath(tab).replace(/^\/workspace/, ''));
      expect(zurueck).toEqual({ type: spec.type });
    }
  });

  it('eine App trägt Kennung und Stand durch Pfad und zurück', () => {
    for (const stand of ['live', 'test'] as const) {
      const spec: WorkspaceTabSpec = { type: 'app', appId: 'urlaub', stand };
      const tab = {
        id: tabId(spec),
        type: 'app' as const,
        title: 'Urlaub',
        appId: 'urlaub',
        stand,
      };
      expect(tabToPath(tab)).toBe(
        stand === 'test' ? '/workspace/app/urlaub/test' : '/workspace/app/urlaub'
      );
      expect(pathToTabSpec(tabToPath(tab).replace(/^\/workspace/, ''))).toEqual(spec);
    }
  });

  it('zwei Apps sind zwei Tabs, Live und Test einer App auch', () => {
    expect(tabId({ type: 'app', appId: 'a' })).not.toBe(tabId({ type: 'app', appId: 'b' }));
    expect(tabId({ type: 'app', appId: 'a', stand: 'live' })).not.toBe(
      tabId({ type: 'app', appId: 'a', stand: 'test' })
    );
    // Ohne Stand gilt der Livestand.
    expect(tabId({ type: 'app', appId: 'a' })).toBe(
      tabId({ type: 'app', appId: 'a', stand: 'live' })
    );
  });

  it('appPfad zeigt auf den Weg, unter dem die App im Browser läuft', () => {
    expect(appPfad('urlaub')).toBe('/apps/urlaub/');
    expect(appPfad('urlaub', 'test')).toBe('/apps/urlaub/test/');
  });

  it('/workspace/app ohne Kennung ist kein Tab', () => {
    expect(pathToTabSpec('/app')).toBeNull();
  });

  /**
   * Die Kennung kommt aus der Adresszeile, und von dort kommt alles Mögliche.
   * `/workspace/app/..` ergäbe sonst einen Rahmen auf `/apps/../`, also auf
   * Arasul selbst: die Oberfläche in sich geschachtelt.
   */
  it('eine Kennung, die keine ist, ergibt ebenfalls keinen Tab', () => {
    for (const p of ['/app/..', '/app/.', '/app/Gross', '/app/mit punkt', '/app/-anfang']) {
      expect(pathToTabSpec(p)).toBeNull();
    }
    expect(pathToTabSpec('/app/beispiel-app-2')).toEqual({
      type: 'app',
      appId: 'beispiel-app-2',
      stand: 'live',
    });
  });

  it('nurFuerAdmin nennt genau die Ansichten und Tabs der Verwaltung', () => {
    expect(nurFuerAdmin('models')).toBe(true);
    expect(nurFuerAdmin('modelle')).toBe(true);
    expect(nurFuerAdmin('settings')).toBe(true);
    expect(nurFuerAdmin('apps')).toBe(false);
    expect(nurFuerAdmin('dashboard')).toBe(false);
    expect(nurFuerAdmin('app')).toBe(false);
  });

  it('der alte /store-Pfad landet bei den Modellen', () => {
    expect(pathToTabSpec('/store')).toEqual({ type: 'modelle' });
  });

  it('die gefallenen Pfade (Terminal, Dokumente, Projekte, Flow, Erweiterungen) ergeben null', () => {
    for (const p of [
      '/terminal',
      '/doc/1',
      '/pfile/p/a.md',
      '/kunden',
      '/projekte',
      '/projekt',
      '/flow',
      '/erweiterungen',
      '/ext/meine-app',
    ]) {
      expect(pathToTabSpec(p)).toBeNull();
    }
  });

  it('unbekannte Pfade ergeben null', () => {
    expect(pathToTabSpec('/gibt-es-nicht')).toBeNull();
    expect(pathToTabSpec('')).toBeNull();
    expect(pathToTabSpec('/ext')).toBeNull();
  });
});
