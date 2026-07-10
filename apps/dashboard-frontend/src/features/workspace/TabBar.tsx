import { X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/**
 * Kompakte Tab-Leiste über der Arbeitsfläche. Klick aktiviert, × oder
 * Mittelklick schließt.
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
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-background"
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
            className={`group flex max-w-48 min-w-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 text-xs select-none ${
              isActive
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
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
              className={`shrink-0 rounded p-0.5 hover:bg-border ${
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
