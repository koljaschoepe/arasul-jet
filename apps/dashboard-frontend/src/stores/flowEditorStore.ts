import { create } from 'zustand';

/**
 * Ziel + Modus des zentralen Flow-Tabs (Plan 012 Phase D / Plan 013 Flow-Zentrale).
 *
 * Der Flow-Tab ist EIN Mitte-Tab (Singleton, Typ `flow` im workspaceStore) —
 * welchen Flow er zeigt und OB als Dashboard (`view`) oder im Editor (`edit`),
 * steht hier, getrennt vom Tab selbst. Genau wie der Store-Tab seinen Inhalt aus
 * dem ephemeren `extensionStore` (`selected`) zieht, liest der Flow-Tab sein Ziel
 * aus diesem Store. Bewusst NICHT persistiert: ein halb getippter neuer Flow soll
 * einen Reload nicht überdauern.
 *
 * - `mode: 'view'` + ein Name → die Flow-Zentrale (Detail-Dashboard: Trigger-URL,
 *   letzte Läufe, Ausgabeort, Pipeline). Klick auf einen Flow in der Sidebar.
 * - `mode: 'edit'` → der Editor (Formular). `editName === null` legt neu an.
 *
 * Aufrufer setzen erst das Ziel und öffnen dann den Tab — dasselbe Muster wie die
 * ActivityBar bei Modellen/Erweiterungen (`setStoreTab` + `openTab`).
 */
export type FlowTabMode = 'view' | 'edit';

interface FlowEditorState {
  /** `null` = neuen Flow anlegen; ein Name = diesen Flow anzeigen/bearbeiten. */
  editName: string | null;
  /** Dashboard-Ansicht (`view`) oder Editor (`edit`). */
  mode: FlowTabMode;
  /** Ziel setzen. Ohne `mode` → Editor (Rückwärtskompatibilität mit Altaufrufern). */
  setEditTarget: (editName: string | null, mode?: FlowTabMode) => void;
}

export const useFlowEditorStore = create<FlowEditorState>(set => ({
  editName: null,
  mode: 'edit',
  setEditTarget: (editName, mode = 'edit') => set({ editName, mode }),
}));
