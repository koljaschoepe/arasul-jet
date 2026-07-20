import { describe, it, expect } from 'vitest';
import {
  sizeBucketOf,
  applyModelFilters,
  deriveModelFacets,
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
    capabilities: p.capabilities,
    ...p,
  };
}

const CATALOG: CatalogModel[] = [
  model({
    id: 'a',
    name: 'Llama',
    model_type: 'llm',
    capabilities: ['chat'],
    ram_required_gb: 5,
    install_status: 'available',
  }),
  model({
    id: 'b',
    name: 'Llava',
    model_type: 'vision',
    capabilities: ['chat', 'vision'],
    ram_required_gb: 12,
    install_status: 'available',
  }),
  model({
    id: 'c',
    name: 'BGE',
    model_type: 'embedding',
    capabilities: ['embedding'],
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

describe('applyModelFilters', () => {
  it('leerer Filter + leere Suche → alle', () => {
    expect(applyModelFilters(CATALOG, EMPTY_MODEL_FILTERS, '')).toHaveLength(3);
  });
  it('Typ-Filter grenzt ein', () => {
    const f: ModelFilterState = { ...EMPTY_MODEL_FILTERS, types: ['vision'] };
    expect(applyModelFilters(CATALOG, f, '').map(m => m.id)).toEqual(['b']);
  });
  it('Fähigkeit ODER innerhalb der Gruppe', () => {
    const f: ModelFilterState = { ...EMPTY_MODEL_FILTERS, capabilities: ['vision', 'embedding'] };
    expect(
      applyModelFilters(CATALOG, f, '')
        .map(m => m.id)
        .sort()
    ).toEqual(['b', 'c']);
  });
  it('Gruppen werden mit UND kombiniert', () => {
    const f: ModelFilterState = {
      ...EMPTY_MODEL_FILTERS,
      capabilities: ['chat'],
      sizes: ['klein'],
    };
    expect(applyModelFilters(CATALOG, f, '').map(m => m.id)).toEqual(['a']);
  });
  it('Suche filtert nach Name', () => {
    expect(applyModelFilters(CATALOG, EMPTY_MODEL_FILTERS, 'bge').map(m => m.id)).toEqual(['c']);
  });
});

describe('deriveModelFacets', () => {
  it('zählt Fähigkeiten, Typen, Größen, Status', () => {
    const f = deriveModelFacets(CATALOG);
    expect(f.capabilities.find(c => c.value === 'chat')?.count).toBe(2);
    expect(f.types.map(t => t.value).sort()).toEqual(['embedding', 'llm', 'vision']);
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
    expect(
      activeFilterCount({ capabilities: ['x'], types: ['y'], sizes: ['klein'], status: [] })
    ).toBe(3);
  });
});
