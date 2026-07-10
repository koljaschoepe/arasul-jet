import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import { setWorkspaceShellEnabled } from '@/lib/featureFlags';
import { useWorkspaceStore, pathToTabSpec, tabToPath, tabId } from '@/stores/workspaceStore';
import { ActivityBar } from './ActivityBar';
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
  const explorerVisible = useWorkspaceStore(s => s.explorerVisible);
  const llmVisible = useWorkspaceStore(s => s.llmVisible);

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

  // Panel-Layout (Breiten) in localStorage persistieren
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'arasul-workspace-panels',
    panelIds: [...(explorerVisible ? ['explorer'] : []), 'main', ...(llmVisible ? ['llm'] : [])],
  });

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-background text-foreground"
      data-testid="workspace-shell"
    >
      <ActivityBar onLeaveWorkspace={leaveWorkspace} />
      <Group
        orientation="horizontal"
        className="flex-1"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        {explorerVisible && (
          <>
            <Panel id="explorer" defaultSize="18%" minSize="160px" maxSize="35%">
              <ExplorerPanel />
            </Panel>
            <Separator className="w-px bg-border transition-colors hover:bg-primary" />
          </>
        )}
        <Panel id="main" minSize="30%">
          <div className="flex h-full min-w-0 flex-col">
            <TabBar />
            <div className="min-h-0 flex-1">
              <TabContent themeControls={props} />
            </div>
          </div>
        </Panel>
        {llmVisible && (
          <>
            <Separator className="w-px bg-border transition-colors hover:bg-primary" />
            <Panel id="llm" defaultSize="26%" minSize="220px" maxSize="45%">
              <LlmPanel />
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
}
