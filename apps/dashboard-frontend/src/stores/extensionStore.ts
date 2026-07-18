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

export type ExtensionKind = 'model' | 'app';

export interface ExtensionSelection {
  kind: ExtensionKind;
  id: string;
}

interface ExtensionState {
  /** Aktuell in der Mitte angezeigte Extension, oder null (Leerzustand). */
  selected: ExtensionSelection | null;
  selectExtension: (selection: ExtensionSelection) => void;
  clearSelection: () => void;
}

export const useExtensionStore = create<ExtensionState>()(set => ({
  selected: null,
  selectExtension: selection => set({ selected: selection }),
  clearSelection: () => set({ selected: null }),
}));
