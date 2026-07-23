import { StoreModelsFilterPanel } from '@/features/store/StoreModelsFilterPanel';
import { SidebarView } from './SidebarView';

/**
 * Sidebar-Ansicht »Modelle« (Plan 012 Phase C Schritt 7): die Modell-Filter
 * (Suche · Typ · Größe · Status) sitzen jetzt hier in der Sidebar; das Karten-
 * Raster in der Mitte (StoreModelsGrid) liest denselben Filterzustand. Die
 * Filter-UI selbst lebt im Store-Feature (StoreModelsFilterPanel), diese Hülle
 * bindet sie nur in die Workspace-Sidebar ein.
 */
export function ModelsPanel() {
  return (
    <SidebarView title="Modelle">
      <StoreModelsFilterPanel />
    </SidebarView>
  );
}
