import React from 'react';
import {
  FolderPlus,
  Upload,
  SquareTerminal,
  Settings,
  PanelLeft,
  PanelRight,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import type { TabThemeControls } from './TabContent';

interface WorkspaceMenuBarProps {
  themeControls: TabThemeControls;
}

function MenuTriggerButton({ label }: { label: string }) {
  return (
    <DropdownMenuTrigger
      className="flex h-6 items-center gap-0.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
      aria-label={`${label}-Menü`}
    >
      {label}
      <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
    </DropdownMenuTrigger>
  );
}

/** Icon-Toggle für die zwei Layout-Flächen (Sidebar/rechtes Panel). */
function LayoutToggleButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
        pressed
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Schlanke Top-Menüleiste der IDE-Shell (à la Cursor, bewusst minimal):
 * links Marke + Datei-Menü, rechts die zwei Layout-Toggles
 * (Sidebar / rechtes Panel) neben den Einstellungen. Der Panel-Modus
 * (Chat/Terminal) wird im Panel selbst umgeschaltet. Das Theme
 * (Schwarz/Dunkel/Hell) wird ausschließlich in den Einstellungen →
 * Erscheinungsbild gesetzt (kein redundanter Ansichtsmodus-Umschalter mehr,
 * Plan 005 · Schritt 1).
 */
export function WorkspaceMenuBar(_props: WorkspaceMenuBarProps) {
  const openTab = useWorkspaceStore(s => s.openTab);
  const sidebarVisible = useWorkspaceStore(s => s.sidebarVisible);
  const rightPanelVisible = useWorkspaceStore(s => s.rightPanelVisible);
  const toggleSidebar = useWorkspaceStore(s => s.toggleSidebar);
  const toggleRightPanel = useWorkspaceStore(s => s.toggleRightPanel);
  const setRightPanelMode = useWorkspaceStore(s => s.setRightPanelMode);
  const requestExplorerAction = useWorkspaceStore(s => s.requestExplorerAction);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);

  return (
    <header
      className="flex h-9 shrink-0 items-center gap-1 bg-background px-2 select-none"
      data-testid="workspace-menubar"
    >
      <span className="mr-1 px-1 text-xs font-semibold tracking-wide text-foreground">Arasul</span>

      <DropdownMenu>
        <MenuTriggerButton label="Datei" />
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem onClick={() => requestExplorerAction('create-folder')}>
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            Neuer Ordner…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRightPanelMode('terminal')}>
            <SquareTerminal className="h-4 w-4" aria-hidden="true" />
            Neue Terminal-Umgebung…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => requestExplorerAction('upload-files')}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Dokumente hochladen…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      {/* Aktiver Ordner-Kontext (Plan 012): Chat + Suche binden hieran. */}
      <WorkspaceSwitcher />

      <div className="flex-1" />

      {/* Zwei Layout-Toggles: Sidebar + rechtes Panel. Der Panel-Modus
          (Chat/Terminal) wird im Panel selbst gewechselt. */}
      <div className="flex items-center gap-0.5" role="group" aria-label="Layout">
        <LayoutToggleButton
          label={sidebarVisible ? 'Sidebar ausblenden' : 'Sidebar einblenden'}
          pressed={sidebarVisible}
          onClick={toggleSidebar}
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </LayoutToggleButton>
        <LayoutToggleButton
          label={rightPanelVisible ? 'Panel ausblenden' : 'Panel einblenden'}
          pressed={rightPanelVisible}
          onClick={toggleRightPanel}
        >
          <PanelRight className="h-4 w-4" aria-hidden="true" />
        </LayoutToggleButton>
      </div>

      <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      <button
        type="button"
        title="Einstellungen"
        aria-label="Einstellungen"
        onClick={() => openTab({ type: 'settings' })}
        className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
          activeTabId === 'settings'
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
      </button>
    </header>
  );
}
