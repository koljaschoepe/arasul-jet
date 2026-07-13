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

export type WorkspaceTabType =
  | 'dashboard'
  | 'document'
  | 'settings'
  | 'store'
  | 'automationen'
  | 'telegram'
  | 'database'
  | 'database-table';

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
  dashboard: 'Dashboard',
  document: 'Dokument',
  settings: 'Einstellungen',
  store: 'Extensions',
  automationen: 'Automationen',
  telegram: 'Telegram',
  database: 'Datenbank',
  'database-table': 'Tabelle',
};

export function tabId(spec: WorkspaceTabSpec): string {
  switch (spec.type) {
    case 'document':
      return `document:${spec.documentId ?? ''}`;
    case 'database-table':
      return `database-table:${spec.slug ?? ''}`;
    default:
      return spec.type;
  }
}

/** Aktiver Tab → URL-Pfad unterhalb von /workspace. */
export function tabToPath(tab: WorkspaceTab): string {
  switch (tab.type) {
    case 'dashboard':
      return '/workspace/dashboard';
    case 'document':
      return `/workspace/doc/${tab.documentId ?? ''}`;
    case 'settings':
      return '/workspace/settings';
    case 'store':
      return '/workspace/store';
    case 'automationen':
      return '/workspace/automationen';
    case 'telegram':
      return '/workspace/telegram';
    case 'database':
      return '/workspace/database';
    case 'database-table':
      return `/workspace/database/${tab.slug ?? ''}`;
  }
}

/** URL-Pfad (nach /workspace) → Tab-Spec, oder null wenn unbekannt. */
export function pathToTabSpec(subPath: string): WorkspaceTabSpec | null {
  const parts = subPath.split('/').filter(Boolean);
  const head = parts[0];
  if (!head) return null;
  switch (head) {
    case 'dashboard':
      return { type: 'dashboard' };
    case 'doc':
      return parts[1] ? { type: 'document', documentId: parts[1] } : null;
    case 'settings':
      return { type: 'settings' };
    case 'store':
      return { type: 'store' };
    case 'automationen':
      return { type: 'automationen' };
    case 'telegram':
      return { type: 'telegram' };
    case 'database':
      return parts[1] ? { type: 'database-table', slug: parts[1] } : { type: 'database' };
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
export type ExplorerAction = 'create-folder' | 'create-project' | 'upload-files';

/**
 * Eine Terminal-Session im rechten Panel. Die Registry lebt im Store
 * (nicht im Komponenten-State), damit genau eine Quelle der Wahrheit
 * existiert — egal ob das Panel sichtbar ist oder nicht. Die eigentliche
 * WebSocket-Verbindung hält die Terminal-Komponente; sie hängt an der
 * stabilen Session-Id.
 */
export interface TerminalSession {
  /** Stabile Session-Id (aktuell: Sandbox-Projekt-Id). */
  id: string;
  /** Sandbox-Projekt, in dem die Session läuft. */
  projectId: string;
  title: string;
}

/** Inhalt des rechten Panels: Chat oder Terminal (nie beide gleichzeitig). */
export type RightPanelMode = 'chat' | 'terminal';

interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  /** Linke Sidebar (Explorer/Workspace). */
  sidebarVisible: boolean;
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
 * Migration auf v4 (rightPanelVisible/-Mode). Läuft für jeden älteren Stand
 * über die Zwischenrepräsentation „zwei Flächen" (chatVisible/terminalVisible)
 * und faltet sie am Ende zu Sichtbarkeit + Modus:
 *   visible = chatVisible || terminalVisible
 *   mode    = (terminalVisible && !chatVisible) ? 'terminal' : 'chat'
 *
 * Quellen der beiden Flächen je Version:
 * - v≥3: direkt chatVisible / terminalVisible.
 * - v≤2: explorerVisible → sidebarVisible, llmVisible → chatVisible,
 *   terminalVisible nur, wenn das rechte Panel sichtbar war UND zuletzt im
 *   Terminal-Modus stand (llmVisible && llmPanelMode === 'terminal').
 *
 * 'sandbox'-Tabs (Terminal als Mitte-Tab) und unbekannte Typen werden
 * entfernt, übrige Tabs + aktiver Tab bleiben erhalten.
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

  // Zwei-Flächen-Zwischenrepräsentation je nach Herkunftsversion herleiten.
  let chatVisible: boolean;
  let terminalVisible: boolean;
  let sidebarVisible: boolean;
  let terminalSessions: TerminalSession[];
  let activeTerminalSessionId: string | null;

  if (version >= 3) {
    chatVisible = old.chatVisible ?? true;
    terminalVisible = old.terminalVisible ?? false;
    sidebarVisible = old.sidebarVisible ?? true;
    terminalSessions = Array.isArray(old.terminalSessions) ? old.terminalSessions : [];
    activeTerminalSessionId = old.activeTerminalSessionId ?? null;
  } else {
    chatVisible = old.llmVisible ?? true;
    terminalVisible = (old.llmVisible ?? true) && old.llmPanelMode === 'terminal';
    sidebarVisible = old.explorerVisible ?? true;
    terminalSessions = [];
    activeTerminalSessionId = null;
  }

  return {
    tabs,
    activeTabId,
    sidebarVisible,
    rightPanelVisible: chatVisible || terminalVisible,
    rightPanelMode: terminalVisible && !chatVisible ? 'terminal' : 'chat',
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
        rightPanelVisible: state.rightPanelVisible,
        rightPanelMode: state.rightPanelMode,
        terminalSessions: state.terminalSessions,
        activeTerminalSessionId: state.activeTerminalSessionId,
      }),
    }
  )
);
