/**
 * useGitSync — die Projekt↔GitHub-Kopplung (Plan 013, B9).
 *
 * Server-State → React Query, gescopt auf EIN Projekt (`projectId`). Verbinden/
 * Synchronisieren/Trennen invalidieren den Status, damit die Statusleiste sofort
 * „Verbunden" bzw. den letzten Sync-Stand zeigt. Der PAT geht nur beim Verbinden
 * hinein und wird nie zurückgegeben.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { GitLink, GitSyncResult } from '@/types/git';

export const gitSyncKey = (projectId: string | null) => ['git', projectId] as const;

export interface ConnectGitInput {
  repo_url: string;
  branch: string;
  /** Optional — leer lässt einen bereits gespeicherten Token unangetastet. */
  pat?: string;
}

export function useGitSync(projectId: string | null) {
  const api = useApi();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: gitSyncKey(projectId),
    queryFn: () => api.get<{ data: GitLink | null }>(`/git/${projectId}`, { showError: false }),
    enabled: !!projectId,
    staleTime: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: gitSyncKey(projectId) });

  const connect = useMutation({
    mutationFn: (input: ConnectGitInput) =>
      api.post<{ data: GitLink }>(
        `/git/${projectId}/connect`,
        input as unknown as Record<string, unknown>
      ),
    onSuccess: invalidate,
  });

  const sync = useMutation({
    mutationFn: () => api.post<{ data: GitSyncResult }>(`/git/${projectId}/sync`, {}),
    onSuccess: invalidate,
  });

  const disconnect = useMutation({
    mutationFn: () => api.del(`/git/${projectId}`),
    onSuccess: invalidate,
  });

  return {
    link: query.data?.data ?? null,
    isLoading: query.isLoading,
    connect,
    sync,
    disconnect,
  };
}
