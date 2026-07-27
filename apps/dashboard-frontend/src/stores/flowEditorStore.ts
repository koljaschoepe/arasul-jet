import { create } from 'zustand';

/**
 * Ziel des zentralen Flow-Editor-Tabs (Plan 012 Phase D, Schritt 10).
 *
 * Der Flow-Editor ist EIN Mitte-Tab (Singleton, Typ `flow` im workspaceStore) —
 * welchen Flow er zeigt, steht hier, getrennt vom Tab selbst. Genau wie der
 * Store-Tab seinen Inhalt aus dem ephemeren `extensionStore` (`selected`) zieht,
 * liest der Flow-Tab sein Ziel aus diesem Store. Bewusst NICHT persistiert: ein
 * halb getippter neuer Flow soll einen Reload nicht überdauern.
 *
 * Aufrufer (Sidebar-Liste, Composer-Slash-Befehle) setzen erst das Ziel und
 * öffnen dann den Tab — dasselbe Muster wie die ActivityBar bei Modellen/
 * Erweiterungen (`setStoreTab` + `openTab`).
 */
interface FlowEditorState {
  /** `null` = neuen Flow anlegen; ein Name = diesen Flow bearbeiten. */
  editName: string | null;
  setEditTarget: (editName: string | null) => void;
}

export const useFlowEditorStore = create<FlowEditorState>(set => ({
  editName: null,
  setEditTarget: editName => set({ editName }),
}));
