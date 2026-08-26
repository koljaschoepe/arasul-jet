/**
 * Store / Modelle — Full-Width-Kartenraster mit eigener Detailseite.
 *
 * Der Store ist ein eigenständiger Full-Width-Bereich (Workspace-Tab
 * `modelle`): LLM-/Embedding-Modelle als Kartenraster (StoreModelsGrid) mit
 * Größe, Status-Badge und Inline-Download (LIVE-Fortschritt). Ein Klick auf
 * eine Karte öffnet die Detailseite (StoreDetailPage) mit einem „← Zurück"-
 * Knopf, der zurück ins Raster führt. Die Auswahl läuft über den ephemeren
 * Extension-Store; die Detailseite ersetzt das Raster im selben Tab (kein
 * Router-Wechsel, keine Sackgasse).
 *
 * Der Reiter „Erweiterungen" (Workspace-Apps und selbst gebaute Pakete) ist
 * mit Phase B3 (26.08.2026) gefallen; der alte Deep-Link /store/apps landet
 * wie jeder unbekannte Pfad auf dem Raster. /store/models(?highlight=…)
 * leitet weiter auf /store und setzt dabei die Auswahl.
 */
import { useEffect } from 'react';
import { Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useExtensionStore } from '@/stores/extensionStore';
import { StoreDetailPage } from './StoreDetailPage';
import { StoreModelsGrid } from './StoreModelsGrid';

/** Alt-Deep-Link /store/models(?highlight=id) → Auswahl setzen, /store. */
function HighlightRedirect() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const selectExtension = useExtensionStore(s => s.selectExtension);
  const highlight = params.get('highlight');
  useEffect(() => {
    if (highlight) selectExtension({ kind: 'model', id: highlight });
    navigate('/store', { replace: true });
  }, [highlight, navigate, selectExtension]);
  return null;
}

function StoreWorkspace() {
  const selected = useExtensionStore(s => s.selected);
  const clearSelection = useExtensionStore(s => s.clearSelection);

  if (selected) {
    return (
      <div className="h-full min-h-0 overflow-hidden bg-background">
        <StoreDetailPage onBack={clearSelection} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="store">
      <div className="min-h-0 flex-1 overflow-hidden">
        <StoreModelsGrid />
      </div>
    </div>
  );
}

function Store() {
  return (
    <ComponentErrorBoundary componentName="Modelle">
      <Routes>
        <Route index element={<StoreWorkspace />} />
        <Route path="models" element={<HighlightRedirect />} />
        <Route path="*" element={<Navigate to="/store" replace />} />
      </Routes>
    </ComponentErrorBoundary>
  );
}

export default Store;
