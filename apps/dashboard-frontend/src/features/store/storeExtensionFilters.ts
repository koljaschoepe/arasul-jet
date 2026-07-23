/**
 * Reine Filter-/Facetten-Logik für den Erweiterungen-Reiter (Plan 012 Phase C
 * Schritt 9). DOM-frei und deterministisch testbar — spiegelt bewusst die
 * Modell-Filter (storeModelFilters), damit beide Reiter dieselbe Sidebar-Mechanik
 * teilen.
 *
 * Facetten über die HEUTE vorhandenen Daten der Workspace-Apps:
 *  - Bereich (`tab`: Automation, Datenbank, …)
 *  - Status  (aktiv / verfügbar, aus `enabled`)
 *
 * Die reichere Taxonomie aus dem Plan (Typ App/Flow/Konnektor, Zugriffs-Stufe)
 * bekommt erst der Erweiterungs-Baukasten (Phase E) die nötigen Attribute; sie
 * folgt dort, statt hier über einer einzigen Kern-App fingiert zu werden.
 */
import type { WorkspaceApp } from '@/hooks/useWorkspaceApps';
import type { FacetOption } from './storeModelFilters';
import { toggleValue } from './storeModelFilters';

export type ExtStatusFacet = 'active' | 'available';

export interface ExtensionFilterState {
  areas: string[];
  status: ExtStatusFacet[];
}

export const EMPTY_EXTENSION_FILTERS: ExtensionFilterState = {
  areas: [],
  status: [],
};

export const EXT_STATUS_LABELS: Record<ExtStatusFacet, string> = {
  active: 'Aktiv',
  available: 'Verfügbar',
};

const AREA_LABELS: Record<string, string> = {
  automationen: 'Automation',
  database: 'Datenbank',
};

export function areaLabel(tab: string): string {
  return AREA_LABELS[tab] ?? tab.charAt(0).toUpperCase() + tab.slice(1);
}

function statusOf(app: WorkspaceApp): ExtStatusFacet {
  return app.enabled ? 'active' : 'available';
}

export function activeExtFilterCount(f: ExtensionFilterState): number {
  return f.areas.length + f.status.length;
}

export function extensionMatches(app: WorkspaceApp, filters: ExtensionFilterState): boolean {
  if (filters.areas.length > 0 && !filters.areas.includes(app.tab)) return false;
  if (filters.status.length > 0 && !filters.status.includes(statusOf(app))) return false;
  return true;
}

export function applyExtensionFilters(
  apps: WorkspaceApp[],
  filters: ExtensionFilterState
): WorkspaceApp[] {
  return apps.filter(a => extensionMatches(a, filters));
}

export interface ExtensionFacets {
  areas: FacetOption[];
  status: FacetOption<ExtStatusFacet>[];
}

export function deriveExtensionFacets(apps: WorkspaceApp[]): ExtensionFacets {
  const areaCount = new Map<string, number>();
  const statusCount = new Map<ExtStatusFacet, number>();

  for (const a of apps) {
    areaCount.set(a.tab, (areaCount.get(a.tab) ?? 0) + 1);
    const st = statusOf(a);
    statusCount.set(st, (statusCount.get(st) ?? 0) + 1);
  }

  const areas: FacetOption[] = [...areaCount.entries()]
    .map(([value, count]) => ({ value, label: areaLabel(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const statusOrder: ExtStatusFacet[] = ['active', 'available'];
  return {
    areas,
    status: statusOrder
      .filter(s => statusCount.has(s))
      .map(s => ({ value: s, label: EXT_STATUS_LABELS[s], count: statusCount.get(s) ?? 0 })),
  };
}

export { toggleValue };
