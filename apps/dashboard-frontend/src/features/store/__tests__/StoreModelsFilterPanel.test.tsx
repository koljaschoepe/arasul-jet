/**
 * StoreModelsFilterPanel — die Modell-Filter in der Sidebar (Plan 012 Phase C).
 * Prüft: Facetten aus dem Katalog, Suche + Facetten schreiben in den
 * storeFilterStore, „Zurücksetzen" leert die Filter.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { EMPTY_MODEL_FILTERS } from '../storeModelFilters';
import { StoreModelsFilterPanel } from '../StoreModelsFilterPanel';

const catalog = {
  models: [
    {
      id: 'a',
      name: 'Llama',
      description: '',
      size_bytes: 0,
      ram_required_gb: 5,
      category: 'llm',
      install_status: 'available',
      model_type: 'llm',
    },
    {
      id: 'b',
      name: 'Llava',
      description: '',
      size_bytes: 0,
      ram_required_gb: 12,
      category: 'vision',
      install_status: 'available',
      model_type: 'vision',
    },
  ],
  loadedModel: null,
  defaultModel: null,
  apps: [],
  isLoading: false,
  invalidateModels: vi.fn(),
  invalidateApps: vi.fn(),
};
vi.mock('@/hooks/useStoreCatalog', async () => {
  const actual =
    await vi.importActual<typeof import('@/hooks/useStoreCatalog')>('@/hooks/useStoreCatalog');
  return { ...actual, useStoreCatalog: () => catalog };
});

describe('StoreModelsFilterPanel', () => {
  beforeEach(() => {
    useStoreFilterStore.setState({ modelQuery: '', modelFilters: EMPTY_MODEL_FILTERS });
  });

  it('zeigt klare Typ-Labels (Sprachmodell statt Llm)', () => {
    render(<StoreModelsFilterPanel />);
    expect(screen.getByText('Sprachmodell')).toBeInTheDocument();
    expect(screen.getByText('Vision')).toBeInTheDocument();
    expect(screen.queryByText('Llm')).not.toBeInTheDocument();
  });

  it('eine Facette anhaken schreibt in den storeFilterStore', () => {
    render(<StoreModelsFilterPanel />);
    fireEvent.click(screen.getByText('Vision'));
    expect(useStoreFilterStore.getState().modelFilters.types).toEqual(['vision']);
  });

  it('Suche schreibt in den storeFilterStore', () => {
    render(<StoreModelsFilterPanel />);
    fireEvent.change(screen.getByLabelText('Modelle durchsuchen'), { target: { value: 'bge' } });
    expect(useStoreFilterStore.getState().modelQuery).toBe('bge');
  });

  it('„Zurücksetzen" leert die Filter', () => {
    useStoreFilterStore.setState({ modelFilters: { ...EMPTY_MODEL_FILTERS, types: ['llm'] } });
    render(<StoreModelsFilterPanel />);
    fireEvent.click(screen.getByText(/Filter zurücksetzen/));
    expect(useStoreFilterStore.getState().modelFilters.types).toEqual([]);
  });
});
