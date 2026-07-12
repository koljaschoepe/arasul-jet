/**
 * Plattform-Apps im Extensions-Tab: die kuratierten Kern-Apps (n8n,
 * Telegram, Datenbank) lassen sich hier an-/abschalten. Deaktivierte Apps
 * verschwinden aus ActivityBar und Tab-Angebot der Workspace-Shell — die
 * Dienste selbst laufen weiter. Datenbasis: useWorkspaceApps (React Query),
 * dadurch wirkt ein Toggle sofort in der ActivityBar.
 */
import { Workflow, Send, Database, Blocks } from 'lucide-react';
import { Switch } from '@/components/ui/shadcn/switch';
import { useToast } from '@/contexts/ToastContext';
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps';

const APP_ICONS: Record<string, React.ReactNode> = {
  n8n: <Workflow className="h-4 w-4" aria-hidden="true" />,
  telegram: <Send className="h-4 w-4" aria-hidden="true" />,
  database: <Database className="h-4 w-4" aria-hidden="true" />,
};

export default function PlatformAppsSection() {
  const { apps, isLoading, setAppEnabled } = useWorkspaceApps();
  const toast = useToast();

  if (isLoading || apps.length === 0) return null;

  return (
    <section className="mb-6" aria-label="Plattform-Apps" data-testid="platform-apps">
      <div className="mb-2 flex items-center gap-2">
        <Blocks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">Plattform-Apps</h2>
        <span className="text-xs text-muted-foreground">
          Sichtbarkeit im Workspace — Dienste laufen weiter
        </span>
      </div>
      <ul className="overflow-hidden rounded-lg border border-border">
        {apps.map(app => (
          <li
            key={app.id}
            className="flex items-center gap-3 bg-card px-3 py-2.5 not-last:border-b not-last:border-border"
          >
            <span className="text-muted-foreground">{APP_ICONS[app.id]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{app.name}</p>
              <p className="truncate text-xs text-muted-foreground">{app.description}</p>
            </div>
            <Switch
              checked={app.enabled}
              aria-label={`${app.name} ${app.enabled ? 'deaktivieren' : 'aktivieren'}`}
              onCheckedChange={async checked => {
                try {
                  await setAppEnabled(app.id, checked);
                  toast.success(
                    checked ? `${app.name} aktiviert` : `${app.name} im Workspace ausgeblendet`
                  );
                } catch {
                  toast.error('Änderung konnte nicht gespeichert werden');
                }
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
