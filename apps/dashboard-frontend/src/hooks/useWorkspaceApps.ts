/**
 * Zustand der kuratierten Workspace-Apps (n8n, Datenbank).
 * Gemeinsame Datenbasis für ActivityBar (Sichtbarkeit) und Extensions-Tab
 * (Toggles) — via React Query, damit ein Toggle sofort überall wirkt.
 * Beim Deaktivieren schließt setAppEnabled offene Mitte-Tabs der App.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { WorkspaceTabType } from '@/stores/workspaceStore';
import type { AccessTier, ExtType } from '@/features/store/storeExtensionFilters';

export interface WorkspaceApp {
  id: string;
  name: string;
  description: string;
  tab: WorkspaceTabType;
  enabled: boolean;
  /**
   * Taxonomie aus Plan 012 Phase E. Optional, damit ein älteres Backend (das
   * die Felder noch nicht schickt) die Ansicht nicht bricht.
   */
  type?: ExtType;
  accessTier?: AccessTier;
}

const QUERY_KEY = ['workspace-apps'];

/** Kind-Tab-Typen, die zum Haupt-Tab einer App gehören (z. B. Tabellen-Tabs). */
const APP_CHILD_TAB_TYPES: Partial<Record<WorkspaceTabType, WorkspaceTabType[]>> = {};

/** Offene Mitte-Tabs einer deaktivierten App schließen (inkl. Kind-Tabs). */
function closeAppTabs(tabType: WorkspaceTabType) {
  const affected = new Set<WorkspaceTabType>([tabType, ...(APP_CHILD_TAB_TYPES[tabType] ?? [])]);
  const { tabs, closeTab } = useWorkspaceStore.getState();
  for (const tab of tabs) {
    if (affected.has(tab.type)) closeTab(tab.id);
  }
}

export function useWorkspaceApps() {
  const api = useApi();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<{ apps: WorkspaceApp[] }>('/workspace-apps', {
        showError: false,
      });
      return res.apps;
    },
    // Bei API-Fehlern (z. B. 401-Race beim Login) lieber alles anzeigen
    // als Funktionen zu verstecken.
    retry: 1,
    staleTime: 60_000,
  });

  const apps = data ?? [];

  const isAppEnabled = useCallback(
    (id: string) => {
      const app = apps.find(a => a.id === id);
      return app ? app.enabled : true;
    },
    [apps]
  );

  /**
   * Gating auf Tab-Typ-Ebene (inkl. etwaiger Kind-Tabs einer App): gehört der
   * Typ zu einer deaktivierten App, darf kein Tab dieses Typs geöffnet werden
   * (URL-Deep-Link, Browser-Zurück). Unbekannte Typen sind immer erlaubt;
   * solange die Apps noch laden, gilt fail-open (siehe Query-Kommentar).
   */
  const isTabTypeEnabled = useCallback(
    (type: WorkspaceTabType) => {
      const app = apps.find(
        a => a.tab === type || (APP_CHILD_TAB_TYPES[a.tab] ?? []).includes(type)
      );
      return app ? app.enabled : true;
    },
    [apps]
  );

  const setAppEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      // showError:false — der Aufrufer (StoreExtensionsGrid / StoreDetailPage)
      // fängt den Fehler selbst ab und zeigt genau EINEN Toast. Sonst doppelt.
      await api.put(`/workspace-apps/${id}`, { enabled }, { showError: false });
      queryClient.setQueryData<WorkspaceApp[]>(QUERY_KEY, prev =>
        (prev ?? []).map(a => (a.id === id ? { ...a, enabled } : a))
      );
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // Deaktivierte App: offene Tabs der App sauber schließen —
      // der ActivityBar-Eintrag verschwindet über den Query-Cache von selbst.
      if (!enabled) {
        const app = apps.find(a => a.id === id);
        if (app) closeAppTabs(app.tab);
      }
    },
    [api, queryClient, apps]
  );

  return { apps, isLoading, isAppEnabled, isTabTypeEnabled, setAppEnabled };
}
