import { StoreExtensionsFilterPanel } from '@/features/store/StoreExtensionsFilterPanel';
import { SidebarView } from './SidebarView';

/**
 * Sidebar-Ansicht »Erweiterungen« (Plan 012 Phase C Schritt 9): die
 * Erweiterungs-Filter (Bereich · Status) sitzen hier in der Sidebar; das
 * Karten-Raster in der Mitte (StoreExtensionsGrid) liest denselben Filter. Die
 * Filter-UI lebt im Store-Feature (StoreExtensionsFilterPanel), diese Hülle
 * bindet sie in die Workspace-Sidebar ein.
 */
export function ExtensionsPanel() {
  return (
    <SidebarView title="Erweiterungen">
      <StoreExtensionsFilterPanel />
    </SidebarView>
  );
}
