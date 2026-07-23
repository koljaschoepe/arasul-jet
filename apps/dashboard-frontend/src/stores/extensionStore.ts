import { create } from 'zustand';

/**
 * Auswahl-Store für den Full-Width-Store (Kartenraster + eigene Detailseite).
 * Ein Klick auf eine Karte (StoreModelsGrid / StoreExtensionsGrid) setzt hier
 * die Auswahl; Store.tsx zeigt daraufhin statt des Rasters die StoreDetailPage,
 * „← Zurück" ruft clearSelection. Der Store ist außerdem der Kanal für die alten
 * Deep-Links /store/models|apps?highlight=… (HighlightRedirect). Ein schlanker,
 * NICHT persistierter Zustand — ephemer wie der chatScope, damit ein Reload
 * immer im Leerzustand („nichts gewählt", d. h. Raster) startet.
 */

/**
 * `builder` ist der Einstieg in den Erweiterungs-Baukasten (Plan 012 Phase C
 * Schritt 9); `extension` ist ein installiertes, selbst gebautes oder
 * importiertes Paket (Phase E Schritt 16) — bewusst getrennt von `app`
 * (kuratierte Kern-App wie n8n), weil beide andere Aktionen haben.
 */
export type ExtensionKind = 'model' | 'app' | 'builder' | 'extension';

/** Reiter im Store-Tab: Modelle oder Erweiterungen. */
export type StoreTab = 'models' | 'extensions';

export interface ExtensionSelection {
  kind: ExtensionKind;
  id: string;
}

interface ExtensionState {
  /** Aktuell in der Mitte angezeigte Extension, oder null (Leerzustand). */
  selected: ExtensionSelection | null;
  /**
   * Aktiver Reiter im Store (Plan 012 Phase B, Schritt 6): aus lokalem
   * Component-State in den Store gehoben, damit die Activity-Bar »Modelle«/
   * »Erweiterungen« direkt den passenden Reiter aktivieren kann.
   */
  storeTab: StoreTab;
  selectExtension: (selection: ExtensionSelection) => void;
  clearSelection: () => void;
  setStoreTab: (tab: StoreTab) => void;
}

export const useExtensionStore = create<ExtensionState>()(set => ({
  selected: null,
  storeTab: 'models',
  selectExtension: selection => set({ selected: selection }),
  clearSelection: () => set({ selected: null }),
  setStoreTab: tab => set({ storeTab: tab }),
}));
