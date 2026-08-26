import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Workspace-Store v9: offene Tabs, aktiver Tab, die Sidebar-Ansicht und die
 * Sichtbarkeit der beiden Seitenspalten. Persistiert in localStorage, der
 * aktive Tab wird zusätzlich in der URL gespiegelt (siehe WorkspaceShell).
 *
 * Tab-Identität: pro Typ existiert höchstens ein Tab — `tabId()` liefert den
 * deterministischen Schlüssel, openTab dedupliziert.
 *
 * Phase B2 (26.08.2026): Editor, Terminal, Agent-Chat und Sandbox sind aus der
 * Oberfläche gefallen, mit ihnen die Terminal-Session-Registry, der Chat-Scope,
 * das Dirty-Register, die Explorer-Anfragen und die Tab-Typen für Dokumente,
 * Projektdateien und Projekte. Phase B3: Flow-Editor, Erweiterungs-Store und
 * der Tab einer installierten Erweiterung sind weg; damit gibt es keinen Tab
 * mehr, der eine Kennung (`extensionId`) trägt. Phase B5: der Automationen-Tab
 * (n8n) ist weg. Es bleiben Einstellungen und Modelle. Das rechte Panel hat keinen Modus, nur eine
 * Sichtbarkeit; die Spalte bleibt leer, bis D2 sie füllt.
 */

export type WorkspaceTabType = 'settings' | 'modelle';

export interface WorkspaceTabSpec {
  type: WorkspaceTabType;
  title?: string;
}

export interface WorkspaceTab {
  id: string;
  type: WorkspaceTabType;
  title: string;
}

const DEFAULT_TITLES: Record<WorkspaceTabType, string> = {
  settings: 'Einstellungen',
  modelle: 'Modelle',
};

export function tabId(spec: WorkspaceTabSpec): string {
  return spec.type;
}

/** Aktiver Tab → URL-Pfad unterhalb von /workspace. */
export function tabToPath(tab: WorkspaceTab): string {
  return `/workspace/${tab.type}`;
}

/** URL-Pfad (nach /workspace) → Tab-Spec, oder null wenn unbekannt. */
export function pathToTabSpec(subPath: string): WorkspaceTabSpec | null {
  const parts = subPath.split('/').filter(Boolean);
  const head = parts[0];
  if (!head) return null;
  switch (head) {
    case 'settings':
      return { type: 'settings' };
    case 'modelle':
      return { type: 'modelle' };
    // Alter Pfad aus der Zeit vor Plan 023 B7: /workspace/store zeigte je nach
    // Zustand Modelle oder Erweiterungen. Seit B3 gibt es nur noch die Modelle.
    case 'store':
      return { type: 'modelle' };
    default:
      return null;
  }
}

/**
 * Die Sidebar-Ansichten der Activity-Bar. `null` heißt: keine Ansicht gewählt,
 * die linke Spalte ist leer. Seit B2 gibt es die Ansicht „Dateien" nicht mehr,
 * seit B3 auch „Erweiterungen" und „Flows" nicht; alte Stände damit landen auf
 * null.
 */
export type ActivityView = 'models' | 'settings';
const ACTIVITY_VIEWS: ReadonlySet<ActivityView> = new Set<ActivityView>(['models', 'settings']);

export interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  activeView: ActivityView | null;
  sidebarVisible: boolean;
  rightPanelVisible: boolean;
  openTab: (spec: WorkspaceTabSpec) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  updateTabTitle: (id: string, title: string) => void;
  toggleSidebar: () => void;
  /** Sidebar-Sichtbarkeit explizit setzen. */
  setSidebarVisible: (visible: boolean) => void;
  /**
   * Activity-Bar-Klick (VS-Code-Semantik): dieselbe Ansicht bei offener Sidebar
   * → einklappen; sonst die Ansicht wählen und das Panel aufziehen.
   */
  selectView: (view: ActivityView) => void;
  /**
   * Ansicht setzen OHNE Toggle-/Sichtbarkeits-Nebenwirkung. Für Sync-Fälle, in
   * denen etwas anderes die Auswahl treibt (z. B. der Store-Reiter in der Mitte
   * folgt dem Sidebar-Filter) — der bloße Klick auf einen Center-Reiter soll die
   * Sidebar nicht ein-/ausklappen, nur ihren Inhalt passend stellen.
   */
  setActiveView: (view: ActivityView) => void;
  /** Rechtes Panel ein-/ausblenden. */
  toggleRightPanel: () => void;
}

/** Persistierte Felder (partialize) — Basis für die migrate-Signatur. */
interface PersistedWorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  activeView: ActivityView | null;
  sidebarVisible: boolean;
  rightPanelVisible: boolean;
}

/** Roh-Shape älterer persistierter Stände (v≤8). */
interface PersistedLegacyState {
  tabs?: Array<{ id: string; type: string; title: string }>;
  activeTabId?: string | null;
  activeView?: string;
  sidebarVisible?: boolean;
  // v≤2
  explorerVisible?: boolean;
  llmVisible?: boolean;
  // v3 (zwei unabhängige Flächen)
  chatVisible?: boolean;
  terminalVisible?: boolean;
  // v4 bis v8
  rightPanelVisible?: boolean;
}

/**
 * Migration auf v9. Ältere Stände kannten ein rechtes Panel mit Modus (Chat
 * oder Terminal), Terminal-Sessions, Tabs für Dokumente, Projektdateien und
 * Projekte (bis v6), die Tabs `erweiterungen`, `flow` und `extension` (v7)
 * und den Tab `automationen` (v8, n8n). Davon bleibt nur, was es noch gibt: die Tabs der verbliebenen Typen,
 * die Sidebar-Ansicht (ohne 'files'/'search'/'extensions'/'flows') und die
 * Sichtbarkeit der beiden Spalten. Ein Tab, der beim Aktualisieren
 * verschwindet, sieht aus wie ein Fehler; deshalb wird der alte `store`-Tab
 * weiter umgeschrieben, jetzt auf `modelle`, statt verworfen.
 */
function migrateWorkspaceState(persisted: unknown, version: number): PersistedWorkspaceState {
  const old = (persisted ?? {}) as PersistedLegacyState;
  const valid = new Set(Object.keys(DEFAULT_TITLES));
  const umbenannt: Record<string, WorkspaceTabType> = { store: 'modelle' };
  const neueId: Record<string, string> = {};
  const tabs = (Array.isArray(old.tabs) ? old.tabs : [])
    .map(t => {
      const neuerTyp = umbenannt[t.type];
      if (!neuerTyp) return t;
      const id = tabId({ type: neuerTyp });
      neueId[t.id] = id;
      return { ...t, type: neuerTyp, id, title: DEFAULT_TITLES[neuerTyp] };
    })
    .filter(t => valid.has(t.type))
    // Zwei alte Tabs können auf denselben neuen Typ fallen (`store` und
    // `modelle` nebeneinander); der Schlüssel bleibt eindeutig.
    .filter((t, i, alle) => alle.findIndex(a => a.id === t.id) === i)
    .map(t => ({ id: t.id, type: t.type as WorkspaceTabType, title: t.title }));
  const alterAktiver = old.activeTabId ? (neueId[old.activeTabId] ?? old.activeTabId) : null;
  const activeTabId =
    alterAktiver && tabs.some(t => t.id === alterAktiver) ? alterAktiver : (tabs[0]?.id ?? null);

  let sidebarVisible: boolean;
  let rightPanelVisible: boolean;
  if (version >= 4) {
    sidebarVisible = old.sidebarVisible ?? true;
    rightPanelVisible = old.rightPanelVisible ?? true;
  } else if (version >= 3) {
    sidebarVisible = old.sidebarVisible ?? true;
    rightPanelVisible = (old.chatVisible ?? true) || (old.terminalVisible ?? false);
  } else {
    sidebarVisible = old.explorerVisible ?? true;
    rightPanelVisible = old.llmVisible ?? true;
  }

  const activeView = ACTIVITY_VIEWS.has(old.activeView as ActivityView)
    ? (old.activeView as ActivityView)
    : null;

  return { tabs, activeTabId, activeView, sidebarVisible, rightPanelVisible };
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      activeView: null,
      sidebarVisible: true,
      rightPanelVisible: true,

      openTab: spec => {
        const id = tabId(spec);
        const { tabs } = get();
        const existing = tabs.find(t => t.id === id);
        if (existing) {
          set({ activeTabId: id });
          return;
        }
        const tab: WorkspaceTab = {
          id,
          type: spec.type,
          title: spec.title ?? DEFAULT_TITLES[spec.type],
        };
        set({ tabs: [...tabs, tab], activeTabId: id });
      },

      closeTab: id => {
        const { tabs, activeTabId } = get();
        const index = tabs.findIndex(t => t.id === id);
        if (index === -1) return;
        const nextTabs = tabs.filter(t => t.id !== id);
        let nextActive = activeTabId;
        if (activeTabId === id) {
          const neighbor = nextTabs[index] ?? nextTabs[index - 1] ?? null;
          nextActive = neighbor ? neighbor.id : null;
        }
        set({ tabs: nextTabs, activeTabId: nextActive });
      },

      activateTab: id => {
        if (get().tabs.some(t => t.id === id)) {
          set({ activeTabId: id });
        }
      },

      moveTab: (fromIndex, toIndex) => {
        const { tabs } = get();
        if (
          fromIndex < 0 ||
          fromIndex >= tabs.length ||
          toIndex < 0 ||
          toIndex >= tabs.length ||
          fromIndex === toIndex
        ) {
          return;
        }
        const next = [...tabs];
        const moved = next.splice(fromIndex, 1)[0];
        if (!moved) return;
        next.splice(toIndex, 0, moved);
        set({ tabs: next });
      },

      updateTabTitle: (id, title) => {
        set(state => ({
          tabs: state.tabs.map(t => (t.id === id ? { ...t, title } : t)),
        }));
      },

      toggleSidebar: () => set(state => ({ sidebarVisible: !state.sidebarVisible })),
      setSidebarVisible: visible => set({ sidebarVisible: visible }),
      selectView: view =>
        set(state =>
          state.sidebarVisible && state.activeView === view
            ? { sidebarVisible: false }
            : { activeView: view, sidebarVisible: true }
        ),
      setActiveView: view => set({ activeView: view }),
      toggleRightPanel: () => set(state => ({ rightPanelVisible: !state.rightPanelVisible })),
    }),
    {
      name: 'arasul_workspace',
      version: 9,
      migrate: (persisted, version) => migrateWorkspaceState(persisted, version) as WorkspaceState,
      partialize: state => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        activeView: state.activeView,
        sidebarVisible: state.sidebarVisible,
        rightPanelVisible: state.rightPanelVisible,
      }),
    }
  )
);
