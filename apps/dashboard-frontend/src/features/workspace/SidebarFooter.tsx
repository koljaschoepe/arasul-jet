import { Settings } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ActivityButton } from './ActivityBar';

/**
 * Fuß-Zeile des linken Panels (Plan 009, Cursor-Stil): das Einstellungen-
 * Zahnrad sitzt unten links, getrennt durch eine feine Hairline. Öffnet den
 * Einstellungen-Tab im Hauptbereich (wie zuvor die ActivityBar).
 */
export function SidebarFooter() {
  const openTab = useWorkspaceStore(s => s.openTab);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);

  return (
    <div className="flex h-9 w-full shrink-0 items-center border-t border-border bg-background px-1">
      <ActivityButton
        label="Einstellungen"
        active={activeTabId === 'settings'}
        onClick={() => openTab({ type: 'settings' })}
      >
        <Settings className="h-[18px] w-[18px]" />
      </ActivityButton>
    </div>
  );
}
