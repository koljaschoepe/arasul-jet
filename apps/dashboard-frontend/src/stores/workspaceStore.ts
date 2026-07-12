import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Workspace-Store v3: offene Tabs, aktiver Tab, drei unabhängige Flächen
 * (Sidebar, Terminal-Panel, Chat-Panel) und die Terminal-Session-Registry
 * der IDE-Shell. Persistiert in localStorage, der aktive Tab wird zusätzlich
 * in der URL gespiegelt (siehe WorkspaceShell).
 *
 * Tab-Identität: pro (type, payload)-Kombination existiert höchstens ein
 * Tab — `tabId()` liefert den deterministischen Schlüssel, openTab dedupliziert.
 *
 * Terminal: existiert NICHT als Mitte-Tab. Es lebt ausschließlich im rechten
 * Panel (terminalVisible), seine Sessions in der Registry dieses Stores —
 * Komponenten rendern die Sessions nur, sie besitzen sie nicht.
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

interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  /** Linke Sidebar (Explorer/Workspace). */
  sidebarVisible: boolean;
  /** Terminal-Fläche im rechten Panel (unten), unabhängig vom Chat. */
  terminalVisible: boolean;
  /** Chat-Fläche im rechten Panel (oben), unabhängig vom Terminal. */
  chatVisible: boolean;
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
  toggleTerminal: () => void;
  toggleChat: () => void;
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
  terminalVisible: boolean;
  chatVisible: boolean;
  terminalSessions: TerminalSession[];
  activeTerminalSessionId: string | null;
}

/** Roh-Shape älterer persistierter Stände (v≤2) + evtl. schon v3-Felder. */
interface PersistedLegacyState extends Partial<Omit<PersistedWorkspaceState, 'tabs'>> {
  tabs?: Array<{
    id: string;
    type: string;
    title: string;
    documentId?: string;
    slug?: string;
  }>;
  explorerVisible?: boolean;
  llmVisible?: boolean;
  llmPanelMode?: 'chat' | 'terminal';
}

/**
 * v2 → v3:
 * - explorerVisible → sidebarVisible
 * - llmVisible → chatVisible
 * - llmPanelMode === 'terminal' → terminalVisible
 * - 'sandbox'-Tabs (Terminal als Mitte-Tab) und unbekannte Typen entfernen,
 *   übrige Tabs + aktiver Tab bleiben erhalten.
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

  if (version >= 3) {
    return {
      tabs,
      activeTabId,
      sidebarVisible: old.sidebarVisible ?? true,
      terminalVisible: old.terminalVisible ?? false,
      chatVisible: old.chatVisible ?? true,
      terminalSessions: Array.isArray(old.terminalSessions) ? old.terminalSessions : [],
      activeTerminalSessionId: old.activeTerminalSessionId ?? null,
    };
  }

  return {
    tabs,
    activeTabId,
    sidebarVisible: old.explorerVisible ?? true,
    terminalVisible: old.llmPanelMode === 'terminal',
    chatVisible: old.llmVisible ?? true,
    terminalSessions: [],
    activeTerminalSessionId: null,
  };
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      sidebarVisible: true,
      terminalVisible: false,
      chatVisible: true,
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
      toggleTerminal: () => set(state => ({ terminalVisible: !state.terminalVisible })),
      toggleChat: () => set(state => ({ chatVisible: !state.chatVisible })),

      openTerminalSession: session => {
        const { terminalSessions } = get();
        const exists = terminalSessions.some(s => s.id === session.id);
        set({
          terminalSessions: exists ? terminalSessions : [...terminalSessions, session],
          activeTerminalSessionId: session.id,
          terminalVisible: true,
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
        set(scope ? { chatScope: scope, chatVisible: true } : { chatScope: null }),
      // Menü-Aktion an den Explorer delegieren — blendet die Sidebar dafür ein
      requestExplorerAction: action => set({ explorerRequest: action, sidebarVisible: true }),
      clearExplorerRequest: () => set({ explorerRequest: null }),
    }),
    {
      name: 'arasul_workspace',
      version: 3,
      migrate: (persisted, version) => migrateWorkspaceState(persisted, version) as WorkspaceState,
      partialize: state => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        sidebarVisible: state.sidebarVisible,
        terminalVisible: state.terminalVisible,
        chatVisible: state.chatVisible,
        terminalSessions: state.terminalSessions,
        activeTerminalSessionId: state.activeTerminalSessionId,
      }),
    }
  )
);
