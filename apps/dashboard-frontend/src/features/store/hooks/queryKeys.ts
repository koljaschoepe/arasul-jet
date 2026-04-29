/**
 * Centralized TanStack Query keys for the Store feature.
 *
 * Phase 1 (LLM_RAG_N8N_HARDENING): the model-namespace keys moved to
 * `src/hooks/queries/modelKeys.ts` to be the single source of truth for
 * Chat / Store / Dashboard / Sidebar. The `storeKeys.modelsX` getters
 * below now alias the centralized ones so existing imports keep working
 * unchanged. New code should import `modelKeys` directly.
 *
 * Hierarchical structure for targeted invalidation:
 *   storeKeys.all                    → invalidate Store-only state
 *   storeKeys.search(query)          → specific search query
 *   storeKeys.modelsStatus()         → loaded model + queue (alias)
 */
import { modelKeys } from '../../../hooks/queries/modelKeys';

export const storeKeys = {
  all: ['store'] as const,
  info: () => [...storeKeys.all, 'info'] as const,
  search: (query: string) => [...storeKeys.all, 'search', query] as const,
  recommendations: () => [...storeKeys.all, 'recommendations'] as const,
  // Apps live under their own root so unrelated invalidations don't dump them
  apps: () => ['apps'] as const,
  // Aliases — prefer `modelKeys.*` in new code
  modelsCatalog: modelKeys.catalog,
  modelsStatus: modelKeys.status,
  modelsDefault: modelKeys.default,
} as const;
