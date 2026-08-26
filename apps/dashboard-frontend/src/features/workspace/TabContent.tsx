import React, { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { IsolatedMemoryRouter } from './IsolatedMemoryRouter';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SkeletonCard, SkeletonText } from '@/components/ui/Skeleton';
import { useWorkspaceStore, tabToPath } from '@/stores/workspaceStore';
import type { WorkspaceTab, WorkspaceTabSpec, WorkspaceTabType } from '@/stores/workspaceStore';

const Settings = lazy(() => import('@/features/settings/Settings'));
const Store = lazy(() => import('@/features/store'));

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
 * Store auf `/settings`) in das Öffnen des passenden Workspace-Tabs und setzt
 * den MemoryRouter des Quell-Tabs zurück.
 */
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
    case 'modelle':
      return '/store';
  }
}

/** Welche Route-Keys gehören zum Tab selbst (statt zur Bridge)? */
const SELF_KEYS: Record<WorkspaceTabType, ReadonlySet<string>> = {
  settings: new Set(['settings']),
  modelle: new Set(['store']),
};

/**
 * Hostet einen Feature-Tab in einem eigenen MemoryRouter. Die Route-Tabelle
 * spiegelt die Legacy-Pfade: Routen des eigenen Features rendern das Feature,
 * fremde Pfade werden per TabBridge in Workspace-Tabs übersetzt. Dadurch
 * funktionieren Router-gekoppelte Features (Store, Einstellungen) ohne
 * Eingriff in ihren Code als Tab.
 */
export function FeatureTabHost({
  tab,
  themeControls,
}: {
  tab: WorkspaceTab;
  themeControls: TabThemeControls;
}) {
  const resetTo = initialPathFor(tab);
  const self = SELF_KEYS[tab.type];

  // Der Suchteil der ECHTEN Adresse muss in den MemoryRouter dieses Tabs
  // hinein, sonst kommt er nirgends an (Plan 023 B1, Nachtrag).
  //
  // `initialPathFor` liefert nur den Pfad. Ein Aufruf von
  // `/workspace/settings?tab=remote-access` startete den Tab-Router also mit
  // `/settings` ohne Suchteil, und `Settings.tsx` las über `useSearchParams`
  // die LEERE Memory-Location statt der Adresszeile. Der Deep-Link zum
  // Fernzugriff landete stumm auf „Allgemein". Am 19.08.2026 im Browser
  // gegengeprüft, vorher und nachher.
  //
  // Nur beim ersten Rendern relevant: `initialEntries` liest der MemoryRouter
  // genau einmal. `resetTo` bleibt bewusst ohne Suchteil, damit ein Rücksprung
  // den Parameter nicht endlos wieder anwendet.
  const aussenLocation = useLocation();
  const startEintrag =
    tabToPath(tab) === aussenLocation.pathname && aussenLocation.search
      ? `${resetTo}${aussenLocation.search}`
      : resetTo;

  const routeFor = (key: string, feature: React.ReactNode, spec: WorkspaceTabSpec) =>
    self.has(key) ? feature : <TabBridge makeSpec={() => spec} resetTo={resetTo} />;

  return (
    <IsolatedMemoryRouter initialEntries={[startEintrag]}>
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
        {/* Der Schluessel ist der ROUTEN-Name, nicht der Tab-Typ: der Tab
            `modelle` liegt auf dem inneren Pfad /store, und SELF_KEYS sagt nur,
            ob dieser Pfad zum Tab selbst gehoert oder zur Bruecke. */}
        <Route path="/store/*" element={routeFor('store', <Store />, { type: 'modelle' })} />
        <Route path="*" element={<Navigate to={resetTo} replace />} />
      </Routes>
    </IsolatedMemoryRouter>
  );
}

/**
 * Rendert den aktiven Tab mit eigener ErrorBoundary (das Keep-Alive für den
 * n8n-iframe ist mit Phase B5 gefallen) — ein Renderfehler in einem Tab darf die Shell
 * nicht mitreißen.
 */
export function TabContent({ themeControls }: TabContentProps) {
  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);

  const mounted = tabs.filter(t => t.id === activeTabId);

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
              <FeatureTabHost tab={tab} themeControls={themeControls} />
            </Suspense>
          </ComponentErrorBoundary>
        </div>
      ))}
    </>
  );
}
