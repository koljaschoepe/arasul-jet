import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApi } from '../useApi';

export interface SystemInfo {
  version: string;
  hostname: string;
  jetpack_version: string;
  uptime_seconds: number;
  build_hash: string;
}

/** Hierarchical query keys for shared system endpoints. */
export const systemKeys = {
  all: ['system'] as const,
  info: () => [...systemKeys.all, 'info'] as const,
};

/**
 * useSystemInfoQuery — Platform/host metadata (version, hostname, JetPack
 * version, uptime, build hash). Shared across GeneralSettings, UpdatePage
 * and SetupWizard so the response is fetched once and deduped from the
 * TanStack Query cache.
 *
 * Stale time: 60s (system info changes rarely).
 */
export function useSystemInfoQuery(): UseQueryResult<SystemInfo> {
  const api = useApi();
  return useQuery({
    queryKey: systemKeys.info(),
    queryFn: ({ signal }) => api.get<SystemInfo>('/system/info', { showError: false, signal }),
    staleTime: 60_000,
  });
}
