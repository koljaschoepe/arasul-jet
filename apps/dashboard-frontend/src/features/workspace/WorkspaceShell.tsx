import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import {
  useWorkspaceStore,
  pathToTabSpec,
  tabToPath,
  tabId,
  nurFuerAdmin,
} from '@/stores/workspaceStore';
import { useAuth } from '@/contexts/AuthContext';
import { useSchmalesFenster } from '@/hooks/useSchmalesFenster';
import { WorkspaceMenuBar } from './WorkspaceMenuBar';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import { TabContent } from './TabContent';
import type { TabThemeControls } from './TabContent';
import { ActivityBar } from './ActivityBar';
import { SidebarHost } from './SidebarHost';
import { RightPanel } from './RightPanel';

/**
 * Das Dreispalten-Raster der Shell:
 *
 *   MenuBar (oben, mit Layout-Toggles rechts)
 *   ActivityBar · Sidebar · Mitte (TabBar + Inhalt) · rechte Spalte
 *   StatusBar (unten)
 *
 * Der aktive Tab wird in der URL gespiegelt (/workspace/...), offene Tabs und
 * Panel-Layout persistieren in localStorage.
 *
 * Phase D1 (27.08.2026) füllt das Raster nach dem Zielbild aus Beschluss 10:
 * links die Apps, in der Mitte das Dashboard oder eine App, rechts die
 * Notizen. Zwischen B2 und D1 standen beide Seitenspalten leer, weil
 * Datei-Explorer, Agent-Chat und Terminal aus der Oberfläche gefallen sind;
 * das Raster ist dieselbe Sache geblieben.
 *
 * Keep-alive: Sidebar und rechte Spalte werden beim Ausblenden NICHT
 * unmounted, sondern nur per CSS versteckt (Regel in index.css:
 * `[data-panel][data-shell-hidden='true'] { display:none }`). react-
 * resizable-panels setzt display:flex inline auf Panel-Wurzeln, daher läuft das
 * über ein Datenattribut + !important statt über das hidden-Attribut.
 *
 * WICHTIG — `data-shell-hidden` statt `aria-hidden` als CSS-Anker: Die
 * Sichtbarkeit MUSS an einem Attribut hängen, das ausschließlich diese Shell
 * setzt. `aria-hidden` erfüllt das nicht — Radix-Dialoge/-Overlays rufen beim
 * Öffnen `hideOthers()` (aria-hidden-Paket) auf und setzen `aria-hidden='true'`
 * auf fremde Geschwister-Elemente, um sie vor Screenreadern zu verbergen. Hing
 * die Versteck-Regel an `aria-hidden`, kollabierten Panels, sobald ein Dialog
 * ein Panel als Nachbarn markierte. `aria-hidden` wird für die A11y weiter
 * gespiegelt, steuert aber die Darstellung nicht mehr.
 */
export default function WorkspaceShell(props: TabThemeControls) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';

  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const openTab = useWorkspaceStore(s => s.openTab);
  const sidebarVisible = useWorkspaceStore(s => s.sidebarVisible);
  const rightPanelVisible = useWorkspaceStore(s => s.rightPanelVisible);

  // URL → Store: Deep-Links und Browser-Zurück aktivieren/öffnen den Tab.
  //
  // Seit D1 gibt es einen Standard-Tab: `/workspace` ohne weiteren Pfad landet
  // auf der Übersicht. Vorher stand dort „Kein Tab geöffnet", weil es keinen
  // gab, der immer passt; jetzt gibt es ihn, und die erste Ansicht nach der
  // Anmeldung soll die eigenen Apps zeigen und keinen Leerzustand.
  //
  // Eine Admin-Adresse, die ein Mitarbeiter tippt, landet ebenfalls auf der
  // Übersicht. Das ist Ausblenden und keine Berechtigung — `requireRole` im
  // Backend antwortet ihm auf jeden Weg dahinter mit 403.
  useEffect(() => {
    const subPath = location.pathname.replace(/^\/workspace/, '');
    const gewuenscht = pathToTabSpec(subPath);
    const spec =
      gewuenscht && (istAdmin || !nurFuerAdmin(gewuenscht.type))
        ? gewuenscht
        : ({ type: 'dashboard' } as const);

    const id = tabId(spec);
    if (id !== activeTabId) {
      openTab(spec);
    }
  }, [location.pathname, istAdmin]);

  // Store → URL: aktiver Tab spiegelt sich im Pfad
  useEffect(() => {
    // Frischen Stand lesen (nicht den Render-Snapshot): der URL→Store-Effekt
    // läuft im selben Commit direkt davor und kann bereits einen Tab geöffnet
    // haben — mit dem stale Snapshot würde ein Deep-Link auf leeren Store
    // sonst sofort überschrieben.
    const state = useWorkspaceStore.getState();
    const active = state.tabs.find(t => t.id === state.activeTabId);
    if (!active) {
      // Kein aktiver Tab → Leerzustand; die URL bleibt unverändert stehen.
      return;
    }
    const path = tabToPath(active);
    if (location.pathname !== path) {
      navigate(path);
    }
  }, [activeTabId, tabs]);

  // ⌘B / Ctrl+B toggelt die Sidebar (wie in VS Code/Cursor)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        useWorkspaceStore.getState().toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /**
   * Plan 023 F5: bei einem schmalen Fenster gibt es keine drei Spalten.
   *
   * Am 22.08.2026 gemessen: die Mindestbreiten der drei Panels ergeben zusammen
   * über 500 px; bei 400 px Fenster kann die Aufteilung sie gar nicht einhalten
   * und verteilt Reste. Darunter fällt die Sidebar weg (die Aktivitätsleiste
   * bleibt, sie ist einen Klick entfernt), die Mitte darf auf null schrumpfen,
   * und die rechte Spalte darf die ganze Breite nehmen.
   */
  const schmal = useSchmalesFenster();
  const sidebarZeigen = sidebarVisible && !schmal;

  // Panel-Layout (Breiten) in localStorage persistieren. Die Panel-Ids sind
  // stabil (Panels bleiben wegen Keep-alive immer gemountet).
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'arasul-workspace-panels',
    panelIds: ['sidebar', 'main', 'right'],
  });

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground"
      data-testid="workspace-shell"
    >
      <WorkspaceMenuBar onLogout={props.onLogout} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Immer sichtbare Activity-Bar links, außerhalb des einklappbaren
            Panels — so bleibt jede Ansicht erreichbar, auch wenn die Sidebar
            zu ist (Plan 012 Phase B, Schritt 5). */}
        <ActivityBar />
        <Group
          orientation="horizontal"
          className="flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel
            id="sidebar"
            defaultSize="18%"
            minSize="160px"
            maxSize="35%"
            aria-hidden={!sidebarZeigen}
            data-shell-hidden={sidebarZeigen ? 'false' : 'true'}
          >
            <SidebarHost />
          </Panel>
          <Separator
            aria-hidden={!sidebarZeigen}
            data-shell-hidden={sidebarZeigen ? 'false' : 'true'}
            className="w-px bg-border transition-colors hover:bg-primary/50"
          />
          <Panel id="main" minSize={schmal ? '0px' : '30%'}>
            <div className="flex h-full min-w-0 flex-col">
              <TabBar />
              <div className="min-h-0 flex-1 overflow-hidden rounded-tl-md bg-background">
                <TabContent themeControls={props} />
              </div>
            </div>
          </Panel>
          <Separator
            aria-hidden={!rightPanelVisible}
            data-shell-hidden={rightPanelVisible ? 'false' : 'true'}
            className="w-px bg-border transition-colors hover:bg-primary/50"
          />
          <Panel
            id="right"
            defaultSize="26%"
            minSize="220px"
            maxSize={schmal ? '100%' : '45%'}
            aria-hidden={!rightPanelVisible}
            data-shell-hidden={rightPanelVisible ? 'false' : 'true'}
          >
            <RightPanel />
          </Panel>
        </Group>
      </div>
      <StatusBar />
    </div>
  );
}
