import { create } from 'zustand';

/**
 * Ziel des zentralen Skill-Editor-Tabs (Plan 012 Phase D, Schritt 10).
 *
 * Der Skill-Editor ist EIN Mitte-Tab (Singleton, Typ `skill` im workspaceStore) —
 * welchen Skill er zeigt, steht hier, getrennt vom Tab selbst. Genau wie der
 * Store-Tab seinen Inhalt aus dem ephemeren `extensionStore` (`selected`) zieht,
 * liest der Skill-Tab sein Ziel aus diesem Store. Bewusst NICHT persistiert: ein
 * halb getippter neuer Skill soll einen Reload nicht überdauern.
 *
 * Aufrufer (Sidebar-Liste, Composer-Slash-Befehle) setzen erst das Ziel und
 * öffnen dann den Tab — dasselbe Muster wie die ActivityBar bei Modellen/
 * Erweiterungen (`setStoreTab` + `openTab`).
 */
interface SkillEditorState {
  /** `null` = neuen Skill anlegen; ein Name = diesen Skill bearbeiten. */
  editName: string | null;
  setEditTarget: (editName: string | null) => void;
}

export const useSkillEditorStore = create<SkillEditorState>(set => ({
  editName: null,
  setEditTarget: editName => set({ editName }),
}));
