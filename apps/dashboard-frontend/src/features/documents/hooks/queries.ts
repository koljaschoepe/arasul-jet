import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApi } from '../../../hooks/useApi';
import type {
  Document,
  DocumentSpace,
  DocumentCategory,
  DocumentStatistics,
  DataTable,
} from '../../../types';
import {
  documentsKeys,
  type DocumentListFilters,
  type DocumentStatsFilters,
  type DocumentTablesFilters,
} from './queryKeys';
import type { SimilarDocument } from './useDocumentActions';

// ---- Documents list ----

interface DocumentsListResponse {
  documents?: Document[];
  total?: number;
}

export interface DocumentsListResult {
  documents: Document[];
  total: number;
}

/**
 * useDocumentsQuery — Paged + filtered documents list. Adaptive polling
 * happens at the consumer level (via `refetchInterval`) so we don't bake
 * polling cadence into the hook.
 */
export function useDocumentsQuery(
  filters: DocumentListFilters,
  refetchInterval: number | false = false
): UseQueryResult<DocumentsListResult> {
  const api = useApi();
  return useQuery({
    queryKey: documentsKeys.list(filters),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        limit: String(filters.itemsPerPage),
        offset: String((filters.currentPage - 1) * filters.itemsPerPage),
      });
      if (filters.statusFilter) params.append('status', filters.statusFilter);
      if (filters.categoryFilter) params.append('category_id', filters.categoryFilter);
      if (filters.searchQuery) params.append('search', filters.searchQuery);
      if (filters.activeSpaceId) params.append('space_id', filters.activeSpaceId);

      const data = await api.get<DocumentsListResponse>(`/documents?${params}`, {
        signal,
        showError: false,
      });
      return { documents: data.documents ?? [], total: data.total ?? 0 };
    },
    refetchInterval,
    placeholderData: prev => prev, // keep previous results visible while refetching with new filters
  });
}

// ---- Categories ----

interface CategoriesResponse {
  categories?: DocumentCategory[];
}

/** useCategoriesQuery — Document categories. Long staleTime: rarely change. */
export function useCategoriesQuery(): UseQueryResult<DocumentCategory[]> {
  const api = useApi();
  return useQuery({
    queryKey: documentsKeys.categories(),
    queryFn: async ({ signal }) => {
      const data = await api.get<CategoriesResponse>('/documents/categories', {
        signal,
        showError: false,
      });
      return data.categories ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

// ---- Statistics ----

/** useStatisticsQuery — Filter-aware document statistics for KPI cards. */
export function useStatisticsQuery(
  filters: DocumentStatsFilters,
  refetchInterval: number | false = false
): UseQueryResult<DocumentStatistics | null> {
  const api = useApi();
  return useQuery({
    queryKey: documentsKeys.statistics(filters),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (filters.activeSpaceId) params.append('space_id', filters.activeSpaceId);
      if (filters.statusFilter) params.append('status', filters.statusFilter);
      if (filters.categoryFilter) params.append('category_id', filters.categoryFilter);

      return api.get<DocumentStatistics>(`/documents/statistics?${params}`, {
        signal,
        showError: false,
      });
    },
    refetchInterval,
  });
}

// ---- Spaces ----

interface SpacesResponse {
  spaces?: DocumentSpace[];
}

/** useSpacesQuery — Knowledge spaces for RAG. Shared across documents view. */
export function useSpacesQuery(): UseQueryResult<DocumentSpace[]> {
  const api = useApi();
  return useQuery({
    queryKey: documentsKeys.spaces(),
    queryFn: async ({ signal }) => {
      const data = await api.get<SpacesResponse>('/spaces', { signal, showError: false });
      return data.spaces ?? [];
    },
  });
}

// ---- Tables (PostgreSQL Datentabellen) ----

interface TablesResponse {
  tables?: DataTable[];
  data?: DataTable[];
  total?: number;
}

export interface TablesResult {
  tables: DataTable[];
  total: number;
}

const STATUS_TO_TABLE_STATUS: Record<string, string> = {
  indexed: 'active',
  pending: 'draft',
  failed: 'archived',
};

/**
 * useTablesQuery — PostgreSQL Datentabellen, filtered by space/status/search.
 * Reuses the same filter shape as documents but maps status values to
 * table-specific names.
 */
export function useTablesQuery(
  filters: DocumentTablesFilters,
  refetchInterval: number | false = false
): UseQueryResult<TablesResult> {
  const api = useApi();
  return useQuery({
    queryKey: documentsKeys.tables(filters),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (filters.activeSpaceId) params.append('space_id', filters.activeSpaceId);
      if (filters.statusFilter) {
        params.append(
          'status',
          STATUS_TO_TABLE_STATUS[filters.statusFilter] || filters.statusFilter
        );
      }
      if (filters.searchQuery) params.append('search', filters.searchQuery);

      const data = await api.get<TablesResponse>(`/v1/datentabellen/tables?${params}`, {
        signal,
        showError: false,
      });
      const tables = data.tables ?? data.data ?? [];
      return { tables, total: data.total ?? tables.length };
    },
    refetchInterval,
    placeholderData: prev => prev,
  });
}

// ---- Similar documents ----

interface SimilarResponse {
  similar_documents?: SimilarDocument[];
}

/**
 * useSimilarDocumentsQuery — Similar documents for the details modal.
 * Disabled until a document is selected and indexed; triggered on demand.
 */
export function useSimilarDocumentsQuery(doc: Document | null): UseQueryResult<SimilarDocument[]> {
  const api = useApi();
  const enabled = !!doc && doc.status === 'indexed';
  return useQuery({
    queryKey: documentsKeys.similar(doc?.id ?? 'none'),
    enabled,
    queryFn: async ({ signal }) => {
      const data = await api.get<SimilarResponse>(`/documents/${doc!.id}/similar`, {
        signal,
        showError: false,
      });
      return data.similar_documents ?? [];
    },
  });
}
