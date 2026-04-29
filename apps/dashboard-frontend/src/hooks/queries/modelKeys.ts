/**
 * Centralized TanStack Query keys for ALL model-related queries.
 *
 * Background (Phase 1 of LLM_RAG_N8N_HARDENING):
 *   Before this file, three places defined their own model-query keys:
 *     - apps/dashboard-frontend/src/contexts/chat/useChatModels.ts (KEYS)
 *     - apps/dashboard-frontend/src/features/store/hooks/queryKeys.ts
 *     - apps/dashboard-frontend/src/hooks/useModelStatus.ts (no TanStack at all)
 *   The arrays happened to be structurally equal (`['models', 'status']`),
 *   so the cache *did* coalesce — but the code claimed isolation in a
 *   comment, and any drift in one place silently broke cross-feature sync.
 *   This module is the single declarative source.
 *
 * Hierarchical structure for targeted invalidation:
 *   modelKeys.all              → invalidate every model query
 *   modelKeys.catalog()        → catalog only
 *   modelKeys.status()         → loaded model + queue stats
 *   modelKeys.installed()      → installed-models list
 *   modelKeys.loaded()         → currently-loaded models list
 *   modelKeys.default()        → system default model id
 *   modelKeys.memoryBudget()   → memory budget + LRU candidates
 *   modelKeys.capabilities(id) → per-model capabilities
 */
export const modelKeys = {
  all: ['models'] as const,
  catalog: () => [...modelKeys.all, 'catalog'] as const,
  status: () => [...modelKeys.all, 'status'] as const,
  installed: () => [...modelKeys.all, 'installed'] as const,
  loaded: () => [...modelKeys.all, 'loaded'] as const,
  default: () => [...modelKeys.all, 'default'] as const,
  memoryBudget: () => [...modelKeys.all, 'memory-budget'] as const,
  capabilities: (modelId: string) => [...modelKeys.all, 'capabilities', modelId] as const,
} as const;

/**
 * Standard polling interval for live model state (loaded model, queue, status).
 * Matches the backend SSE/sync cadence so the UI never lags >5s behind reality.
 *
 * Catalog and capabilities are static-ish and refetch on demand only.
 */
export const MODEL_POLL_INTERVAL_MS = 5_000;
