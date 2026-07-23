import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import { useWorkspaceStore, pathToTabSpec, tabToPath, tabId } from '@/stores/workspaceStore';
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps';
import { WorkspaceMenuBar } from './WorkspaceMenuBar';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import { TabContent } from './TabContent';
import type { TabThemeControls } from './TabContent';
import { ActivityBar } from './ActivityBar';
import { SidebarHost } from './SidebarHost';
import { RightPanel } from './RightPanel';

/**
 * Cursor-Raster der IDE-Shell:
 *
 *   MenuBar (oben, mit Layout-Toggles rechts)
 *   ActivityBar · Sidebar · Mitte (TabBar + Inhalt) · rechtes Panel
 *                                                     (Chat ⇄ Terminal, Segment-Kopf)
 *   StatusBar (unten)
 *
 * Der aktive Tab wird in der URL gespiegelt (/workspace/...), offene Tabs und
 * Panel-Layout persistieren in localStorage.
 *
 * Rechtes Panel: EINE Fläche mit zwei Modi (Chat/Terminal), gerendert vom
 * RightPanel — der frühere innere vertikale Split (Chat oben / Terminal unten)
 * samt eigener Layout-Persistenz entfällt. Der Modus lebt im Store
 * (rightPanelMode), die Sichtbarkeit in rightPanelVisible.
 *
 * Keep-alive: Sidebar und das rechte Panel werden beim Ausblenden NICHT
 * unmounted, sondern nur per CSS versteckt (Regel in index.css:
 * `[data-panel][data-shell-hidden='true'] { display:none }`). So überleben
 * Terminal-WebSocket-Sessions und Chat-Streams jeden Panel-Toggle. react-
 * resizable-panels setzt display:flex inline auf Panel-Wurzeln, daher läuft das
 * über ein Datenattribut + !important statt über das hidden-Attribut.
 *
 * WICHTIG — `data-shell-hidden` statt `aria-hidden` als CSS-Anker: Die
 * Sichtbarkeit MUSS an einem Attribut hängen, das ausschließlich diese Shell
 * setzt. `aria-hidden` erfüllt das nicht — Radix-Dialoge/-Overlays rufen beim
 * Öffnen `hideOthers()` (aria-hidden-Paket) auf und setzen `aria-hidden='true'`
 * auf fremde Geschwister-Elemente, um sie vor Screenreadern zu verbergen. Hing
 * die Versteck-Regel an `aria-hidden`, kollabierten Panels, sobald ein Dialog
 * (z. B. „Neuer Ordner") ein Panel als Nachbarn markierte. `aria-hidden` wird
 * für die A11y weiter gespiegelt, steuert aber die Darstellung nicht mehr.
 */
export default function WorkspaceShell(props: TabThemeControls) {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const openTab = useWorkspaceStore(s => s.openTab);
  const sidebarVisible = useWorkspaceStore(s => s.sidebarVisible);
  const rightPanelVisible = useWorkspaceStore(s => s.rightPanelVisible);
  const { isTabTypeEnabled } = useWorkspaceApps();

  // URL → Store: Deep-Links und Browser-Zurück aktivieren/öffnen den Tab
  useEffect(() => {
    const subPath = location.pathname.replace(/^\/workspace/, '');

    // v2-Deep-Link /workspace/terminal: Terminal ist kein Tab mehr — Panel
    // einblenden (gleiche Semantik wie die TerminalPanelBridge in TabContent);
    // die URL normalisiert der Store→URL-Effekt auf den aktiven Tab.
    if (subPath.split('/').filter(Boolean)[0] === 'terminal') {
      useWorkspaceStore.setState({ rightPanelVisible: true, rightPanelMode: 'terminal' });
      return;
    }

    const spec = pathToTabSpec(subPath);

    // Extension-Gating: Tabs deaktivierter Apps öffnen sich auch per
    // Deep-Link oder Browser-Zurück nicht (wieder).
    if (spec && !isTabTypeEnabled(spec.type)) {
      const state = useWorkspaceStore.getState();
      const id = tabId(spec);
      if (state.tabs.some(t => t.id === id)) {
        // Während des App-Ladens durchgerutscht (fail-open) → wieder schließen;
        // der Store→URL-Effekt springt zum Nachbarn.
        state.closeTab(id);
      } else {
        const active = state.tabs.find(t => t.id === state.activeTabId);
        if (active) {
          navigate(tabToPath(active), { replace: true });
        }
      }
      return;
    }

    if (spec) {
      const id = tabId(spec);
      if (id !== activeTabId) {
        openTab(spec);
      }
    }
    // Kein Default-Tab mehr: ohne passenden Deep-Link landet der Workspace auf
    // seinem Leerzustand ("Kein Tab geöffnet") — das Chat-Panel rechts ist der
    // Chat-first-Einstieg (Plan 008).
  }, [location.pathname, isTabTypeEnabled]);

  // Store → URL: aktiver Tab spiegelt sich im Pfad
  useEffect(() => {
    // Frischen Stand lesen (nicht den Render-Snapshot): der URL→Store-Effekt
    // läuft im selben Commit direkt davor und kann bereits einen Tab geöffnet
    // haben — mit dem stale Snapshot würde ein Deep-Link auf leeren Store
    // sonst sofort von einem Dashboard-Default-Tab überschrieben.
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

  // Das rechte Panel (Chat/Terminal) ist als Ganzes sichtbar oder nicht.
  const rightVisible = rightPanelVisible;

  // Panel-Layout (Breiten) in localStorage persistieren. Die Panel-Ids sind
  // stabil (Panels bleiben wegen Keep-alive immer gemountet).
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'arasul-workspace-panels',
    panelIds: ['explorer', 'main', 'llm'],
  });

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground"
      data-testid="workspace-shell"
    >
      <WorkspaceMenuBar themeControls={props} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Immer sichtbare Activity-Bar links, außerhalb des einklappbaren
            Panels — so bleibt jede Ansicht (v. a. »Dateien«) erreichbar, auch
            wenn die Sidebar zu ist (Plan 012 Phase B, Schritt 5). */}
        <ActivityBar />
        <Group
          orientation="horizontal"
          className="flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel
            id="explorer"
            defaultSize="18%"
            minSize="160px"
            maxSize="35%"
            aria-hidden={!sidebarVisible}
            data-shell-hidden={sidebarVisible ? 'false' : 'true'}
          >
            <SidebarHost />
          </Panel>
          <Separator
            aria-hidden={!sidebarVisible}
            data-shell-hidden={sidebarVisible ? 'false' : 'true'}
            className="w-px bg-border transition-colors hover:bg-primary/50"
          />
          <Panel id="main" minSize="30%">
            <div className="flex h-full min-w-0 flex-col">
              <TabBar />
              <div className="min-h-0 flex-1 overflow-hidden rounded-tl-md bg-background">
                <TabContent themeControls={props} />
              </div>
            </div>
          </Panel>
          <Separator
            aria-hidden={!rightVisible}
            data-shell-hidden={rightVisible ? 'false' : 'true'}
            className="w-px bg-border transition-colors hover:bg-primary/50"
          />
          <Panel
            id="llm"
            defaultSize="26%"
            minSize="220px"
            maxSize="45%"
            aria-hidden={!rightVisible}
            data-shell-hidden={rightVisible ? 'false' : 'true'}
          >
            <RightPanel />
          </Panel>
        </Group>
      </div>
      <StatusBar />
    </div>
  );
}
