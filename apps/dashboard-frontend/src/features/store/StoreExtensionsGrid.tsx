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
import { useState } from 'react';
import { Package, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/shadcn/badge';
import { Switch } from '@/components/ui/shadcn/switch';
import { cn } from '@/lib/utils';
import { useToast } from '@/contexts/ToastContext';
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps';
import type { WorkspaceApp } from '@/hooks/useWorkspaceApps';
import { useExtensionStore } from '@/stores/extensionStore';

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

export function StoreExtensionsGrid() {
  const { apps, setAppEnabled } = useWorkspaceApps();

  return (
    <div
      className="flex h-full flex-col"
      data-testid="store-extensions-grid"
      aria-label="Erweiterungen"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {apps.map(app => (
            <ExtensionCard key={app.id} app={app} onToggle={setAppEnabled} />
          ))}

          {/* Plan 009: ehrlicher Ausblick auf den selbst-baubaren Marktplatz
              (eigene Extension-Schnittstelle) — die echte Upload-Funktion kommt
              in Plan 010. Bewusst nicht klickbar, kein Fake. */}
          <div
            data-testid="ext-coming-soon"
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center"
          >
            <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
              <Upload aria-hidden="true" />
            </span>
            <span className="text-ui-sm font-semibold text-foreground">
              Eigene Erweiterungen hochladen
            </span>
            <span className="text-ui-xs text-muted-foreground">
              Baue eigene Erweiterungen über eine definierte Schnittstelle — kommt bald.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StoreExtensionsGrid;
