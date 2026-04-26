/**
 * Centralized TanStack Query keys for the Documents feature.
 *
 * Key structure includes filter inputs so different filter combinations
 * get separate cache entries (and unrelated invalidations don't dump
 * unrelated data).
 */
export interface DocumentListFilters {
  activeSpaceId: string | null;
  searchQuery: string;
  statusFilter: string;
  categoryFilter: string;
  currentPage: number;
  itemsPerPage: number;
}

export interface DocumentStatsFilters {
  activeSpaceId: string | null;
  statusFilter: string;
  categoryFilter: string;
}

export interface DocumentTablesFilters {
  activeSpaceId: string | null;
  statusFilter: string;
  searchQuery: string;
}

export const documentsKeys = {
  all: ['documents'] as const,
  list: (filters: DocumentListFilters) => [...documentsKeys.all, 'list', filters] as const,
  statistics: (filters: DocumentStatsFilters) =>
    [...documentsKeys.all, 'statistics', filters] as const,
  categories: () => [...documentsKeys.all, 'categories'] as const,
  similar: (docId: string) => [...documentsKeys.all, 'similar', docId] as const,
  tables: (filters: DocumentTablesFilters) => [...documentsKeys.all, 'tables', filters] as const,
  spaces: () => ['spaces'] as const,
};
