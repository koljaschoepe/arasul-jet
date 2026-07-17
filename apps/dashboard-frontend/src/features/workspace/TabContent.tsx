import React, { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import { IsolatedMemoryRouter } from './IsolatedMemoryRouter';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SkeletonCard, SkeletonText } from '@/components/ui/Skeleton';
import { useWorkspaceStore, tabToPath } from '@/stores/workspaceStore';
import type { WorkspaceTab, WorkspaceTabSpec, WorkspaceTabType } from '@/stores/workspaceStore';

const Settings = lazy(() => import('@/features/settings/Settings'));
const Store = lazy(() => import('@/features/store'));
const DocumentViewerTab = lazy(() => import('./viewers/DocumentViewerTab'));
const AutomationenTab = lazy(() => import('./viewers/AutomationenTab'));

export interface TabThemeControls {
  theme: string;
  onToggleTheme: () => void;
  onLogout: () => Promise<void>;
}

interface TabContentProps {
  themeControls: TabThemeControls;
}

/**
 * Übersetzt Navigation auf einen fremden Legacy-Pfad (z. B. ein Link aus dem
 * Store auf `/`) in das Öffnen des passenden Workspace-Tabs und setzt den
 * MemoryRouter des Quell-Tabs zurück.
 */
/**
 * Legacy-Links auf /chat landen nicht mehr in einem Tab — der Chat lebt nur
 * noch im rechten KI-Panel. Diese Bridge blendet das Panel ein und setzt den
 * MemoryRouter des Quell-Tabs zurück.
 */
function ChatPanelBridge({ resetTo }: { resetTo: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    useWorkspaceStore.setState({ rightPanelVisible: true, rightPanelMode: 'chat' });
    navigate(resetTo, { replace: true });
  }, []);
  return null;
}

/**
 * Das Terminal ist kein Mitte-Tab mehr — Legacy-Links auf /terminal blenden
 * das Terminal-Panel ein und setzen den MemoryRouter des Quell-Tabs zurück.
 */
function TerminalPanelBridge({ resetTo }: { resetTo: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    useWorkspaceStore.setState({ rightPanelVisible: true, rightPanelMode: 'terminal' });
    navigate(resetTo, { replace: true });
  }, []);
  return null;
}

function TabBridge({
  makeSpec,
  resetTo,
}: {
  makeSpec: (params: Record<string, string | undefined>) => WorkspaceTabSpec;
  resetTo: string;
}) {
  const params = useParams();
  const navigate = useNavigate();
  const openTab = useWorkspaceStore(s => s.openTab);

  useEffect(() => {
    openTab(makeSpec(params));
    navigate(resetTo, { replace: true });
  }, []);

  return null;
}

/** Legacy-Startpfad je Tab-Typ (für den MemoryRouter des Tabs). */
function initialPathFor(tab: WorkspaceTab): string {
  switch (tab.type) {
    case 'settings':
      return '/settings';
    case 'store':
      return '/store';
    case 'automationen':
      return '/';
    case 'document':
      return '/';
  }
}

/** Welche Route-Keys gehören zum Tab selbst (statt zur Bridge)? */
const SELF_KEYS: Record<WorkspaceTabType, ReadonlySet<string>> = {
  document: new Set([]),
  settings: new Set(['settings']),
  store: new Set(['store']),
  automationen: new Set([]),
};

/**
 * Hostet einen Feature-Tab in einem eigenen MemoryRouter. Die Route-Tabelle
 * spiegelt die Legacy-Pfade: Routen des eigenen Features rendern das Feature,
 * fremde Pfade werden per TabBridge in Workspace-Tabs übersetzt. Dadurch
 * funktionieren Router-gekoppelte Features (Store, Chat, Datenbank) ohne
 * Eingriff in ihren Code als Tab.
 */
function FeatureTabHost({
  tab,
  themeControls,
}: {
  tab: WorkspaceTab;
  themeControls: TabThemeControls;
}) {
  const resetTo = initialPathFor(tab);
  const self = SELF_KEYS[tab.type];

  const routeFor = (key: string, feature: React.ReactNode, spec: WorkspaceTabSpec) =>
    self.has(key) ? feature : <TabBridge makeSpec={() => spec} resetTo={resetTo} />;

  return (
    <IsolatedMemoryRouter initialEntries={[resetTo]}>
      <Routes>
        {/* Kein Dashboard-Tab mehr (Plan 008): "/" fällt auf den Startpfad des
            jeweiligen Tabs zurück. */}
        <Route path="/" element={<Navigate to={resetTo} replace />} />
        <Route
          path="/settings"
          element={routeFor(
            'settings',
            <Settings
              handleLogout={themeControls.onLogout}
              theme={themeControls.theme}
              onToggleTheme={themeControls.onToggleTheme}
            />,
            { type: 'settings' }
          )}
        />
        <Route path="/chat/*" element={<ChatPanelBridge resetTo={resetTo} />} />
        {/* Dateiverwaltung lebt im Explorer — Legacy-Links auf /data setzen den
            Quell-Tab nur auf seinen Startpfad zurück. */}
        <Route path="/data" element={<Navigate to={resetTo} replace />} />
        <Route path="/documents" element={<Navigate to="/data" replace />} />
        <Route
          path="/store/*"
          element={routeFor('store', <Store variant="workspace" />, { type: 'store' })}
        />
        <Route path="/claude-code" element={<Navigate to="/terminal" replace />} />
        <Route path="/sandbox" element={<Navigate to="/terminal" replace />} />
        <Route path="/terminal" element={<TerminalPanelBridge resetTo={resetTo} />} />
        <Route path="*" element={<Navigate to={resetTo} replace />} />
      </Routes>
    </IsolatedMemoryRouter>
  );
}

function renderTab(tab: WorkspaceTab, themeControls: TabThemeControls) {
  if (tab.type === 'document') {
    return <DocumentViewerTab documentId={tab.documentId ?? ''} tabId={tab.id} />;
  }
  if (tab.type === 'automationen') {
    return <AutomationenTab />;
  }
  return <FeatureTabHost tab={tab} themeControls={themeControls} />;
}

/** Tab-Typen, die beim Wechsel gemountet bleiben (eingebettete iframes). */
const KEEP_ALIVE_TYPES: ReadonlySet<WorkspaceTabType> = new Set(['automationen']);

/**
 * Rendert den aktiven Tab (plus Keep-Alive-Tabs unsichtbar), jeweils mit
 * eigener ErrorBoundary — ein Renderfehler in einem Tab darf die Shell
 * nicht mitreißen.
 */
export function TabContent({ themeControls }: TabContentProps) {
  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);

  const mounted = tabs.filter(t => t.id === activeTabId || KEEP_ALIVE_TYPES.has(t.type));

  if (mounted.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Kein Tab geöffnet
      </div>
    );
  }

  return (
    <>
      {mounted.map(tab => (
        <div
          key={tab.id}
          className="h-full min-h-0 overflow-auto"
          hidden={tab.id !== activeTabId}
          data-tab-path={tabToPath(tab)}
        >
          <ComponentErrorBoundary componentName={`Tab ${tab.title}`}>
            <Suspense
              fallback={
                <div className="flex flex-col gap-6 p-6 animate-in fade-in">
                  <SkeletonText lines={2} width="40%" />
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <SkeletonCard hasAvatar={false} lines={3} />
                    <SkeletonCard hasAvatar={false} lines={3} />
                  </div>
                </div>
              }
            >
              {renderTab(tab, themeControls)}
            </Suspense>
          </ComponentErrorBoundary>
        </div>
      ))}
    </>
  );
}
