import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { useBatchDeleteMutation, useBatchReindexMutation, useBatchMoveMutation } from './mutations';

interface UseDocumentBatchParams {
  /** Document IDs visible in the current view (used for select-all). */
  visibleDocIds: string[];
  /** Filter signal — selection clears whenever any of these change. */
  selectionResetKey: unknown;
  /** Confirm dialog from useConfirm(). */
  confirm: (options: {
    title?: string;
    message: string;
    confirmText?: string;
    confirmVariant?: 'warning' | 'danger';
  }) => Promise<boolean>;
  /** Kept for API parity; mutations invalidate cache themselves now. */
  reloadDocuments: () => void;
  reloadStatistics: () => void;
  reloadSpaces: () => void;
}

interface UseDocumentBatchReturn {
  selectedIds: Set<string>;
  selectionCount: number;
  allDocsSelected: boolean;
  someDocsSelected: boolean;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;
  handleBatchDelete: () => Promise<void>;
  handleBatchReindex: () => Promise<void>;
  handleBatchMove: (spaceId: string | null, spaceName: string) => Promise<void>;
}

/**
 * useDocumentBatch — Multi-select state and batch operations (delete,
 * reindex, move). Public API preserved; server calls now go through
 * TanStack mutations which invalidate the documents cache automatically.
 */
export default function useDocumentBatch({
  visibleDocIds,
  selectionResetKey,
  confirm,
}: UseDocumentBatchParams): UseDocumentBatchReturn {
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const batchDelete = useBatchDeleteMutation();
  const batchReindex = useBatchReindexMutation();
  const batchMove = useBatchMoveMutation();

  // Clear selection whenever filters/page change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectionResetKey]);

  const allDocsSelected =
    visibleDocIds.length > 0 && visibleDocIds.every(id => selectedIds.has(id));
  const someDocsSelected = visibleDocIds.some(id => selectedIds.has(id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      const allSelected = visibleDocIds.length > 0 && visibleDocIds.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(visibleDocIds);
    });
  }, [visibleDocIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBatchDelete = useCallback(async () => {
    const count = selectedIds.size;
    const confirmed = await confirm({
      title: `${count} Dokumente löschen?`,
      message: `${count} ausgewählte Dokumente werden unwiderruflich gelöscht.`,
    });
    if (!confirmed) return;

    try {
      const result = await batchDelete.mutateAsync(Array.from(selectedIds));
      const errors = result.errors?.length ?? 0;
      const deleted = result.deleted ?? 0;
      if (errors > 0) {
        toast.warning(`${deleted} gelöscht, ${errors} fehlgeschlagen`);
      } else {
        toast.success(`${deleted} Dokumente gelöscht`);
      }
      setSelectedIds(new Set());
    } catch (err: unknown) {
      toast.error(
        'Batch-Löschung fehlgeschlagen: ' +
          (err instanceof Error ? err.message : 'Unbekannter Fehler')
      );
    }
  }, [batchDelete, confirm, selectedIds, toast]);

  const handleBatchReindex = useCallback(async () => {
    try {
      const result = await batchReindex.mutateAsync(Array.from(selectedIds));
      const errors = result.errors?.length ?? 0;
      const queued = result.queued ?? 0;
      if (errors > 0) {
        toast.warning(`${queued} eingeplant, ${errors} fehlgeschlagen`);
      } else {
        toast.success(`${queued} Dokumente zur Neuindexierung eingeplant`);
      }
      setSelectedIds(new Set());
    } catch (err: unknown) {
      toast.error(
        'Batch-Reindex fehlgeschlagen: ' +
          (err instanceof Error ? err.message : 'Unbekannter Fehler')
      );
    }
  }, [batchReindex, selectedIds, toast]);

  const handleBatchMove = useCallback(
    async (spaceId: string | null, spaceName: string) => {
      try {
        const result = await batchMove.mutateAsync({
          ids: Array.from(selectedIds),
          spaceId,
        });
        const errors = result.errors?.length ?? 0;
        const moved = result.moved ?? 0;
        if (errors > 0) {
          toast.warning(`${moved} verschoben, ${errors} fehlgeschlagen`);
        } else {
          toast.success(`${moved} Dokumente verschoben nach: ${spaceName}`);
        }
        setSelectedIds(new Set());
      } catch (err: unknown) {
        toast.error(
          'Batch-Verschiebung fehlgeschlagen: ' +
            (err instanceof Error ? err.message : 'Unbekannter Fehler')
        );
      }
    },
    [batchMove, selectedIds, toast]
  );

  return {
    selectedIds,
    selectionCount: selectedIds.size,
    allDocsSelected,
    someDocsSelected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    handleBatchDelete,
    handleBatchReindex,
    handleBatchMove,
  };
}
