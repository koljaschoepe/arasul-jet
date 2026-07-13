import { create } from 'zustand';

/**
 * Auswahl-Store für die Extensions-Ansicht (Store 3.1: Liste links, Detail in
 * der Mitte). Die Liste (ExtensionsSidebarList) lebt im Workspace-Sidebar-Baum,
 * die Detailseite (StoreDetailPage) im isolierten MemoryRouter des Store-Tabs —
 * zwei getrennte Router-Bäume unter derselben React-Wurzel. Ein schlanker,
 * NICHT persistierter Zustand-Store ist der Kanal dazwischen: ephemer wie der
 * chatScope, damit ein Reload immer im Leerzustand („nichts gewählt") startet.
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
