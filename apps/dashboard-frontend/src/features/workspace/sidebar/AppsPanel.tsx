/**
 * Sidebar-Ansicht »Apps« — die linke Spalte des Zielbilds (Phase D1).
 *
 * Seit Phase B2 stand hier „Noch nichts hier": der Datei-Explorer, der die
 * Spalte füllte, ist mit dem Editor gefallen. Das Zielbild aus Beschluss 10
 * vom 26.08.2026 sagt, was stattdessen hingehört — die Apps, die dem
 * Angemeldeten freigegeben sind.
 *
 * Die Liste kommt aus `GET /api/apps/meine` und siebt über `app_members`
 * (Phase C2). Sie ist damit für Administrator und Mitarbeiter dieselbe Abfrage
 * mit demselben Ergebnisumfang; hier wird nichts nach Rolle ausgeblendet, weil
 * hier nichts nach Rolle verschieden ist.
 *
 * Ganz oben die **Übersicht**: ohne sie gäbe es keinen Weg zurück aus einer
 * App, wenn jemand den Tab der Mitte geschlossen hat.
 */
import { AppWindow, LayoutDashboard } from 'lucide-react';
import { useWorkspaceStore, tabId } from '@/stores/workspaceStore';
import { useMeineApps, zuEintraegen } from '@/features/apps/meineApps';
import { SkeletonText } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { SidebarView } from './SidebarView';

export function AppsPanel() {
  const openTab = useWorkspaceStore(s => s.openTab);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const { data: apps, isLoading, isError } = useMeineApps();

  const eintraege = zuEintraegen(apps ?? []);

  return (
    <SidebarView title="Apps">
      <ul className="flex flex-col py-1">
        <li>
          <button
            type="button"
            data-testid="apps-open-uebersicht"
            aria-current={activeTabId === 'dashboard' ? 'true' : undefined}
            onClick={() => openTab({ type: 'dashboard' })}
            className={cn(
              'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent/50',
              activeTabId === 'dashboard' && 'bg-accent/60'
            )}
          >
            <LayoutDashboard className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-foreground">Übersicht</span>
          </button>
        </li>

        {isLoading && (
          <li className="px-3 py-2">
            <SkeletonText lines={2} />
          </li>
        )}

        {/* Ein Fehler ist kein Leerzustand. „Keine Apps" und „ich konnte nicht
            fragen" sehen sonst gleich aus, und der zweite Fall schickt jemanden
            zum Administrator, der nichts falsch gemacht hat. */}
        {isError && (
          <li className="px-3 py-2 text-sm text-muted-foreground" data-testid="apps-fehler">
            Die App-Liste ließ sich nicht laden.
          </li>
        )}

        {!isLoading && !isError && eintraege.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground" data-testid="apps-leer">
            Noch keine App für dich freigegeben.
          </li>
        )}

        {eintraege.map(e => {
          const id = tabId({ type: 'app', appId: e.id, stand: e.stand });
          return (
            <li key={id}>
              <button
                type="button"
                data-testid={`apps-open-${e.id}-${e.stand}`}
                title={e.beschreibung || e.name}
                aria-current={activeTabId === id ? 'true' : undefined}
                onClick={() => openTab({ type: 'app', appId: e.id, stand: e.stand, title: e.name })}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent/50',
                  activeTabId === id && 'bg-accent/60'
                )}
              >
                <AppWindow className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-foreground">{e.name}</span>
                {e.stand === 'test' && (
                  <span className="shrink-0 rounded bg-warning/15 px-1.5 py-0.5 text-ui-xs font-medium text-warning">
                    Test
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </SidebarView>
  );
}
