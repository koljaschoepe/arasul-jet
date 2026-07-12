/**
 * Zustand der kuratierten Workspace-Apps (n8n, Telegram, Datenbank).
 * Gemeinsame Datenbasis für ActivityBar (Sichtbarkeit) und Extensions-Tab
 * (Toggles) — via React Query, damit ein Toggle sofort überall wirkt.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { WorkspaceTabType } from '@/stores/workspaceStore';

export interface WorkspaceApp {
  id: string;
  name: string;
  description: string;
  tab: WorkspaceTabType;
  enabled: boolean;
}

const QUERY_KEY = ['workspace-apps'];

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

  const setAppEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      await api.put(`/workspace-apps/${id}`, { enabled });
      queryClient.setQueryData<WorkspaceApp[]>(QUERY_KEY, prev =>
        (prev ?? []).map(a => (a.id === id ? { ...a, enabled } : a))
      );
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    [api, queryClient]
  );

  return { apps, isLoading, isAppEnabled, setAppEnabled };
}
