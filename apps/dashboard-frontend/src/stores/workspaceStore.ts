import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Workspace-Store v4: offene Tabs, aktiver Tab, die Sidebar, EIN rechtes Panel
 * (Chat ODER Terminal, umschaltbar über den Modus) und die Terminal-Session-
 * Registry der IDE-Shell. Persistiert in localStorage, der aktive Tab wird
 * zusätzlich in der URL gespiegelt (siehe WorkspaceShell).
 *
 * Tab-Identität: pro (type, payload)-Kombination existiert höchstens ein
 * Tab — `tabId()` liefert den deterministischen Schlüssel, openTab dedupliziert.
 *
 * Rechtes Panel: EINE Fläche mit zwei Modi. `rightPanelVisible` steuert die
 * Sichtbarkeit, `rightPanelMode` ('chat' | 'terminal') den Inhalt. Zuvor
 * (v3) waren Chat und Terminal zwei unabhängige Flächen (chatVisible/
 * terminalVisible) — die Migration faltet sie zu Sichtbarkeit + Modus.
 *
 * Terminal: existiert NICHT als Mitte-Tab. Es lebt ausschließlich im rechten
 * Panel (rightPanelMode === 'terminal'), seine Sessions in der Registry dieses
 * Stores — Komponenten rendern die Sessions nur, sie besitzen sie nicht.
 */

export type WorkspaceTabType = 'document' | 'settings' | 'store' | 'automationen';

export interface WorkspaceTabSpec {
  type: WorkspaceTabType;
  title?: string;
  documentId?: string;
  slug?: string;
}

export interface WorkspaceTab {
  id: string;
  type: WorkspaceTabType;
  title: string;
  documentId?: string;
  slug?: string;
}

const DEFAULT_TITLES: Record<WorkspaceTabType, string> = {
  document: 'Dokument',
  settings: 'Einstellungen',
  store: 'Extensions',
  automationen: 'Automationen',
};

export function tabId(spec: WorkspaceTabSpec): string {
  switch (spec.type) {
    case 'document':
      return `document:${spec.documentId ?? ''}`;
    default:
      return spec.type;
  }
}

/** Aktiver Tab → URL-Pfad unterhalb von /workspace. */
export function tabToPath(tab: WorkspaceTab): string {
  switch (tab.type) {
    case 'document':
      return `/workspace/doc/${tab.documentId ?? ''}`;
    case 'settings':
      return '/workspace/settings';
    case 'store':
      return '/workspace/store';
    case 'automationen':
      return '/workspace/automationen';
  }
}

/** URL-Pfad (nach /workspace) → Tab-Spec, oder null wenn unbekannt. */
export function pathToTabSpec(subPath: string): WorkspaceTabSpec | null {
  const parts = subPath.split('/').filter(Boolean);
  const head = parts[0];
  if (!head) return null;
  switch (head) {
    case 'doc':
      return parts[1] ? { type: 'document', documentId: parts[1] } : null;
    case 'settings':
      return { type: 'settings' };
    case 'store':
      return { type: 'store' };
    case 'automationen':
      return { type: 'automationen' };
    default:
      // /workspace/terminal (v2) ist kein Tab mehr — Terminal lebt im Panel.
      return null;
  }
}

/**
 * Ordner-Scope für den Chat (»Mit Ordner chatten«): schränkt die RAG-Suche
 * auf den Teilbaum eines Ordners ein. Ephemer — wird bewusst nicht persistiert.
 */
export interface ChatScope {
  spaceIds: string[];
  label: string;
}

/**
 * Aktionen, die die Menüleiste an den Explorer delegiert (der Dialog-State
 * lebt lokal im ExplorerPanel; die Menubar stellt nur eine Anfrage).
 */
export type ExplorerAction = 'create-folder' | 'upload-files';

/**
 * Eine Terminal-Session im rechten Panel. Die Registry lebt im Store
 * (nicht im Komponenten-State), damit genau eine Quelle der Wahrheit
 * existiert — egal ob das Panel sichtbar ist oder nicht. Die eigentliche
 * WebSocket-Verbindung hält die Terminal-Komponente; sie hängt an der
 * stabilen Session-Id.
 */
export interface TerminalSession {
  /**
   * Stabile, eindeutige Session-Id. Erste Session eines Projekts: die
   * Projekt-Id selbst (rückwärtskompatibel zum 1-Session-Modell); weitere
   * Sessions desselben Projekts: `${projectId}#${n}`.
   */
  id: string;
  /** Sandbox-Projekt (Container), in dem die Session läuft. */
  projectId: string;
  title: string;
  /**
   * tmux-Session-Name im Container — stabil über Reconnects hinweg. Mehrere
   * Sessions im selben Projekt brauchen DISTINKTE Namen, sonst spiegeln sie
   * denselben Screen statt unabhängige Shells zu sein. Fehlt bei Alt-Sessions
   * (v≤4-Persist) → Backend-Default 'main'.
   */
  terminalName?: string;
}

/** Inhalt des rechten Panels: Chat oder Terminal (nie beide gleichzeitig). */
export type RightPanelMode = 'chat' | 'terminal';

interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  /** Linke Sidebar (Explorer/Workspace). */
  sidebarVisible: boolean;
  /**
   * Auto-Collapse-Merker: die vor dem Betreten eines App-Tabs gültige
   * Sidebar-Präferenz. `null` heißt „nicht auto-eingeklappt". Persistiert,
   * damit die Präferenz einen Reload auf einem App-Tab überlebt und beim
   * Verlassen korrekt wiederhergestellt wird (statt den bereits eingeklappten
   * Zustand als vermeintliche Präferenz zu übernehmen).
   */
  sidebarRestore: boolean | null;
  /** Sichtbarkeit des rechten Panels (Chat/Terminal). */
  rightPanelVisible: boolean;
  /** Aktiver Inhalt des rechten Panels. */
  rightPanelMode: RightPanelMode;
  terminalSessions: TerminalSession[];
  activeTerminalSessionId: string | null;
  chatScope: ChatScope | null;
  explorerRequest: ExplorerAction | null;
  openTab: (spec: WorkspaceTabSpec) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  updateTabTitle: (id: string, title: string) => void;
  toggleSidebar: () => void;
  /** Sidebar-Sichtbarkeit explizit setzen (Auto-Collapse des SidebarHost). */
  setSidebarVisible: (visible: boolean) => void;
  /**
   * Auto-Collapse-Zustandsmaschine für Kontextwechsel: beim Betreten eines
   * App-Tabs die aktuelle Präferenz in `sidebarRestore` sichern und einklappen,
   * beim Verlassen wiederherstellen. Nur die Ein-/Austritts-Übergänge wirken
   * (Gate über `sidebarRestore === null`), damit ein manueller Toggle auf einem
   * App-Tab nicht sofort revidiert wird.
   */
  syncSidebarForTab: (isAppTab: boolean) => void;
  /** Rechtes Panel ein-/ausblenden (Modus bleibt erhalten). */
  toggleRightPanel: () => void;
  /** Modus setzen und das rechte Panel dabei einblenden. */
  setRightPanelMode: (mode: RightPanelMode) => void;
  /** Session registrieren/aktivieren — blendet das Terminal-Panel ein. */
  openTerminalSession: (session: TerminalSession) => void;
  closeTerminalSession: (id: string) => void;
  activateTerminalSession: (id: string) => void;
  updateTerminalSessionTitle: (id: string, title: string) => void;
  setChatScope: (scope: ChatScope | null) => void;
  requestExplorerAction: (action: ExplorerAction) => void;
  clearExplorerRequest: () => void;
}

/** Persistierte Felder (partialize) — Basis für die migrate-Signatur. */
interface PersistedWorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  sidebarVisible: boolean;
  sidebarRestore: boolean | null;
  rightPanelVisible: boolean;
  rightPanelMode: RightPanelMode;
  terminalSessions: TerminalSession[];
  activeTerminalSessionId: string | null;
}

/** Roh-Shape älterer persistierter Stände (v≤3) + evtl. schon v4-Felder. */
interface PersistedLegacyState extends Partial<Omit<PersistedWorkspaceState, 'tabs'>> {
  tabs?: Array<{
    id: string;
    type: string;
    title: string;
    documentId?: string;
    slug?: string;
  }>;
  // v2-Felder
  explorerVisible?: boolean;
  llmVisible?: boolean;
  llmPanelMode?: 'chat' | 'terminal';
  // v3-Felder (zwei unabhängige Flächen)
  chatVisible?: boolean;
  terminalVisible?: boolean;
}

/**
 * Migration auf v4 (rightPanelVisible/-Mode). Je nach Herkunftsversion:
 *
 * - v≤2: Das rechte Panel war schon damals EINE Fläche mit Modus
 *   (llmVisible = sichtbar, llmPanelMode = Inhalt) — es bildet 1:1 auf v4 ab:
 *   rightPanelVisible = llmVisible, rightPanelMode = llmPanelMode. explorerVisible
 *   → sidebarVisible. (Kein Umweg über die v3-Zwei-Flächen-Faltung: der würde
 *   den zuletzt genutzten Terminal-Modus verlieren, weil llmVisible=true dort als
 *   „Chat sichtbar" gelesen würde und Chat beim Falten Vorrang hat.)
 * - v≥3: Chat und Terminal waren zwei unabhängige Flächen; sie werden zu
 *   Sichtbarkeit + Modus gefaltet:
 *     visible = chatVisible || terminalVisible
 *     mode    = (terminalVisible && !chatVisible) ? 'terminal' : 'chat'
 *
 * 'sandbox'-Tabs (Terminal als Mitte-Tab) und unbekannte Typen werden
 * entfernt, übrige Tabs + aktiver Tab bleiben erhalten. sidebarRestore startet
 * bei null (kein Auto-Collapse aus einer Alt-Session übernehmen).
 */
function migrateWorkspaceState(persisted: unknown, version: number): PersistedWorkspaceState {
  const old = (persisted ?? {}) as PersistedLegacyState;
  const valid = new Set(Object.keys(DEFAULT_TITLES));
  const tabs = (Array.isArray(old.tabs) ? old.tabs : []).filter(t =>
    valid.has(t.type)
  ) as WorkspaceTab[];
  const activeTabId =
    old.activeTabId && tabs.some(t => t.id === old.activeTabId)
      ? old.activeTabId
      : (tabs[0]?.id ?? null);

  let sidebarVisible: boolean;
  let rightPanelVisible: boolean;
  let rightPanelMode: RightPanelMode;
  let terminalSessions: TerminalSession[];
  let activeTerminalSessionId: string | null;

  if (version >= 3) {
    const chatVisible = old.chatVisible ?? true;
    const terminalVisible = old.terminalVisible ?? false;
    sidebarVisible = old.sidebarVisible ?? true;
    rightPanelVisible = chatVisible || terminalVisible;
    rightPanelMode = terminalVisible && !chatVisible ? 'terminal' : 'chat';
    terminalSessions = Array.isArray(old.terminalSessions) ? old.terminalSessions : [];
    activeTerminalSessionId = old.activeTerminalSessionId ?? null;
  } else {
    // v≤2: EIN Panel mit Modus → direkt übernehmen (kein Faltungs-Verlust).
    sidebarVisible = old.explorerVisible ?? true;
    rightPanelVisible = old.llmVisible ?? true;
    rightPanelMode = old.llmPanelMode === 'terminal' ? 'terminal' : 'chat';
    terminalSessions = [];
    activeTerminalSessionId = null;
  }

  return {
    tabs,
    activeTabId,
    sidebarVisible,
    sidebarRestore: null,
    rightPanelVisible,
    rightPanelMode,
    terminalSessions,
    activeTerminalSessionId,
  };
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      sidebarVisible: true,
      sidebarRestore: null,
      rightPanelVisible: true,
      rightPanelMode: 'chat',
      terminalSessions: [],
      activeTerminalSessionId: null,
      chatScope: null,
      explorerRequest: null,

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
          documentId: spec.documentId,
          slug: spec.slug,
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
      syncSidebarForTab: isAppTab =>
        set(state => {
          // Betreten eines App-Tabs (nur der Eintritts-Übergang, Gate über
          // sidebarRestore === null): Präferenz sichern und einklappen.
          if (isAppTab && state.sidebarRestore === null) {
            return { sidebarRestore: state.sidebarVisible, sidebarVisible: false };
          }
          // Verlassen des App-Kontexts: gesicherte Präferenz wiederherstellen.
          // Greift auch selbstheilend nach einem Reload, der auf einem App-Tab
          // mit bereits eingeklappter (persistierter) Sidebar startete.
          if (!isAppTab && state.sidebarRestore !== null) {
            return { sidebarVisible: state.sidebarRestore, sidebarRestore: null };
          }
          return {};
        }),
      toggleRightPanel: () => set(state => ({ rightPanelVisible: !state.rightPanelVisible })),
      setRightPanelMode: mode => set({ rightPanelVisible: true, rightPanelMode: mode }),

      openTerminalSession: session => {
        const { terminalSessions } = get();
        const exists = terminalSessions.some(s => s.id === session.id);
        set({
          terminalSessions: exists ? terminalSessions : [...terminalSessions, session],
          activeTerminalSessionId: session.id,
          rightPanelVisible: true,
          rightPanelMode: 'terminal',
        });
      },

      closeTerminalSession: id => {
        const { terminalSessions, activeTerminalSessionId } = get();
        const index = terminalSessions.findIndex(s => s.id === id);
        if (index === -1) return;
        const next = terminalSessions.filter(s => s.id !== id);
        let nextActive = activeTerminalSessionId;
        if (activeTerminalSessionId === id) {
          const neighbor = next[index] ?? next[index - 1] ?? null;
          nextActive = neighbor ? neighbor.id : null;
        }
        set({ terminalSessions: next, activeTerminalSessionId: nextActive });
      },

      activateTerminalSession: id => {
        if (get().terminalSessions.some(s => s.id === id)) {
          set({ activeTerminalSessionId: id });
        }
      },

      updateTerminalSessionTitle: (id, title) => {
        set(state => ({
          terminalSessions: state.terminalSessions.map(s => (s.id === id ? { ...s, title } : s)),
        }));
      },

      // Scope setzen blendet das Chat-Panel ein (dorthin wirkt der Scope)
      setChatScope: scope =>
        set(
          scope
            ? { chatScope: scope, rightPanelVisible: true, rightPanelMode: 'chat' }
            : { chatScope: null }
        ),
      // Menü-Aktion an den Explorer delegieren — blendet die Sidebar dafür ein
      requestExplorerAction: action => set({ explorerRequest: action, sidebarVisible: true }),
      clearExplorerRequest: () => set({ explorerRequest: null }),
    }),
    {
      name: 'arasul_workspace',
      version: 4,
      migrate: (persisted, version) => migrateWorkspaceState(persisted, version) as WorkspaceState,
      partialize: state => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        sidebarVisible: state.sidebarVisible,
        sidebarRestore: state.sidebarRestore,
        rightPanelVisible: state.rightPanelVisible,
        rightPanelMode: state.rightPanelMode,
        terminalSessions: state.terminalSessions,
        activeTerminalSessionId: state.activeTerminalSessionId,
      }),
    }
  )
);
