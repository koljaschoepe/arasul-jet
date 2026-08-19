/**
 * StoreExtensionsFilterPanel — die Sidebar-Ansicht »Erweiterungen«.
 *
 * Seit der Neuausrichtung KEINE Facetten-Checkboxen mehr (Typ/Zugriffs-Stufe/…):
 * bei einer überschaubaren, selbst gebauten Erweiterungs-Sammlung ist eine
 * einfache Freitext-Suche über Name und Beschreibung ehrlicher und schneller als
 * vier Filter-Gruppen. Die Suche teilt ihren Zustand über den `storeFilterStore`
 * mit dem Karten-Raster in der Mitte (StoreExtensionsGrid).
 */
import { SidebarSearch } from '@/components/ui/SidebarSearch';
import { useStoreFilterStore } from '@/stores/storeFilterStore';

export function StoreExtensionsFilterPanel() {
  const query = useStoreFilterStore(s => s.extQuery);
  const setQuery = useStoreFilterStore(s => s.setExtQuery);

  return (
    <div className="flex flex-col gap-3 p-3">
      <SidebarSearch
        value={query}
        onChange={setQuery}
        placeholder="Suchen…"
        ariaLabel="Erweiterungen durchsuchen"
      />
      <p className="px-1 text-ui-xs text-muted-foreground">
        Sucht in Name und Beschreibung aller Erweiterungen.
      </p>
    </div>
  );
}

export default StoreExtensionsFilterPanel;
