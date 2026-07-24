/**
 * StoreExtensionsGrid — der „Erweiterungen"-Reiter des Stores (Full-Width-
 * Kartenraster). Zeigt die kuratierten Workspace-Apps (n8n, Datenbank, …) als
 * Karten mit Name, Kurzbeschreibung, Status-Badge (Aktiv/Inaktiv) und einem
 * An/Aus-Schalter. Der Schalter läuft über denselben `PUT /workspace-apps/:id`-
 * Fluss wie zuvor die Sidebar-Liste (useWorkspaceApps.setAppEnabled): der
 * Zustand propagiert sofort über den gemeinsamen React-Query-Cache, und beim
 * Deaktivieren schließt der Hook offene Mitte-Tabs der App. Ein Klick auf die
 * Karte (nicht den Schalter) öffnet die Detailseite über den Extension-Store.
 */
import { useMemo, useState } from 'react';
import { Package, Blocks } from 'lucide-react';
import { Badge } from '@/components/ui/shadcn/badge';
import { Switch } from '@/components/ui/shadcn/switch';
import { cn } from '@/lib/utils';
import { useToast } from '@/contexts/ToastContext';
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps';
import type { WorkspaceApp } from '@/hooks/useWorkspaceApps';
import { useExtensionStore } from '@/stores/extensionStore';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { useExtensions } from '@/hooks/useExtensions';
import type { InstalledExtension } from '@/hooks/useExtensions';
import {
  applyExtensionFilters,
  extensionQueryMatches,
  extTypeLabel,
  accessTierLabel,
} from './storeExtensionFilters';

function ExtensionCard({
  app,
  onToggle,
}: {
  app: WorkspaceApp;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
}) {
  const toast = useToast();
  const selectExtension = useExtensionStore(s => s.selectExtension);
  const [busy, setBusy] = useState(false);

  const handleToggle = async (checked: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await onToggle(app.id, checked);
      toast.success(checked ? `${app.name} aktiviert` : `${app.name} im Workspace ausgeblendet`);
    } catch {
      toast.error('Änderung konnte nicht gespeichert werden');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid={`ext-card-${app.id}`}
      className="flex flex-col rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
    >
      <button
        type="button"
        data-testid={`ext-open-${app.id}`}
        onClick={() => selectExtension({ kind: 'app', id: app.id })}
        className="flex flex-1 flex-col gap-2 rounded-t-lg p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-3.5">
            <Package aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{app.name}</span>
          <Badge
            variant="outline"
            className={cn(
              'h-5 shrink-0 px-1.5 text-ui-xs',
              app.enabled
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-muted text-muted-foreground'
            )}
          >
            {app.enabled ? 'Aktiv' : 'Inaktiv'}
          </Badge>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{app.description}</p>
      </button>

      <div className="flex items-center justify-between border-t border-border p-3">
        <span className="text-xs font-medium text-muted-foreground">
          {app.enabled ? 'Im Workspace sichtbar' : 'Im Workspace ausgeblendet'}
        </span>
        <Switch
          checked={app.enabled}
          disabled={busy}
          aria-label={`${app.name} ${app.enabled ? 'deaktivieren' : 'aktivieren'}`}
          onCheckedChange={handleToggle}
        />
      </div>
    </div>
  );
}

/**
 * Karte für ein installiertes Erweiterungs-Paket (Plan 012 Phase E · Schritt 16).
 * Trägt zusätzlich Typ, Zugriffs-Stufe und Herkunft — genau die Attribute, nach
 * denen die Sidebar filtert.
 */
function InstalledExtensionCard({
  ext,
  onToggle,
}: {
  ext: InstalledExtension;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
}) {
  const toast = useToast();
  const selectExtension = useExtensionStore(s => s.selectExtension);
  const [busy, setBusy] = useState(false);

  const handleToggle = async (checked: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await onToggle(ext.id, checked);
      toast.success(checked ? `${ext.name} aktiviert` : `${ext.name} deaktiviert`);
    } catch {
      toast.error('Änderung konnte nicht gespeichert werden');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid={`ext-card-${ext.id}`}
      className="flex flex-col rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
    >
      <button
        type="button"
        data-testid={`ext-open-${ext.id}`}
        onClick={() => selectExtension({ kind: 'extension', id: ext.id })}
        className="flex flex-1 flex-col gap-2 rounded-t-lg p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-3.5">
            <Blocks aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{ext.name}</span>
          <Badge
            variant="outline"
            className={cn(
              'h-5 shrink-0 px-1.5 text-ui-xs',
              ext.enabled
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-muted text-muted-foreground'
            )}
          >
            {ext.enabled ? 'Aktiv' : 'Inaktiv'}
          </Badge>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{ext.description}</p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="h-5 px-1.5 text-ui-xs">
            {extTypeLabel(ext.type)}
          </Badge>
          <Badge variant="outline" className="h-5 px-1.5 text-ui-xs">
            {accessTierLabel(ext.accessTier)}
          </Badge>
          <Badge variant="outline" className="h-5 px-1.5 text-ui-xs text-muted-foreground">
            v{ext.version}
          </Badge>
        </div>
      </button>

      <div className="flex items-center justify-between border-t border-border p-3">
        <span className="text-xs font-medium text-muted-foreground">
          {ext.source === 'built' ? 'Selbst gebaut' : 'Importiert'}
        </span>
        <Switch
          checked={ext.enabled}
          disabled={busy}
          aria-label={`${ext.name} ${ext.enabled ? 'deaktivieren' : 'aktivieren'}`}
          onCheckedChange={handleToggle}
        />
      </div>
    </div>
  );
}

export function StoreExtensionsGrid() {
  const { apps, setAppEnabled } = useWorkspaceApps();
  const { extensions, setExtensionEnabled } = useExtensions();
  const filters = useStoreFilterStore(s => s.extFilters);
  const query = useStoreFilterStore(s => s.extQuery);
  const selectExtension = useExtensionStore(s => s.selectExtension);

  // Facetten-Logik bleibt (heute leer), zusätzlich die Freitext-Suche über Name
  // und Beschreibung — das ist der aktive Filter in der Sidebar.
  const visible = useMemo(
    () =>
      applyExtensionFilters(apps, filters).filter(a =>
        extensionQueryMatches([a.name, a.description], query)
      ),
    [apps, filters, query]
  );
  const visibleExtensions = useMemo(
    () =>
      applyExtensionFilters(extensions, filters).filter(e =>
        extensionQueryMatches([e.name, e.description], query)
      ),
    [extensions, filters, query]
  );
  const isFiltered = query.trim().length > 0;
  const nothingVisible = visible.length === 0 && visibleExtensions.length === 0;

  return (
    <div
      className="flex h-full flex-col"
      data-testid="store-extensions-grid"
      aria-label="Erweiterungen"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(app => (
            <ExtensionCard key={app.id} app={app} onToggle={setAppEnabled} />
          ))}

          {visibleExtensions.map(ext => (
            <InstalledExtensionCard key={ext.id} ext={ext} onToggle={setExtensionEnabled} />
          ))}

          {/* Plan 012 Phase C Schritt 9: der frühere „kommt bald"-Platzhalter ist
              jetzt ein echter Einstieg in den Erweiterungs-Baukasten (öffnet die
              Detailseite, kind:'builder'). Nur ohne aktive Filter zeigen — bei
              gesetztem Filter ginge es um Erweiterungen, nicht ums Bauen. */}
          {!isFiltered && (
            <button
              type="button"
              data-testid="ext-builder-entry"
              onClick={() => selectExtension({ kind: 'builder', id: 'builder' })}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center outline-none transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4">
                <Blocks aria-hidden="true" />
              </span>
              <span className="text-ui-sm font-semibold text-foreground">
                Eigene Erweiterung bauen
              </span>
              <span className="text-ui-xs text-muted-foreground">
                Apps, n8n-Flows und Konnektoren über eine definierte Schnittstelle — Einstieg
                öffnen.
              </span>
            </button>
          )}
        </div>

        {nothingVisible && isFiltered && (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            Keine Erweiterungen passen zur Suche.
          </p>
        )}
      </div>
    </div>
  );
}

export default StoreExtensionsGrid;
