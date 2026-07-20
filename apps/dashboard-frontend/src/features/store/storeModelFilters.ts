/**
 * Reine Filter-/Facetten-Logik für den Modell-Store (Plan 009).
 *
 * DOM-frei und deterministisch testbar. Die Facetten (Fähigkeit, Typ, Größe,
 * Status) werden aus dem Katalog abgeleitet; die Größen-Buckets aus dem
 * RAM-Bedarf (Fallback: Dateigröße). Angelehnt an moderne Modell-Browser
 * (LM Studio / Jan / Hugging Face): Facetten-Zähler + Mehrfachauswahl.
 */
import type { CatalogModel } from '@/hooks/useStoreCatalog';
import { isModelInstalled } from '@/hooks/useStoreCatalog';

export type SizeBucket = 'klein' | 'mittel' | 'gross';
export type StatusFacet = 'installed' | 'available';

export interface ModelFilterState {
  capabilities: string[];
  types: string[];
  sizes: SizeBucket[];
  status: StatusFacet[];
}

export const EMPTY_MODEL_FILTERS: ModelFilterState = {
  capabilities: [],
  types: [],
  sizes: [],
  status: [],
};

export const SIZE_LABELS: Record<SizeBucket, string> = {
  klein: 'Klein (< 8 GB)',
  mittel: 'Mittel (8–16 GB)',
  gross: 'Groß (> 16 GB)',
};

export const STATUS_LABELS: Record<StatusFacet, string> = {
  installed: 'Installiert',
  available: 'Verfügbar',
};

/** Größen-Bucket aus RAM-Bedarf (GB), Fallback Dateigröße. */
export function sizeBucketOf(model: CatalogModel): SizeBucket {
  const gb =
    model.ram_required_gb && model.ram_required_gb > 0
      ? model.ram_required_gb
      : model.size_bytes
        ? model.size_bytes / 1_000_000_000
        : 0;
  if (gb > 0 && gb < 8) return 'klein';
  if (gb > 16) return 'gross';
  return 'mittel';
}

function statusOf(model: CatalogModel): StatusFacet {
  return isModelInstalled(model) ? 'installed' : 'available';
}

/** True, wenn kein Filter gesetzt ist. */
export function isFilterEmpty(f: ModelFilterState): boolean {
  return (
    f.capabilities.length === 0 &&
    f.types.length === 0 &&
    f.sizes.length === 0 &&
    f.status.length === 0
  );
}

/** Anzahl aktiver Einzel-Filter (für die Chip-Leiste / „Zurücksetzen"). */
export function activeFilterCount(f: ModelFilterState): number {
  return f.capabilities.length + f.types.length + f.sizes.length + f.status.length;
}

/**
 * Ein Modell gegen Suchtext + Filterzustand prüfen. Innerhalb einer Gruppe
 * gilt ODER (mind. ein gewählter Wert passt), zwischen Gruppen UND.
 */
export function modelMatches(
  model: CatalogModel,
  filters: ModelFilterState,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (q !== '') {
    const hay = `${model.name} ${model.description}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (filters.types.length > 0 && !(model.model_type && filters.types.includes(model.model_type))) {
    return false;
  }
  if (filters.sizes.length > 0 && !filters.sizes.includes(sizeBucketOf(model))) {
    return false;
  }
  if (filters.status.length > 0 && !filters.status.includes(statusOf(model))) {
    return false;
  }
  if (filters.capabilities.length > 0) {
    const caps = model.capabilities ?? [];
    if (!filters.capabilities.some(c => caps.includes(c))) return false;
  }
  return true;
}

export function applyModelFilters(
  models: CatalogModel[],
  filters: ModelFilterState,
  query: string
): CatalogModel[] {
  return models.filter(m => modelMatches(m, filters, query));
}

export interface FacetOption<T extends string = string> {
  value: T;
  label: string;
  count: number;
}

export interface ModelFacets {
  capabilities: FacetOption[];
  types: FacetOption[];
  sizes: FacetOption<SizeBucket>[];
  status: FacetOption<StatusFacet>[];
}

function labelize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Verfügbare Facetten mit Zählern aus dem Katalog ableiten. Zähler beziehen
 * sich auf den gesamten Katalog (nicht kreuz-gefiltert) — bewusst einfach.
 * Werte ohne Treffer werden weggelassen; leere Gruppen ergeben leere Arrays.
 */
export function deriveModelFacets(models: CatalogModel[]): ModelFacets {
  const capCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  const sizeCount = new Map<SizeBucket, number>();
  const statusCount = new Map<StatusFacet, number>();

  for (const m of models) {
    for (const c of m.capabilities ?? []) {
      capCount.set(c, (capCount.get(c) ?? 0) + 1);
    }
    if (m.model_type) {
      typeCount.set(m.model_type, (typeCount.get(m.model_type) ?? 0) + 1);
    }
    const bucket = sizeBucketOf(m);
    sizeCount.set(bucket, (sizeCount.get(bucket) ?? 0) + 1);
    const st = statusOf(m);
    statusCount.set(st, (statusCount.get(st) ?? 0) + 1);
  }

  const toSorted = (map: Map<string, number>): FacetOption[] =>
    [...map.entries()]
      .map(([value, count]) => ({ value, label: labelize(value), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const sizeOrder: SizeBucket[] = ['klein', 'mittel', 'gross'];
  const statusOrder: StatusFacet[] = ['installed', 'available'];

  return {
    capabilities: toSorted(capCount),
    types: toSorted(typeCount),
    sizes: sizeOrder
      .filter(b => sizeCount.has(b))
      .map(b => ({ value: b, label: SIZE_LABELS[b], count: sizeCount.get(b) ?? 0 })),
    status: statusOrder
      .filter(s => statusCount.has(s))
      .map(s => ({ value: s, label: STATUS_LABELS[s], count: statusCount.get(s) ?? 0 })),
  };
}

/** Einen Wert in einer String-Liste umschalten (immutably). */
export function toggleValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}
