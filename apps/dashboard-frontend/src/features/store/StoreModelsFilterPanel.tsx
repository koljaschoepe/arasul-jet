/**
 * StoreModelsFilterPanel — die Modell-Filter (Suche · Typ · Größe · Status) für
 * die linke Sidebar (Plan 012 Phase C Schritt 7). Zuvor saß diese Leiste im
 * Content des StoreModelsGrid; jetzt lebt sie in der Sidebar-Ansicht »Modelle«
 * (features/workspace/sidebar/ModelsPanel) und teilt den Filterzustand über den
 * storeFilterStore mit dem Karten-Raster in der Mitte.
 */
import { useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/shadcn/input';
import { useStoreCatalog } from '@/hooks/useStoreCatalog';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { deriveModelFacets, activeFilterCount } from './storeModelFilters';
import { FacetGroup } from './FacetGroup';

export function StoreModelsFilterPanel() {
  const { models } = useStoreCatalog();
  const query = useStoreFilterStore(s => s.modelQuery);
  const setQuery = useStoreFilterStore(s => s.setModelQuery);
  const filters = useStoreFilterStore(s => s.modelFilters);
  const toggle = useStoreFilterStore(s => s.toggleModelFilter);
  const reset = useStoreFilterStore(s => s.resetModelFilters);

  const facets = useMemo(() => deriveModelFacets(models), [models]);
  const activeCount = activeFilterCount(filters);

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Modelle durchsuchen…"
          aria-label="Modelle durchsuchen"
          className="h-9 pl-8 pr-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Suche leeren"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

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
        selected={filters.types}
        onToggle={v => toggle('types', v)}
      />
      <FacetGroup
        title="Größe"
        options={facets.sizes}
        selected={filters.sizes}
        onToggle={v => toggle('sizes', v)}
      />
      <FacetGroup
        title="Status"
        options={facets.status}
        selected={filters.status}
        onToggle={v => toggle('status', v)}
      />

      {facets.types.length === 0 && facets.sizes.length === 0 && facets.status.length === 0 && (
        <p className="text-ui-sm text-muted-foreground">Noch keine Modelle im Katalog.</p>
      )}
    </div>
  );
}

export default StoreModelsFilterPanel;
