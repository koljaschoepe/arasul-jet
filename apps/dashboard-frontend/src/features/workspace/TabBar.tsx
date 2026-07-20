import { X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/**
 * Kompakte Tab-Leiste über der Arbeitsfläche (Cursor-Maß: 32px). Keine
 * Trennstriche zwischen Tabs — der aktive Tab teilt die eine Flächenfarbe
 * (bg-background) mit dem Editor-Inhalt darunter und hebt sich nur über
 * Schriftstärke/Textfarbe ab. Klick aktiviert, × oder Mittelklick schließt.
 */
export function TabBar() {
  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const activateTab = useWorkspaceStore(s => s.activateTab);
  const closeTab = useWorkspaceStore(s => s.closeTab);

  return (
    <div
      role="tablist"
      aria-label="Offene Tabs"
      className="flex h-8 shrink-0 items-end gap-px overflow-x-auto bg-background px-1 pt-1"
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
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
        );
      })}
    </div>
  );
}
