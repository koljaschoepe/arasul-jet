import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../hooks/useApi';
import { modelKeys, MODEL_POLL_INTERVAL_MS } from '../../../hooks/queries/modelKeys';
import type { MemoryBudget } from '../../../types';
import type { N8nDocData } from '../n8n-template';

interface ApiKeyEntry {
  id: number;
  key_prefix: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

interface ApiKeysResponse {
  api_keys: ApiKeyEntry[];
}

interface DefaultModelResponse {
  default_model: string | null;
}

const ARASUL_INTERNAL_BACKEND = 'http://dashboard-backend:3001';
const ARASUL_INTERNAL_OLLAMA = 'http://llm-service:11434';
const ARASUL_INTERNAL_EMBEDDING = 'http://embedding-service:11435';
const ARASUL_INTERNAL_QDRANT = 'http://qdrant:6333';
const EMBEDDING_DIMENSION = 1024;

/**
 * Aggregates everything the n8n-doc template needs:
 *  - currently loaded model (so the doc shows what the user is talking to)
 *  - default model (fallback when nothing is loaded)
 *  - latest API-key prefix (for copy/paste examples)
 *  - public hostname (for the "external" base URL — n8n that runs on the
 *    same box uses the docker-internal name; humans need a real URL).
 */
export function useN8nIntegrationData() {
  const api = useApi();

  // Reuse the shared cache from useModelStatus — same TanStack key.
  const budgetQuery = useQuery({
    queryKey: modelKeys.memoryBudget(),
    queryFn: ({ signal }) =>
      api.get<MemoryBudget>('/models/memory-budget', { showError: false, signal }),
    refetchInterval: MODEL_POLL_INTERVAL_MS,
  });

  const defaultQuery = useQuery({
    queryKey: modelKeys.default(),
    queryFn: ({ signal }) =>
      api.get<DefaultModelResponse>('/models/default', { showError: false, signal }),
  });

  const apiKeysQuery = useQuery({
    queryKey: ['n8n', 'api-keys'],
    queryFn: ({ signal }) =>
      api.get<ApiKeysResponse>('/v1/external/api-keys', { showError: false, signal }),
    staleTime: 30_000,
  });

  const loaded = budgetQuery.data?.loadedModels ?? [];
  const activeModel = loaded[0]?.ollamaName || loaded[0]?.id || null;
  const defaultModel = defaultQuery.data?.default_model || null;
  const latestKeyPrefix = apiKeysQuery.data?.api_keys?.find(k => k.is_active)?.key_prefix || null;

  // External base URL — what's reachable from outside the box. The frontend
  // talks to /api on the same origin, so window.location is the right
  // anchor. Local-dev (vite at 3000) and production (Traefik at 443) both
  // resolve cleanly here.
  const baseUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.host}`
      : 'https://arasul.local';

  const data: N8nDocData = {
    activeModel,
    defaultModel,
    baseUrl,
    internalBackendUrl: ARASUL_INTERNAL_BACKEND,
    internalOllamaUrl: ARASUL_INTERNAL_OLLAMA,
    internalEmbeddingUrl: ARASUL_INTERNAL_EMBEDDING,
    internalQdrantUrl: ARASUL_INTERNAL_QDRANT,
    latestKeyPrefix,
    embeddingDim: EMBEDDING_DIMENSION,
    generatedAt: new Date().toISOString().slice(0, 10),
  };

  return {
    data,
    isLoading: budgetQuery.isLoading || defaultQuery.isLoading,
    isFetching: budgetQuery.isFetching || apiKeysQuery.isFetching,
  };
}
