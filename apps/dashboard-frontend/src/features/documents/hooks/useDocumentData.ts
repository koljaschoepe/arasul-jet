import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import type {
  Document,
  DocumentSpace,
  DocumentCategory,
  DocumentStatistics,
  DataTable,
} from '../../../types';
import {
  useDocumentsQuery,
  useCategoriesQuery,
  useStatisticsQuery,
  useSpacesQuery,
  useTablesQuery,
} from './queries';

const POLL_FAST = 5000;
const POLL_IDLE = 30000;

interface UseDocumentDataReturn {
  // Data
  documents: Document[];
  tables: DataTable[];
  categories: DocumentCategory[];
  statistics: DocumentStatistics | null;
  spaces: DocumentSpace[];
  totalDocuments: number;
  totalTables: number;

  // Status
  loading: boolean;
  loadingTables: boolean;
  error: string | null;
  statsError: boolean;
  spacesError: boolean;
  setError: React.Dispatch<React.SetStateAction<string | null>>;

  // Filters
  activeSpaceId: string | null;
  uploadSpaceId: string | null;
  searchQuery: string;
  statusFilter: string;
  categoryFilter: string;
  currentPage: number;
  itemsPerPage: number;
  setActiveSpaceId: React.Dispatch<React.SetStateAction<string | null>>;
  setUploadSpaceId: React.Dispatch<React.SetStateAction<string | null>>;
  setSearchQuery: (value: string) => void;
  setStatusFilter: (value: string) => void;
  setCategoryFilter: (value: string) => void;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setItemsPerPage: React.Dispatch<React.SetStateAction<number>>;

  // Actions / reloads
  selectSpace: (spaceId: string | null) => void;
  reloadDocuments: () => void;
  reloadStatistics: () => void;
  reloadSpaces: () => void;
  reloadTables: () => void;
  reloadAll: () => void;
}

/**
 * useDocumentData — Filter state + composed TanStack queries for the
 * Documents view. Public API preserved from the pre-TanStack version so
 * consumers don't change. Internally:
 *   - Each data domain is a separate useQuery (auto-cached, deduped)
 *   - Adaptive polling: 5s fast / 30s idle, derived from current document
 *     statuses (toggles via refetchInterval)
 *   - Status-transition toasts (pending→indexed) live here since they
 *     compare server-state across refetches
 */
export default function useDocumentData(): UseDocumentDataReturn {
  const toast = useToast();

  // Filter state — drives query keys
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [uploadSpaceId, setUploadSpaceId] = useState<string | null>(null);
  const [searchQuery, setSearchQueryState] = useState('');
  const [statusFilter, setStatusFilterState] = useState('');
  const [categoryFilter, setCategoryFilterState] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Local error overlay (mutations + actions write here)
  const [error, setError] = useState<string | null>(null);

  // Filter setters that also reset to page 1 (canonical UX)
  const setSearchQuery = useCallback((value: string) => {
    setSearchQueryState(value);
    setCurrentPage(1);
  }, []);
  const setStatusFilter = useCallback((value: string) => {
    setStatusFilterState(value);
    setCurrentPage(1);
  }, []);
  const setCategoryFilter = useCallback((value: string) => {
    setCategoryFilterState(value);
    setCurrentPage(1);
  }, []);

  const listFilters = {
    activeSpaceId,
    searchQuery,
    statusFilter,
    categoryFilter,
    currentPage,
    itemsPerPage,
  };
  const statsFilters = { activeSpaceId, statusFilter, categoryFilter };
  const tablesFilters = { activeSpaceId, statusFilter, searchQuery };

  // Adaptive polling: derive interval from whatever data we currently have.
  // We track this via a ref-like state that updates AFTER each render — the
  // next refetch cycle picks up the new interval automatically.
  const [pollInterval, setPollInterval] = useState<number>(POLL_IDLE);

  const documentsQuery = useDocumentsQuery(listFilters, pollInterval);
  const statsQuery = useStatisticsQuery(statsFilters, pollInterval);
  const tablesQuery = useTablesQuery(tablesFilters, pollInterval);
  const categoriesQuery = useCategoriesQuery();
  const spacesQuery = useSpacesQuery();

  const documents = documentsQuery.data?.documents ?? [];
  const totalDocuments = documentsQuery.data?.total ?? 0;

  // Recompute polling interval whenever the documents list changes
  useEffect(() => {
    const hasPending = documents.some(
      d => d.status === 'pending' || d.status === 'processing' || d.status === 'uploaded'
    );
    setPollInterval(hasPending ? POLL_FAST : POLL_IDLE);
  }, [documents]);

  // Status-transition toasts — runs whenever the documents list changes
  const prevStatusesRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const prev = prevStatusesRef.current;
    for (const doc of documents) {
      const oldStatus = prev.get(doc.id);
      if (oldStatus && oldStatus !== doc.status) {
        if (doc.status === 'indexed') {
          toast.success(`„${doc.original_name || doc.filename}" erfolgreich indexiert`);
        } else if (doc.status === 'failed') {
          toast.error(`Indexierung fehlgeschlagen: „${doc.original_name || doc.filename}"`);
        }
      }
    }
    const next = new Map<string, string>();
    for (const doc of documents) next.set(doc.id, doc.status);
    prevStatusesRef.current = next;
  }, [documents, toast]);

  // Surface load errors as a single error message
  useEffect(() => {
    if (documentsQuery.error) {
      setError('Fehler beim Laden der Dokumente');
    }
  }, [documentsQuery.error]);

  // Switch active space + reset filters (canonical UX)
  const selectSpace = useCallback((spaceId: string | null) => {
    setActiveSpaceId(spaceId);
    setCurrentPage(1);
    setStatusFilterState('');
    setCategoryFilterState('');
    setSearchQueryState('');
    setUploadSpaceId(spaceId);
  }, []);

  // Manual reloads delegate to the underlying refetch functions
  const reloadDocuments = useCallback(() => {
    documentsQuery.refetch();
  }, [documentsQuery]);
  const reloadStatistics = useCallback(() => {
    statsQuery.refetch();
  }, [statsQuery]);
  const reloadSpaces = useCallback(() => {
    spacesQuery.refetch();
  }, [spacesQuery]);
  const reloadTables = useCallback(() => {
    tablesQuery.refetch();
  }, [tablesQuery]);
  const reloadAll = useCallback(() => {
    documentsQuery.refetch();
    statsQuery.refetch();
    spacesQuery.refetch();
    tablesQuery.refetch();
  }, [documentsQuery, statsQuery, spacesQuery, tablesQuery]);

  return {
    documents,
    tables: tablesQuery.data?.tables ?? [],
    categories: categoriesQuery.data ?? [],
    statistics: statsQuery.data ?? null,
    spaces: spacesQuery.data ?? [],
    totalDocuments,
    totalTables: tablesQuery.data?.total ?? 0,

    loading: documentsQuery.isLoading,
    loadingTables: tablesQuery.isLoading,
    error,
    statsError: !!statsQuery.error,
    spacesError: !!spacesQuery.error,
    setError,

    activeSpaceId,
    uploadSpaceId,
    searchQuery,
    statusFilter,
    categoryFilter,
    currentPage,
    itemsPerPage,
    setActiveSpaceId,
    setUploadSpaceId,
    setSearchQuery,
    setStatusFilter,
    setCategoryFilter,
    setCurrentPage,
    setItemsPerPage,

    selectSpace,
    reloadDocuments,
    reloadStatistics,
    reloadSpaces,
    reloadTables,
    reloadAll,
  };
}
