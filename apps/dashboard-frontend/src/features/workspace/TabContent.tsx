import React, { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { IsolatedMemoryRouter } from './IsolatedMemoryRouter';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SkeletonCard, SkeletonText } from '@/components/ui/Skeleton';
import { useWorkspaceStore, tabToPath, nurFuerAdmin } from '@/stores/workspaceStore';
import { useAuth } from '@/contexts/AuthContext';
import type { WorkspaceTab, WorkspaceTabSpec } from '@/stores/workspaceStore';
import { Uebersicht } from '@/features/apps/Uebersicht';
import { AppRahmen } from '@/features/apps/AppRahmen';

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

/**
 * Die Tab-Typen, die aus der Zeit der Legacy-Routen stammen und deshalb einen
 * eigenen MemoryRouter brauchen. `dashboard` und `app` (Phase D1) gehören
 * NICHT dazu: sie sind ohne Router gebaut, ihr Zustand steht im Workspace-Store
 * bzw. im iframe der App. Einen Router um sie zu legen hieße, ihnen eine
 * zweite, unsichtbare Adresse zu geben, die niemand benutzt.
 */
type RouterTabTyp = 'settings' | 'modelle';

/** Legacy-Startpfad je Tab-Typ (für den MemoryRouter des Tabs). */
function initialPathFor(typ: RouterTabTyp): string {
  switch (typ) {
    case 'settings':
      return '/settings';
    case 'modelle':
      return '/store';
  }
}

/** Welche Route-Keys gehören zum Tab selbst (statt zur Bridge)? */
const SELF_KEYS: Record<RouterTabTyp, ReadonlySet<string>> = {
  settings: new Set(['settings']),
  modelle: new Set(['store']),
};

/**
 * Die Weiche für den Inhalt eines Tabs.
 *
 * Zwei Typen (Übersicht und App, Phase D1) rendern direkt. Die übrigen sind
 * Router-gekoppelte Features aus der Zeit der Legacy-Pfade und laufen je in
 * einem eigenen MemoryRouter (`RouterTab`) — dadurch funktionieren Store und
 * Einstellungen ohne Eingriff in ihren Code als Tab.
 */
export function FeatureTabHost({
  tab,
  themeControls,
}: {
  tab: WorkspaceTab;
  themeControls: TabThemeControls;
}) {
  // Die zwei Typen aus D1 stehen VOR dem Router und nicht darin: sie haben
  // keine Legacy-Adresse, an die eine Brücke führen könnte, und ihr Zustand
  // steht im Workspace-Store bzw. im iframe der App. Diese Weiche ruft selbst
  // keinen Hook auf — deshalb darf sie vorzeitig zurückkehren.
  if (tab.type === 'dashboard') {
    return <Uebersicht />;
  }
  if (tab.type === 'app') {
    // Ohne Kennung ist der Tab keiner. Die Store-Migration wirft solche Tabs
    // weg (v10); hier steht der Fall trotzdem, weil `appId` im Typ optional
    // ist und ein `!` an dieser Stelle nur die Frage verstecken würde.
    return tab.appId ? (
      <AppRahmen appId={tab.appId} stand={tab.stand ?? 'live'} />
    ) : (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Dieser Tab zeigt auf keine App.
      </div>
    );
  }
  return <RouterTab typ={tab.type} tab={tab} themeControls={themeControls} />;
}

/**
 * Ein Tab, dessen Feature an einen Router gekoppelt ist (Einstellungen,
 * Modelle). Er bekommt einen eigenen MemoryRouter mit der Legacy-Route des
 * Features; fremde Pfade übersetzt die TabBridge in Tab-Öffnungen.
 */
function RouterTab({
  typ,
  tab,
  themeControls,
}: {
  typ: RouterTabTyp;
  tab: WorkspaceTab;
  themeControls: TabThemeControls;
}) {
  const resetTo = initialPathFor(typ);
  const self = SELF_KEYS[typ];

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
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
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
            {/* Ein Admin-Tab, der im gespeicherten Stand eines Mitarbeiters
                liegt (er war einmal Administrator), zeigt einen Satz statt
                einer Seite, die bei jedem Handgriff 403 sagt. */}
            {!istAdmin && nurFuerAdmin(tab.type) ? (
              <div
                className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground"
                data-testid="tab-nur-admin"
              >
                {tab.title} ist der Verwaltung vorbehalten.
              </div>
            ) : (
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
            )}
          </ComponentErrorBoundary>
        </div>
      ))}
    </>
  );
}
