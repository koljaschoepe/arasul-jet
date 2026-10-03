import React from 'react';
import { LogOut, Menu, PanelLeft, PanelRight, User } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@marken';
import { useWorkspaceStore, sidebarSichtbar, notizenSichtbar } from '@/stores/workspaceStore';
import { useSchmalesFenster } from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { Mascot } from '@/components/mascot/Mascot';
import { PersonAvatar } from '@/components/PersonAvatar';
import { API_BASE } from '@/config/api';

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
 * die zwei Layout-Toggles (Sidebar / rechte Spalte) und das Benutzermenü. Das
 * Theme wird ausschließlich in den Einstellungen → Erscheinungsbild gesetzt
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
 *
 * Das Kontomenü zeigt seit M5 nur Name und Abmelden. Profil und angemeldete
 * Rechner (vorher „Ausweise") stehen in den Einstellungen, die jetzt für alle
 * da sind und nur Persönliches enthalten.
 *
 * UNTER 900 PX IST DIESE LEISTE DIE GANZE NAVIGATION (Phase D7): links der
 * Hamburger-Knopf, daneben der Name der Ansicht, die gerade dasteht — dort
 * gibt es weder Aktivitätsleiste noch Tab-Leiste, und ohne den Namen wüsste
 * niemand, worauf er schaut. Der Sidebar-Schalter und das Zahnrad fallen
 * dort weg: die eine Spalte hat keine Sidebar.
 */
export function WorkspaceMenuBar({ onLogout }: WorkspaceMenuBarProps) {
  const { user } = useAuth();
  const sidebarVisible = useWorkspaceStore(sidebarSichtbar);
  const rightPanelVisible = useWorkspaceStore(notizenSichtbar);
  const notizenAnsichtOffen = useWorkspaceStore(s => s.notizenAnsichtOffen);
  const menueOffen = useWorkspaceStore(s => s.menueOffen);
  const toggleSidebar = useWorkspaceStore(s => s.toggleSidebar);
  const toggleRightPanel = useWorkspaceStore(s => s.toggleRightPanel);
  const toggleNotizenAnsicht = useWorkspaceStore(s => s.toggleNotizenAnsicht);
  const toggleMenue = useWorkspaceStore(s => s.toggleMenue);
  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);

  // EIN Knopf für die Notizen, zwei Zustände dahinter (Phase D6): über 900 px
  // ist es die Spalte, darunter das Blatt über der Mitte. Der Mensch drückt
  // dasselbe Ding — was er aufmacht, entscheidet die Breite des Fensters.
  const schmal = useSchmalesFenster();
  const notizenOffen = schmal ? notizenAnsichtOffen : rightPanelVisible;
  const notizenSchalten = schmal ? toggleNotizenAnsicht : toggleRightPanel;

  // Was gerade dasteht — der Name für den schmalen Aufbau. Der Zettel gewinnt
  // gegen den Tab: er liegt dort nicht daneben, sondern an seiner Stelle.
  const aktiverTab = tabs.find(t => t.id === activeTabId);
  const ansichtsName = notizenOffen && schmal ? 'Notizen' : (aktiverTab?.title ?? 'Arasul');

  return (
    <header
      className="flex h-ui-header shrink-0 items-center gap-1 bg-background px-2 select-none"
      data-testid="workspace-menubar"
    >
      {schmal ? (
        <>
          {/* Der Hamburger. Er ist unter 900 px der einzige Weg zu einer
              anderen Ansicht und deshalb der erste Halt der Tastatur. */}
          <button
            type="button"
            title={menueOffen ? 'Menü schließen' : 'Menü öffnen'}
            aria-label={menueOffen ? 'Menü schließen' : 'Menü öffnen'}
            aria-expanded={menueOffen}
            data-testid="workspace-menue-knopf"
            onClick={toggleMenue}
            className="flex h-8 w-8 items-center justify-center rounded text-foreground transition-colors hover:bg-accent"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span
            className="min-w-0 flex-1 truncate px-1 text-ui-sm font-semibold text-foreground"
            data-testid="workspace-ansichtsname"
          >
            {ansichtsName}
          </span>
        </>
      ) : (
        <>
          <span className="mr-1 flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-foreground">
            <Mascot state="idle" label="Arasul" className="h-5 w-5" />
            Arasul
          </span>
          <div className="flex-1" />
        </>
      )}

      <div className="flex items-center gap-0.5" role="group" aria-label="Layout">
        {/* Kein Sidebar-Schalter unter 900 px: dort gibt es keine Sidebar,
            und ein Schalter für eine Fläche, die es nicht gibt, ist ein
            Knopf, der nichts tut. */}
        {!schmal && (
          <LayoutToggleButton
            label={sidebarVisible ? 'Sidebar ausblenden' : 'Sidebar einblenden'}
            pressed={sidebarVisible}
            onClick={toggleSidebar}
          >
            <PanelLeft className="h-4 w-4" aria-hidden="true" />
          </LayoutToggleButton>
        )}
        <LayoutToggleButton
          label={notizenOffen ? 'Notizen ausblenden' : 'Notizen einblenden'}
          pressed={notizenOffen}
          onClick={notizenSchalten}
        >
          <PanelRight className="h-4 w-4" aria-hidden="true" />
        </LayoutToggleButton>
      </div>

      <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

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
          <div className="flex items-center gap-2 px-2 py-1.5">
            <PersonAvatar
              name={user?.anzeigeName ?? user?.username ?? ''}
              bild={user?.hatBild ? `${API_BASE}/profil/bild` : null}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.anzeigeName ?? user?.username ?? 'Angemeldet'}
              </p>
            </div>
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
