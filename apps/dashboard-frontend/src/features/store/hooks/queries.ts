import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApi } from '../../../hooks/useApi';
import { storeKeys } from './queryKeys';

// ---- Types ----

export interface StoreInfo {
  models?: { count?: number };
  apps?: { count?: number };
  [key: string]: unknown;
}

export interface SearchResults {
  results?: unknown[];
  [key: string]: unknown;
}

export interface CatalogModel {
  id: string;
  name?: string;
  description?: string;
  size?: number;
  parameters?: string;
  installed?: boolean;
  [key: string]: unknown;
}

export interface LoadedModel {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface QueueEntry {
  model_id: string;
  count: number;
}

export interface ModelStatus {
  loaded_model?: LoadedModel | null;
  queue_by_model?: QueueEntry[];
}

export interface DefaultModelResponse {
  default_model?: string | null;
}

export interface AppItem {
  id: string;
  name?: string;
  installed?: boolean;
  enabled?: boolean;
  [key: string]: unknown;
}

interface AppsResponse {
  apps?: AppItem[];
}

interface CatalogResponse {
  models?: CatalogModel[];
}

interface RecommendationsResponse {
  recommendations?: unknown[];
}

// ---- Queries ----

/** useStoreInfoQuery — Top-level store summary (used by Store landing). */
export function useStoreInfoQuery(): UseQueryResult<StoreInfo> {
  const api = useApi();
  return useQuery({
    queryKey: storeKeys.info(),
    queryFn: ({ signal }) => api.get<StoreInfo>('/store/info', { showError: false, signal }),
  });
}

/**
 * useStoreSearchQuery — Search across the store. Disabled when query is
 * empty so the user can type without firing requests.
 */
export function useStoreSearchQuery(query: string): UseQueryResult<SearchResults> {
  const api = useApi();
  const enabled = query.trim().length > 0;
  return useQuery({
    queryKey: storeKeys.search(query),
    enabled,
    queryFn: ({ signal }) =>
      api.get<SearchResults>(`/store/search?q=${encodeURIComponent(query)}`, {
        showError: false,
        signal,
      }),
  });
}

/** useRecommendationsQuery — Personalized store recommendations. */
export function useRecommendationsQuery(): UseQueryResult<unknown[]> {
  const api = useApi();
  return useQuery({
    queryKey: storeKeys.recommendations(),
    queryFn: async ({ signal }) => {
      const data = await api.get<RecommendationsResponse>('/store/recommendations', {
        showError: false,
        signal,
      });
      return data.recommendations ?? [];
    },
  });
}

/**
 * useAppsQuery — All apps (installed + available).
 * Optional `refetchInterval` for status polling (StoreApps polls every 20s).
 */
export function useAppsQuery(refetchInterval: number | false = false): UseQueryResult<AppItem[]> {
  const api = useApi();
  return useQuery({
    queryKey: storeKeys.apps(),
    queryFn: async ({ signal }) => {
      const data = await api.get<AppsResponse>('/apps', { showError: false, signal });
      return data.apps ?? [];
    },
    refetchInterval,
  });
}

/** useModelsCatalogQuery — Full catalog of models (installable). */
export function useModelsCatalogQuery(): UseQueryResult<CatalogModel[]> {
  const api = useApi();
  return useQuery({
    queryKey: storeKeys.modelsCatalog(),
    queryFn: async ({ signal }) => {
      const data = await api.get<CatalogResponse>('/models/catalog', {
        showError: false,
        signal,
      });
      return data.models ?? [];
    },
  });
}

/**
 * useModelsStatusQuery — Currently loaded model + queue. Polled every 5s
 * since the loaded model can change at any time (chat starts, etc.).
 */
export function useModelsStatusQuery(): UseQueryResult<ModelStatus> {
  const api = useApi();
  return useQuery({
    queryKey: storeKeys.modelsStatus(),
    queryFn: async ({ signal }) => {
      try {
        return await api.get<ModelStatus>('/models/status', { showError: false, signal });
      } catch {
        // Endpoint may not exist in some configurations — return empty
        return {};
      }
    },
    refetchInterval: 5_000,
  });
}

/** useModelsDefaultQuery — Currently set default model. */
export function useModelsDefaultQuery(): UseQueryResult<DefaultModelResponse> {
  const api = useApi();
  return useQuery({
    queryKey: storeKeys.modelsDefault(),
    queryFn: async ({ signal }) => {
      try {
        return await api.get<DefaultModelResponse>('/models/default', {
          showError: false,
          signal,
        });
      } catch {
        return {};
      }
    },
  });
}
