/**
 * Installierte Erweiterungs-Pakete (Plan 012 Phase E · Schritt 16).
 *
 * Getrennt von `useWorkspaceApps` (kuratierte Kern-Apps wie n8n): hier geht es
 * um selbst gebaute bzw. importierte Pakete aus dem Erweiterungs-Baukasten.
 * Beide Listen laufen im Erweiterungen-Reiter durch dieselbe Filter-Logik.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { API_BASE } from '@/config/api';
import type { AccessTier, ExtType } from '@/features/store/storeExtensionFilters';

export interface InstalledExtension {
  id: string;
  name: string;
  description: string;
  type: ExtType;
  accessTier: AccessTier;
  version: string;
  source: 'built' | 'imported';
  enabled: boolean;
  installedAt: string;
  manifest: Record<string, unknown>;
}

const QUERY_KEY = ['extensions'];

export function useExtensions() {
  const api = useApi();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<{ data: InstalledExtension[] }>('/extensions', {
        showError: false,
      });
      return res.data;
    },
    retry: 1,
    staleTime: 30_000,
  });

  const extensions = data ?? [];

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  /** Ordner einer Werkstatt-Sandbox zum Paket machen. */
  const buildFromSandbox = useCallback(
    async (slug: string, subfolder: string, overwrite = false) => {
      const res = await api.post<{ data: InstalledExtension }>('/extensions/bauen', {
        slug,
        subfolder,
        overwrite,
      });
      invalidate();
      return res.data;
    },
    [api, invalidate]
  );

  const setExtensionEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      await api.put(`/extensions/${id}`, { enabled }, { showError: false });
      queryClient.setQueryData<InstalledExtension[]>(QUERY_KEY, prev =>
        (prev ?? []).map(e => (e.id === id ? { ...e, enabled } : e))
      );
      invalidate();
    },
    [api, queryClient, invalidate]
  );

  const forkExtension = useCallback(
    async (id: string, name?: string) => {
      const res = await api.post<{ data: { project: { slug: string; name: string } } }>(
        `/extensions/${id}/fork`,
        name ? { name } : {}
      );
      invalidate();
      return res.data;
    },
    [api, invalidate]
  );

  const removeExtension = useCallback(
    async (id: string) => {
      await api.del(`/extensions/${id}`);
      invalidate();
    },
    [api, invalidate]
  );

  /**
   * Import läuft als multipart-Upload über `api.request`: bei FormData entfernt
   * useApi den JSON-Content-Type, damit der Browser die Boundary selbst setzt.
   */
  const importPackage = useCallback(
    async (file: File, overwrite = false) => {
      const form = new FormData();
      form.append('file', file);
      form.append('overwrite', String(overwrite));
      const res = await api.request<{ data: InstalledExtension }>('/extensions/import', {
        method: 'POST',
        body: form,
      });
      invalidate();
      return res.data;
    },
    [api, invalidate]
  );

  /** Download-URL des Pakets (der Browser lädt direkt, mit Session-Cookie). */
  const downloadUrl = useCallback((id: string) => `${API_BASE}/extensions/${id}/download`, []);

  return {
    extensions,
    isLoading,
    refetch,
    buildFromSandbox,
    setExtensionEnabled,
    forkExtension,
    removeExtension,
    importPackage,
    downloadUrl,
  };
}
