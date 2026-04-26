import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../hooks/useApi';
import type { Space } from './types';

interface SpacesResponse {
  spaces?: Space[];
}

// Shared with documents (`useSpacesQuery`) via same key — single source of truth
const SPACES_KEY = ['spaces'] as const;

interface UseChatSpacesParams {
  isAuthenticated: boolean;
}

export interface UseChatSpacesReturn {
  spaces: Space[];
  loadSpaces: () => Promise<void>;
}

/**
 * useChatSpaces — RAG knowledge spaces via TanStack Query. Shared cache
 * with the Documents feature (same query key) so creating/deleting a
 * space in DocumentManager propagates to ChatContext consumers immediately.
 */
export default function useChatSpaces({
  isAuthenticated,
}: UseChatSpacesParams): UseChatSpacesReturn {
  const api = useApi();
  const qc = useQueryClient();

  const spacesQuery = useQuery({
    queryKey: SPACES_KEY,
    enabled: isAuthenticated,
    queryFn: async ({ signal }) => {
      const data = await api.get<SpacesResponse>('/spaces', { showError: false, signal });
      return data.spaces ?? [];
    },
  });

  const loadSpaces = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: SPACES_KEY });
  }, [qc]);

  return {
    spaces: spacesQuery.data ?? [],
    loadSpaces,
  };
}
