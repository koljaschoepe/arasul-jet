import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

/**
 * Server-State des aktiven Ordner-Kontexts (Plan 012 Phase A).
 *
 * Der aktive Workspace ist eine app-weite Singleton-Einstellung (Einzel-Admin),
 * die Pins sind pro Nutzer abgelegt — beides lebt im Backend (system_settings /
 * pinned_documents) und ist damit Server-State (React Query), nicht persistenter
 * Client-State.
 */

export interface ActiveWorkspaceSpace {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
}

interface ActiveWorkspaceResponse {
  active_workspace: ActiveWorkspaceSpace | null;
  subtree_ids: string[];
}

export interface Pin {
  id: number;
  document_id: string | null;
  space_id: string | null;
  label: string | null;
  kind: 'folder' | 'document';
  created_at: string;
}

interface PinsResponse {
  pins: Pin[];
  total: number;
}

export const ACTIVE_WORKSPACE_QUERY_KEY = ['active-workspace'] as const;
export const PINS_QUERY_KEY = ['pins'] as const;

/** Aktiver Top-Level-Ordner + Setter. */
export function useActiveWorkspace() {
  const api = useApi();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ACTIVE_WORKSPACE_QUERY_KEY,
    queryFn: () =>
      api.get<ActiveWorkspaceResponse>('/spaces/active-workspace', { showError: false }),
    staleTime: 30_000,
  });

  const setActive = useMutation({
    mutationFn: (spaceId: string | null) =>
      api.put<{ active_workspace_id: string | null }>('/spaces/active-workspace', {
        space_id: spaceId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ACTIVE_WORKSPACE_QUERY_KEY }),
  });

  return {
    active: query.data?.active_workspace ?? null,
    subtreeIds: query.data?.subtree_ids ?? [],
    isLoading: query.isLoading,
    setActive,
  };
}

/** Angeheftete Dokumente/Unterordner + Anheften/Lösen. */
export function usePins() {
  const api = useApi();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: PINS_QUERY_KEY,
    queryFn: () => api.get<PinsResponse>('/spaces/pins', { showError: false }),
    staleTime: 30_000,
  });

  const addPin = useMutation({
    mutationFn: (target: { documentId?: string; spaceId?: string }) =>
      api.post('/spaces/pins', {
        document_id: target.documentId ?? null,
        space_id: target.spaceId ?? null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PINS_QUERY_KEY }),
  });

  const removePin = useMutation({
    mutationFn: (id: number) => api.del(`/spaces/pins/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: PINS_QUERY_KEY }),
  });

  return {
    pins: query.data?.pins ?? [],
    isLoading: query.isLoading,
    addPin,
    removePin,
  };
}
