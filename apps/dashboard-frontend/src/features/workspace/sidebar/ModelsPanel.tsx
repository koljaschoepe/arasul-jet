import { Cpu } from 'lucide-react';
import { Badge, Liste, ListenEintrag } from '@marken';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useStoreCatalog, isModelInstalled } from '@/hooks/useStoreCatalog';
import { modellAnzeigeName } from '@/utils/modelDisplay';
import { SkeletonText } from '@/components/ui/Skeleton';
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
 *
 * Und seit H5 ist es auch dieselbe LISTE: `Liste dicht` aus `@marken`, wie
 * die Apps und wie das Hamburger-Menü aus D7.
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
        <div className="py-1">
          <Liste dicht>
            {models.map(modell => (
              <ListenEintrag
                key={modell.id}
                titel={modellAnzeigeName(modell)}
                symbol={<Cpu />}
                erklaerung={modell.description}
                aktiv={activeTabId === 'modelle'}
                kennzeichen={`modelle-open-${modell.id}`}
                hinweis={
                  isModelInstalled(modell) ? undefined : (
                    <Badge variant="outline" title="Dieses Modell liegt nicht am Gerät.">
                      fehlt
                    </Badge>
                  )
                }
                onKlick={() => openTab({ type: 'modelle' })}
              />
            ))}
          </Liste>
        </div>
      )}
    </SidebarView>
  );
}
