import { useState, useCallback } from 'react';
import type { Row, CellPosition } from '../types';

export default function useSorting(rows: Row[], setActiveCell: (pos: CellPosition) => void) {
  const [sortField, setSortField] = useState('_created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Server-side sorting: rows come pre-sorted from the API, so just pass through
  const sortedRows = rows;

  const handleSort = useCallback(
    (fieldSlug: string) => {
      if (sortField === fieldSlug) {
        setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(fieldSlug);
        setSortOrder('asc');
      }
      setActiveCell({ row: 0, col: 0 });
    },
    [sortField, setActiveCell]
  );

  return { sortField, sortOrder, sortedRows, handleSort };
}
