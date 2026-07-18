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
import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { Cpu, Package } from 'lucide-react';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { cn } from '@/lib/utils';
import { useExtensionStore } from '@/stores/extensionStore';
import type { ExtensionKind } from '@/stores/extensionStore';
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

type StoreTab = 'models' | 'extensions';

const STORE_TABS: ReadonlyArray<{ value: StoreTab; label: string; icon: React.ReactNode }> = [
  { value: 'models', label: 'Modelle', icon: <Cpu aria-hidden="true" /> },
  { value: 'extensions', label: 'Erweiterungen', icon: <Package aria-hidden="true" /> },
];

function StoreWorkspace() {
  const [tab, setTab] = useState<StoreTab>('models');
  const selected = useExtensionStore(s => s.selected);
  const clearSelection = useExtensionStore(s => s.clearSelection);

  // Auswahl (Karte oder Deep-Link) → passenden Reiter aktivieren, damit „Zurück"
  // ins richtige Raster führt.
  useEffect(() => {
    if (selected?.kind === 'model') setTab('models');
    else if (selected?.kind === 'app') setTab('extensions');
  }, [selected]);

  if (selected) {
    return (
      <div className="h-full min-h-0 overflow-hidden bg-background">
        <StoreDetailPage onBack={clearSelection} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="store">
      <div
        role="tablist"
        aria-label="Store-Bereich"
        className="flex shrink-0 gap-1 border-b border-border px-3 py-2"
      >
        {STORE_TABS.map(t => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            data-testid={`store-tab-${t.value}`}
            onClick={() => setTab(t.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-ui-sm font-medium transition-colors [&_svg]:size-4',
              tab === t.value
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'models' ? <StoreModelsGrid /> : <StoreExtensionsGrid />}
      </div>
    </div>
  );
}

function Store() {
  return (
    <ComponentErrorBoundary componentName="Erweiterungen">
      <Routes>
        <Route index element={<StoreWorkspace />} />
        <Route path="models" element={<HighlightRedirect kind="model" />} />
        <Route path="apps" element={<HighlightRedirect kind="app" />} />
        <Route path="*" element={<Navigate to="/store" replace />} />
      </Routes>
    </ComponentErrorBoundary>
  );
}

export default Store;
