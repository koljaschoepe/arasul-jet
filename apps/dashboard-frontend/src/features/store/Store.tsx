/**
 * Store / Extensions — Liste links, Detail in der Mitte (Plan 008 · Schritt 15).
 *
 * Die linke Liste hat zwei Reiter:
 *   - „Modelle" (StoreModelsList): alle LLM-/Embedding-Modelle mit Größe, Status
 *     und LIVE-Download-Fortschritt — ruhig/übersichtlich.
 *   - „Erweiterungen" (ExtensionsSidebarList): Apps als schlichte An/Aus-Liste.
 * Die Reiter schalten NUR die linke Liste um; die Detailseite in der Mitte
 * (StoreDetailPage) bleibt geteilt und reagiert auf die Auswahl (Extension-Store).
 *
 *   - im Workspace (variant="workspace"): NUR die Detailseite; die Liste liefert
 *     der SidebarHost über die ExtensionsSidebarList.
 *   - eigenständig (Route /store): die Zwei-Reiter-Liste + Detail nebeneinander.
 *
 * Alte Deep-Links /store/models und /store/apps (auch mit ?highlight=…) leiten
 * auf die neue Struktur um: Highlight → Auswahl im Extension-Store, dann /store.
 */
import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { Cpu, Package } from 'lucide-react';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { ExtensionsSidebarList } from '@/components/extensions/ExtensionsSidebarList';
import { cn } from '@/lib/utils';
import { useExtensionStore } from '@/stores/extensionStore';
import type { ExtensionKind } from '@/stores/extensionStore';
import { StoreDetailPage } from './StoreDetailPage';
import { StoreModelsList } from './StoreModelsList';

type StoreVariant = 'standalone' | 'workspace';

interface StoreProps {
  variant?: StoreVariant;
}

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

/** Zwei-Reiter-Liste links: „Modelle" (Katalog + Fortschritt) / „Erweiterungen" (An/Aus). */
function StoreSidebar() {
  const [tab, setTab] = useState<StoreTab>('models');
  return (
    <div className="flex h-full flex-col bg-background" data-testid="store-sidebar">
      <div
        role="tablist"
        aria-label="Store-Bereich"
        className="flex shrink-0 gap-1 border-b border-border p-1.5"
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
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-ui-sm font-medium transition-colors [&_svg]:size-3.5',
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
        {tab === 'models' ? <StoreModelsList /> : <ExtensionsSidebarList />}
      </div>
    </div>
  );
}

function StoreContent({ variant }: { variant: StoreVariant }) {
  if (variant === 'workspace') {
    return <StoreDetailPage />;
  }
  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-lg border border-border">
      <aside className="w-72 shrink-0 overflow-hidden border-r border-border">
        <StoreSidebar />
      </aside>
      <div className="min-w-0 flex-1 overflow-hidden bg-background">
        <StoreDetailPage />
      </div>
    </div>
  );
}

function Store({ variant = 'standalone' }: StoreProps) {
  return (
    <ComponentErrorBoundary componentName="Extensions">
      <Routes>
        <Route index element={<StoreContent variant={variant} />} />
        <Route path="models" element={<HighlightRedirect kind="model" />} />
        <Route path="apps" element={<HighlightRedirect kind="app" />} />
        <Route path="*" element={<Navigate to="/store" replace />} />
      </Routes>
    </ComponentErrorBoundary>
  );
}

export default Store;
