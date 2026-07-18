import { useEffect } from 'react';
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
 *   Automation (n8n)                      → ExplorerPanel bleibt sichtbar (Tab
 *                                           im Hauptbereich, kein Auto-Collapse)
 *   App-Tabs (Datenbank)                  → Sidebar klappt automatisch zu
 *
 * Auto-Collapse: Beim Betreten eines App-Tabs wird die Sidebar eingeklappt und
 * die vorherige Nutzer-Präferenz gemerkt; beim Verlassen wird sie
 * wiederhergestellt. Die Zustandsmaschine (inkl. persistiertem `sidebarRestore`)
 * lebt im Store (`syncSidebarForTab`), damit die Präferenz auch einen Reload auf
 * einem App-Tab überlebt und nicht der bereits eingeklappte Zustand als
 * vermeintliche Präferenz übernommen wird. `sidebarVisible` bleibt die Quelle
 * der Wahrheit (die WorkspaceShell versteckt das Panel darüber), der Toggle
 * (⌘B / Menüleiste) bleibt jederzeit bedienbar — er kann die Sidebar auch auf
 * einem App-Tab wieder aufziehen, ohne dass das erneute Einklappen greift.
 */

// Tabs, die den Explorer automatisch einklappen. 'automationen' (n8n) ist
// bewusst NICHT dabei: n8n läuft als Tab im Hauptbereich, der Explorer bleibt
// stehen, damit der Nutzer seine Dateien nicht verliert (Plan 005 · Schritt 1).
const APP_TAB_TYPES: ReadonlySet<WorkspaceTabType> = new Set([]);

export function SidebarHost() {
  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const syncSidebarForTab = useWorkspaceStore(s => s.syncSidebarForTab);

  const activeType = tabs.find(t => t.id === activeTabId)?.type ?? null;
  const isAppTab = activeType != null && APP_TAB_TYPES.has(activeType);

  // Kontextwechsel an die Store-Zustandsmaschine melden: Ein-/Austritt in den
  // App-Tab-Kontext klappt ein bzw. stellt wieder her. Das Gate (sidebarRestore)
  // sitzt im Store, deshalb ist kein Transition-Ref mehr nötig.
  useEffect(() => {
    syncSidebarForTab(isAppTab);
  }, [isAppTab, syncSidebarForTab]);

  if (activeType === 'store') {
    return <ExtensionsSidebarList />;
  }
  // Dashboard, Dokumente, Einstellungen — und als neutraler Default auch bei
  // eingeklappten App-Tabs (falls der Nutzer die Sidebar dort aufzieht).
  return <ExplorerPanel />;
}
