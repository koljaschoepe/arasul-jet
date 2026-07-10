import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Workspace-Store: offene Tabs, aktiver Tab und Panel-Sichtbarkeit der
 * IDE-Shell. Persistiert in localStorage, der aktive Tab wird zusätzlich
 * in der URL gespiegelt (siehe WorkspaceShell).
 *
 * Tab-Identität: pro (type, payload)-Kombination existiert höchstens ein
 * Tab — `tabId()` liefert den deterministischen Schlüssel, openTab dedupliziert.
 */

export type WorkspaceTabType =
  | 'dashboard'
  | 'documents'
  | 'document'
  | 'chat'
  | 'settings'
  | 'store'
  | 'sandbox'
  | 'telegram'
  | 'database'
  | 'database-table';

export interface WorkspaceTabSpec {
  type: WorkspaceTabType;
  title?: string;
  documentId?: string;
  chatId?: string;
  slug?: string;
}

export interface WorkspaceTab {
  id: string;
  type: WorkspaceTabType;
  title: string;
  documentId?: string;
  chatId?: string;
  slug?: string;
}

const DEFAULT_TITLES: Record<WorkspaceTabType, string> = {
  dashboard: 'Dashboard',
  documents: 'Daten',
  document: 'Dokument',
  chat: 'Chat',
  settings: 'Einstellungen',
  store: 'Store',
  sandbox: 'Terminal',
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
    case 'chat':
      return `chat:${spec.chatId ?? 'new'}`;
    default:
      return spec.type;
  }
}

/** Aktiver Tab → URL-Pfad unterhalb von /workspace. */
export function tabToPath(tab: WorkspaceTab): string {
  switch (tab.type) {
    case 'dashboard':
      return '/workspace/dashboard';
    case 'documents':
      return '/workspace/documents';
    case 'document':
      return `/workspace/doc/${tab.documentId ?? ''}`;
    case 'chat':
      return tab.chatId ? `/workspace/chat/${tab.chatId}` : '/workspace/chat';
    case 'settings':
      return '/workspace/settings';
    case 'store':
      return '/workspace/store';
    case 'sandbox':
      return '/workspace/terminal';
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
    case 'documents':
      return { type: 'documents' };
    case 'doc':
      return parts[1] ? { type: 'document', documentId: parts[1] } : null;
    case 'chat':
      return parts[1] ? { type: 'chat', chatId: parts[1] } : { type: 'chat' };
    case 'settings':
      return { type: 'settings' };
    case 'store':
      return { type: 'store' };
    case 'terminal':
      return { type: 'sandbox' };
    case 'telegram':
      return { type: 'telegram' };
    case 'database':
      return parts[1] ? { type: 'database-table', slug: parts[1] } : { type: 'database' };
    default:
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

interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  explorerVisible: boolean;
  llmVisible: boolean;
  chatScope: ChatScope | null;
  openTab: (spec: WorkspaceTabSpec) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  updateTabTitle: (id: string, title: string) => void;
  toggleExplorer: () => void;
  toggleLlm: () => void;
  setChatScope: (scope: ChatScope | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      explorerVisible: true,
      llmVisible: true,
      chatScope: null,

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
          chatId: spec.chatId,
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

      toggleExplorer: () => set(state => ({ explorerVisible: !state.explorerVisible })),
      toggleLlm: () => set(state => ({ llmVisible: !state.llmVisible })),
      // Scope setzen blendet das KI-Panel ein (dorthin wirkt der Scope)
      setChatScope: scope =>
        set(scope ? { chatScope: scope, llmVisible: true } : { chatScope: null }),
    }),
    {
      name: 'arasul_workspace',
      partialize: state => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        explorerVisible: state.explorerVisible,
        llmVisible: state.llmVisible,
      }),
    }
  )
);
