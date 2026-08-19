/**
 * Store / Erweiterungen — Full-Width-Kartenlayout mit eigener Detailseite.
 *
 * Der Store ist ein eigenständiger Full-Width-Bereich (Workspace-Tab vom Typ
 * `store`), NICHT mehr eine Liste in der Datei-Sidebar. Oben schalten zwei
 * Reiter um:
 *   - „Modelle" (StoreModelsGrid): LLM-/Embedding-Modelle als Kartenraster mit
 *     Größe, Status-Badge und Inline-Download (LIVE-Fortschritt).
 *   - „Erweiterungen" (StoreExtensionsGrid): Workspace-Apps (n8n, …) als Karten
 *     mit An/Aus-Schalter.
 * Ein Klick auf eine Karte öffnet die Detailseite (StoreDetailPage) mit einem
 * „← Zurück"-Knopf, der zurück ins Raster desselben Reiters führt. Die Auswahl
 * läuft über den ephemeren Extension-Store; die Detailseite ersetzt das Raster
 * im selben Tab (kein Router-Wechsel, keine Sackgasse mehr).
 *
 * Alte Deep-Links /store/models und /store/apps (auch mit ?highlight=…) leiten
 * auf /store um und setzen dabei die Auswahl im Extension-Store.
 */
import { useCallback, useEffect } from 'react';
import { Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useExtensionStore } from '@/stores/extensionStore';
import type { ExtensionKind, StoreTab } from '@/stores/extensionStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { StoreDetailPage } from './StoreDetailPage';
import { StoreModelsGrid } from './StoreModelsGrid';
import { StoreExtensionsGrid } from './StoreExtensionsGrid';

/** Alt-Deep-Link /store/models|apps(?highlight=id) → Auswahl setzen, /store. */
function HighlightRedirect({ kind }: { kind: ExtensionKind }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const selectExtension = useExtensionStore(s => s.selectExtension);
  const highlight = params.get('highlight');
  useEffect(() => {
    if (highlight) selectExtension({ kind, id: highlight });
    navigate('/store', { replace: true });
  }, [highlight, kind, navigate, selectExtension]);
  return null;
}

function StoreWorkspace({ bereich }: { bereich: StoreTab }) {
  // Plan 023 B7: welcher Bereich gezeigt wird, sagt der Tab, nicht mehr ein
  // Zustand nebenan. Der Reiter im extensionStore bleibt trotzdem gesetzt: die
  // Sidebar-Filter und die Detailseite lesen ihn.
  const tab = bereich;
  const setStoreTab = useExtensionStore(s => s.setStoreTab);
  const selected = useExtensionStore(s => s.selected);
  const clearSelection = useExtensionStore(s => s.clearSelection);
  const setActiveView = useWorkspaceStore(s => s.setActiveView);

  // Center-Reiter und Sidebar-Filter sind EINE Auswahl: ein Klick auf »Modelle«/
  // »Erweiterungen« in der Mitte stellt zugleich die passende Sidebar-Ansicht,
  // damit man nie die Erweiterungs-Facetten neben dem Modell-Raster sieht (der
  // frühere Auseinanderlauf von activeView und storeTab). Ohne Toggle, damit der
  // Reiter-Klick die Sidebar nicht ein-/ausklappt.
  const setTab = useCallback(
    (value: StoreTab) => {
      setStoreTab(value);
      setActiveView(value);
    },
    [setStoreTab, setActiveView]
  );

  // Der Tab sagt der Sidebar, welche Filter sie zeigen soll. Ohne das stuende
  // beim Wechsel auf den Modelle-Tab noch der Erweiterungs-Filter daneben.
  useEffect(() => {
    setStoreTab(bereich);
  }, [bereich, setStoreTab]);

  // Auswahl (Karte oder Deep-Link) → passenden Reiter aktivieren, damit „Zurück"
  // ins richtige Raster führt.
  useEffect(() => {
    if (selected?.kind === 'model') setTab('models');
    else if (selected?.kind === 'app' || selected?.kind === 'builder') setTab('extensions');
  }, [selected, setTab]);

  if (selected) {
    return (
      <div className="h-full min-h-0 overflow-hidden bg-background">
        <StoreDetailPage onBack={clearSelection} />
      </div>
    );
  }

  // Kein zweiter Modelle/Erweiterungen-Umschalter mehr in der Mitte (B3): die
  // ActivityBar links wechselt bereits zwischen »Modelle« und »Erweiterungen«,
  // und die Sidebar-Kopfzeile zeigt den aktiven Bereich. Der Reiter (`storeTab`)
  // bleibt der Zustand, den die ActivityBar setzt; die Mitte rendert nur noch
  // das passende Raster.
  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="store">
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'models' ? <StoreModelsGrid /> : <StoreExtensionsGrid />}
      </div>
    </div>
  );
}

function Store({ bereich = 'extensions' }: { bereich?: StoreTab }) {
  return (
    <ComponentErrorBoundary componentName={bereich === 'models' ? 'Modelle' : 'Erweiterungen'}>
      <Routes>
        <Route index element={<StoreWorkspace bereich={bereich} />} />
        <Route path="models" element={<HighlightRedirect kind="model" />} />
        <Route path="apps" element={<HighlightRedirect kind="app" />} />
        <Route path="*" element={<Navigate to="/store" replace />} />
      </Routes>
    </ComponentErrorBoundary>
  );
}

export default Store;
