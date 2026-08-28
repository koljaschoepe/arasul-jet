import React from 'react';
import { LogOut, Settings, PanelLeft, PanelRight, User } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/shadcn/popover';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSchmalesFenster } from '@/hooks/useSchmalesFenster';
import { useAuth } from '@/contexts/AuthContext';
import { Mascot } from '@/components/mascot/Mascot';

/** Icon-Toggle für die zwei Layout-Flächen (Sidebar/rechte Spalte). */
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

interface WorkspaceMenuBarProps {
  /** Abmelden. Kommt von der Shell, die es von App.tsx bekommt. */
  onLogout: () => Promise<void> | void;
}

/**
 * Schlanke Top-Menüleiste der Shell, bewusst minimal: links die Marke, rechts
 * die zwei Layout-Toggles (Sidebar / rechte Spalte), das Benutzermenü und —
 * für den Administrator — die Einstellungen. Das Theme (Schwarz/Dunkel/Hell)
 * wird ausschließlich in den Einstellungen → Erscheinungsbild gesetzt
 * (Plan 005 · Schritt 1).
 *
 * Das Datei-Menü (Ordner anlegen, Terminal, Dokumente hochladen) und der
 * Projekt-Umschalter sind mit B2 gefallen: Explorer, Terminal und Projekte
 * gibt es in der Oberfläche nicht mehr.
 *
 * DAS BENUTZERMENÜ IST NEU IN D1, und es musste kommen: das Abmelden lag
 * bisher **in** den Einstellungen, und die Einstellungen sind ab dieser Phase
 * eine Admin-Seite. Ein Mitarbeiter hätte sich sonst nicht mehr abmelden
 * können — die Rolle hätte nicht nur ausgeblendet, sondern eingesperrt.
 */
export function WorkspaceMenuBar({ onLogout }: WorkspaceMenuBarProps) {
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const openTab = useWorkspaceStore(s => s.openTab);
  const sidebarVisible = useWorkspaceStore(s => s.sidebarVisible);
  const rightPanelVisible = useWorkspaceStore(s => s.rightPanelVisible);
  const notizenBlattOffen = useWorkspaceStore(s => s.notizenBlattOffen);
  const toggleSidebar = useWorkspaceStore(s => s.toggleSidebar);
  const toggleRightPanel = useWorkspaceStore(s => s.toggleRightPanel);
  const toggleNotizenBlatt = useWorkspaceStore(s => s.toggleNotizenBlatt);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const selectView = useWorkspaceStore(s => s.selectView);

  // EIN Knopf für die Notizen, zwei Zustände dahinter (Phase D6): über 900 px
  // ist es die Spalte, darunter das Blatt über der Mitte. Der Mensch drückt
  // dasselbe Ding — was er aufmacht, entscheidet die Breite des Fensters.
  const schmal = useSchmalesFenster();
  const notizenOffen = schmal ? notizenBlattOffen : rightPanelVisible;
  const notizenSchalten = schmal ? toggleNotizenBlatt : toggleRightPanel;

  return (
    <header
      className="flex h-ui-header shrink-0 items-center gap-1 bg-background px-2 select-none"
      data-testid="workspace-menubar"
    >
      <span className="mr-1 flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-foreground">
        <Mascot state="idle" label="Arasul" className="h-5 w-5" />
        Arasul
      </span>

      <div className="flex-1" />

      <div className="flex items-center gap-0.5" role="group" aria-label="Layout">
        <LayoutToggleButton
          label={sidebarVisible ? 'Sidebar ausblenden' : 'Sidebar einblenden'}
          pressed={sidebarVisible}
          onClick={toggleSidebar}
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </LayoutToggleButton>
        <LayoutToggleButton
          label={notizenOffen ? 'Notizen ausblenden' : 'Notizen einblenden'}
          pressed={notizenOffen}
          onClick={notizenSchalten}
        >
          <PanelRight className="h-4 w-4" aria-hidden="true" />
        </LayoutToggleButton>
      </div>

      <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      {/* Die Einstellungen sind ab D1 eine Admin-Seite. Sie einem Mitarbeiter
          zu zeigen hiesse, ihm sechs Bereiche anzubieten, von denen fünf mit
          403 antworten. Entscheiden tut weiter `requireRole` im Backend. */}
      {istAdmin && (
        <button
          type="button"
          title="Einstellungen"
          aria-label="Einstellungen"
          onClick={() => {
            selectView('settings');
            openTab({ type: 'settings' });
          }}
          className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
            activeTabId === 'settings'
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      <Popover>
        <PopoverTrigger
          title="Konto"
          aria-label="Konto"
          data-testid="workspace-benutzermenue"
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <User className="h-4 w-4" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1 text-xs">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium text-foreground">
              {user?.username ?? 'Angemeldet'}
            </p>
            {/* Die Rolle steht da, weil sie erklärt, warum jemand mehr oder
                weniger sieht als der Kollege daneben. */}
            <p className="text-muted-foreground">
              {user?.role === 'admin' ? 'Administrator' : 'Mitarbeiter'}
            </p>
          </div>
          <div className="my-1 h-px bg-border" aria-hidden="true" />
          <button
            type="button"
            data-testid="workspace-abmelden"
            onClick={() => {
              void onLogout();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-foreground hover:bg-accent"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Abmelden
          </button>
        </PopoverContent>
      </Popover>
    </header>
  );
}
