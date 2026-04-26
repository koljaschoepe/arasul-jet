import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import type { Document } from '../../../types';
import { documentsKeys } from './queryKeys';

/** Invalidate all document-related queries (used by most mutations on success). */
function useInvalidateDocuments() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: documentsKeys.all });
    qc.invalidateQueries({ queryKey: documentsKeys.spaces() });
  };
}

// ---- Single-document operations ----

/** useDeleteDocumentMutation — Soft-delete a single document. */
export function useDeleteDocumentMutation(): UseMutationResult<unknown, Error, string> {
  const api = useApi();
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (docId: string) => api.del(`/documents/${docId}`, { showError: false }),
    onSuccess: invalidate,
  });
}

/** useReindexDocumentMutation — Re-queue a document for indexing. */
export function useReindexDocumentMutation(): UseMutationResult<unknown, Error, string> {
  const api = useApi();
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (docId: string) =>
      api.post(`/documents/${docId}/reindex`, undefined, { showError: false }),
    onSuccess: invalidate,
  });
}

interface MoveDocumentPayload {
  docId: string;
  spaceId: string | null;
  spaceName: string | null;
}

/**
 * useMoveDocumentMutation — Move a document to a different space.
 * Toasts on success; the caller doesn't need to wire its own.
 */
export function useMoveDocumentMutation(): UseMutationResult<unknown, Error, MoveDocumentPayload> {
  const api = useApi();
  const toast = useToast();
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({ docId, spaceId }: MoveDocumentPayload) =>
      api.put(`/documents/${docId}/move`, { space_id: spaceId }, { showError: false }),
    onSuccess: (_data, vars) => {
      toast.success(`Dokument verschoben nach: ${vars.spaceName || 'Kein Bereich'}`);
      invalidate();
    },
    onError: err => {
      toast.error(
        'Fehler beim Verschieben: ' + (err instanceof Error ? err.message : 'Unbekannter Fehler')
      );
    },
  });
}

interface ToggleFavoritePayload {
  doc: Document;
}

/**
 * useToggleFavoriteMutation — Optimistically flip is_favorite. Rolls back
 * on error so the UI matches server state.
 */
export function useToggleFavoriteMutation(): UseMutationResult<
  unknown,
  Error,
  ToggleFavoritePayload,
  { snapshot: Map<unknown, unknown> }
> {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ doc }: ToggleFavoritePayload) =>
      api.patch(`/documents/${doc.id}`, { is_favorite: !doc.is_favorite }, { showError: false }),
    onMutate: async ({ doc }) => {
      await qc.cancelQueries({ queryKey: documentsKeys.all });
      // Snapshot all matching list caches so we can roll back on error
      const snapshot = new Map<unknown, unknown>();
      qc.getQueriesData<{ documents: Document[]; total: number }>({
        queryKey: [...documentsKeys.all, 'list'],
      }).forEach(([key, value]) => {
        if (!value) return;
        snapshot.set(key, value);
        qc.setQueryData(key, {
          ...value,
          documents: value.documents.map(d =>
            d.id === doc.id ? { ...d, is_favorite: !d.is_favorite } : d
          ),
        });
      });
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      context?.snapshot.forEach((value, key) => {
        qc.setQueryData(key as readonly unknown[], value);
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: documentsKeys.all });
    },
  });
}

// ---- Semantic search (mutation, not a query — it's a one-shot user action) ----

interface SearchResults {
  query?: string;
  results: Array<{
    document_name?: string;
    chunk_text?: string;
    score?: number;
    [key: string]: unknown;
  }>;
}

/** useSemanticSearchMutation — POST /documents/search. */
export function useSemanticSearchMutation(): UseMutationResult<SearchResults, Error, string> {
  const api = useApi();
  return useMutation({
    mutationFn: (query: string) =>
      api.post<SearchResults>('/documents/search', { query, top_k: 10 }, { showError: false }),
  });
}

// ---- Cleanup ----

interface CleanupResponse {
  cleaned: {
    deleted_from_minio: number;
    marked_failed_in_db: number;
    purged_soft_deleted: number;
  };
}

/** useCleanupOrphanedMutation — Admin: clean orphaned files. */
export function useCleanupOrphanedMutation(): UseMutationResult<CleanupResponse, Error, void> {
  const api = useApi();
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: () =>
      api.post<CleanupResponse>('/documents/cleanup-orphaned', {}, { showError: false }),
    onSuccess: invalidate,
  });
}

// ---- Batch operations ----

interface BatchResponse {
  deleted?: number;
  queued?: number;
  moved?: number;
  errors?: unknown[];
}

/** useBatchDeleteMutation — Soft-delete many documents at once. */
export function useBatchDeleteMutation(): UseMutationResult<BatchResponse, Error, string[]> {
  const api = useApi();
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post<BatchResponse>('/documents/batch/delete', { ids }, { showError: false }),
    onSuccess: invalidate,
  });
}

/** useBatchReindexMutation — Reindex many documents. */
export function useBatchReindexMutation(): UseMutationResult<BatchResponse, Error, string[]> {
  const api = useApi();
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post<BatchResponse>('/documents/batch/reindex', { ids }, { showError: false }),
    onSuccess: invalidate,
  });
}

interface BatchMovePayload {
  ids: string[];
  spaceId: string | null;
}

/** useBatchMoveMutation — Move many documents to a target space. */
export function useBatchMoveMutation(): UseMutationResult<BatchResponse, Error, BatchMovePayload> {
  const api = useApi();
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({ ids, spaceId }: BatchMovePayload) =>
      api.post<BatchResponse>(
        '/documents/batch/move',
        { ids, space_id: spaceId },
        { showError: false }
      ),
    onSuccess: invalidate,
  });
}

// ---- Tables (Datentabellen) ----

/** useDeleteTableMutation — Delete a PostgreSQL table by slug. */
export function useDeleteTableMutation(): UseMutationResult<unknown, Error, string> {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => api.del(`/v1/datentabellen/tables/${slug}`, { showError: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...documentsKeys.all, 'tables'] });
    },
  });
}
