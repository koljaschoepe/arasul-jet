/**
 * Centralized TanStack Query keys for the Store feature.
 *
 * Hierarchical structure for targeted invalidation:
 *   storeKeys.all()                  → invalidate everything
 *   storeKeys.modelStatus()          → only loaded model + queue
 *   storeKeys.search(query)          → specific search query
 */
export const storeKeys = {
  all: ['store'] as const,
  info: () => [...storeKeys.all, 'info'] as const,
  search: (query: string) => [...storeKeys.all, 'search', query] as const,
  recommendations: () => [...storeKeys.all, 'recommendations'] as const,
  // Apps + Models live under their own roots so unrelated invalidations don't dump them
  apps: () => ['apps'] as const,
  modelsCatalog: () => ['models', 'catalog'] as const,
  modelsStatus: () => ['models', 'status'] as const,
  modelsDefault: () => ['models', 'default'] as const,
};
