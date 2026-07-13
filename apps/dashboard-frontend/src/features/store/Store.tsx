/**
 * Store / Extensions (3.1) — Liste links, Detail in der Mitte.
 *
 * Die früheren Unter-Tabs (Start / Modelle / Apps) mit NavLinks und globaler
 * Such-Overlay entfallen. Stattdessen:
 *   - im Workspace (variant="workspace"): NUR die Detailseite; die Liste liefert
 *     der SidebarHost über dieselbe ExtensionsSidebarList.
 *   - eigenständig (Legacy-Route /store): Liste + Detail nebeneinander, damit
 *     der alte Pfad ohne Workspace-Shell funktionsfähig bleibt.
 *
 * Alte Deep-Links /store/models und /store/apps (auch mit ?highlight=…) leiten
 * auf die neue Struktur um: Highlight → Auswahl im Extension-Store, dann /store.
 */
import { useEffect } from 'react';
import { Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { ExtensionsSidebarList } from '@/components/extensions/ExtensionsSidebarList';
import { useExtensionStore } from '@/stores/extensionStore';
import type { ExtensionKind } from '@/stores/extensionStore';
import { StoreDetailPage } from './StoreDetailPage';

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

function StoreContent({ variant }: { variant: StoreVariant }) {
  if (variant === 'workspace') {
    return <StoreDetailPage />;
  }
  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-lg border border-border">
      <aside className="w-72 shrink-0 overflow-hidden border-r border-border">
        <ExtensionsSidebarList />
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
