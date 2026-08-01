import { X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/shadcn/context-menu';

/**
 * Kompakte Tab-Leiste über der Arbeitsfläche (Cursor-Maß: 32px). Keine
 * Trennstriche zwischen Tabs — der aktive Tab teilt die eine Flächenfarbe
 * (bg-background) mit dem Editor-Inhalt darunter und hebt sich nur über
 * Schriftstärke/Textfarbe ab. Klick aktiviert, × oder Mittelklick schließt;
 * Rechtsklick bietet Sammel-Schließen (IDE-Konvention).
 */
export function TabBar() {
  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const activateTab = useWorkspaceStore(s => s.activateTab);
  const closeTab = useWorkspaceStore(s => s.closeTab);

  const schliesseAndere = (behalteId: string) => {
    for (const t of tabs) {
      if (t.id !== behalteId) closeTab(t.id);
    }
  };
  const schliesseRechts = (abId: string) => {
    const ab = tabs.findIndex(t => t.id === abId);
    if (ab < 0) return;
    for (const t of tabs.slice(ab + 1)) {
      closeTab(t.id);
    }
  };
  const schliesseAlle = () => {
    for (const t of tabs) {
      closeTab(t.id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Offene Tabs"
      className="flex h-8 shrink-0 items-end gap-px overflow-x-auto bg-background px-1 pt-1"
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;
        return (
          <ContextMenu key={tab.id}>
            <ContextMenuTrigger asChild>
              <div
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                onClick={() => activateTab(tab.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activateTab(tab.id);
                  }
                }}
                onAuxClick={e => {
                  // Mittelklick schließt den Tab (IDE-Konvention)
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(tab.id);
                  }
                }}
                className={`group flex h-7 max-w-44 min-w-0 cursor-pointer items-center gap-1.5 rounded-t-md px-2.5 text-ui-sm select-none ${
                  isActive
                    ? 'bg-background font-medium text-foreground'
                    : 'text-muted-foreground/70 hover:bg-card/50 hover:text-foreground'
                }`}
              >
                <span className="truncate">{tab.title}</span>
                <button
                  type="button"
                  aria-label={`Tab ${tab.title} schließen`}
                  onClick={e => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className={`shrink-0 rounded p-0.5 hover:bg-accent ${
                    isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-70'
                  }`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => closeTab(tab.id)}>Schließen</ContextMenuItem>
              <ContextMenuItem disabled={tabs.length < 2} onSelect={() => schliesseAndere(tab.id)}>
                Andere schließen
              </ContextMenuItem>
              <ContextMenuItem
                disabled={index >= tabs.length - 1}
                onSelect={() => schliesseRechts(tab.id)}
              >
                Tabs rechts schließen
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={schliesseAlle}>Alle schließen</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}
