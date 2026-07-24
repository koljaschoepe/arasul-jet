/**
 * StoreExtensionsFilterPanel — die Sidebar-Ansicht »Erweiterungen«.
 *
 * Seit der Neuausrichtung KEINE Facetten-Checkboxen mehr (Typ/Zugriffs-Stufe/…):
 * bei einer überschaubaren, selbst gebauten Erweiterungs-Sammlung ist eine
 * einfache Freitext-Suche über Name und Beschreibung ehrlicher und schneller als
 * vier Filter-Gruppen. Die Suche teilt ihren Zustand über den `storeFilterStore`
 * mit dem Karten-Raster in der Mitte (StoreExtensionsGrid).
 */
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/shadcn/input';
import { useStoreFilterStore } from '@/stores/storeFilterStore';

export function StoreExtensionsFilterPanel() {
  const query = useStoreFilterStore(s => s.extQuery);
  const setQuery = useStoreFilterStore(s => s.setExtQuery);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Erweiterungen durchsuchen…"
          aria-label="Erweiterungen durchsuchen"
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
      <p className="px-1 text-ui-xs text-muted-foreground">
        Sucht in Name und Beschreibung aller Erweiterungen.
      </p>
    </div>
  );
}

export default StoreExtensionsFilterPanel;
