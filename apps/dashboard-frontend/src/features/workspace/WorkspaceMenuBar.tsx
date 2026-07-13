import React from 'react';
import {
  FolderPlus,
  FolderKanban,
  Upload,
  SquareTerminal,
  Undo2,
  Settings,
  PanelLeft,
  MessageSquare,
  Check,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useTheme, type Theme } from '@/hooks/useTheme';
import type { TabThemeControls } from './TabContent';

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: 'black', label: 'Schwarz' },
  { value: 'dark', label: 'Dunkel' },
  { value: 'light', label: 'Hell' },
];

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

/** Icon-Toggle für die drei Layout-Flächen (Sidebar/Terminal/Chat). */
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
 * links Marke + Datei/Ansicht-Menüs, rechts die drei Layout-Toggles
 * (Sidebar / Terminal-Panel / Chat-Panel) neben den Einstellungen.
 */
export function WorkspaceMenuBar({ onLeaveWorkspace }: WorkspaceMenuBarProps) {
  // Theme direkt über den Hook (synct alle useTheme-Instanzen); die
  // themeControls-Prop bleibt für die TabContent-Verdrahtung erhalten.
  const { theme, setTheme } = useTheme();
  const openTab = useWorkspaceStore(s => s.openTab);
  const sidebarVisible = useWorkspaceStore(s => s.sidebarVisible);
  const rightPanelVisible = useWorkspaceStore(s => s.rightPanelVisible);
  const rightPanelMode = useWorkspaceStore(s => s.rightPanelMode);
  const toggleSidebar = useWorkspaceStore(s => s.toggleSidebar);
  const toggleRightPanel = useWorkspaceStore(s => s.toggleRightPanel);
  const setRightPanelMode = useWorkspaceStore(s => s.setRightPanelMode);
  const requestExplorerAction = useWorkspaceStore(s => s.requestExplorerAction);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);

  // Abgeleitet aus dem einen rechten Panel — ein Klick im schon aktiven Modus
  // blendet das Panel aus, sonst wird der Modus gewählt (finaler Umbau: Stufe 4/5).
  const chatVisible = rightPanelVisible && rightPanelMode === 'chat';
  const terminalVisible = rightPanelVisible && rightPanelMode === 'terminal';
  const toggleChat = () => (chatVisible ? toggleRightPanel() : setRightPanelMode('chat'));
  const toggleTerminal = () =>
    terminalVisible ? toggleRightPanel() : setRightPanelMode('terminal');

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
          <DropdownMenuItem onClick={() => requestExplorerAction('create-project')}>
            <FolderKanban className="h-4 w-4" aria-hidden="true" />
            Neues Projekt…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRightPanelMode('terminal')}>
            <SquareTerminal className="h-4 w-4" aria-hidden="true" />
            Neue Terminal-Umgebung…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => requestExplorerAction('upload-files')}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Dokumente hochladen…
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
          <DropdownMenuLabel className="text-xs text-muted-foreground">Design</DropdownMenuLabel>
          {THEME_OPTIONS.map(option => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setTheme(option.value)}
              role="menuitemradio"
              aria-checked={theme === option.value}
            >
              <Check
                className={`h-4 w-4 ${theme === option.value ? 'opacity-100' : 'opacity-0'}`}
                aria-hidden="true"
              />
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      {/* Layout-Toggles: Sidebar / Terminal-Panel / Chat-Panel (ersetzen die
          alten Ansicht-Menü-Einträge und den Chat-Toggle unten links) */}
      <div className="flex items-center gap-0.5" role="group" aria-label="Layout">
        <LayoutToggleButton
          label={sidebarVisible ? 'Sidebar ausblenden' : 'Sidebar einblenden'}
          pressed={sidebarVisible}
          onClick={toggleSidebar}
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </LayoutToggleButton>
        <LayoutToggleButton
          label={terminalVisible ? 'Terminal-Panel ausblenden' : 'Terminal-Panel einblenden'}
          pressed={terminalVisible}
          onClick={toggleTerminal}
        >
          <SquareTerminal className="h-4 w-4" aria-hidden="true" />
        </LayoutToggleButton>
        <LayoutToggleButton
          label={chatVisible ? 'Chat-Panel ausblenden' : 'Chat-Panel einblenden'}
          pressed={chatVisible}
          onClick={toggleChat}
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
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
