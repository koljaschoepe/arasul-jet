import {
  FolderPlus,
  FolderKanban,
  Upload,
  SquareTerminal,
  Undo2,
  Settings,
  PanelLeft,
  MessageSquare,
  SunMoon,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { TabThemeControls } from './TabContent';

interface WorkspaceMenuBarProps {
  themeControls: TabThemeControls;
  onLeaveWorkspace: () => void;
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

/**
 * Schlanke Top-Menüleiste der IDE-Shell (à la Cursor, bewusst minimal):
 * links Marke + Datei/Ansicht-Menüs, rechts die Einstellungen. Sitzt
 * oberhalb von ActivityBar + Panel-Group und volle Breite.
 */
export function WorkspaceMenuBar({ themeControls, onLeaveWorkspace }: WorkspaceMenuBarProps) {
  const openTab = useWorkspaceStore(s => s.openTab);
  const explorerVisible = useWorkspaceStore(s => s.explorerVisible);
  const llmVisible = useWorkspaceStore(s => s.llmVisible);
  const toggleExplorer = useWorkspaceStore(s => s.toggleExplorer);
  const toggleLlm = useWorkspaceStore(s => s.toggleLlm);
  const requestExplorerAction = useWorkspaceStore(s => s.requestExplorerAction);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);

  return (
    <header
      className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-background px-2 select-none"
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
          <DropdownMenuItem onClick={() => requestExplorerAction('create-project')}>
            <FolderKanban className="h-4 w-4" aria-hidden="true" />
            Neues Projekt…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openTab({ type: 'sandbox' })}>
            <SquareTerminal className="h-4 w-4" aria-hidden="true" />
            Neue Terminal-Umgebung…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openTab({ type: 'documents' })}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Dokument hochladen…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLeaveWorkspace}>
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Zur klassischen Ansicht
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <MenuTriggerButton label="Ansicht" />
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem onClick={toggleExplorer}>
            <PanelLeft className="h-4 w-4" aria-hidden="true" />
            {explorerVisible ? 'Explorer ausblenden' : 'Explorer einblenden'}
            <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleLlm}>
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            {llmVisible ? 'KI-Panel ausblenden' : 'KI-Panel einblenden'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={themeControls.onToggleTheme}>
            <SunMoon className="h-4 w-4" aria-hidden="true" />
            {themeControls.theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

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
