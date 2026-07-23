/**
 * Reine Filter-/Facetten-Logik für den Erweiterungen-Reiter (Plan 012 Phase C
 * Schritt 9). DOM-frei und deterministisch testbar — spiegelt bewusst die
 * Modell-Filter (storeModelFilters), damit beide Reiter dieselbe Sidebar-Mechanik
 * teilen.
 *
 * Facetten:
 *  - Bereich (`tab`: Automation, Datenbank, …) — nur Kern-Apps haben einen
 *  - Typ (App / Automation / Konnektor) und Zugriffs-Stufe — seit dem
 *    Erweiterungs-Baukasten (Phase E) tragen Kern-Apps UND selbst gebaute
 *    Erweiterungen diese Attribute
 *  - Status (aktiv / verfügbar, aus `enabled`)
 *
 * Bewusst strukturell typisiert (`FilterableExtension`): dieselbe Logik filtert
 * kuratierte Workspace-Apps und installierte Erweiterungs-Pakete.
 */
import type { FacetOption } from './storeModelFilters';
import { toggleValue } from './storeModelFilters';

export type ExtStatusFacet = 'active' | 'available';
export type ExtType = 'app' | 'flow' | 'tool';
export type AccessTier = 'internet' | 'internal' | 'full';

/** Das Minimum, das eine filterbare Erweiterung mitbringen muss. */
export interface FilterableExtension {
  id: string;
  enabled: boolean;
  /** Bereich/Tab — nur kuratierte Kern-Apps haben einen. */
  tab?: string;
  type?: ExtType;
  accessTier?: AccessTier;
}

export interface ExtensionFilterState {
  areas: string[];
  status: ExtStatusFacet[];
  /** Optional, damit ältere Aufrufer/Fixtures gültig bleiben. */
  types?: ExtType[];
  tiers?: AccessTier[];
}

export const EMPTY_EXTENSION_FILTERS: ExtensionFilterState = {
  areas: [],
  status: [],
  types: [],
  tiers: [],
};

export const EXT_STATUS_LABELS: Record<ExtStatusFacet, string> = {
  active: 'Aktiv',
  available: 'Verfügbar',
};

export const EXT_TYPE_LABELS: Record<ExtType, string> = {
  app: 'App',
  flow: 'Automation',
  tool: 'Konnektor',
};

/** Die drei Zugriffs-Stufen aus Plan 012 Phase E · Schritt 14. */
export const ACCESS_TIER_LABELS: Record<AccessTier, string> = {
  internet: 'Nur Internet',
  internal: 'Interne Dienste',
  full: 'Voller Zugriff',
};

const AREA_LABELS: Record<string, string> = {
  automationen: 'Automation',
  database: 'Datenbank',
};

export function areaLabel(tab: string): string {
  return AREA_LABELS[tab] ?? tab.charAt(0).toUpperCase() + tab.slice(1);
}

export function extTypeLabel(t: ExtType): string {
  return EXT_TYPE_LABELS[t] ?? t;
}

export function accessTierLabel(t: AccessTier): string {
  return ACCESS_TIER_LABELS[t] ?? t;
}

function statusOf(app: FilterableExtension): ExtStatusFacet {
  return app.enabled ? 'active' : 'available';
}

export function activeExtFilterCount(f: ExtensionFilterState): number {
  return f.areas.length + f.status.length + (f.types?.length ?? 0) + (f.tiers?.length ?? 0);
}

export function extensionMatches(app: FilterableExtension, filters: ExtensionFilterState): boolean {
  // Ein aktiver Facetten-Filter schließt Einträge ohne dieses Attribut aus —
  // ehrlicher, als ein fehlendes Attribut als Treffer durchzuwinken.
  if (filters.areas.length > 0 && (!app.tab || !filters.areas.includes(app.tab))) return false;
  if (filters.status.length > 0 && !filters.status.includes(statusOf(app))) return false;
  const types = filters.types ?? [];
  if (types.length > 0 && (!app.type || !types.includes(app.type))) return false;
  const tiers = filters.tiers ?? [];
  if (tiers.length > 0 && (!app.accessTier || !tiers.includes(app.accessTier))) return false;
  return true;
}

export function applyExtensionFilters<T extends FilterableExtension>(
  apps: T[],
  filters: ExtensionFilterState
): T[] {
  return apps.filter(a => extensionMatches(a, filters));
}

export interface ExtensionFacets {
  areas: FacetOption[];
  status: FacetOption<ExtStatusFacet>[];
  types: FacetOption<ExtType>[];
  tiers: FacetOption<AccessTier>[];
}

export function deriveExtensionFacets(apps: FilterableExtension[]): ExtensionFacets {
  const areaCount = new Map<string, number>();
  const statusCount = new Map<ExtStatusFacet, number>();
  const typeCount = new Map<ExtType, number>();
  const tierCount = new Map<AccessTier, number>();

  for (const a of apps) {
    if (a.tab) areaCount.set(a.tab, (areaCount.get(a.tab) ?? 0) + 1);
    const st = statusOf(a);
    statusCount.set(st, (statusCount.get(st) ?? 0) + 1);
    if (a.type) typeCount.set(a.type, (typeCount.get(a.type) ?? 0) + 1);
    if (a.accessTier) tierCount.set(a.accessTier, (tierCount.get(a.accessTier) ?? 0) + 1);
  }

  const areas: FacetOption[] = [...areaCount.entries()]
    .map(([value, count]) => ({ value, label: areaLabel(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const statusOrder: ExtStatusFacet[] = ['active', 'available'];
  const typeOrder: ExtType[] = ['app', 'flow', 'tool'];
  const tierOrder: AccessTier[] = ['internet', 'internal', 'full'];

  return {
    areas,
    status: statusOrder
      .filter(s => statusCount.has(s))
      .map(s => ({ value: s, label: EXT_STATUS_LABELS[s], count: statusCount.get(s) ?? 0 })),
    types: typeOrder
      .filter(t => typeCount.has(t))
      .map(t => ({ value: t, label: EXT_TYPE_LABELS[t], count: typeCount.get(t) ?? 0 })),
    tiers: tierOrder
      .filter(t => tierCount.has(t))
      .map(t => ({ value: t, label: ACCESS_TIER_LABELS[t], count: tierCount.get(t) ?? 0 })),
  };
}

export { toggleValue };
