import { create } from 'zustand';
import {
  EMPTY_MODEL_FILTERS,
  toggleValue,
  type ModelFilterState,
} from '@/features/store/storeModelFilters';
import {
  EMPTY_EXTENSION_FILTERS,
  type ExtensionFilterState,
} from '@/features/store/storeExtensionFilters';

/**
 * Filter-Zustand des Stores (Plan 012 Phase C). Aus dem Content in einen
 * eigenen Store gehoben, damit die Filter jetzt in der linken Sidebar
 * (ModelsPanel) sitzen und das Karten-Raster in der Mitte (StoreModelsGrid) sie
 * liest — beide teilen genau eine Quelle der Wahrheit.
 *
 * Ephemer (nicht persistiert), wie der extensionStore: ein Reload startet mit
 * leeren Filtern.
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

  /**
   * Freitext-Suche der Erweiterungen. Ersetzt seit der Neuausrichtung die
   * Facetten-Filter (Typ/Zugriffs-Stufe/…): eine einfache Suche über Name und
   * Beschreibung passt hier besser als vier Checkbox-Gruppen. `extFilters`
   * bleibt für die Filter-Logik erhalten (heute leer), das Raster liest primär
   * `extQuery`.
   */
  extQuery: string;
  setExtQuery: (query: string) => void;

  extFilters: ExtensionFilterState;
  // NonNullable: die Facetten `types`/`tiers` sind optional (Rückwärts-
  // kompatibilität), ihre Element-Typen bleiben so trotzdem ableitbar.
  toggleExtFilter: <K extends keyof ExtensionFilterState>(
    group: K,
    value: NonNullable<ExtensionFilterState[K]>[number]
  ) => void;
  resetExtFilters: () => void;
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

  extQuery: '',
  setExtQuery: query => set({ extQuery: query }),

  extFilters: EMPTY_EXTENSION_FILTERS,
  toggleExtFilter: (group, value) =>
    set(state => ({
      extFilters: {
        ...state.extFilters,
        [group]: toggleValue(state.extFilters[group] as string[], value as string),
      },
    })),
  resetExtFilters: () => set({ extFilters: EMPTY_EXTENSION_FILTERS }),
}));
