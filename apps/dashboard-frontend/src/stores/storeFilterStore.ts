import { create } from 'zustand';
import {
  EMPTY_MODEL_FILTERS,
  toggleValue,
  type ModelFilterState,
} from '@/features/store/storeModelFilters';

/**
 * Filter-Zustand des Modell-Stores (Plan 012 Phase C). Aus dem Content in einen
 * eigenen Store gehoben, damit die Filter in der linken Sidebar (ModelsPanel)
 * sitzen und das Karten-Raster in der Mitte (StoreModelsGrid) sie liest — beide
 * teilen genau eine Quelle der Wahrheit.
 *
 * Ephemer (nicht persistiert), wie der extensionStore: ein Reload startet mit
 * leeren Filtern. Die Erweiterungs-Suche (`extQuery`, `extFilters`) ist mit
 * Phase B3 gefallen.
 */
interface StoreFilterState {
  modelQuery: string;
  modelFilters: ModelFilterState;
  setModelQuery: (query: string) => void;
  toggleModelFilter: <K extends keyof ModelFilterState>(
    group: K,
    value: ModelFilterState[K][number]
  ) => void;
  resetModelFilters: () => void;
}

export const useStoreFilterStore = create<StoreFilterState>()(set => ({
  modelQuery: '',
  modelFilters: EMPTY_MODEL_FILTERS,
  setModelQuery: query => set({ modelQuery: query }),
  toggleModelFilter: (group, value) =>
    set(state => ({
      modelFilters: {
        ...state.modelFilters,
        [group]: toggleValue(state.modelFilters[group] as string[], value as string),
      },
    })),
  resetModelFilters: () => set({ modelFilters: EMPTY_MODEL_FILTERS }),
}));
