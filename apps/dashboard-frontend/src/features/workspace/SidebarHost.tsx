import { useEffect, useRef } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { WorkspaceTabType } from '@/stores/workspaceStore';
import { ExtensionsSidebarList } from '@/components/extensions/ExtensionsSidebarList';
import { ExplorerPanel } from './explorer/ExplorerPanel';

/**
 * Kontextabhängige Sidebar nach dem TabBridge-Muster: der aktive Tab-Typ
 * bestimmt den Inhalt der linken Fläche.
 *
 *   Dashboard / Dokumente / Einstellungen → ExplorerPanel (Second-Brain-Baum)
 *   Extensions (store)                    → ExtensionsSidebarList (Suche + Liste)
 *   App-Tabs (n8n / Telegram / Datenbank) → Sidebar klappt automatisch zu
 *
 * Auto-Collapse: Beim Betreten eines App-Tabs wird die Sidebar eingeklappt und
 * die vorherige Nutzer-Präferenz gemerkt; beim Verlassen wird sie
 * wiederhergestellt. `sidebarVisible` bleibt die Quelle der Wahrheit (die
 * WorkspaceShell versteckt das Panel darüber), der Toggle (⌘B / Menüleiste)
 * bleibt jederzeit bedienbar — er kann die Sidebar auch auf einem App-Tab
 * wieder aufziehen.
 */

const APP_TAB_TYPES: ReadonlySet<WorkspaceTabType> = new Set([
  'automationen',
  'telegram',
  'database',
  'database-table',
]);

export function SidebarHost() {
  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const setSidebarVisible = useWorkspaceStore(s => s.setSidebarVisible);

  const activeType = tabs.find(t => t.id === activeTabId)?.type ?? null;
  const isAppTab = activeType != null && APP_TAB_TYPES.has(activeType);

  // Auto-Collapse nur bei echten App-/Nicht-App-Übergängen (nicht bei jedem
  // sidebarVisible-Wechsel), damit ein manueller Toggle nicht sofort revidiert
  // wird. Der vor dem App-Tab gültige Zustand wird gemerkt und beim Verlassen
  // wiederhergestellt.
  const wasAppTab = useRef(false);
  const savedVisible = useRef<boolean | null>(null);
  useEffect(() => {
    if (isAppTab && !wasAppTab.current) {
      savedVisible.current = useWorkspaceStore.getState().sidebarVisible;
      setSidebarVisible(false);
    } else if (!isAppTab && wasAppTab.current) {
      if (savedVisible.current !== null) {
        setSidebarVisible(savedVisible.current);
        savedVisible.current = null;
      }
    }
    wasAppTab.current = isAppTab;
  }, [isAppTab, setSidebarVisible]);

  if (activeType === 'store') {
    return <ExtensionsSidebarList />;
  }
  // Dashboard, Dokumente, Einstellungen — und als neutraler Default auch bei
  // eingeklappten App-Tabs (falls der Nutzer die Sidebar dort aufzieht).
  return <ExplorerPanel />;
}
