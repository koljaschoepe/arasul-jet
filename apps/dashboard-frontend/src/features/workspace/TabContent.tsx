import { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Meldung } from '@marken';
import { IsolatedMemoryRouter } from './IsolatedMemoryRouter';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SkeletonCard, SkeletonText } from '@/components/ui/Skeleton';
import { useWorkspaceStore, tabToPath, nurFuerAdmin } from '@/stores/workspaceStore';
import { useAuth } from '@/contexts/AuthContext';
import type { WorkspaceTab, WorkspaceTabSpec } from '@/stores/workspaceStore';
import { Uebersicht } from '@/features/apps/Uebersicht';
import { AppRahmen } from '@/features/apps/AppRahmen';
import { OffeneFreigaben } from '@/features/freigaben/OffeneFreigaben';
import { lazyNachladen } from '@/utils/lazyNachladen';

const Settings = lazyNachladen(() => import('@/features/settings/Settings'));
const ModelleAnsicht = lazyNachladen(() => import('@/features/modelle/ModelleAnsicht'));

/**
 * Was die Shell von aussen braucht: das Abmelden, und sonst nichts.
 *
 * Bis Phase H1 hiess das hier `TabThemeControls` und trug `theme` und
 * `onToggleTheme` durch vier Ebenen bis in die Einstellungen -- wo sie
 * niemand las: `GeneralSettings` nahm das Theme schon seit laengerem direkt
 * aus `useTheme()`, und einen Knopf fuer `onToggleTheme` gab es nirgends.
 * Seit H1 kommt das Theme ohnehin vom Angemeldeten und nicht aus der Shell.
 */
export interface ShellHandgriffe {
  onLogout: () => Promise<void>;
}

interface TabContentProps {
  handgriffe: ShellHandgriffe;
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
 * Der Startpfad im MemoryRouter des Einstellungen-Tabs. Er ist der letzte
 * Tab-Typ mit einer Legacy-Adresse; `dashboard`, `app` (D1) und seit D5 auch
 * `modelle` sind ohne Router gebaut, ihr Zustand steht im Workspace-Store,
 * im iframe der App oder in der Abfrage.
 */
const EINSTELLUNGEN_PFAD = '/settings';

/**
 * Die Weiche für den Inhalt eines Tabs.
 *
 * Drei Typen rendern direkt: Übersicht und App (D1) und die Modelle (D5).
 * Übrig bleibt die Einstellungsseite, die an ihrer Legacy-Adresse hängt und
 * deshalb in einem eigenen MemoryRouter läuft; fremde Pfade darin übersetzt
 * die TabBridge in Tab-Öffnungen.
 */
export function FeatureTabHost({
  tab,
  handgriffe,
}: {
  tab: WorkspaceTab;
  handgriffe: ShellHandgriffe;
}) {
  // Diese drei stehen VOR dem Router und nicht darin: sie haben keine
  // Legacy-Adresse, an die eine Brücke führen könnte. Diese Weiche ruft selbst
  // keinen Hook auf — deshalb darf sie vorzeitig zurückkehren.
  if (tab.type === 'dashboard') {
    // Die Shell ist die EINE Stelle, die quer zusammensetzt (Regel des
    // Ordners: `features/X/` importiert nichts aus `features/Y/`). Die
    // Übersicht bekommt die Freigaben deshalb hereingereicht, statt sie zu
    // kennen — Phase D2.
    return <Uebersicht freigaben={<OffeneFreigaben />} />;
  }
  if (tab.type === 'modelle') {
    return <ModelleAnsicht />;
  }
  if (tab.type === 'app') {
    // Ohne Kennung ist der Tab keiner. Die Store-Migration wirft solche Tabs
    // weg (v10); hier steht der Fall trotzdem, weil `appId` im Typ optional
    // ist und ein `!` an dieser Stelle nur die Frage verstecken würde.
    return tab.appId ? (
      <AppRahmen appId={tab.appId} stand={tab.stand ?? 'live'} />
    ) : (
      <div className="p-ui-4">
        <Meldung art="warnung" titel="Dieser Tab zeigt auf keine App.">
          Er kann nur aus einem von Hand veränderten Speicher stammen. Schließe ihn.
        </Meldung>
      </div>
    );
  }
  return <EinstellungenTab tab={tab} handgriffe={handgriffe} />;
}

/**
 * Der Einstellungen-Tab in seinem eigenen MemoryRouter.
 */
function EinstellungenTab({ tab, handgriffe }: { tab: WorkspaceTab; handgriffe: ShellHandgriffe }) {
  const resetTo = EINSTELLUNGEN_PFAD;

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

  return (
    <IsolatedMemoryRouter initialEntries={[startEintrag]}>
      <Routes>
        {/* Kein Dashboard-Tab mehr (Plan 008): "/" fällt auf den Startpfad des
            jeweiligen Tabs zurück. */}
        <Route path="/" element={<Navigate to={resetTo} replace />} />
        <Route path="/settings" element={<Settings handleLogout={handgriffe.onLogout} />} />
        {/* Ein Verweis aus den Einstellungen auf die Modelle öffnet den
            Modelle-Tab, statt ihn in diesen hineinzuziehen. */}
        <Route
          path="/store/*"
          element={<TabBridge makeSpec={() => ({ type: 'modelle' })} resetTo={resetTo} />}
        />
        <Route path="*" element={<Navigate to={resetTo} replace />} />
      </Routes>
    </IsolatedMemoryRouter>
  );
}

/**
 * Rendert den aktiven Tab mit eigener ErrorBoundary — ein Renderfehler in
 * einem Tab darf die Shell nicht mitreißen.
 *
 * EIN APP-TAB BLEIBT STEHEN, AUCH WENN ER NICHT VORN IST (Phase H2). Alle
 * anderen Tabs sind Ansichten dieser Shell: sie holen ihre Daten aus React
 * Query, und der Cache liegt über der Shell — was sie zeigen, ist nach einem
 * Neuaufbau dasselbe. Eine App ist ein FREMDES Dokument in einem iframe. Wird
 * sie abgeräumt, fängt sie von vorn an: ein halb ausgefülltes Formular ist
 * weg, ein laufender Vorgang wird neu geholt, und beim Theme-Wechsel — der
 * über den Einstellungen-Tab geht — lädt der Rahmen jedes Mal neu, obwohl der
 * Wechsel selbst ihn gar nicht anfasst (`AppRahmen`, H2).
 *
 * Der `hidden`-Zweig darunter stand für das Keep-Alive des n8n-iframes (B5)
 * schon da und lief seither leer; jetzt trägt er wieder etwas. Was nicht vorn
 * steht, ist `display: none`: die App wird nicht mehr gezeichnet und bekommt
 * kein Layout, aber sie bleibt im Dokument — deshalb lädt sie beim
 * Zurückkommen nicht neu. Sie läuft dabei weiter (ein Zeitgeber in ihr tickt
 * auch versteckt), und das ist der Preis: es sind die Apps, die der Mensch
 * selbst geöffnet hat, und er schließt sie über die Tab-Leiste.
 */
export function TabContent({ handgriffe }: TabContentProps) {
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);

  const mounted = tabs.filter(t => t.id === activeTabId || t.type === 'app');

  // Ohne offenen Tab hat auch ein stehen gebliebener App-Tab nichts zu zeigen:
  // `activeTabId` zeigt dann auf nichts, und jeder Gemountete wäre `hidden`.
  if (!tabs.some(t => t.id === activeTabId)) {
    return (
      <div className="p-ui-4">
        <Meldung titel="Kein Tab geöffnet">
          Wählen Sie links eine Ansicht, unter 900 px im Menü.
        </Meldung>
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
              <div className="p-ui-4" data-testid="tab-nur-admin">
                <Meldung titel={`${tab.title} ist der Verwaltung vorbehalten.`}>
                  Die Wege dahinter antworten mit 403, unabhängig davon, was hier steht.
                </Meldung>
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
                <FeatureTabHost tab={tab} handgriffe={handgriffe} />
              </Suspense>
            )}
          </ComponentErrorBoundary>
        </div>
      ))}
    </>
  );
}
