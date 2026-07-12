import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import { setWorkspaceShellEnabled } from '@/lib/featureFlags';
import { useWorkspaceStore, pathToTabSpec, tabToPath, tabId } from '@/stores/workspaceStore';
import { ActivityBar } from './ActivityBar';
import { WorkspaceMenuBar } from './WorkspaceMenuBar';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import { TabContent } from './TabContent';
import type { TabThemeControls } from './TabContent';
import { ExplorerPanel } from './explorer/ExplorerPanel';
import { ChatPanel } from './llm/ChatPanel';
import { TerminalPanel } from './terminal/TerminalPanel';

/**
 * Cursor-Raster der IDE-Shell:
 *
 *   MenuBar (oben, mit Layout-Toggles rechts)
 *   ActivityBar · Sidebar · Mitte (TabBar + Inhalt) · rechtes Panel
 *                                                     (Chat oben / Terminal unten)
 *   StatusBar (unten)
 *
 * Der aktive Tab wird in der URL gespiegelt (/workspace/...), offene Tabs und
 * Panel-Layout persistieren in localStorage.
 *
 * Keep-alive: Sidebar, Chat- und Terminal-Fläche werden beim Ausblenden NICHT
 * unmounted, sondern nur per aria-hidden versteckt (CSS-Regel in index.css:
 * `[data-panel][aria-hidden='true'] { display:none }`). So überleben Terminal-
 * WebSocket-Sessions und Chat-Streams jeden Panel-Toggle. react-resizable-
 * panels setzt display:flex inline auf Panel-Wurzeln, daher läuft das über
 * aria-hidden + !important statt über das hidden-Attribut.
 */
export default function WorkspaceShell(props: TabThemeControls) {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const openTab = useWorkspaceStore(s => s.openTab);
  const sidebarVisible = useWorkspaceStore(s => s.sidebarVisible);
  const chatVisible = useWorkspaceStore(s => s.chatVisible);
  const terminalVisible = useWorkspaceStore(s => s.terminalVisible);

  // URL → Store: Deep-Links und Browser-Zurück aktivieren/öffnen den Tab
  useEffect(() => {
    const subPath = location.pathname.replace(/^\/workspace/, '');
    const spec = pathToTabSpec(subPath);
    if (spec) {
      const id = tabId(spec);
      if (id !== activeTabId) {
        openTab(spec);
      }
    } else if (tabs.length === 0) {
      // Erster Start: Dashboard als Default-Tab
      openTab({ type: 'dashboard' });
    }
  }, [location.pathname]);

  // Store → URL: aktiver Tab spiegelt sich im Pfad
  useEffect(() => {
    const active = tabs.find(t => t.id === activeTabId);
    if (!active) {
      if (tabs.length === 0) {
        openTab({ type: 'dashboard' });
      }
      return;
    }
    const path = tabToPath(active);
    if (location.pathname !== path) {
      navigate(path);
    }
  }, [activeTabId, tabs]);

  const leaveWorkspace = () => {
    setWorkspaceShellEnabled(false);
    navigate('/');
  };

  // Beim ersten Rendern der Shell das Flag setzen, damit "/" künftig hierher führt
  useEffect(() => {
    setWorkspaceShellEnabled(true);
  }, []);

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

  // Rechtes Panel ist sichtbar, sobald eine seiner Flächen sichtbar ist
  const rightVisible = chatVisible || terminalVisible;
  const rightSplit = chatVisible && terminalVisible;

  // Panel-Layout (Breiten/Höhen) in localStorage persistieren. Die Panel-Ids
  // sind stabil (Panels bleiben wegen Keep-alive immer gemountet).
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'arasul-workspace-panels',
    panelIds: ['explorer', 'main', 'llm'],
  });
  const { defaultLayout: rightLayout, onLayoutChanged: onRightLayoutChanged } = useDefaultLayout({
    id: 'arasul-workspace-right-panels',
    panelIds: ['chat', 'terminal'],
  });

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground"
      data-testid="workspace-shell"
    >
      <WorkspaceMenuBar themeControls={props} onLeaveWorkspace={leaveWorkspace} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
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
          >
            <ExplorerPanel />
          </Panel>
          <Separator
            aria-hidden={!sidebarVisible}
            className="w-[3px] bg-transparent transition-colors hover:bg-primary/50"
          />
          <Panel id="main" minSize="30%">
            <div className="flex h-full min-w-0 flex-col">
              <TabBar />
              <div className="min-h-0 flex-1 overflow-hidden rounded-tl-md bg-card">
                <TabContent themeControls={props} />
              </div>
            </div>
          </Panel>
          <Separator
            aria-hidden={!rightVisible}
            className="w-[3px] bg-transparent transition-colors hover:bg-primary/50"
          />
          <Panel
            id="llm"
            defaultSize="26%"
            minSize="220px"
            maxSize="45%"
            aria-hidden={!rightVisible}
          >
            <Group
              orientation="vertical"
              className="h-full"
              defaultLayout={rightLayout}
              onLayoutChanged={onRightLayoutChanged}
            >
              <Panel id="chat" defaultSize="60%" minSize="120px" aria-hidden={!chatVisible}>
                <ChatPanel />
              </Panel>
              <Separator
                aria-hidden={!rightSplit}
                className="h-[3px] bg-transparent transition-colors hover:bg-primary/50"
              />
              <Panel id="terminal" defaultSize="40%" minSize="100px" aria-hidden={!terminalVisible}>
                <TerminalPanel />
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
      <StatusBar />
    </div>
  );
}
