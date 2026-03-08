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
  Tag,
  FileText,
  Database,
  Cpu,
  Eye,
  Link,
  Pencil,
  Plus,
  Settings,
  Table,
  Grid3x3,
} from 'lucide-react';
import { TableBadge, StatusBadge, TableStatusBadge, CategoryBadge, SpaceBadge } from './Badges';
import MarkdownEditor from '../../components/editor/MarkdownEditor';
import CreateDocumentDialog from '../../components/editor/CreateDocumentDialog';
import ExcelEditor from '../datentabellen/ExcelEditor';
import SpaceModal from './SpaceModal';
import Modal from '../../components/ui/Modal';
import { useApi } from '../../hooks/useApi';
import { getValidToken } from '../../utils/token';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import { formatDate, formatFileSize } from '../../utils/formatting';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import useDocumentUpload from './useDocumentUpload';
import useDocumentActions from './useDocumentActions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/shadcn/button';

function DocumentManager() {
  // State
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [documents, setDocuments] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]); // PostgreSQL Datentabellen
  const [categories, setCategories] = useState<any[]>([]);
  const [statistics, setStatistics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Knowledge Spaces (RAG 2.0)
  const [spaces, setSpaces] = useState<any[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null); // null = all spaces
  const [showSpaceModal, setShowSpaceModal] = useState(false);
  const [editingSpace, setEditingSpace] = useState<any>(null);
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
  const [editingDocument, setEditingDocument] = useState<any>(null);

  // Table Editor state (ExcelEditor popup)
  const [showTableEditor, setShowTableEditor] = useState(false);
  const [editingTable, setEditingTable] = useState<any>(null);

  // Create dialog state
  const [showMarkdownCreate, setShowMarkdownCreate] = useState(false);
  const [showSimpleTableCreate, setShowSimpleTableCreate] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get auth token via validated token utility
  const getAuthToken = () => getValidToken();

  // Check if file is editable (markdown or text)
  const isEditable = (doc: any) => {
    const editableExtensions = ['.md', '.markdown', '.txt'];
    return editableExtensions.includes(doc.file_extension?.toLowerCase());
  };

  // Check if any type of editing is supported
  const canEdit = (doc: any) => {
    return isEditable(doc);
  };

  // Get file type icon
  const getFileIcon = (doc: any) => {
    if (isEditable(doc)) return FileText;
    return File;
  };

  // Get document type label
  const getDocumentType = (doc: any) => {
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
      } catch (err: any) {
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
    } catch (err: any) {
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
      } catch (err: any) {
        if (signal?.aborted) return;
        console.error('Error loading statistics:', err);
      }
    },
    [api, activeSpaceId, statusFilter, categoryFilter]
  );

  // Load Knowledge Spaces (RAG 2.0)
  const loadSpaces = async (signal?: AbortSignal) => {
    try {
      const data = await api.get('/spaces', { signal, showError: false });
      setSpaces(data.spaces || []);
    } catch (err: any) {
      if (signal?.aborted) return;
      console.error('Error loading spaces:', err);
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
      } catch (err: any) {
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
  const handleSpaceSave = (savedSpace: any) => {
    loadSpaces();
    loadStatistics();
    loadDocuments();
  };

  // Edit space
  const handleEditSpace = (space: any, e: React.MouseEvent) => {
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
    } catch (err: any) {
      toast.error('Fehler beim Verschieben: ' + err.message);
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

  // Initial load - empty dependency array for mount-only
  useEffect(() => {
    const controller = new AbortController();
    loadDocumentsRef.current(controller.signal);
    loadCategories(controller.signal);
    loadStatisticsRef.current(controller.signal);
    loadSpaces(controller.signal);
    loadTablesRef.current(controller.signal);

    // Refresh every 30 seconds - uses refs so interval is only created once
    const interval = setInterval(() => {
      loadDocumentsRef.current(controller.signal);
      loadStatisticsRef.current(controller.signal);
      loadTablesRef.current(controller.signal);
    }, 30000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, []); // Empty array - only run on mount

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
  const handleEdit = (doc: any) => {
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
  const handleMarkdownCreated = (newDoc: any) => {
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
  const handleDataTableCreated = (newTable: any) => {
    setShowSimpleTableCreate(false);
    loadTables(); // Refresh tables list
    // Open the new table in the editor popup
    if (newTable?.slug) {
      setEditingTable(newTable);
      setShowTableEditor(true);
    }
  };

  // Handle table edit
  const handleTableEdit = (table: any) => {
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
  const handleDeleteTable = async (table: any) => {
    if (!(await confirm({ message: `Tabelle "${table.name}" wirklich löschen?` }))) return;

    try {
      await api.del(`/v1/datentabellen/tables/${table.slug}`, { showError: false });
      loadTables();
    } catch (err: any) {
      setError('Fehler beim Löschen der Tabelle');
    }
  };

  // Get space name for a table
  const getTableSpaceName = (table: any) => {
    const space = spaces.find((s: any) => s.id === table.space_id);
    return space?.name || 'Allgemein';
  };

  const getTableSpaceColor = (table: any) => {
    const space = spaces.find((s: any) => s.id === table.space_id);
    return space?.color || 'var(--primary-color)';
  };

  // Combine documents and tables into a unified list for display
  const combinedItems = [
    // Tables first (marked as type 'table')
    ...tables.map((t: any) => ({ ...t, _type: 'table' })),
    // Then documents (marked as type 'document')
    ...documents.map((d: any) => ({ ...d, _type: 'document' })),
  ];

  // Server already filters - no client-side filtering needed
  const filteredItems = combinedItems;

  const totalPages = Math.ceil((totalDocuments + totalTables) / itemsPerPage);

  return (
    <main
      className="document-manager p-[clamp(1rem,2vw,1.5rem)] max-w-[1600px] mx-auto"
      role="main"
      aria-label="Dokumentenverwaltung"
    >
      {/* Header with statistics */}
      <header className="mb-6" aria-label="Dokumenten-Statistiken">
        <div
          className="dm-stats-row grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[clamp(0.75rem,1.5vw,1rem)]"
          role="group"
          aria-label="Übersicht"
        >
          <div
            className="dm-stat-card flex items-center gap-4 bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-lg py-4 px-5"
            aria-label={`${(statistics?.total_documents || 0) + (statistics?.table_count || 0)} Einträge insgesamt`}
          >
            <Database
              className="text-3xl text-[var(--primary-color)] opacity-80 shrink-0"
              aria-hidden="true"
            />
            <div>
              <span className="dm-stat-value text-2xl font-bold text-[var(--text-primary)] block">
                {(statistics?.total_documents || 0) + (statistics?.table_count || 0)}
              </span>
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                Gesamt{activeSpaceId || statusFilter || categoryFilter ? ' (gefiltert)' : ''}
              </span>
            </div>
          </div>
          <div
            className="dm-stat-card flex items-center gap-4 bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-lg py-4 px-5"
            aria-label={`${statistics?.indexed_documents || 0} Dokumente indexiert`}
          >
            <Check
              className="text-3xl text-[var(--success-color)] opacity-80 shrink-0"
              aria-hidden="true"
            />
            <div>
              <span className="dm-stat-value text-2xl font-bold text-[var(--text-primary)] block">
                {statistics?.indexed_documents || 0}
              </span>
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                Indexiert
              </span>
            </div>
          </div>
          <div
            className="dm-stat-card flex items-center gap-4 bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-lg py-4 px-5"
            aria-label={`${statistics?.pending_documents || 0} Dokumente wartend`}
          >
            <Clock
              className="text-3xl text-[var(--warning-color)] opacity-80 shrink-0"
              aria-hidden="true"
            />
            <div>
              <span className="dm-stat-value text-2xl font-bold text-[var(--text-primary)] block">
                {statistics?.pending_documents || 0}
              </span>
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                Wartend
              </span>
            </div>
          </div>
          <div
            className="dm-stat-card flex items-center gap-4 bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-lg py-4 px-5"
            aria-label={`${statistics?.table_count || 0} Tabellen`}
          >
            <Table
              className="text-3xl text-[var(--primary-color)] opacity-80 shrink-0"
              aria-hidden="true"
            />
            <div>
              <span className="dm-stat-value text-2xl font-bold text-[var(--text-primary)] block">
                {statistics?.table_count || 0}
              </span>
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                Tabellen
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Knowledge Spaces Tabs (RAG 2.0) */}
      <nav className="mb-4 overflow-hidden" aria-label="Wissensbereiche">
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
              'flex items-center gap-2 py-2.5 px-4 bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-md text-[var(--text-muted)] text-sm font-medium cursor-pointer transition-all whitespace-nowrap shrink-0 relative hover:border-[var(--border-hover)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]',
              activeSpaceId === null &&
                'border-[var(--primary-color)] bg-[var(--primary-muted)] text-[var(--text-primary)] shadow-sm'
            )}
            onClick={() => handleSpaceChange(null)}
          >
            <Folder aria-hidden="true" size={16} />
            <span>Alle</span>
            <span
              className="bg-[var(--primary-muted)] text-[var(--primary-color)] py-0.5 px-1.5 rounded-xs text-xs font-semibold"
              aria-label={`${statistics?.total_documents || 0} Dokumente`}
            >
              {statistics?.total_documents || 0}
            </span>
          </button>
          {spaces.map((space: any) => (
            <button
              type="button"
              key={space.id}
              role="tab"
              aria-selected={activeSpaceId === space.id}
              className={cn(
                'group/tab flex items-center gap-2 py-2.5 px-4 bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-md text-[var(--text-muted)] text-sm font-medium cursor-pointer transition-all whitespace-nowrap shrink-0 relative hover:border-[var(--border-hover)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]',
                activeSpaceId === space.id &&
                  'border-[var(--space-color,var(--primary-color))] bg-[var(--primary-muted)] text-[var(--text-primary)] shadow-sm'
              )}
              onClick={() => handleSpaceChange(space.id)}
              style={{ '--space-color': space.color } as React.CSSProperties}
            >
              <Folder style={{ color: space.color }} aria-hidden="true" size={16} />
              <span>{space.name}</span>
              <span
                className="bg-[var(--primary-muted)] text-[var(--primary-color)] py-0.5 px-1.5 rounded-xs text-xs font-semibold"
                aria-label={`${space.document_count || 0} Dokumente`}
              >
                {space.document_count || 0}
              </span>
              {!space.is_default && !space.is_system && (
                <button
                  type="button"
                  className="hidden group-hover/tab:flex bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-0.5 ml-1 rounded-xs transition-colors hover:text-[var(--primary-color)] hover:bg-[var(--primary-muted)]"
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
            className="flex items-center gap-2 py-2.5 px-4 bg-[var(--gradient-card)] border border-dashed border-[var(--border-input)] rounded-md text-[var(--primary-color)] text-sm font-medium cursor-pointer transition-all whitespace-nowrap shrink-0 relative hover:border-[var(--primary-color)] hover:bg-[var(--primary-muted)]"
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
      {activeSpaceId && spaces.find((s: any) => s.id === activeSpaceId) && (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-md py-4 px-5 mb-4">
          <div>
            <h4>{spaces.find((s: any) => s.id === activeSpaceId)?.name}</h4>
            <p>
              {spaces.find((s: any) => s.id === activeSpaceId)?.description?.substring(0, 200)}...
            </p>
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
          onChange={e => handleFileUpload((e.target as HTMLInputElement).files)}
          multiple
          accept=".pdf,.docx,.md,.markdown,.txt,.yaml,.yml"
          style={{ display: 'none' }}
          aria-label="Datei auswählen"
        />

        {uploading ? (
          <div
            className="flex flex-col items-center gap-2"
            role="progressbar"
            aria-valuenow={uploadProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-1.5 bg-[var(--primary-color)] rounded-sm max-w-[200px] transition-[width]"
              style={{ width: `${uploadProgress}%` }}
            />
            <span aria-live="polite">{uploadProgress}% hochgeladen</span>
          </div>
        ) : (
          <>
            <Upload
              className="text-4xl text-[var(--primary-color)] mb-3 mx-auto"
              aria-hidden="true"
              size={40}
            />
            <p>
              Dateien hier ablegen oder klicken zum Auswählen
              {(uploadSpaceId || activeSpaceId) && spaces.length > 0 && (
                <span className="text-[var(--primary-color)] font-medium">
                  {' \u2192 '}
                  {spaces.find((s: any) => s.id === (uploadSpaceId || activeSpaceId))?.name ||
                    'Allgemein'}
                </span>
              )}
            </p>
            <span className="text-[var(--text-muted)] text-sm">
              PDF, DOCX, Markdown, YAML (max. 50MB)
            </span>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div
          className="dm-error flex items-center gap-3 bg-[var(--danger-alpha-10)] border border-[var(--danger-alpha-30)] rounded-md py-3 px-4 mb-4 text-[var(--danger-light)]"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle aria-hidden="true" size={18} />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Fehlermeldung schließen"
            className="ml-auto bg-transparent border-none text-[var(--danger-light)] cursor-pointer"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
      )}

      {/* Semantic Search */}
      <section className="mb-6" aria-label="Semantische Suche">
        <div
          className="flex items-center bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-md py-2 px-4 gap-3"
          role="search"
        >
          <Cpu
            className="text-[var(--primary-color)] text-xl shrink-0"
            aria-hidden="true"
            size={20}
          />
          <input
            type="search"
            className="flex-1 bg-transparent border-none text-[var(--text-primary)] text-sm py-2 placeholder:text-[var(--text-muted)] focus:outline-none"
            placeholder="Semantische Suche in allen Dokumenten..."
            value={semanticSearch}
            onChange={e => setSemanticSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSemanticSearch()}
            aria-label="Semantische Suche in Dokumenten"
          />
          <button
            type="button"
            className="bg-[var(--gradient-primary)] border-none rounded-md text-white py-2 px-4 cursor-pointer flex items-center gap-2 text-sm transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSemanticSearch}
            disabled={searching || !semanticSearch.trim()}
            aria-label={searching ? 'Suche läuft...' : 'Suchen'}
          >
            {searching ? (
              <RefreshCw className="animate-spin" aria-hidden="true" size={16} />
            ) : (
              <Search aria-hidden="true" size={16} />
            )}
          </button>
        </div>

        {/* Search Results */}
        {searchResults && (
          <div
            className="bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-md mt-4 overflow-hidden"
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
                className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)]"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            {searchResults.results.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-[var(--text-muted)]">Keine Ergebnisse gefunden</p>
                <p className="text-[var(--text-disabled)] text-xs mt-1">
                  Versuche andere Suchbegriffe
                </p>
              </div>
            ) : (
              <ul className="max-h-[300px] overflow-y-auto" aria-labelledby="search-results-title">
                {searchResults.results.map((result: any, idx: number) => (
                  <li
                    key={idx}
                    className="py-3 px-4 border-b border-[var(--border-subtle)] last:border-b-0"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[var(--primary-color)] font-medium">
                        {result.document_name}
                      </span>
                      <span
                        className="bg-[var(--primary-muted)] text-[var(--primary-color)] py-0.5 px-2 rounded-xs text-xs"
                        aria-label={`Relevanz: ${(result.score * 100).toFixed(0)} Prozent`}
                      >
                        {(result.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-[var(--text-muted)] text-sm leading-snug m-0">
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
        <div className="flex items-center bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-md py-2 px-3 gap-2 flex-1 min-w-[150px]">
          <Search className="text-[var(--text-muted)] shrink-0" aria-hidden="true" size={16} />
          <input
            type="text"
            className="flex-1 bg-transparent border-none text-[var(--text-primary)] text-sm w-full placeholder:text-[var(--text-muted)] focus:outline-none"
            placeholder="Suchen..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Nach Namen suchen"
          />
        </div>

        <div className="flex items-center bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-md py-2 px-3 gap-2 flex-1 min-w-[150px]">
          <Filter className="text-[var(--text-muted)] shrink-0" aria-hidden="true" size={16} />
          <select
            className="flex-1 bg-transparent border-none text-[var(--text-primary)] text-sm w-full placeholder:text-[var(--text-muted)] focus:outline-none cursor-pointer"
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Nach Status filtern"
          >
            <option
              value=""
              style={{ background: 'var(--bg-option)', color: 'var(--text-primary)' }}
            >
              Alle Status
            </option>
            <option
              value="indexed"
              style={{ background: 'var(--bg-option)', color: 'var(--text-primary)' }}
            >
              Indexiert
            </option>
            <option
              value="pending"
              style={{ background: 'var(--bg-option)', color: 'var(--text-primary)' }}
            >
              Wartend
            </option>
            <option
              value="processing"
              style={{ background: 'var(--bg-option)', color: 'var(--text-primary)' }}
            >
              Verarbeitung
            </option>
            <option
              value="failed"
              style={{ background: 'var(--bg-option)', color: 'var(--text-primary)' }}
            >
              Fehlgeschlagen
            </option>
          </select>
        </div>

        <div className="flex items-center bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-md py-2 px-3 gap-2 flex-1 min-w-[150px]">
          <Folder className="text-[var(--text-muted)] shrink-0" aria-hidden="true" size={16} />
          <select
            className="flex-1 bg-transparent border-none text-[var(--text-primary)] text-sm w-full placeholder:text-[var(--text-muted)] focus:outline-none cursor-pointer"
            value={categoryFilter}
            onChange={e => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Nach Kategorie filtern"
          >
            <option
              value=""
              style={{ background: 'var(--bg-option)', color: 'var(--text-primary)' }}
            >
              Alle Kategorien
            </option>
            {categories.map((cat: any) => (
              <option
                key={cat.id}
                value={cat.id}
                style={{ background: 'var(--bg-option)', color: 'var(--text-primary)' }}
              >
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-md text-[var(--primary-color)] py-2 px-3 cursor-pointer transition-all hover:border-[var(--primary-color)]"
          onClick={() => loadDocuments()}
          aria-label="Aktualisieren"
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" size={16} />
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-2 py-2.5 px-4 bg-transparent text-[var(--text-secondary)] border border-[var(--border-color)] rounded-sm text-sm font-medium cursor-pointer transition-all hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] hover:bg-[var(--primary-alpha-10)] hover:-translate-y-px hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setShowSimpleTableCreate(true)}
          aria-label="Neue Tabelle erstellen"
        >
          <Table aria-hidden="true" size={16} />
          <span>Neue Tabelle</span>
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-2 py-2.5 px-4 bg-transparent text-[var(--text-secondary)] border border-[var(--border-color)] rounded-sm text-sm font-medium cursor-pointer transition-all hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] hover:bg-[var(--primary-alpha-10)] hover:-translate-y-px hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setShowMarkdownCreate(true)}
          aria-label="Neues Dokument erstellen"
        >
          <FileText aria-hidden="true" size={16} />
          <span>Neues Dokument</span>
        </button>
      </div>

      {/* Documents and Tables List */}
      <section
        className="bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-lg overflow-hidden"
        aria-label="Datenliste"
      >
        {(loading || loadingTables) && filteredItems.length === 0 ? (
          <SkeletonDocumentList count={6} />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={<Database />}
            title="Keine Einträge gefunden"
            description={
              searchQuery || statusFilter || categoryFilter || activeSpaceId
                ? 'Keine Ergebnisse für die aktuelle Filterung.'
                : 'Laden Sie Dateien hoch oder erstellen Sie eine neue Tabelle.'
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
                <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-1" /> Datei hochladen
                </Button>
              )
            }
          />
        ) : (
          <table className="w-full border-collapse" aria-label={`${filteredItems.length} Einträge`}>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                  aria-label="Favorit"
                ></th>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                >
                  Typ
                </th>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                >
                  Bereich
                </th>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                >
                  Info
                </th>
                <th
                  scope="col"
                  className="bg-[var(--bg-table-header)] text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]"
                >
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Render Tables */}
              {filteredItems
                .filter((item: any) => item._type === 'table')
                .map((table: any) => (
                  <tr
                    key={`table-${table.id}`}
                    className="cursor-pointer transition-all hover:bg-[var(--bg-table-row-active)] focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:-outline-offset-2"
                    onClick={() => handleTableEdit(table)}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && handleTableEdit(table)}
                    aria-label={`Tabelle: ${table.name}`}
                  >
                    <td className="py-3 px-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] text-sm">
                      <span className="inline-flex items-center justify-center w-6 h-6 text-[var(--primary-color)] opacity-60">
                        <Grid3x3 aria-hidden="true" size={16} />
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] text-sm max-w-[300px]">
                      <div className="flex items-center gap-3">
                        <Table
                          className="text-[var(--primary-color)] text-xl shrink-0"
                          aria-hidden="true"
                          size={20}
                        />
                        <div>
                          <span className="block font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                            {table.name}
                          </span>
                          {table.description && (
                            <span className="block text-[var(--text-muted)] text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                              {table.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] text-sm">
                      <TableBadge />
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] text-sm">
                      <SpaceBadge
                        name={getTableSpaceName(table)}
                        color={getTableSpaceColor(table)}
                      />
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] text-sm">
                      <TableStatusBadge status={table.status || 'active'} />
                    </td>
                    <td className="py-3 px-4 text-[var(--text-muted)] border-b border-[var(--border-subtle)] text-sm">
                      <span>{table.field_count || 0} Spalten</span>
                    </td>
                    <td
                      className="py-3 px-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] text-sm whitespace-nowrap"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-xs transition-colors mr-1 hover:text-[var(--primary-color)] hover:bg-[var(--primary-muted)]"
                        onClick={() => handleTableEdit(table)}
                        aria-label={`${table.name} bearbeiten`}
                      >
                        <Pencil aria-hidden="true" size={16} />
                      </button>
                      <button
                        type="button"
                        className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-xs transition-colors mr-1 hover:text-[var(--danger-color)] hover:bg-[var(--danger-alpha-10)]"
                        onClick={() => handleDeleteTable(table)}
                        aria-label={`${table.name} löschen`}
                      >
                        <Trash2 aria-hidden="true" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              {/* Render Documents */}
              {filteredItems
                .filter((item: any) => item._type === 'document')
                .map((doc: any) => (
                  <tr
                    key={`doc-${doc.id}`}
                    className={cn(
                      'cursor-pointer transition-all hover:bg-[var(--bg-table-row-active)] focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:-outline-offset-2',
                      doc.is_favorite && 'bg-[rgba(251,191,36,0.05)]'
                    )}
                    onClick={() => viewDocumentDetails(doc)}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && viewDocumentDetails(doc)}
                    aria-label={`${doc.title || doc.filename}, Typ: ${getDocumentType(doc)}, Status: ${doc.status}`}
                  >
                    <td className="py-3 px-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] text-sm">
                      <button
                        type="button"
                        className={cn(
                          'bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1 transition-colors hover:text-[var(--warning-color)]',
                          doc.is_favorite && 'text-[var(--warning-color)]'
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
                    <td className="py-3 px-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] text-sm max-w-[300px]">
                      <div className="flex items-center gap-3">
                        {React.createElement(getFileIcon(doc), {
                          className: 'text-[var(--primary-color)] text-xl shrink-0',
                          'aria-hidden': 'true',
                          size: 20,
                        })}
                        <div>
                          <span className="block font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                            {doc.title || doc.filename}
                          </span>
                          {doc.title && doc.title !== doc.filename && (
                            <span className="block text-[var(--text-muted)] text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                              {doc.filename}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] text-sm">
                      <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-sm text-xs font-medium uppercase tracking-wide bg-[var(--primary-alpha-10)] text-[var(--primary-color)]">
                        {getDocumentType(doc)}
                      </span>
                    </td>
                    <td
                      className="py-3 px-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] text-sm"
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
                    <td className="py-3 px-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] text-sm">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] text-sm">
                      {formatFileSize(doc.file_size)}
                    </td>
                    <td
                      className="py-3 px-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] text-sm whitespace-nowrap"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-xs transition-colors mr-1 hover:text-[var(--primary-color)] hover:bg-[var(--primary-muted)]"
                        onClick={() => viewDocumentDetails(doc)}
                        aria-label={`Details für ${doc.title || doc.filename} anzeigen`}
                      >
                        <Eye aria-hidden="true" size={16} />
                      </button>
                      {canEdit(doc) && (
                        <button
                          type="button"
                          className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-xs transition-colors mr-1 hover:text-[var(--primary-color)] hover:bg-[var(--primary-muted)]"
                          onClick={() => handleEdit(doc)}
                          aria-label={`${doc.title || doc.filename} bearbeiten`}
                        >
                          <Pencil aria-hidden="true" size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-xs transition-colors mr-1 hover:text-[var(--primary-color)] hover:bg-[var(--primary-muted)]"
                        onClick={() => handleDownload(doc.id, doc.filename)}
                        aria-label={`${doc.filename} herunterladen`}
                      >
                        <Download aria-hidden="true" size={16} />
                      </button>
                      {doc.status === 'failed' && (
                        <button
                          type="button"
                          className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-xs transition-colors mr-1 hover:text-[var(--primary-color)] hover:bg-[var(--primary-muted)]"
                          onClick={() => handleReindex(doc.id)}
                          aria-label={`${doc.title || doc.filename} neu indexieren`}
                        >
                          <RefreshCw aria-hidden="true" size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-xs transition-colors mr-1 hover:text-[var(--danger-color)] hover:bg-[var(--danger-alpha-10)]"
                        onClick={() => handleDelete(doc.id, doc.filename)}
                        aria-label={`${doc.title || doc.filename} löschen`}
                      >
                        <Trash2 aria-hidden="true" size={16} />
                      </button>
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
          <div className="flex items-center gap-2">
            <label
              htmlFor="dm-page-size"
              className="text-[var(--text-muted)] text-sm whitespace-nowrap"
            >
              Pro Seite:
            </label>
            <select
              id="dm-page-size"
              className="bg-[var(--bg-dark)] border border-[var(--border-input)] rounded-sm text-[var(--text-primary)] py-1.5 px-2 text-sm cursor-pointer"
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
            <button
              type="button"
              className="bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-sm text-[var(--primary-color)] py-2 px-4 cursor-pointer text-sm transition-all hover:border-[var(--primary-color)] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
              aria-label="Erste Seite"
            >
              &laquo;
            </button>
            <button
              type="button"
              className="bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-sm text-[var(--primary-color)] py-2 px-4 cursor-pointer text-sm transition-all hover:border-[var(--primary-color)] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              aria-label="Vorherige Seite"
            >
              Zur&uuml;ck
            </button>
            <span
              className="text-[var(--text-muted)] text-sm whitespace-nowrap"
              aria-live="polite"
              aria-atomic="true"
            >
              Seite {currentPage} von {totalPages}
            </span>
            <button
              type="button"
              className="bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-sm text-[var(--primary-color)] py-2 px-4 cursor-pointer text-sm transition-all hover:border-[var(--primary-color)] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              aria-label="Nächste Seite"
            >
              Weiter
            </button>
            <button
              type="button"
              className="bg-[var(--gradient-card)] border border-[var(--border-input)] rounded-sm text-[var(--primary-color)] py-2 px-4 cursor-pointer text-sm transition-all hover:border-[var(--primary-color)] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
              aria-label="Letzte Seite"
            >
              &raquo;
            </button>
          </div>
        </nav>
      )}

      {/* Document Details Modal */}
      {showDetails && selectedDocument && (
        <Modal
          isOpen={true}
          onClose={() => setShowDetails(false)}
          title={selectedDocument.title || selectedDocument.filename}
          size="medium"
          footer={
            <div className="flex items-center gap-3" role="group" aria-label="Aktionen">
              {isEditable(selectedDocument) && (
                <button
                  type="button"
                  className="flex items-center gap-2 py-2.5 px-5 rounded-md text-sm cursor-pointer transition-all bg-[var(--primary-color)] border border-[var(--primary-color)] text-[var(--text-on-primary)] hover:bg-[var(--primary-hover)] hover:border-[var(--primary-hover)]"
                  onClick={() => {
                    setShowDetails(false);
                    handleEdit(selectedDocument);
                  }}
                  aria-label="Dokument bearbeiten"
                >
                  <Pencil aria-hidden="true" size={16} /> Bearbeiten
                </button>
              )}
              <button
                type="button"
                className="flex items-center gap-2 py-2.5 px-5 rounded-md text-sm cursor-pointer transition-all bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-hover)]"
                onClick={() => handleDownload(selectedDocument.id, selectedDocument.filename)}
                aria-label="Dokument herunterladen"
              >
                <Download aria-hidden="true" size={16} /> Download
              </button>
              <button
                type="button"
                className="flex items-center gap-2 py-2.5 px-5 rounded-md text-sm cursor-pointer transition-all bg-[var(--danger-alpha-10)] border border-[var(--danger-alpha-30)] text-[var(--danger-color)] hover:bg-[var(--danger-alpha-20)]"
                onClick={() => {
                  handleDelete(selectedDocument.id, selectedDocument.filename);
                  setShowDetails(false);
                }}
                aria-label="Dokument löschen"
              >
                <Trash2 aria-hidden="true" size={16} /> Löschen
              </button>
            </div>
          }
        >
          {/* Basic Info */}
          <div className="mb-6 last:mb-0">
            <h4 className="flex items-center gap-2 text-[var(--text-muted)] text-sm uppercase tracking-wide m-0 mb-3">
              Informationen
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-muted)] text-xs">Dateiname</span>
                <span className="text-[var(--text-primary)] text-sm">
                  {selectedDocument.filename}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-muted)] text-xs">Gr&ouml;&szlig;e</span>
                <span className="text-[var(--text-primary)] text-sm">
                  {formatFileSize(selectedDocument.file_size)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-muted)] text-xs">Typ</span>
                <span className="text-[var(--text-primary)] text-sm">
                  {selectedDocument.file_extension}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-muted)] text-xs">Status</span>
                <StatusBadge status={selectedDocument.status} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-muted)] text-xs">Seiten</span>
                <span className="text-[var(--text-primary)] text-sm">
                  {selectedDocument.page_count || '-'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-muted)] text-xs">W&ouml;rter</span>
                <span className="text-[var(--text-primary)] text-sm">
                  {selectedDocument.word_count?.toLocaleString() || '-'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-muted)] text-xs">Chunks</span>
                <span className="text-[var(--text-primary)] text-sm">
                  {selectedDocument.chunk_count || '-'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-muted)] text-xs">Sprache</span>
                <span className="text-[var(--text-primary)] text-sm">
                  {selectedDocument.language === 'de' ? 'Deutsch' : 'Englisch'}
                </span>
              </div>
            </div>
          </div>

          {/* AI Summary */}
          {selectedDocument.summary && (
            <div className="mb-6 last:mb-0">
              <h4 className="flex items-center gap-2 text-[var(--text-muted)] text-sm uppercase tracking-wide m-0 mb-3">
                <Cpu aria-hidden="true" size={16} /> KI-Zusammenfassung
              </h4>
              <p className="text-[var(--text-secondary)] leading-relaxed text-sm m-0 bg-[var(--bg-code)] p-4 rounded-md border-l-[3px] border-l-[var(--primary-color)]">
                {selectedDocument.summary}
              </p>
            </div>
          )}

          {/* Topics */}
          {selectedDocument.key_topics && selectedDocument.key_topics.length > 0 && (
            <div className="mb-6 last:mb-0">
              <h4 className="flex items-center gap-2 text-[var(--text-muted)] text-sm uppercase tracking-wide m-0 mb-3">
                <Tag aria-hidden="true" size={16} /> Themen
              </h4>
              <div className="flex flex-wrap gap-2" aria-label="Dokumenten-Themen">
                {selectedDocument.key_topics.map((topic: string, idx: number) => (
                  <span
                    key={idx}
                    className="bg-[var(--primary-muted)] text-[var(--primary-color)] py-1 px-2.5 rounded-xs text-sm"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Category with confidence */}
          {selectedDocument.category_name && (
            <div className="mb-6 last:mb-0">
              <h4 className="flex items-center gap-2 text-[var(--text-muted)] text-sm uppercase tracking-wide m-0 mb-3">
                <Folder aria-hidden="true" size={16} /> Kategorie
              </h4>
              <div className="flex items-center gap-3">
                <CategoryBadge
                  name={selectedDocument.category_name}
                  color={selectedDocument.category_color}
                />
                {selectedDocument.category_confidence && (
                  <span
                    className="text-[var(--text-muted)] text-sm"
                    aria-label={`Konfidenz: ${(selectedDocument.category_confidence * 100).toFixed(0)} Prozent`}
                  >
                    ({(selectedDocument.category_confidence * 100).toFixed(0)}% Konfidenz)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Similar Documents */}
          {selectedDocument.status === 'indexed' && (
            <div className="mb-6 last:mb-0">
              <h4 className="flex items-center gap-2 text-[var(--text-muted)] text-sm uppercase tracking-wide m-0 mb-3">
                <Link aria-hidden="true" size={16} /> Ähnliche Dokumente
              </h4>
              {loadingSimilar ? (
                <div
                  className="flex items-center gap-3 text-[var(--text-muted)]"
                  role="status"
                  aria-live="polite"
                >
                  <RefreshCw className="animate-spin" aria-hidden="true" size={16} />
                  <span>Suche ähnliche Dokumente...</span>
                </div>
              ) : similarDocuments.length === 0 ? (
                <p className="text-[var(--text-muted)] italic">
                  Keine ähnlichen Dokumente gefunden
                </p>
              ) : (
                <div className="flex flex-col gap-2" aria-label="Ähnliche Dokumente">
                  {similarDocuments.map((sim: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 py-2 px-3 bg-[var(--bg-code)] rounded-sm"
                    >
                      <File aria-hidden="true" size={16} />
                      <span className="flex-1 text-[var(--text-primary)] overflow-hidden text-ellipsis whitespace-nowrap">
                        {sim.title || sim.filename}
                      </span>
                      <span
                        className="bg-[var(--primary-muted)] text-[var(--primary-color)] py-0.5 px-2 rounded-xs text-xs"
                        aria-label={`Ähnlichkeit: ${(sim.similarity_score * 100).toFixed(0)} Prozent`}
                      >
                        {(sim.similarity_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error message if failed */}
          {selectedDocument.status === 'failed' && selectedDocument.processing_error && (
            <div
              className="mb-6 last:mb-0 bg-[rgba(239,68,68,0.05)] p-4 rounded-md border border-[var(--danger-alpha-20)]"
              role="alert"
            >
              <h4 className="flex items-center gap-2 text-[var(--text-muted)] text-sm uppercase tracking-wide m-0 mb-3">
                <AlertCircle aria-hidden="true" size={16} /> Fehler
              </h4>
              <p className="text-[var(--danger-light)] m-0 mb-4 text-sm">
                {selectedDocument.processing_error}
              </p>
              <button
                type="button"
                className="flex items-center gap-2 bg-[var(--danger-alpha-10)] border border-[var(--danger-alpha-30)] text-[var(--danger-light)] py-2 px-4 rounded-sm cursor-pointer text-sm transition-all hover:bg-[var(--danger-alpha-20)]"
                onClick={() => {
                  handleReindex(selectedDocument.id);
                  setShowDetails(false);
                }}
                aria-label="Indexierung erneut versuchen"
              >
                <RefreshCw aria-hidden="true" size={16} /> Erneut versuchen
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* Markdown Editor */}
      {showEditor && editingDocument && (
        <MarkdownEditor
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
