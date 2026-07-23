import { describe, it, expect } from 'vitest';
import {
  sizeBucketOf,
  applyModelFilters,
  deriveModelFacets,
  sortModels,
  typeLabel,
  toggleValue,
  activeFilterCount,
  EMPTY_MODEL_FILTERS,
  type ModelFilterState,
} from '../storeModelFilters';
import type { CatalogModel } from '@/hooks/useStoreCatalog';

function model(p: Partial<CatalogModel>): CatalogModel {
  return {
    id: p.id ?? 'm',
    name: p.name ?? 'Modell',
    description: p.description ?? '',
    size_bytes: p.size_bytes ?? 0,
    ram_required_gb: p.ram_required_gb ?? 0,
    category: p.category ?? 'llm',
    install_status: p.install_status ?? 'available',
    model_type: p.model_type,
    ...p,
  };
}

const CATALOG: CatalogModel[] = [
  model({
    id: 'a',
    name: 'Llama',
    model_type: 'llm',
    ram_required_gb: 5,
    install_status: 'available',
  }),
  model({
    id: 'b',
    name: 'Llava',
    model_type: 'vision',
    ram_required_gb: 12,
    install_status: 'available',
  }),
  model({
    id: 'c',
    name: 'BGE',
    model_type: 'embedding',
    ram_required_gb: 20,
    install_status: 'available',
  }),
];

describe('sizeBucketOf', () => {
  it('teilt nach RAM-Bedarf in klein/mittel/groß', () => {
    expect(sizeBucketOf(model({ ram_required_gb: 5 }))).toBe('klein');
    expect(sizeBucketOf(model({ ram_required_gb: 12 }))).toBe('mittel');
    expect(sizeBucketOf(model({ ram_required_gb: 20 }))).toBe('gross');
  });
  it('fällt ohne RAM auf Dateigröße zurück, sonst mittel', () => {
    expect(sizeBucketOf(model({ size_bytes: 3_000_000_000 }))).toBe('klein');
    expect(sizeBucketOf(model({}))).toBe('mittel');
  });
});

describe('typeLabel', () => {
  it('gibt klare Labels statt roher Katalogwerte', () => {
    expect(typeLabel('llm')).toBe('Sprachmodell');
    expect(typeLabel('ocr')).toBe('OCR');
    expect(typeLabel('embedding')).toBe('Embedding');
  });
  it('fällt bei unbekanntem Typ auf Groß­schreibung zurück (kein „Llm")', () => {
    expect(typeLabel('sonstiges')).toBe('Sonstiges');
  });
});

describe('applyModelFilters', () => {
  it('leerer Filter + leere Suche → alle', () => {
    expect(applyModelFilters(CATALOG, EMPTY_MODEL_FILTERS, '')).toHaveLength(3);
  });
  it('Typ-Filter grenzt ein', () => {
    const f: ModelFilterState = { ...EMPTY_MODEL_FILTERS, types: ['vision'] };
    expect(applyModelFilters(CATALOG, f, '').map(m => m.id)).toEqual(['b']);
  });
  it('Gruppen werden mit UND kombiniert', () => {
    const f: ModelFilterState = { ...EMPTY_MODEL_FILTERS, types: ['llm'], sizes: ['klein'] };
    expect(applyModelFilters(CATALOG, f, '').map(m => m.id)).toEqual(['a']);
  });
  it('Suche filtert nach Name', () => {
    expect(applyModelFilters(CATALOG, EMPTY_MODEL_FILTERS, 'bge').map(m => m.id)).toEqual(['c']);
  });
});

describe('sortModels — Status → Größe', () => {
  it('installierte Modelle zuerst, dann nach RAM-Bedarf aufsteigend', () => {
    // install_status === 'available' bedeutet im Katalog „installiert".
    const catalog = [
      model({ id: 'big-inst', ram_required_gb: 30, install_status: 'available' }),
      model({ id: 'small-avail', ram_required_gb: 4, install_status: 'not_installed' }),
      model({ id: 'small-inst', ram_required_gb: 4, install_status: 'available' }),
    ];
    expect(sortModels(catalog).map(m => m.id)).toEqual(['small-inst', 'big-inst', 'small-avail']);
  });
  it('mutiert die Eingabe nicht', () => {
    const input = [...CATALOG];
    sortModels(input);
    expect(input.map(m => m.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('deriveModelFacets', () => {
  it('zählt Typen, Größen, Status (keine Fähigkeit mehr)', () => {
    const f = deriveModelFacets(CATALOG);
    expect(f.types.map(t => t.value).sort()).toEqual(['embedding', 'llm', 'vision']);
    expect(f.types.find(t => t.value === 'llm')?.label).toBe('Sprachmodell');
    expect(f.sizes.map(s => s.value)).toEqual(['klein', 'mittel', 'gross']);
    // Achtung: install_status === 'available' bedeutet im Katalog „installiert".
    expect(f.status.find(s => s.value === 'installed')?.count).toBe(3);
  });
});

describe('toggleValue / activeFilterCount', () => {
  it('togglet Werte immutably', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('zählt aktive Filter über alle Gruppen', () => {
    expect(activeFilterCount({ types: ['y'], sizes: ['klein'], status: [] })).toBe(2);
  });
});
