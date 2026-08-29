import { Cpu } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useStoreCatalog, isModelInstalled } from '@/hooks/useStoreCatalog';
import { modellAnzeigeName } from '@/utils/modelDisplay';
import { SkeletonText } from '@/components/ui/Skeleton';
import { cn } from '@marken';
import { SidebarView } from './SidebarView';

/**
 * Sidebar-Ansicht »Modelle« — die Kurzliste auf einen Blick (Phase D5).
 *
 * Bis D5 standen hier die Filter des Modell-Rasters: Suche, Typ, Größe,
 * Status. Sie sind mit dem Raster gefallen, denn seit C8 hat der Katalog vier
 * Einträge, und über vier Zeilen sucht niemand.
 *
 * Was jetzt hier steht, folgt derselben Form wie die Apps darüber (D1): die
 * Liste links, die Sache in der Mitte. Ein Klick öffnet den Modelle-Tab; die
 * Handgriffe (laden, Standard setzen, entfernen) stehen dort, nicht hier. Eine
 * Sidebar mit Knöpfen wäre eine zweite Bedienstelle für dieselbe Sache.
 */
export function ModelsPanel() {
  const openTab = useWorkspaceStore(s => s.openTab);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const { models, isLoading } = useStoreCatalog();

  return (
    <SidebarView title="Modelle">
      {isLoading ? (
        <div className="px-3 py-2">
          <SkeletonText lines={3} />
        </div>
      ) : (
        <ul className="flex flex-col py-1">
          {models.map(modell => (
            <li key={modell.id}>
              <button
                type="button"
                data-testid={`modelle-open-${modell.id}`}
                title={modell.description}
                onClick={() => openTab({ type: 'modelle' })}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent/50',
                  activeTabId === 'modelle' && 'bg-accent/60'
                )}
              >
                <Cpu className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {modellAnzeigeName(modell)}
                </span>
                {!isModelInstalled(modell) && (
                  <span
                    className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-ui-xs text-muted-foreground"
                    title="Dieses Modell liegt nicht am Gerät."
                  >
                    fehlt
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </SidebarView>
  );
}
