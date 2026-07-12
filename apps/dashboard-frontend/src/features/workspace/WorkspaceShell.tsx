import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import { setWorkspaceShellEnabled } from '@/lib/featureFlags';
import { useWorkspaceStore, pathToTabSpec, tabToPath, tabId } from '@/stores/workspaceStore';
import { ActivityBar } from './ActivityBar';
import { WorkspaceMenuBar } from './WorkspaceMenuBar';
import { TabBar } from './TabBar';
import { TabContent } from './TabContent';
import type { TabThemeControls } from './TabContent';
import { ExplorerPanel } from './explorer/ExplorerPanel';
import { LlmPanel } from './llm/LlmPanel';

/**
 * IDE-artige 3-Spalten-Shell (Explorer | Tab-Arbeitsfläche | KI-Panel).
 * Der aktive Tab wird in der URL gespiegelt (/workspace/...), offene Tabs
 * und Panel-Layout persistieren in localStorage.
 */
export default function WorkspaceShell(props: TabThemeControls) {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const openTab = useWorkspaceStore(s => s.openTab);
  const sidebarVisible = useWorkspaceStore(s => s.sidebarVisible);
  const chatVisible = useWorkspaceStore(s => s.chatVisible);

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

  const enterWorkspacePermanently = () => {
    setWorkspaceShellEnabled(true);
  };

  // Beim ersten Rendern der Shell das Flag setzen, damit "/" künftig hierher führt
  useEffect(() => {
    enterWorkspacePermanently();
  }, []);

  // ⌘B / Ctrl+B toggelt den Explorer (wie in der klassischen UI die Sidebar)
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

  // Panel-Layout (Breiten) in localStorage persistieren
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'arasul-workspace-panels',
    panelIds: [...(sidebarVisible ? ['explorer'] : []), 'main', ...(chatVisible ? ['llm'] : [])],
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
          {sidebarVisible && (
            <>
              <Panel id="explorer" defaultSize="18%" minSize="160px" maxSize="35%">
                <ExplorerPanel />
              </Panel>
              <Separator className="w-[3px] bg-transparent transition-colors hover:bg-primary/50" />
            </>
          )}
          <Panel id="main" minSize="30%">
            <div className="flex h-full min-w-0 flex-col">
              <TabBar />
              <div className="min-h-0 flex-1 overflow-hidden rounded-tl-md bg-card">
                <TabContent themeControls={props} />
              </div>
            </div>
          </Panel>
          {chatVisible && (
            <>
              <Separator className="w-[3px] bg-transparent transition-colors hover:bg-primary/50" />
              <Panel id="llm" defaultSize="26%" minSize="220px" maxSize="45%">
                <LlmPanel />
              </Panel>
            </>
          )}
        </Group>
      </div>
    </div>
  );
}
