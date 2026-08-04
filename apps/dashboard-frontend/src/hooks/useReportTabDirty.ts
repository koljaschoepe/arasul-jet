import { useEffect } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/**
 * Meldet den Ungespeichert-Zustand eines Editors an den Workspace-Store, damit
 * die Tab-Leiste (Punkt + „Verwerfen?"-Rückfrage) und die Shell
 * (beforeunload-Warnung) davon wissen. Zentrale Datenverlust-Absicherung.
 *
 * `tabId` fehlt bei nicht-eingebetteten Editoren (z. B. TipTap im alten
 * Vollbild-Overlay) — dann meldet der Hook nichts. Beim Unmount wird der
 * Merker geräumt, damit kein Geister-Eintrag die Warnung offen hält.
 */
export function useReportTabDirty(tabId: string | undefined, dirty: boolean): void {
  const setTabDirty = useWorkspaceStore(s => s.setTabDirty);

  useEffect(() => {
    if (!tabId) return;
    setTabDirty(tabId, dirty);
  }, [tabId, dirty, setTabDirty]);

  useEffect(() => {
    if (!tabId) return;
    return () => setTabDirty(tabId, false);
  }, [tabId, setTabDirty]);
}
