/**
 * Reine Filter-/Facetten-/Sortier-Logik für den Modell-Store.
 *
 * DOM-frei und deterministisch testbar. Facetten (Typ · Größe · Status) werden
 * aus dem Katalog abgeleitet; die Größen-Buckets aus dem RAM-Bedarf (Fallback:
 * Dateigröße). Angelehnt an moderne Modell-Browser (LM Studio / Jan): Facetten-
 * Zähler + Mehrfachauswahl.
 *
 * Plan 012 Phase C Schritt 7: Facette „Fähigkeit" (capabilities) entfernt — es
 * bleiben Typ · Größe · Status mit klaren Labels (statt „Llm"/„Ocr"). Die Filter
 * leben jetzt in der Sidebar (ModelsPanel), das Grid liest sie aus dem Store.
 */
import type { CatalogModel } from '@/hooks/useStoreCatalog';
import { isModelInstalled } from '@/hooks/useStoreCatalog';

export type SizeBucket = 'klein' | 'mittel' | 'gross';
export type StatusFacet = 'installed' | 'available';

export interface ModelFilterState {
  types: string[];
  sizes: SizeBucket[];
  status: StatusFacet[];
}

export const EMPTY_MODEL_FILTERS: ModelFilterState = {
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

/**
 * Klare Labels für den Modell-Typ (statt der rohen, klein geschriebenen
 * Katalogwerte „llm"/„ocr"). Unbekannte Typen werden auf Groß­schreibung des
 * ersten Buchstabens zurückgeführt.
 */
export const TYPE_LABELS: Record<string, string> = {
  llm: 'Sprachmodell',
  chat: 'Sprachmodell',
  vision: 'Vision',
  embedding: 'Embedding',
  reranker: 'Reranker',
  ocr: 'OCR',
  code: 'Code',
};

export function typeLabel(value: string): string {
  return TYPE_LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

/** RAM-Bedarf (GB) eines Modells, Fallback Dateigröße; 0 wenn unbekannt. */
function modelSizeGb(model: CatalogModel): number {
  if (model.ram_required_gb && model.ram_required_gb > 0) return model.ram_required_gb;
  if (model.size_bytes) return model.size_bytes / 1_000_000_000;
  return 0;
}

/** Größen-Bucket aus RAM-Bedarf (GB), Fallback Dateigröße. */
export function sizeBucketOf(model: CatalogModel): SizeBucket {
  const gb = modelSizeGb(model);
  if (gb > 0 && gb < 8) return 'klein';
  if (gb > 16) return 'gross';
  return 'mittel';
}

function statusOf(model: CatalogModel): StatusFacet {
  return isModelInstalled(model) ? 'installed' : 'available';
}

/** True, wenn kein Filter gesetzt ist. */
export function isFilterEmpty(f: ModelFilterState): boolean {
  return f.types.length === 0 && f.sizes.length === 0 && f.status.length === 0;
}

/** Anzahl aktiver Einzel-Filter (für die Chip-Leiste / „Zurücksetzen"). */
export function activeFilterCount(f: ModelFilterState): number {
  return f.types.length + f.sizes.length + f.status.length;
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
  return true;
}

export function applyModelFilters(
  models: CatalogModel[],
  filters: ModelFilterState,
  query: string
): CatalogModel[] {
  return models.filter(m => modelMatches(m, filters, query));
}

/**
 * Default-Sortierung (Plan 012 Phase C Schritt 7): Status → Größe.
 * Installierte Modelle zuerst, danach nach RAM-Bedarf aufsteigend (leichte,
 * sofort lauffähige Modelle oben), Namen als stabiler Tiebreaker.
 */
export function sortModels(models: CatalogModel[]): CatalogModel[] {
  const statusRank = (m: CatalogModel) => (isModelInstalled(m) ? 0 : 1);
  return [...models].sort(
    (a, b) =>
      statusRank(a) - statusRank(b) ||
      modelSizeGb(a) - modelSizeGb(b) ||
      a.name.localeCompare(b.name)
  );
}

export interface FacetOption<T extends string = string> {
  value: T;
  label: string;
  count: number;
}

export interface ModelFacets {
  types: FacetOption[];
  sizes: FacetOption<SizeBucket>[];
  status: FacetOption<StatusFacet>[];
}

/**
 * Verfügbare Facetten mit Zählern aus dem Katalog ableiten. Zähler beziehen
 * sich auf den gesamten Katalog (nicht kreuz-gefiltert) — bewusst einfach.
 * Werte ohne Treffer werden weggelassen; leere Gruppen ergeben leere Arrays.
 */
export function deriveModelFacets(models: CatalogModel[]): ModelFacets {
  const typeCount = new Map<string, number>();
  const sizeCount = new Map<SizeBucket, number>();
  const statusCount = new Map<StatusFacet, number>();

  for (const m of models) {
    if (m.model_type) {
      typeCount.set(m.model_type, (typeCount.get(m.model_type) ?? 0) + 1);
    }
    const bucket = sizeBucketOf(m);
    sizeCount.set(bucket, (sizeCount.get(bucket) ?? 0) + 1);
    const st = statusOf(m);
    statusCount.set(st, (statusCount.get(st) ?? 0) + 1);
  }

  const types: FacetOption[] = [...typeCount.entries()]
    .map(([value, count]) => ({ value, label: typeLabel(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const sizeOrder: SizeBucket[] = ['klein', 'mittel', 'gross'];
  const statusOrder: StatusFacet[] = ['installed', 'available'];

  return {
    types,
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
