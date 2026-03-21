import { useState, useCallback } from 'react';

interface UsePaginationReturn {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setTotalRows: (total: number) => void;
  nextPage: () => void;
  prevPage: () => void;
}

export default function usePagination(initialPageSize = 50): UsePaginationReturn {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [totalRows, setTotalRows] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const nextPage = useCallback(() => {
    setPage(prev => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setPage(prev => Math.max(prev - 1, 1));
  }, []);

  return {
    page,
    pageSize,
    totalRows,
    totalPages,
    setPage,
    setPageSize,
    setTotalRows,
    nextPage,
    prevPage,
  };
}
