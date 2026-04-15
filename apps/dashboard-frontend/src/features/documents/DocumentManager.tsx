import React, { useState, useEffect, useCallback, useRef } from 'react';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonDocumentList } from '../../components/ui/Skeleton';
import {
  Upload,
  File,
  Search,
  Filter,
  Trash2,
  Download,
  RefreshCw,
  X,
  Check,
  AlertCircle,
  Clock,
  Folder,
  Star,
  FileText,
  Database,
  Cpu,
  Eye,
  Pencil,
  Plus,
  Settings,
  Table,
  Grid3x3,
  CheckSquare,
  Square,
  Minus,
  FolderInput,
} from 'lucide-react';
import { TableBadge, StatusBadge, TableStatusBadge, IndexStatusBadge, SpaceBadge } from './Badges';
import TipTapEditor from '../../components/editor/tiptap/TipTapEditor';
import CreateDocumentDialog from '../../components/editor/CreateDocumentDialog';
import ExcelEditor from '../datentabellen/ExcelEditor';
import SpaceModal from './SpaceModal';
import DocumentDetailsModal from './DocumentDetailsModal';
import { useApi } from '../../hooks/useApi';
import { getValidToken } from '../../utils/token';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import { formatFileSize } from '../../utils/formatting';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import useDocumentUpload from './useDocumentUpload';
import useDocumentActions from './useDocumentActions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/shadcn/button';
import type {
  Document,
  DocumentSpace,
  DocumentCategory,
  DocumentStatistics,
  DataTable,
} from '../../types';

function DocumentManager() {
  // State
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tables, setTables] = useState<DataTable[]>([]); // PostgreSQL Datentabellen
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [statistics, setStatistics] = useState<DocumentStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [spacesError, setSpacesError] = useState(false);

  // Knowledge Spaces (RAG 2.0)
  const [spaces, setSpaces] = useState<DocumentSpace[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null); // null = all spaces
  const [showSpaceModal, setShowSpaceModal] = useState(false);
  const [editingSpace, setEditingSpace] = useState<DocumentSpace | null>(null);
  const [uploadSpaceId, setUploadSpaceId] = useState<string | null>(null);

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Upload state - provided by useDocumentUpload hook below

  // Modal/search state - provided by useDocumentActions hook below

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);

  // Table Editor state (ExcelEditor popup)
  const [showTableEditor, setShowTableEditor] = useState(false);
  const [editingTable, setEditingTable] = useState<DataTable | null>(null);

  // Create dialog state
  const [showMarkdownCreate, setShowMarkdownCreate] = useState(false);
  const [showSimpleTableCreate, setShowSimpleTableCreate] = useState(false);

  // Multi-select for batch operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get auth token via validated token utility
  const getAuthToken = () => getValidToken();

  // Check if file is editable (markdown or text)
  const isEditable = (doc: Document) => {
    const editableExtensions = ['.md', '.markdown', '.txt'];
    return editableExtensions.includes(doc.file_extension?.toLowerCase() ?? '');
  };

  // Check if any type of editing is supported
  const canEdit = (doc: Document) => {
    return isEditable(doc);
  };

  // Get file type icon
  const getFileIcon = (doc: Document) => {
    if (isEditable(doc)) return FileText;
    return File;
  };

  // Get document type label
  const getDocumentType = (_doc: Document) => {
    return 'Dokument';
  };

  // Load documents
  const loadDocuments = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          limit: String(itemsPerPage),
          offset: String((currentPage - 1) * itemsPerPage),
        });

        if (statusFilter) params.append('status', statusFilter);
        if (categoryFilter) params.append('category_id', categoryFilter);
        if (searchQuery) params.append('search', searchQuery);
        if (activeSpaceId) params.append('space_id', activeSpaceId);

        const data = await api.get(`/documents?${params}`, { signal, showError: false });
        setDocuments(data.documents || []);
        setTotalDocuments(data.total || 0);
        setError(null);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        console.error('Error loading documents:', err);
        setError('Fehler beim Laden der Dokumente');
      } finally {
        setLoading(false);
      }
    },
    [api, currentPage, statusFilter, categoryFilter, searchQuery, itemsPerPage, activeSpaceId]
  );

  // Load categories
  const loadCategories = async (signal?: AbortSignal) => {
    try {
      const data = await api.get('/documents/categories', { signal, showError: false });
      setCategories(data.categories || []);
    } catch (err: unknown) {
      if (signal?.aborted) return;
      console.error('Error loading categories:', err);
    }
  };

  // Load statistics - filter-aware for dynamic KPIs
  const loadStatistics = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const params = new URLSearchParams();
        if (activeSpaceId) params.append('space_id', activeSpaceId);
        if (statusFilter) params.append('status', statusFilter);
        if (categoryFilter) params.append('category_id', categoryFilter);

        const data = await api.get(`/documents/statistics?${params}`, { signal, showError: false });
        setStatistics(data);
        setStatsError(false);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        console.error('Error loading statistics:', err);
        setStatsError(true);
      }
    },
    [api, activeSpaceId, statusFilter, categoryFilter]
  );

  // Load Knowledge Spaces (RAG 2.0)
  const loadSpaces = async (signal?: AbortSignal) => {
    try {
      const data = await api.get('/spaces', { signal, showError: false });
      setSpaces(data.spaces || []);
      setSpacesError(false);
    } catch (err: unknown) {
      if (signal?.aborted) return;
      console.error('Error loading spaces:', err);
      setSpacesError(true);
    }
  };

  // Total tables count (from server)
  const [totalTables, setTotalTables] = useState(0);

  // Load Datentabellen (PostgreSQL tables) - server-side filtering
  const loadTables = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoadingTables(true);
        const params = new URLSearchParams();

        if (activeSpaceId) params.append('space_id', activeSpaceId);
        if (statusFilter) {
          // Map document status to table status
          const statusMap: Record<string, string> = {
            indexed: 'active',
            pending: 'draft',
            failed: 'archived',
          };
          params.append('status', statusMap[statusFilter] || statusFilter);
        }
        if (searchQuery) params.append('search', searchQuery);

        const data = await api.get(`/v1/datentabellen/tables?${params}`, {
          signal,
          showError: false,
        });
        const allTables = data.tables || data.data || [];
        setTables(allTables);
        setTotalTables(data.total || allTables.length);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        console.error('Error loading tables:', err);
      } finally {
        setLoadingTables(false);
      }
    },
    [api, activeSpaceId, statusFilter, searchQuery]
  );

  // Handle space change (for tabs) - reset all filters
  const handleSpaceChange = (spaceId: string | null) => {
    setActiveSpaceId(spaceId);
    setCurrentPage(1);
    setStatusFilter('');
    setCategoryFilter('');
    setSearchQuery('');
    // Also set as default upload space
    setUploadSpaceId(spaceId);
  };

  // Handle space modal save
  const handleSpaceSave = (_savedSpace: DocumentSpace | null) => {
    loadSpaces();
    loadStatistics();
    loadDocuments();
  };

  // Edit space
  const handleEditSpace = (space: DocumentSpace, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSpace(space);
    setShowSpaceModal(true);
  };

  // Move document to a different space
  const handleMoveDocument = async (
    docId: string,
    newSpaceId: string | null,
    newSpaceName: string | null
  ) => {
    try {
      await api.put(`/documents/${docId}/move`, { space_id: newSpaceId }, { showError: false });
      toast.success(`Dokument verschoben nach: ${newSpaceName || 'Kein Bereich'}`);
      loadDocuments();
      loadStatistics();
    } catch (err: unknown) {
      toast.error(
        'Fehler beim Verschieben: ' + (err instanceof Error ? err.message : 'Unbekannter Fehler')
      );
    }
  };

  // Cleanup orphaned files (admin action)
  const [cleaningUp, setCleaningUp] = useState(false);
  const handleCleanup = async () => {
    const confirmed = await confirm({
      title: 'Bereinigung starten?',
      message:
        'Verwaiste Dateien (ohne Datenbankeintrag) werden gelöscht und fehlende Dateien markiert. Soft-gelöschte Dokumente älter als 30 Tage werden endgültig entfernt.',
      confirmText: 'Bereinigen',
      confirmVariant: 'warning',
    });
    if (!confirmed) return;

    setCleaningUp(true);
    try {
      const result = await api.post('/documents/cleanup-orphaned', {}, { showError: false });
      const cleaned = result.cleaned;
      if (
        cleaned.deleted_from_minio + cleaned.marked_failed_in_db + cleaned.purged_soft_deleted ===
        0
      ) {
        toast.success('Keine verwaisten Dateien gefunden — alles sauber!');
      } else {
        toast.success(
          `Bereinigt: ${cleaned.deleted_from_minio} MinIO-Dateien, ${cleaned.marked_failed_in_db} DB-Einträge, ${cleaned.purged_soft_deleted} alte Löschungen`
        );
      }
      loadDocuments();
      loadStatistics();
    } catch (err: unknown) {
      toast.error(
        'Bereinigung fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Unbekannter Fehler')
      );
    } finally {
      setCleaningUp(false);
    }
  };

  // Batch operations
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allDocsSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(docIds));
    }
  };

  // Clear selection when documents change (filter, pagination)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeSpaceId, statusFilter, categoryFilter, searchQuery, currentPage]);

  const handleBatchDelete = async () => {
    const count = selectedIds.size;
    const confirmed = await confirm({
      title: `${count} Dokumente löschen?`,
      message: `${count} ausgewählte Dokumente werden unwiderruflich gelöscht.`,
    });
    if (!confirmed) return;

    try {
      const result = await api.post(
        '/documents/batch/delete',
        { ids: Array.from(selectedIds) },
        { showError: false }
      );
      if (result.errors?.length > 0) {
        toast.warning(`${result.deleted} gelöscht, ${result.errors.length} fehlgeschlagen`);
      } else {
        toast.success(`${result.deleted} Dokumente gelöscht`);
      }
      setSelectedIds(new Set());
      loadDocuments();
      loadStatistics();
      loadSpaces();
    } catch (err: unknown) {
      toast.error(
        'Batch-Löschung fehlgeschlagen: ' +
          (err instanceof Error ? err.message : 'Unbekannter Fehler')
      );
    }
  };

  const handleBatchReindex = async () => {
    try {
      const result = await api.post(
        '/documents/batch/reindex',
        { ids: Array.from(selectedIds) },
        { showError: false }
      );
      if (result.errors?.length > 0) {
        toast.warning(`${result.queued} eingeplant, ${result.errors.length} fehlgeschlagen`);
      } else {
        toast.success(`${result.queued} Dokumente zur Neuindexierung eingeplant`);
      }
      setSelectedIds(new Set());
      loadDocuments();
    } catch (err: unknown) {
      toast.error(
        'Batch-Reindex fehlgeschlagen: ' +
          (err instanceof Error ? err.message : 'Unbekannter Fehler')
      );
    }
  };

  const handleBatchMove = async (spaceId: string | null, spaceName: string) => {
    try {
      const result = await api.post(
        '/documents/batch/move',
        { ids: Array.from(selectedIds), space_id: spaceId },
        { showError: false }
      );
      if (result.errors?.length > 0) {
        toast.warning(`${result.moved} verschoben, ${result.errors.length} fehlgeschlagen`);
      } else {
        toast.success(`${result.moved} Dokumente verschoben nach: ${spaceName}`);
      }
      setSelectedIds(new Set());
      loadDocuments();
      loadStatistics();
      loadSpaces();
    } catch (err: unknown) {
      toast.error(
        'Batch-Verschiebung fehlgeschlagen: ' +
          (err instanceof Error ? err.message : 'Unbekannter Fehler')
      );
    }
  };

  // ML-001 FIX: Use ref to track loadDocuments to prevent interval recreation
  // when filter dependencies change. The interval should only be created once on mount.
  const loadDocumentsRef = useRef(loadDocuments);
  const loadStatisticsRef = useRef(loadStatistics);
  const loadTablesRef = useRef(loadTables);

  // Keep refs in sync with latest functions
  useEffect(() => {
    loadDocumentsRef.current = loadDocuments;
  }, [loadDocuments]);

  useEffect(() => {
    loadStatisticsRef.current = loadStatistics;
  }, [loadStatistics]);

  useEffect(() => {
    loadTablesRef.current = loadTables;
  }, [loadTables]);

  // Adaptive polling: 5s when documents are pending/processing, 30s otherwise
  const POLL_FAST = 5000;
  const POLL_IDLE = 30000;
  const prevStatusesRef = useRef<Map<string, string>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Detect status transitions and show toasts
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
    // Update ref with current statuses
    const next = new Map<string, string>();
    for (const doc of documents) {
      next.set(doc.id, doc.status);
    }
    prevStatusesRef.current = next;
  }, [documents, toast]);

  // Compute current poll interval based on document statuses
  const hasPending = documents.some(
    d => d.status === 'pending' || d.status === 'processing' || d.status === 'uploaded'
  );
  const pollInterval = hasPending ? POLL_FAST : POLL_IDLE;

  // Initial load + adaptive polling interval
  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    loadDocumentsRef.current(controller.signal);
    loadCategories(controller.signal);
    loadStatisticsRef.current(controller.signal);
    loadSpaces(controller.signal);
    loadTablesRef.current(controller.signal);

    return () => {
      controller.abort();
      controllerRef.current = null;
    };
  }, []); // Empty array - only run on mount

  // Dynamic polling interval - recreated when pollInterval changes
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      const signal = controllerRef.current?.signal;
      if (signal?.aborted) return;
      loadDocumentsRef.current(signal);
      loadStatisticsRef.current(signal);
      loadTablesRef.current(signal);
    }, pollInterval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollInterval]);

  // Reload all data when filters change
  useEffect(() => {
    const controller = new AbortController();
    loadDocumentsRef.current(controller.signal);
    loadStatisticsRef.current(controller.signal);
    loadTablesRef.current(controller.signal);
    return () => controller.abort();
  }, [activeSpaceId, statusFilter, categoryFilter, searchQuery]);

  // Upload hook
  const {
    uploading,
    uploadProgress,
    fileStatuses,
    dragActive,
    handleFileUpload,
    handleDrag,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  } = useDocumentUpload({
    activeSpaceId,
    uploadSpaceId,
    setError,
    loadDocuments,
    loadStatistics,
    loadSpaces,
  });

  // Document actions hook
  const {
    selectedDocument,
    setSelectedDocument,
    showDetails,
    setShowDetails,
    similarDocuments,
    loadingSimilar,
    semanticSearch,
    setSemanticSearch,
    searchResults,
    setSearchResults,
    searching,
    handleDelete,
    handleDownload,
    handleReindex,
    viewDocumentDetails,
    handleSemanticSearch,
    toggleFavorite,
  } = useDocumentActions({
    confirm,
    setError,
    loadDocuments,
    loadStatistics,
  });

  // --- Inline handlers that remain in component (editor, table-related) ---

  // Open editor for a document
  const handleEdit = (doc: Document) => {
    if (isEditable(doc)) {
      setEditingDocument(doc);
      setShowEditor(true);
    }
  };

  // Close editor and optionally refresh
  const handleEditorClose = () => {
    setShowEditor(false);
    setEditingDocument(null);
  };

  // Handle save from editor (refresh documents)
  const handleEditorSave = () => {
    loadDocuments();
    loadStatistics();
  };

  // Handle Markdown document creation
  const handleMarkdownCreated = (newDoc: Document | null) => {
    setShowMarkdownCreate(false);
    loadDocuments();
    loadStatistics();
    loadSpaces();
    // Open the new document for editing
    if (newDoc) {
      setEditingDocument(newDoc);
      setShowEditor(true);
    }
  };

  // Handle Datentabelle (PostgreSQL) creation
  const handleDataTableCreated = (newTable: DataTable | null) => {
    setShowSimpleTableCreate(false);
    loadTables(); // Refresh tables list
    // Open the new table in the editor popup
    if (newTable?.slug) {
      setEditingTable(newTable);
      setShowTableEditor(true);
    }
  };

  // Handle table edit
  const handleTableEdit = (table: DataTable) => {
    setEditingTable(table);
    setShowTableEditor(true);
  };

  // Handle table editor close
  const handleTableEditorClose = () => {
    setShowTableEditor(false);
    setEditingTable(null);
    loadTables(); // Refresh tables after editing
  };

  // Delete table
  const handleDeleteTable = async (table: DataTable) => {
    if (!(await confirm({ message: `Tabelle "${table.name}" wirklich löschen?` }))) return;

    try {
      await api.del(`/v1/datentabellen/tables/${table.slug}`, { showError: false });
      loadTables();
    } catch (err: unknown) {
      setError('Fehler beim Löschen der Tabelle');
    }
  };

  // Get space name for a table
  const getTableSpaceName = (table: DataTable) => {
    const space = spaces.find(s => s.id === table.space_id);
    return space?.name || 'Allgemein';
  };

  const getTableSpaceColor = (table: DataTable) => {
    const space = spaces.find(s => s.id === table.space_id);
    return space?.color || 'var(--primary-color)';
  };

  // Combine documents and tables into a unified list for display
  type TaggedDocument = Document & { _type: 'document' };
  type TaggedTable = DataTable & { _type: 'table' };
  type CombinedItem = TaggedDocument | TaggedTable;
  const combinedItems: CombinedItem[] = [
    // Tables first (marked as type 'table')
    ...tables.map(t => ({ ...t, _type: 'table' as const })),
    // Then documents (marked as type 'document')
    ...documents.map(d => ({ ...d, _type: 'document' as const })),
  ];

  // Server already filters - no client-side filtering needed
  const filteredItems = combinedItems;

  // Batch selection helpers (must be after filteredItems declaration)
  const docIds = filteredItems.filter(i => i._type === 'document').map(i => i.id);
  const allDocsSelected = docIds.length > 0 && docIds.every((id: string) => selectedIds.has(id));
  const someDocsSelected = docIds.some((id: string) => selectedIds.has(id));

  const totalPages = Math.ceil((totalDocuments + totalTables) / itemsPerPage);

  return (
    <main
      className="document-manager p-[clamp(1rem,2vw,1.5rem)] max-w-[1600px] mx-auto"
      role="main"
      aria-label="Dokumentenverwaltung"
    >
      {/* Header with statistics */}
      <header className="mb-6" aria-label="Dokumenten-Statistiken">
        {statsError && (
          <div
            className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-md py-2 px-3 mb-3 text-destructive text-sm"
            role="alert"
          >
            <AlertCircle size={14} className="shrink-0" />
            <span>Statistiken konnten nicht geladen werden</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive h-7 px-2"
              onClick={() => loadStatistics()}
            >
              <RefreshCw size={12} className="mr-1" /> Erneut versuchen
            </Button>
          </div>
        )}
        <div
          className={cn(
            'dm-stats-row grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[clamp(0.75rem,1.5vw,1rem)]',
            statsError && 'opacity-50'
          )}
          role="group"
          aria-label="Übersicht"
        >
          <div
            className="dm-stat-card flex items-center gap-4 bg-[var(--gradient-card)] border border-border rounded-lg py-4 px-5"
            aria-label={`${statistics?.total_documents || 0} Dokumente`}
          >
            <Database className="text-3xl text-primary opacity-80 shrink-0" aria-hidden="true" />
            <div>
              <span className="dm-stat-value text-2xl font-bold text-foreground block">
                {statistics?.total_documents || 0}
              </span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Dokumente{activeSpaceId || statusFilter || categoryFilter ? ' (gefiltert)' : ''}
              </span>
            </div>
          </div>
          <div
            className="dm-stat-card flex items-center gap-4 bg-[var(--gradient-card)] border border-border rounded-lg py-4 px-5"
            aria-label={`${statistics?.total_chunks || 0} indexierte Chunks`}
          >
            <Check className="text-3xl text-primary opacity-80 shrink-0" aria-hidden="true" />
            <div>
              <span className="dm-stat-value text-2xl font-bold text-foreground block">
                {statistics?.total_chunks || 0}
              </span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Indexierte Chunks
              </span>
            </div>
          </div>
          <div
            className="dm-stat-card flex items-center gap-4 bg-[var(--gradient-card)] border border-border rounded-lg py-4 px-5"
            aria-label={`${statistics?.pending_documents || 0} Dokumente wartend`}
          >
            <Clock
              className="text-3xl text-muted-foreground opacity-80 shrink-0"
              aria-hidden="true"
            />
            <div>
              <span className="dm-stat-value text-2xl font-bold text-foreground block">
                {statistics?.pending_documents || 0}
              </span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Wartend</span>
            </div>
          </div>
          <div
            className="dm-stat-card flex items-center gap-4 bg-[var(--gradient-card)] border border-border rounded-lg py-4 px-5"
            aria-label={`${statistics?.table_count || 0} Tabellen`}
          >
            <Table className="text-3xl text-primary opacity-80 shrink-0" aria-hidden="true" />
            <div>
              <span className="dm-stat-value text-2xl font-bold text-foreground block">
                {statistics?.table_count || 0}
              </span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Tabellen
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Knowledge Spaces Tabs (RAG 2.0) */}
      <nav className="mb-4 overflow-hidden" aria-label="Wissensbereiche">
        {spacesError && (
          <div
            className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-md py-2 px-3 mb-2 text-destructive text-sm"
            role="alert"
          >
            <AlertCircle size={14} className="shrink-0" />
            <span>Wissensbereiche nicht verfügbar</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive h-7 px-2"
              onClick={() => loadSpaces()}
            >
              <RefreshCw size={12} className="mr-1" /> Laden
            </Button>
          </div>
        )}
        <div
          className="flex gap-2 overflow-x-auto py-1"
          role="tablist"
          aria-label="Dokumenten-Bereiche"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSpaceId === null}
            className={cn(
              'flex items-center gap-2 py-2.5 px-4 bg-[var(--gradient-card)] border border-border rounded-md text-muted-foreground text-sm font-medium cursor-pointer transition-all whitespace-nowrap shrink-0 relative hover:border-[var(--border-hover)] hover:bg-accent hover:text-foreground',
              activeSpaceId === null && 'border-primary bg-primary/10 text-foreground shadow-sm'
            )}
            onClick={() => handleSpaceChange(null)}
          >
            <Folder aria-hidden="true" size={16} />
            <span>Alle</span>
            <span
              className="bg-primary/10 text-primary py-0.5 px-1.5 rounded-xs text-xs font-semibold"
              aria-label={`${statistics?.total_documents || 0} Dokumente`}
            >
              {statistics?.total_documents || 0}
            </span>
          </button>
          {spaces.map(space => (
            <button
              type="button"
              key={space.id}
              role="tab"
              aria-selected={activeSpaceId === space.id}
              className={cn(
                'group/tab flex items-center gap-2 py-2.5 px-4 bg-[var(--gradient-card)] border border-border rounded-md text-muted-foreground text-sm font-medium cursor-pointer transition-all whitespace-nowrap shrink-0 relative hover:border-[var(--border-hover)] hover:bg-accent hover:text-foreground',
                activeSpaceId === space.id &&
                  'border-[var(--space-color,var(--primary-color))] bg-primary/10 text-foreground shadow-sm'
              )}
              onClick={() => handleSpaceChange(space.id)}
              style={{ '--space-color': space.color } as React.CSSProperties}
            >
              <Folder style={{ color: space.color }} aria-hidden="true" size={16} />
              <span>{space.name}</span>
              <span
                className="bg-primary/10 text-primary py-0.5 px-1.5 rounded-xs text-xs font-semibold"
                aria-label={`${space.document_count || 0} Dokumente`}
              >
                {space.document_count || 0}
              </span>
              {!space.is_default && !space.is_system && (
                <button
                  type="button"
                  className="hidden group-hover/tab:flex bg-transparent border-none text-muted-foreground cursor-pointer p-0.5 ml-1 rounded-xs transition-colors hover:text-primary hover:bg-primary/10"
                  onClick={e => handleEditSpace(space, e)}
                  aria-label={`${space.name} bearbeiten`}
                >
                  <Settings aria-hidden="true" size={14} />
                </button>
              )}
            </button>
          ))}
          <button
            type="button"
            className="flex items-center gap-2 py-2.5 px-4 bg-[var(--gradient-card)] border border-dashed border-border rounded-md text-primary text-sm font-medium cursor-pointer transition-all whitespace-nowrap shrink-0 relative hover:border-primary hover:bg-primary/10"
            onClick={() => {
              setEditingSpace(null);
              setShowSpaceModal(true);
            }}
            aria-label="Neuen Bereich erstellen"
          >
            <Plus aria-hidden="true" size={16} />
            <span>Neu</span>
          </button>
        </div>
      </nav>

      {/* Active Space Description (if a space is selected) */}
      {activeSpaceId && spaces.find(s => s.id === activeSpaceId) && (
        <div className="bg-muted border border-border rounded-md py-4 px-5 mb-4">
          <div>
            <h4>{spaces.find(s => s.id === activeSpaceId)?.name}</h4>
            <p>{spaces.find(s => s.id === activeSpaceId)?.description?.substring(0, 200)}...</p>
          </div>
        </div>
      )}

      {/* Upload Zone */}
      <div
        className={cn(
          'bg-[var(--bg-dropzone)] border-2 border-dashed border-[var(--border-dropzone)] rounded-lg p-8 text-center cursor-pointer transition-all mb-6 hover:border-[var(--border-dropzone-hover)] hover:bg-[var(--bg-dropzone-hover)]',
          dragActive &&
            'border-[var(--border-dropzone-active)] bg-[var(--bg-dropzone-active)] scale-[1.01]',
          uploading && 'pointer-events-none opacity-80'
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Dateien hochladen - Klicken oder Dateien hierher ziehen"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={e => {
            handleFileUpload((e.target as HTMLInputElement).files);
            // Reset so same file can be re-selected
            (e.target as HTMLInputElement).value = '';
          }}
          multiple
          accept=".pdf,.docx,.md,.markdown,.txt,.yaml,.yml"
          style={{ display: 'none' }}
          aria-label="Datei auswählen"
        />

        {uploading || fileStatuses.length > 0 ? (
          <div className="w-full max-w-md mx-auto space-y-2" onClick={e => e.stopPropagation()}>
            {/* Overall progress */}
            {uploading && (
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-1.5 bg-muted rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-sm transition-[width] duration-300"
                    style={{ width: `${uploadProgress}%` }}
                    role="progressbar"
                    aria-valuenow={uploadProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                <span
                  className="text-sm text-muted-foreground whitespace-nowrap"
                  aria-live="polite"
                >
                  {uploadProgress}%
                </span>
              </div>
            )}
            {/* Per-file status */}
            {fileStatuses.map(fs => (
              <div key={fs.name} className="flex items-center gap-2 text-sm">
                {fs.status === 'success' && <Check size={14} className="text-green-500 shrink-0" />}
                {fs.status === 'error' && (
                  <AlertCircle size={14} className="text-destructive shrink-0" />
                )}
                {fs.status === 'uploading' && (
                  <RefreshCw size={14} className="text-primary shrink-0 animate-spin" />
                )}
                {fs.status === 'pending' && (
                  <Clock size={14} className="text-muted-foreground shrink-0" />
                )}
                <span className="truncate flex-1" title={fs.name}>
                  {fs.name}
                </span>
                {fs.status === 'uploading' && (
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {fs.progress}%
                  </span>
                )}
                {fs.status === 'error' && (
                  <span
                    className="text-destructive text-xs truncate max-w-[150px]"
                    title={fs.error}
                  >
                    {fs.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <>
            <Upload className="text-4xl text-primary mb-3 mx-auto" aria-hidden="true" size={40} />
            <p>
              Dateien hier ablegen oder klicken zum Auswählen
              {(uploadSpaceId || activeSpaceId) && spaces.length > 0 && (
                <span className="text-primary font-medium">
                  {' \u2192 '}
                  {spaces.find(s => s.id === (uploadSpaceId || activeSpaceId))?.name || 'Allgemein'}
                </span>
              )}
            </p>
            <span className="text-muted-foreground text-sm">
              PDF, DOCX, Markdown, YAML (max. 50MB)
            </span>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div
          className="dm-error flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-md py-3 px-4 mb-4 text-destructive"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle aria-hidden="true" size={18} />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setError(null)}
            aria-label="Fehlermeldung schließen"
            className="ml-auto text-destructive"
          >
            <X aria-hidden="true" size={18} />
          </Button>
        </div>
      )}

      {/* Semantic Search */}
      <section className="mb-6" aria-label="Semantische Suche">
        <div
          className="flex items-center bg-[var(--gradient-card)] border border-border rounded-md py-2 px-4 gap-3"
          role="search"
        >
          <Cpu className="text-primary text-xl shrink-0" aria-hidden="true" size={20} />
          <input
            type="search"
            className="flex-1 bg-transparent border-none text-foreground text-sm py-2 placeholder:text-muted-foreground focus:outline-none"
            placeholder="Semantische Suche in allen Dokumenten..."
            value={semanticSearch}
            onChange={e => setSemanticSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSemanticSearch()}
            aria-label="Semantische Suche in Dokumenten"
          />
          <Button
            onClick={handleSemanticSearch}
            disabled={searching || !semanticSearch.trim()}
            aria-label={searching ? 'Suche läuft...' : 'Suchen'}
          >
            {searching ? (
              <RefreshCw className="animate-spin" aria-hidden="true" size={16} />
            ) : (
              <Search aria-hidden="true" size={16} />
            )}
          </Button>
        </div>

        {/* Search Results */}
        {searchResults && (
          <div
            className="bg-[var(--gradient-card)] border border-border rounded-md mt-4 overflow-hidden"
            role="region"
            aria-label="Suchergebnisse"
            aria-live="polite"
          >
            <div className="flex justify-between items-center py-3 px-4 border-b border-[var(--border-table)]">
              <h4 id="search-results-title">
                Suchergebnisse für &quot;{searchResults.query}&quot;
              </h4>
              <button
                type="button"
                onClick={() => setSearchResults(null)}
                aria-label="Suchergebnisse schließen"
                className="bg-transparent border-none text-muted-foreground cursor-pointer hover:text-foreground"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            {searchResults.results.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground">Keine Ergebnisse gefunden</p>
                <p className="text-muted-foreground/60 text-xs mt-1">
                  Versuche andere Suchbegriffe
                </p>
              </div>
            ) : (
              <ul className="max-h-[300px] overflow-y-auto" aria-labelledby="search-results-title">
                {searchResults.results.map((result, idx) => (
                  <li key={idx} className="py-3 px-4 border-b border-border/50 last:border-b-0">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-primary font-medium">{result.document_name}</span>
                      <span
                        className="bg-primary/10 text-primary py-0.5 px-2 rounded-xs text-xs"
                        aria-label={`Relevanz: ${((result.score ?? 0) * 100).toFixed(0)} Prozent`}
                      >
                        {((result.score ?? 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-muted-foreground text-sm leading-snug m-0">
                      {result.chunk_text}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Filters */}
      <div
        className="flex gap-3 mb-6 flex-wrap items-center w-full"
        role="group"
        aria-label="Dokumenten-Filter"
      >
        <div className="flex items-center bg-[var(--gradient-card)] border border-border rounded-md py-2 px-3 gap-2 flex-1 min-w-[150px]">
          <Search className="text-muted-foreground shrink-0" aria-hidden="true" size={16} />
          <input
            type="text"
            className="flex-1 bg-transparent border-none text-foreground text-sm w-full placeholder:text-muted-foreground focus:outline-none"
            placeholder="Suchen..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Nach Namen suchen"
          />
        </div>

        <div className="flex items-center bg-[var(--gradient-card)] border border-border rounded-md py-2 px-3 gap-2 flex-1 min-w-[150px]">
          <Filter className="text-muted-foreground shrink-0" aria-hidden="true" size={16} />
          <select
            className="flex-1 bg-transparent border-none text-foreground text-sm w-full placeholder:text-muted-foreground focus:outline-none cursor-pointer"
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Nach Status filtern"
          >
            <option
              value=""
              style={{ background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
            >
              Alle Status
            </option>
            <option
              value="indexed"
              style={{ background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
            >
              Indexiert
            </option>
            <option
              value="pending"
              style={{ background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
            >
              Wartend
            </option>
            <option
              value="processing"
              style={{ background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
            >
              Verarbeitung
            </option>
            <option
              value="failed"
              style={{ background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
            >
              Fehlgeschlagen
            </option>
          </select>
        </div>

        <div className="flex items-center bg-[var(--gradient-card)] border border-border rounded-md py-2 px-3 gap-2 flex-1 min-w-[150px]">
          <Folder className="text-muted-foreground shrink-0" aria-hidden="true" size={16} />
          <select
            className="flex-1 bg-transparent border-none text-foreground text-sm w-full placeholder:text-muted-foreground focus:outline-none cursor-pointer"
            value={categoryFilter}
            onChange={e => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Nach Kategorie filtern"
          >
            <option
              value=""
              style={{ background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
            >
              Alle Kategorien
            </option>
            {categories.map(cat => (
              <option
                key={cat.id}
                value={cat.id}
                style={{
                  background: 'hsl(var(--popover))',
                  color: 'hsl(var(--popover-foreground))',
                }}
              >
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => loadDocuments()}
          aria-label="Aktualisieren"
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" size={16} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleCleanup}
          disabled={cleaningUp}
          aria-label="Verwaiste Dateien bereinigen"
          title="Bereinigung: Verwaiste Dateien aufräumen"
        >
          <Trash2 className={cleaningUp ? 'animate-pulse' : ''} aria-hidden="true" size={16} />
        </Button>

        <Button onClick={() => setShowSimpleTableCreate(true)} aria-label="Neue Tabelle erstellen">
          <Table aria-hidden="true" size={16} />
          <span>Neue Tabelle</span>
        </Button>

        <Button onClick={() => setShowMarkdownCreate(true)} aria-label="Neues Dokument erstellen">
          <FileText aria-hidden="true" size={16} />
          <span>Neues Dokument</span>
        </Button>
      </div>

      {/* Batch Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-lg py-2.5 px-4 mb-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="text-sm font-medium text-primary">{selectedIds.size} ausgewählt</span>
          <div className="h-4 w-px bg-primary/30" />
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7"
            onClick={handleBatchDelete}
          >
            <Trash2 size={14} className="mr-1" /> Löschen
          </Button>
          <Button variant="ghost" size="sm" className="h-7" onClick={handleBatchReindex}>
            <RefreshCw size={14} className="mr-1" /> Neu indexieren
          </Button>
          <div className="relative group">
            <Button variant="ghost" size="sm" className="h-7">
              <FolderInput size={14} className="mr-1" /> Verschieben
            </Button>
            <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px] hidden group-hover:block z-50">
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-foreground"
                onClick={() => handleBatchMove(null, 'Kein Bereich')}
              >
                Kein Bereich
              </button>
              {spaces.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-foreground"
                  onClick={() => handleBatchMove(s.id, s.name)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-muted-foreground"
            onClick={() => setSelectedIds(new Set())}
          >
            <X size={14} className="mr-1" /> Auswahl aufheben
          </Button>
        </div>
      )}

      {/* Documents and Tables List */}
      <section
        className="bg-[var(--gradient-card)] border border-border rounded-lg overflow-hidden"
        aria-label="Datenliste"
      >
        {(loading || loadingTables) && filteredItems.length === 0 ? (
          <SkeletonDocumentList count={6} />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={
              searchQuery || statusFilter || categoryFilter || activeSpaceId ? (
                <Search />
              ) : (
                <Database />
              )
            }
            title={
              searchQuery || statusFilter || categoryFilter || activeSpaceId
                ? 'Keine Ergebnisse'
                : 'Noch keine Dokumente'
            }
            description={
              searchQuery || statusFilter || categoryFilter || activeSpaceId
                ? `Keine Einträge für die aktuelle Filterung gefunden.${searchQuery ? ` Suchbegriff: "${searchQuery}"` : ''}`
                : 'Laden Sie Ihre ersten Dokumente hoch oder erstellen Sie eine Tabelle, um loszulegen.'
            }
            action={
              searchQuery || statusFilter || categoryFilter || activeSpaceId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('');
                    setCategoryFilter('');
                    setActiveSpaceId(null);
                  }}
                >
                  Filter zurücksetzen
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 hover:text-primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-4 mr-1" /> Datei hochladen
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="border border-border text-muted-foreground hover:text-foreground"
                    onClick={() => setShowMarkdownCreate(true)}
                  >
                    <FileText className="size-4 mr-1" /> Dokument erstellen
                  </Button>
                </div>
              )
            }
          />
        ) : (
          <table className="w-full border-collapse" aria-label={`${filteredItems.length} Einträge`}>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-muted-foreground font-semibold text-xs uppercase tracking-wide py-3 px-2 text-center border-b border-[var(--border-table)] w-10"
                >
                  <button
                    type="button"
                    className="p-1 text-muted-foreground hover:text-primary transition-colors"
                    onClick={toggleSelectAll}
                    aria-label={allDocsSelected ? 'Alle abwählen' : 'Alle auswählen'}
                  >
                    {allDocsSelected ? (
                      <CheckSquare size={16} className="text-primary" />
                    ) : someDocsSelected ? (
                      <Minus size={16} className="text-primary" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-muted-foreground font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                  aria-label="Favorit"
                ></th>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-muted-foreground font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-muted-foreground font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                >
                  Typ
                </th>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-muted-foreground font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                >
                  Bereich
                </th>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-muted-foreground font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-muted-foreground font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                >
                  Info
                </th>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-muted-foreground font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                >
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Render Tables */}
              {filteredItems
                .filter((item): item is TaggedTable => item._type === 'table')
                .map(table => (
                  <tr
                    key={`table-${table.id}`}
                    className="cursor-pointer transition-all hover:bg-[var(--bg-table-row-active)] focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
                    onClick={() => handleTableEdit(table)}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && handleTableEdit(table)}
                    aria-label={`Tabelle: ${table.name}`}
                  >
                    <td className="py-3 px-2 text-center border-b border-border/50 text-sm w-10">
                      <span className="inline-flex items-center justify-center size-6 text-muted-foreground/40">
                        <Square size={14} />
                      </span>
                    </td>
                    <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                      <span className="inline-flex items-center justify-center size-6 text-primary opacity-60">
                        <Grid3x3 aria-hidden="true" size={16} />
                      </span>
                    </td>
                    <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm max-w-[300px]">
                      <div className="flex items-center gap-3">
                        <Table
                          className="text-primary text-xl shrink-0"
                          aria-hidden="true"
                          size={20}
                        />
                        <div>
                          <span className="block font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                            {table.name}
                          </span>
                          {table.description && (
                            <span className="block text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                              {table.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                      <TableBadge />
                    </td>
                    <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                      <SpaceBadge
                        name={getTableSpaceName(table)}
                        color={getTableSpaceColor(table)}
                      />
                    </td>
                    <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <TableStatusBadge status={table.status || 'active'} />
                        <IndexStatusBadge
                          needsReindex={table.needs_reindex}
                          lastIndexedAt={table.last_indexed_at}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground border-b border-border/50 text-sm">
                      <span>{table.field_count || 0} Spalten</span>
                    </td>
                    <td
                      className="py-3 px-4 text-foreground border-b border-border/50 text-sm whitespace-nowrap"
                      onClick={e => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="mr-1"
                        onClick={() => handleTableEdit(table)}
                        aria-label={`${table.name} bearbeiten`}
                      >
                        <Pencil aria-hidden="true" size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="mr-1 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDeleteTable(table)}
                        aria-label={`${table.name} löschen`}
                      >
                        <Trash2 aria-hidden="true" size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              {/* Render Documents */}
              {filteredItems
                .filter((item): item is TaggedDocument => item._type === 'document')
                .map(doc => (
                  <tr
                    key={`doc-${doc.id}`}
                    className={cn(
                      'cursor-pointer transition-all hover:bg-[var(--bg-table-row-active)] focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2',
                      doc.is_favorite && 'bg-primary/5',
                      selectedIds.has(doc.id) && 'bg-primary/10'
                    )}
                    onClick={() => viewDocumentDetails(doc)}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && viewDocumentDetails(doc)}
                    aria-label={`${doc.title || doc.filename}, Typ: ${getDocumentType(doc)}, Status: ${doc.status}`}
                  >
                    <td
                      className="py-3 px-2 text-center border-b border-border/50 text-sm w-10"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="p-1 text-muted-foreground hover:text-primary transition-colors"
                        onClick={() => toggleSelect(doc.id)}
                        aria-label={selectedIds.has(doc.id) ? 'Abwählen' : 'Auswählen'}
                      >
                        {selectedIds.has(doc.id) ? (
                          <CheckSquare size={16} className="text-primary" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                      <button
                        type="button"
                        className={cn(
                          'bg-transparent border-none text-muted-foreground cursor-pointer p-1 transition-colors hover:text-primary',
                          doc.is_favorite && 'text-primary'
                        )}
                        onClick={e => {
                          e.stopPropagation();
                          toggleFavorite(doc);
                        }}
                        aria-label={
                          doc.is_favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'
                        }
                        aria-pressed={doc.is_favorite}
                      >
                        <Star aria-hidden="true" size={16} />
                      </button>
                    </td>
                    <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm max-w-[300px]">
                      <div className="flex items-center gap-3">
                        {React.createElement(getFileIcon(doc), {
                          className: 'text-primary text-xl shrink-0',
                          'aria-hidden': 'true',
                          size: 20,
                        })}
                        <div>
                          <span className="block font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                            {doc.title || doc.filename}
                          </span>
                          {doc.title && doc.title !== doc.filename && (
                            <span className="block text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                              {doc.filename}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                      <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-sm text-xs font-medium uppercase tracking-wide bg-primary/10 text-primary">
                        {getDocumentType(doc)}
                      </span>
                    </td>
                    <td
                      className="py-3 px-4 text-foreground border-b border-border/50 text-sm"
                      onClick={e => e.stopPropagation()}
                    >
                      <SpaceBadge
                        name={doc.space_name}
                        color={doc.space_color}
                        docId={doc.id}
                        spaces={spaces}
                        onMove={handleMoveDocument}
                      />
                    </td>
                    <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                      {formatFileSize(doc.file_size)}
                    </td>
                    <td
                      className="py-3 px-4 text-foreground border-b border-border/50 text-sm whitespace-nowrap"
                      onClick={e => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="mr-1"
                        onClick={() => viewDocumentDetails(doc)}
                        aria-label={`Details für ${doc.title || doc.filename} anzeigen`}
                      >
                        <Eye aria-hidden="true" size={16} />
                      </Button>
                      {canEdit(doc) && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="mr-1"
                          onClick={() => handleEdit(doc)}
                          aria-label={`${doc.title || doc.filename} bearbeiten`}
                        >
                          <Pencil aria-hidden="true" size={16} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="mr-1"
                        onClick={() => handleDownload(doc.id, doc.filename)}
                        aria-label={`${doc.filename} herunterladen`}
                      >
                        <Download aria-hidden="true" size={16} />
                      </Button>
                      {doc.status === 'failed' && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="mr-1"
                          onClick={() => handleReindex(doc.id)}
                          aria-label={`${doc.title || doc.filename} neu indexieren`}
                        >
                          <RefreshCw aria-hidden="true" size={16} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="mr-1 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(doc.id, doc.filename)}
                        aria-label={`${doc.title || doc.filename} löschen`}
                      >
                        <Trash2 aria-hidden="true" size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Pagination */}
      {totalPages > 0 && (
        <nav
          className="flex justify-between items-center gap-4 mt-6 flex-wrap"
          role="navigation"
          aria-label="Seitennavigation"
        >
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground text-sm">
              {totalDocuments + totalTables} Einträge
            </span>
            <label
              htmlFor="dm-page-size"
              className="text-muted-foreground text-sm whitespace-nowrap"
            >
              Pro Seite:
            </label>
            <select
              id="dm-page-size"
              className="bg-background border border-border rounded-sm text-foreground py-1.5 px-2 text-sm cursor-pointer"
              value={itemsPerPage}
              onChange={e => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
              aria-label="Erste Seite"
            >
              &laquo;
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              aria-label="Vorherige Seite"
            >
              Zur&uuml;ck
            </Button>
            <span
              className="text-muted-foreground text-sm whitespace-nowrap"
              aria-live="polite"
              aria-atomic="true"
            >
              Seite {currentPage} von {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              aria-label="Nächste Seite"
            >
              Weiter
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
              aria-label="Letzte Seite"
            >
              &raquo;
            </Button>
          </div>
        </nav>
      )}

      {/* Document Details Modal */}
      {showDetails && selectedDocument && (
        <DocumentDetailsModal
          document={selectedDocument}
          isOpen={true}
          onClose={() => setShowDetails(false)}
          onEdit={handleEdit}
          onDownload={handleDownload}
          onDelete={handleDelete}
          onReindex={handleReindex}
          loadingSimilar={loadingSimilar}
          similarDocuments={similarDocuments}
          isEditable={isEditable}
        />
      )}

      {/* Markdown Editor */}
      {showEditor && editingDocument && (
        <TipTapEditor
          documentId={editingDocument.id}
          filename={editingDocument.filename}
          onClose={handleEditorClose}
          onSave={handleEditorSave}
          token={getAuthToken()}
        />
      )}

      {/* Space Modal (RAG 2.0) */}
      <ComponentErrorBoundary componentName="Space-Modal">
        <SpaceModal
          isOpen={showSpaceModal}
          onClose={() => {
            setShowSpaceModal(false);
            setEditingSpace(null);
          }}
          onSave={handleSpaceSave}
          space={editingSpace}
          mode={editingSpace ? 'edit' : 'create'}
        />
      </ComponentErrorBoundary>

      {/* Create New Markdown Document Dialog */}
      {showMarkdownCreate && (
        <CreateDocumentDialog
          type="markdown"
          isOpen={showMarkdownCreate}
          onClose={() => setShowMarkdownCreate(false)}
          onCreated={handleMarkdownCreated}
          spaceId={activeSpaceId || uploadSpaceId}
          spaces={spaces}
        />
      )}

      {/* Simple Table Create Dialog (PostgreSQL Datentabellen) */}
      {showSimpleTableCreate && (
        <CreateDocumentDialog
          type="table"
          isOpen={showSimpleTableCreate}
          onClose={() => setShowSimpleTableCreate(false)}
          onCreated={handleDataTableCreated}
          spaceId={activeSpaceId || uploadSpaceId}
          spaces={spaces}
        />
      )}

      {/* Excel Editor Popup (PostgreSQL Datentabellen) */}
      {showTableEditor && editingTable && (
        <ExcelEditor
          tableSlug={editingTable.slug}
          tableName={editingTable.name}
          onClose={handleTableEditorClose}
        />
      )}

      {ConfirmDialog}
    </main>
  );
}

export default DocumentManager;
