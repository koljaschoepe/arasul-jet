/**
 * StoreExtensionsFilterPanel — die Erweiterungs-Filter für die linke Sidebar.
 * Seit dem Erweiterungs-Baukasten (Plan 012 Phase E) vier Facetten:
 * Typ · Zugriffs-Stufe · Bereich · Status. Die Facetten werden aus BEIDEN
 * Quellen abgeleitet — kuratierte Kern-Apps und installierte Pakete —, damit
 * die Zähler zu dem passen, was das Raster in der Mitte zeigt.
 */
import { useMemo } from 'react';
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps';
import { useExtensions } from '@/hooks/useExtensions';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { deriveExtensionFacets, activeExtFilterCount } from './storeExtensionFilters';
import type { FilterableExtension } from './storeExtensionFilters';
import { FacetGroup } from './FacetGroup';

export function StoreExtensionsFilterPanel() {
  const { apps } = useWorkspaceApps();
  const { extensions } = useExtensions();
  const filters = useStoreFilterStore(s => s.extFilters);
  const toggle = useStoreFilterStore(s => s.toggleExtFilter);
  const reset = useStoreFilterStore(s => s.resetExtFilters);

  const alle = useMemo<FilterableExtension[]>(() => [...apps, ...extensions], [apps, extensions]);
  const facets = useMemo(() => deriveExtensionFacets(alle), [alle]);
  const activeCount = activeExtFilterCount(filters);

  return (
    <div className="flex flex-col gap-4 p-3">
      {activeCount > 0 && (
        <button
          type="button"
          onClick={reset}
          className="self-start text-ui-xs text-primary hover:underline"
        >
          Filter zurücksetzen ({activeCount})
        </button>
      )}

      <FacetGroup
        title="Typ"
        options={facets.types}
        selected={filters.types ?? []}
        onToggle={v => toggle('types', v)}
      />
      <FacetGroup
        title="Zugriffs-Stufe"
        options={facets.tiers}
        selected={filters.tiers ?? []}
        onToggle={v => toggle('tiers', v)}
      />
      <FacetGroup
        title="Bereich"
        options={facets.areas}
        selected={filters.areas}
        onToggle={v => toggle('areas', v)}
      />
      <FacetGroup
        title="Status"
        options={facets.status}
        selected={filters.status}
        onToggle={v => toggle('status', v)}
      />

      {facets.areas.length === 0 &&
        facets.status.length === 0 &&
        facets.types.length === 0 &&
        facets.tiers.length === 0 && (
          <p className="text-ui-sm text-muted-foreground">Noch keine Erweiterungen.</p>
        )}
    </div>
  );
}

export default StoreExtensionsFilterPanel;
