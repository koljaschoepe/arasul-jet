import { create } from 'zustand';

/**
 * Auswahl-Store für den Modell-Store (Kartenraster + eigene Detailseite).
 * Ein Klick auf eine Karte (StoreModelsGrid) setzt hier die Auswahl; Store.tsx
 * zeigt daraufhin statt des Rasters die StoreDetailPage, „← Zurück" ruft
 * clearSelection. Der Store ist außerdem der Kanal für den alten Deep-Link
 * /store/models?highlight=… (HighlightRedirect). Ein schlanker, NICHT
 * persistierter Zustand, damit ein Reload immer im Leerzustand („nichts
 * gewählt", d. h. Raster) startet.
 *
 * Bis Phase B3 (26.08.2026) kannte die Auswahl auch `app` (Kern-App wie n8n),
 * `builder` (Erweiterungs-Baukasten) und `extension` (installiertes Paket) und
 * trug den aktiven Reiter des Stores. Der Erweiterungs-Store ist gefallen; es
 * bleibt das Modell.
 */
type ExtensionKind = 'model';

interface ExtensionSelection {
  kind: ExtensionKind;
  id: string;
}

interface ExtensionState {
  /** Aktuell in der Mitte angezeigtes Modell, oder null (Leerzustand). */
  selected: ExtensionSelection | null;
  selectExtension: (selection: ExtensionSelection) => void;
  clearSelection: () => void;
}

export const useExtensionStore = create<ExtensionState>()(set => ({
  selected: null,
  selectExtension: selection => set({ selected: selection }),
  clearSelection: () => set({ selected: null }),
}));
