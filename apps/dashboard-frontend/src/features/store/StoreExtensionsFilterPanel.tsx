/**
 * StoreExtensionsFilterPanel — die Erweiterungs-Filter (Bereich · Status) für
 * die linke Sidebar (Plan 012 Phase C Schritt 9). Parallel zu den Modell-Filtern
 * (StoreModelsFilterPanel): das Karten-Raster in der Mitte (StoreExtensionsGrid)
 * liest denselben Filterzustand aus dem storeFilterStore.
 */
import { useMemo } from 'react';
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { deriveExtensionFacets, activeExtFilterCount } from './storeExtensionFilters';
import { FacetGroup } from './FacetGroup';

export function StoreExtensionsFilterPanel() {
  const { apps } = useWorkspaceApps();
  const filters = useStoreFilterStore(s => s.extFilters);
  const toggle = useStoreFilterStore(s => s.toggleExtFilter);
  const reset = useStoreFilterStore(s => s.resetExtFilters);

  const facets = useMemo(() => deriveExtensionFacets(apps), [apps]);
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

      {facets.areas.length === 0 && facets.status.length === 0 && (
        <p className="text-ui-sm text-muted-foreground">Noch keine Erweiterungen.</p>
      )}
    </div>
  );
}

export default StoreExtensionsFilterPanel;
