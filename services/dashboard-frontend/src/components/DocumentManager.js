import React, { useState, useEffect, useCallback, useRef } from 'react';
import EmptyState from './EmptyState';
import { SkeletonDocumentList } from './Skeleton';
import {
  FiUpload,
  FiFile,
  FiSearch,
  FiFilter,
  FiTrash2,
  FiDownload,
  FiRefreshCw,
  FiX,
  FiCheck,
  FiAlertCircle,
  FiClock,
  FiFolder,
  FiStar,
  FiTag,
  FiFileText,
  FiDatabase,
  FiCpu,
  FiEye,
  FiLink,
  FiEdit2,
  FiPlus,
  FiSettings,
  FiTable,
  FiGrid,
} from 'react-icons/fi';
import {
  TableBadge,
  StatusBadge,
  TableStatusBadge,
  CategoryBadge,
  SpaceBadge,
} from './DocumentManager/Badges';
import MarkdownEditor from './MarkdownEditor';
import MarkdownCreateDialog from './MarkdownCreateDialog';
import SimpleTableCreateDialog from './SimpleTableCreateDialog';
import ExcelEditor from './Database/ExcelEditor';
import SpaceModal from './SpaceModal';
import Modal from './Modal';
import { API_BASE, getAuthHeaders } from '../config/api';
import { getValidToken } from '../utils/token';
import { useToast } from '../contexts/ToastContext';
import useConfirm from '../hooks/useConfirm';
import { formatDate, formatFileSize } from '../utils/formatting';
import { ComponentErrorBoundary } from './ErrorBoundary';
import '../documents.css';
import '../markdown-editor.css';

function DocumentManager() {
  // State
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [documents, setDocuments] = useState([]);
  const [tables, setTables] = useState([]); // PostgreSQL Datentabellen
  const [categories, setCategories] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [error, setError] = useState(null);

  // Knowledge Spaces (RAG 2.0)
  const [spaces, setSpaces] = useState([]);
  const [activeSpaceId, setActiveSpaceId] = useState(null); // null = all spaces
  const [showSpaceModal, setShowSpaceModal] = useState(false);
  const [editingSpace, setEditingSpace] = useState(null);
  const [uploadSpaceId, setUploadSpaceId] = useState(null);

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  // Modal state
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [similarDocuments, setSimilarDocuments] = useState([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  // Semantic search
  const [semanticSearch, setSemanticSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  // RC-003 FIX: Request ID counter for race condition protection in semantic search
  const searchRequestIdRef = useRef(0);

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);

  // Table Editor state (ExcelEditor popup)
  const [showTableEditor, setShowTableEditor] = useState(false);
  const [editingTable, setEditingTable] = useState(null);

  // Create dialog state
  const [showMarkdownCreate, setShowMarkdownCreate] = useState(false);
  const [showSimpleTableCreate, setShowSimpleTableCreate] = useState(false);

  // Refs
  const fileInputRef = useRef(null);

  // Get auth token via validated token utility
  const getAuthToken = () => getValidToken();

  // Check if file is editable (markdown or text)
  const isEditable = doc => {
    const editableExtensions = ['.md', '.markdown', '.txt'];
    return editableExtensions.includes(doc.file_extension?.toLowerCase());
  };

  // Check if any type of editing is supported
  const canEdit = doc => {
    return isEditable(doc);
  };

  // Get file type icon
  const getFileIcon = doc => {
    if (isEditable(doc)) return FiFileText;
    return FiFile;
  };

  // Get document type label
  const getDocumentType = doc => {
    return 'Dokument';
  };

  // Load documents
  const loadDocuments = useCallback(
    async signal => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          limit: itemsPerPage,
          offset: (currentPage - 1) * itemsPerPage,
        });

        if (statusFilter) params.append('status', statusFilter);
        if (categoryFilter) params.append('category_id', categoryFilter);
        if (searchQuery) params.append('search', searchQuery);
        if (activeSpaceId) params.append('space_id', activeSpaceId);

        const response = await fetch(`${API_BASE}/documents?${params}`, {
          headers: getAuthHeaders(),
          signal,
        });
        const data = await response.json();
        setDocuments(data.documents || []);
        setTotalDocuments(data.total || 0);
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        console.error('Error loading documents:', err);
        setError('Fehler beim Laden der Dokumente');
      } finally {
        setLoading(false);
      }
    },
    [currentPage, statusFilter, categoryFilter, searchQuery, itemsPerPage, activeSpaceId]
  );

  // Load categories
  const loadCategories = async signal => {
    try {
      const response = await fetch(`${API_BASE}/documents/categories`, {
        headers: getAuthHeaders(),
        signal,
      });
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Error loading categories:', err);
    }
  };

  // Load statistics - filter-aware for dynamic KPIs
  const loadStatistics = useCallback(
    async signal => {
      try {
        const params = new URLSearchParams();
        if (activeSpaceId) params.append('space_id', activeSpaceId);
        if (statusFilter) params.append('status', statusFilter);
        if (categoryFilter) params.append('category_id', categoryFilter);

        const response = await fetch(`${API_BASE}/documents/statistics?${params}`, {
          headers: getAuthHeaders(),
          signal,
        });
        const data = await response.json();
        setStatistics(data);
      } catch (err) {
        if (signal?.aborted) return;
        console.error('Error loading statistics:', err);
      }
    },
    [activeSpaceId, statusFilter, categoryFilter]
  );

  // Load Knowledge Spaces (RAG 2.0)
  const loadSpaces = async signal => {
    try {
      const response = await fetch(`${API_BASE}/spaces`, { headers: getAuthHeaders(), signal });
      const data = await response.json();
      setSpaces(data.spaces || []);
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Error loading spaces:', err);
    }
  };

  // Total tables count (from server)
  const [totalTables, setTotalTables] = useState(0);

  // Load Datentabellen (PostgreSQL tables) - server-side filtering
  const loadTables = useCallback(
    async signal => {
      try {
        setLoadingTables(true);
        const params = new URLSearchParams();

        if (activeSpaceId) params.append('space_id', activeSpaceId);
        if (statusFilter) {
          // Map document status to table status
          const statusMap = { indexed: 'active', pending: 'draft', failed: 'archived' };
          params.append('status', statusMap[statusFilter] || statusFilter);
        }
        if (searchQuery) params.append('search', searchQuery);

        const response = await fetch(`${API_BASE}/v1/datentabellen/tables?${params}`, {
          headers: getAuthHeaders(),
          signal,
        });
        const data = await response.json();
        const allTables = data.tables || data.data || [];
        setTables(allTables);
        setTotalTables(data.total || allTables.length);
      } catch (err) {
        if (signal?.aborted) return;
        console.error('Error loading tables:', err);
      } finally {
        setLoadingTables(false);
      }
    },
    [activeSpaceId, statusFilter, searchQuery]
  );

  // Handle space change (for tabs) - reset all filters
  const handleSpaceChange = spaceId => {
    setActiveSpaceId(spaceId);
    setCurrentPage(1);
    setStatusFilter('');
    setCategoryFilter('');
    setSearchQuery('');
    // Also set as default upload space
    setUploadSpaceId(spaceId);
  };

  // Handle space modal save
  const handleSpaceSave = savedSpace => {
    loadSpaces();
    loadStatistics();
    loadDocuments();
  };

  // Edit space
  const handleEditSpace = (space, e) => {
    e.stopPropagation();
    setEditingSpace(space);
    setShowSpaceModal(true);
  };

  // Move document to a different space
  const handleMoveDocument = async (docId, newSpaceId, newSpaceName) => {
    try {
      await fetch(`${API_BASE}/documents/${docId}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ space_id: newSpaceId }),
      });
      toast.success(`Dokument verschoben nach: ${newSpaceName || 'Kein Bereich'}`);
      loadDocuments();
      loadStatistics();
    } catch (err) {
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

  // File upload handler
  const handleFileUpload = async files => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    const totalFiles = files.length;
    let completedFiles = 0;

    // Use active space or upload space selection
    const targetSpaceId = uploadSpaceId || activeSpaceId;

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        // RAG 2.0: Include space_id for document organization
        if (targetSpaceId) {
          formData.append('space_id', targetSpaceId);
        }

        await fetch(`${API_BASE}/documents/upload`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });

        completedFiles++;
        setUploadProgress(Math.round((completedFiles / totalFiles) * 100));
      } catch (err) {
        console.error(`Error uploading ${file.name}:`, err);
        setError(`Fehler beim Hochladen von "${file.name}"`);
      }
    }

    setUploading(false);
    setUploadProgress(0);

    // Refresh documents list and spaces (for updated counts)
    loadDocuments();
    loadStatistics();
    loadSpaces();
  };

  // Drag and drop handlers
  const handleDrag = e => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = e => {
    handleDrag(e);
    setDragActive(true);
  };

  const handleDragLeave = e => {
    handleDrag(e);
    setDragActive(false);
  };

  const handleDrop = e => {
    handleDrag(e);
    setDragActive(false);
    handleFileUpload(e.dataTransfer.files);
  };

  // Delete document
  const handleDelete = async (docId, filename) => {
    if (!(await confirm({ message: `"${filename}" wirklich löschen?` }))) return;

    try {
      await fetch(`${API_BASE}/documents/${docId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      loadDocuments();
      loadStatistics();
    } catch (err) {
      setError('Fehler beim Löschen');
    }
  };

  // Download document
  const handleDownload = async (docId, filename) => {
    try {
      const response = await fetch(`${API_BASE}/documents/${docId}/download`, {
        headers: getAuthHeaders(),
      });
      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Fehler beim Download');
    }
  };

  // Reindex document
  const handleReindex = async docId => {
    try {
      await fetch(`${API_BASE}/documents/${docId}/reindex`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      loadDocuments();
    } catch (err) {
      setError('Fehler beim Neuindexieren');
    }
  };

  // View document details
  const viewDocumentDetails = async doc => {
    setSelectedDocument(doc);
    setShowDetails(true);
    setSimilarDocuments([]);

    // Load similar documents
    if (doc.status === 'indexed') {
      setLoadingSimilar(true);
      try {
        const response = await fetch(`${API_BASE}/documents/${doc.id}/similar`, {
          headers: getAuthHeaders(),
        });
        const data = await response.json();
        setSimilarDocuments(data.similar_documents || []);
      } catch (err) {
        console.error('Error loading similar documents:', err);
      } finally {
        setLoadingSimilar(false);
      }
    }
  };

  // Semantic search - RC-003 FIX: Race condition protection
  const handleSemanticSearch = async () => {
    if (!semanticSearch.trim()) return;

    // Increment request ID to track this specific search
    const currentRequestId = ++searchRequestIdRef.current;
    setSearching(true);

    try {
      const response = await fetch(`${API_BASE}/documents/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ query: semanticSearch, top_k: 10 }),
      });
      const data = await response.json();

      // RC-003: Only update state if this is still the most recent search
      if (searchRequestIdRef.current === currentRequestId) {
        setSearchResults(data);
      }
    } catch (err) {
      // Only show error if this is still the most recent search
      if (searchRequestIdRef.current === currentRequestId) {
        setError('Fehler bei der Suche');
      }
    } finally {
      // Only reset loading if this is still the most recent search
      if (searchRequestIdRef.current === currentRequestId) {
        setSearching(false);
      }
    }
  };

  // Toggle favorite
  const toggleFavorite = async doc => {
    try {
      await fetch(`${API_BASE}/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ is_favorite: !doc.is_favorite }),
      });
      loadDocuments();
    } catch (err) {
      setError('Fehler beim Aktualisieren');
    }
  };

  // Open editor for a document
  const handleEdit = doc => {
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
  const handleMarkdownCreated = newDoc => {
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
  const handleDataTableCreated = newTable => {
    setShowSimpleTableCreate(false);
    loadTables(); // Refresh tables list
    // Open the new table in the editor popup
    if (newTable?.slug) {
      setEditingTable(newTable);
      setShowTableEditor(true);
    }
  };

  // Handle table edit
  const handleTableEdit = table => {
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
  const handleDeleteTable = async table => {
    if (!(await confirm({ message: `Tabelle "${table.name}" wirklich löschen?` }))) return;

    try {
      await fetch(`${API_BASE}/v1/datentabellen/tables/${table.slug}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      loadTables();
    } catch (err) {
      setError('Fehler beim Löschen der Tabelle');
    }
  };

  // Get space name for a table
  const getTableSpaceName = table => {
    const space = spaces.find(s => s.id === table.space_id);
    return space?.name || 'Allgemein';
  };

  const getTableSpaceColor = table => {
    const space = spaces.find(s => s.id === table.space_id);
    return space?.color || 'var(--primary-color)';
  };

  // Combine documents and tables into a unified list for display
  const combinedItems = [
    // Tables first (marked as type 'table')
    ...tables.map(t => ({ ...t, _type: 'table' })),
    // Then documents (marked as type 'document')
    ...documents.map(d => ({ ...d, _type: 'document' })),
  ];

  // Server already filters - no client-side filtering needed
  const filteredItems = combinedItems;

  const totalPages = Math.ceil((totalDocuments + totalTables) / itemsPerPage);

  return (
    <main className="document-manager" role="main" aria-label="Dokumentenverwaltung">
      {/* Header with statistics */}
      <header className="dm-header" aria-label="Dokumenten-Statistiken">
        <div className="dm-stats-row" role="group" aria-label="Übersicht">
          <div
            className="dm-stat-card"
            aria-label={`${(statistics?.total_documents || 0) + (statistics?.table_count || 0)} Einträge insgesamt`}
          >
            <FiDatabase className="dm-stat-icon" aria-hidden="true" />
            <div className="dm-stat-content">
              <span className="dm-stat-value">
                {(statistics?.total_documents || 0) + (statistics?.table_count || 0)}
              </span>
              <span className="dm-stat-label">
                Gesamt{activeSpaceId || statusFilter || categoryFilter ? ' (gefiltert)' : ''}
              </span>
            </div>
          </div>
          <div
            className="dm-stat-card"
            aria-label={`${statistics?.indexed_documents || 0} Dokumente indexiert`}
          >
            <FiCheck className="dm-stat-icon success" aria-hidden="true" />
            <div className="dm-stat-content">
              <span className="dm-stat-value">{statistics?.indexed_documents || 0}</span>
              <span className="dm-stat-label">Indexiert</span>
            </div>
          </div>
          <div
            className="dm-stat-card"
            aria-label={`${statistics?.pending_documents || 0} Dokumente wartend`}
          >
            <FiClock className="dm-stat-icon warning" aria-hidden="true" />
            <div className="dm-stat-content">
              <span className="dm-stat-value">{statistics?.pending_documents || 0}</span>
              <span className="dm-stat-label">Wartend</span>
            </div>
          </div>
          <div className="dm-stat-card" aria-label={`${statistics?.table_count || 0} Tabellen`}>
            <FiTable className="dm-stat-icon" aria-hidden="true" />
            <div className="dm-stat-content">
              <span className="dm-stat-value">{statistics?.table_count || 0}</span>
              <span className="dm-stat-label">Tabellen</span>
            </div>
          </div>
        </div>
      </header>

      {/* Knowledge Spaces Tabs (RAG 2.0) */}
      <nav className="dm-spaces-tabs" aria-label="Wissensbereiche">
        <div className="spaces-tabs-list" role="tablist" aria-label="Dokumenten-Bereiche">
          <button
            type="button"
            role="tab"
            aria-selected={activeSpaceId === null}
            className={`space-tab ${activeSpaceId === null ? 'active' : ''}`}
            onClick={() => handleSpaceChange(null)}
          >
            <FiFolder aria-hidden="true" />
            <span>Alle</span>
            <span
              className="space-count"
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
              className={`space-tab ${activeSpaceId === space.id ? 'active' : ''}`}
              onClick={() => handleSpaceChange(space.id)}
              style={{ '--space-color': space.color }}
            >
              <FiFolder style={{ color: space.color }} aria-hidden="true" />
              <span>{space.name}</span>
              <span className="space-count" aria-label={`${space.document_count || 0} Dokumente`}>
                {space.document_count || 0}
              </span>
              {!space.is_default && !space.is_system && (
                <button
                  type="button"
                  className="space-edit-btn"
                  onClick={e => handleEditSpace(space, e)}
                  aria-label={`${space.name} bearbeiten`}
                >
                  <FiSettings aria-hidden="true" />
                </button>
              )}
            </button>
          ))}
          <button
            type="button"
            className="space-tab add-space"
            onClick={() => {
              setEditingSpace(null);
              setShowSpaceModal(true);
            }}
            aria-label="Neuen Bereich erstellen"
          >
            <FiPlus aria-hidden="true" />
            <span>Neu</span>
          </button>
        </div>
      </nav>

      {/* Active Space Description (if a space is selected) */}
      {activeSpaceId && spaces.find(s => s.id === activeSpaceId) && (
        <div className="dm-space-info">
          <div className="space-info-content">
            <h4>{spaces.find(s => s.id === activeSpaceId)?.name}</h4>
            <p>{spaces.find(s => s.id === activeSpaceId)?.description?.substring(0, 200)}...</p>
          </div>
        </div>
      )}

      {/* Upload Zone */}
      <div
        className={`dm-upload-zone ${dragActive ? 'drag-active' : ''} ${uploading ? 'uploading' : ''}`}
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
          onChange={e => handleFileUpload(e.target.files)}
          multiple
          accept=".pdf,.docx,.md,.markdown,.txt,.yaml,.yml"
          style={{ display: 'none' }}
          aria-label="Datei auswählen"
        />

        {uploading ? (
          <div
            className="upload-progress"
            role="progressbar"
            aria-valuenow={uploadProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
            <span aria-live="polite">{uploadProgress}% hochgeladen</span>
          </div>
        ) : (
          <>
            <FiUpload className="upload-icon" aria-hidden="true" />
            <p>
              Dateien hier ablegen oder klicken zum Auswählen
              {(uploadSpaceId || activeSpaceId) && spaces.length > 0 && (
                <span className="upload-space-hint">
                  {' → '}
                  {spaces.find(s => s.id === (uploadSpaceId || activeSpaceId))?.name || 'Allgemein'}
                </span>
              )}
            </p>
            <span className="upload-hint">PDF, DOCX, Markdown, YAML (max. 50MB)</span>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="dm-error" role="alert" aria-live="assertive">
          <FiAlertCircle aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Fehlermeldung schließen">
            <FiX aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Semantic Search */}
      <section className="dm-semantic-search" aria-label="Semantische Suche">
        <div className="semantic-search-input" role="search">
          <FiCpu className="search-icon" aria-hidden="true" />
          <input
            type="search"
            placeholder="Semantische Suche in allen Dokumenten..."
            value={semanticSearch}
            onChange={e => setSemanticSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSemanticSearch()}
            aria-label="Semantische Suche in Dokumenten"
          />
          <button
            type="button"
            className="search-btn"
            onClick={handleSemanticSearch}
            disabled={searching || !semanticSearch.trim()}
            aria-label={searching ? 'Suche läuft...' : 'Suchen'}
          >
            {searching ? (
              <FiRefreshCw className="spin" aria-hidden="true" />
            ) : (
              <FiSearch aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Search Results */}
        {searchResults && (
          <div
            className="search-results"
            role="region"
            aria-label="Suchergebnisse"
            aria-live="polite"
          >
            <div className="search-results-header">
              <h4 id="search-results-title">Suchergebnisse für "{searchResults.query}"</h4>
              <button
                type="button"
                onClick={() => setSearchResults(null)}
                aria-label="Suchergebnisse schließen"
              >
                <FiX aria-hidden="true" />
              </button>
            </div>
            {searchResults.results.length === 0 ? (
              <p className="no-results">Keine Ergebnisse gefunden</p>
            ) : (
              <ul className="search-results-list" aria-labelledby="search-results-title">
                {searchResults.results.map((result, idx) => (
                  <li key={idx} className="search-result-item">
                    <div className="result-header">
                      <span className="result-name">{result.document_name}</span>
                      <span
                        className="result-score"
                        aria-label={`Relevanz: ${(result.score * 100).toFixed(0)} Prozent`}
                      >
                        {(result.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="result-preview">{result.chunk_text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Filters */}
      <div className="dm-filters" role="group" aria-label="Dokumenten-Filter">
        <div className="filter-group">
          <FiSearch className="filter-icon" aria-hidden="true" />
          <input
            type="text"
            placeholder="Suchen..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Nach Namen suchen"
          />
        </div>

        <div className="filter-group">
          <FiFilter className="filter-icon" aria-hidden="true" />
          <select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Nach Status filtern"
          >
            <option value="">Alle Status</option>
            <option value="indexed">Indexiert</option>
            <option value="pending">Wartend</option>
            <option value="processing">Verarbeitung</option>
            <option value="failed">Fehlgeschlagen</option>
          </select>
        </div>

        <div className="filter-group">
          <FiFolder className="filter-icon" aria-hidden="true" />
          <select
            value={categoryFilter}
            onChange={e => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Nach Kategorie filtern"
          >
            <option value="">Alle Kategorien</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="refresh-btn"
          onClick={loadDocuments}
          aria-label="Aktualisieren"
        >
          <FiRefreshCw className={loading ? 'spin' : ''} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="dm-create-btn dm-create-btn-secondary"
          onClick={() => setShowSimpleTableCreate(true)}
          aria-label="Neue Tabelle erstellen"
        >
          <FiTable aria-hidden="true" />
          <span>Neue Tabelle</span>
        </button>

        <button
          type="button"
          className="dm-create-btn dm-create-btn-secondary"
          onClick={() => setShowMarkdownCreate(true)}
          aria-label="Neues Dokument erstellen"
        >
          <FiFileText aria-hidden="true" />
          <span>Neues Dokument</span>
        </button>
      </div>

      {/* Documents and Tables List */}
      <section className="dm-documents" aria-label="Datenliste">
        {(loading || loadingTables) && filteredItems.length === 0 ? (
          <SkeletonDocumentList count={6} />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={<FiDatabase />}
            title="Keine Einträge gefunden"
            description="Laden Sie Dateien hoch oder erstellen Sie eine neue Tabelle"
          />
        ) : (
          <table className="dm-table" aria-label={`${filteredItems.length} Einträge`}>
            <thead>
              <tr>
                <th scope="col" aria-label="Favorit"></th>
                <th scope="col">Name</th>
                <th scope="col">Typ</th>
                <th scope="col">Bereich</th>
                <th scope="col">Status</th>
                <th scope="col">Info</th>
                <th scope="col">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {/* Render Tables */}
              {filteredItems
                .filter(item => item._type === 'table')
                .map(table => (
                  <tr
                    key={`table-${table.id}`}
                    className="clickable-row table-row"
                    onClick={() => handleTableEdit(table)}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && handleTableEdit(table)}
                    aria-label={`Tabelle: ${table.name}`}
                  >
                    <td>
                      <span className="table-icon-placeholder">
                        <FiGrid aria-hidden="true" />
                      </span>
                    </td>
                    <td className="doc-name-cell">
                      <div className="doc-info">
                        <FiTable className="doc-icon table-icon" aria-hidden="true" />
                        <div>
                          <span className="doc-title">{table.name}</span>
                          {table.description && (
                            <span className="doc-filename">{table.description}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <TableBadge />
                    </td>
                    <td>
                      <SpaceBadge
                        name={getTableSpaceName(table)}
                        color={getTableSpaceColor(table)}
                      />
                    </td>
                    <td>
                      <TableStatusBadge status={table.status || 'active'} />
                    </td>
                    <td>
                      <span className="table-info">{table.field_count || 0} Spalten</span>
                    </td>
                    <td className="actions-cell" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className="action-btn edit"
                        onClick={() => handleTableEdit(table)}
                        aria-label={`${table.name} bearbeiten`}
                      >
                        <FiEdit2 aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="action-btn delete"
                        onClick={() => handleDeleteTable(table)}
                        aria-label={`${table.name} löschen`}
                      >
                        <FiTrash2 aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              {/* Render Documents */}
              {filteredItems
                .filter(item => item._type === 'document')
                .map(doc => (
                  <tr
                    key={`doc-${doc.id}`}
                    className={`clickable-row ${doc.is_favorite ? 'favorite' : ''}`}
                    onClick={() => viewDocumentDetails(doc)}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && viewDocumentDetails(doc)}
                    aria-label={`${doc.title || doc.filename}, Typ: ${getDocumentType(doc)}, Status: ${doc.status}`}
                  >
                    <td>
                      <button
                        type="button"
                        className={`favorite-btn ${doc.is_favorite ? 'active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          toggleFavorite(doc);
                        }}
                        aria-label={
                          doc.is_favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'
                        }
                        aria-pressed={doc.is_favorite}
                      >
                        <FiStar aria-hidden="true" />
                      </button>
                    </td>
                    <td className="doc-name-cell">
                      <div className="doc-info">
                        {React.createElement(getFileIcon(doc), {
                          className: 'doc-icon',
                          'aria-hidden': 'true',
                        })}
                        <div>
                          <span className="doc-title">{doc.title || doc.filename}</span>
                          {doc.title && doc.title !== doc.filename && (
                            <span className="doc-filename">{doc.filename}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="type-badge type-document">{getDocumentType(doc)}</span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <SpaceBadge
                        name={doc.space_name}
                        color={doc.space_color}
                        docId={doc.id}
                        spaces={spaces}
                        onMove={handleMoveDocument}
                      />
                    </td>
                    <td>
                      <StatusBadge status={doc.status} />
                    </td>
                    <td>{formatFileSize(doc.file_size)}</td>
                    <td className="actions-cell" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => viewDocumentDetails(doc)}
                        aria-label={`Details für ${doc.title || doc.filename} anzeigen`}
                      >
                        <FiEye aria-hidden="true" />
                      </button>
                      {canEdit(doc) && (
                        <button
                          type="button"
                          className="action-btn edit"
                          onClick={() => handleEdit(doc)}
                          aria-label={`${doc.title || doc.filename} bearbeiten`}
                        >
                          <FiEdit2 aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => handleDownload(doc.id, doc.filename)}
                        aria-label={`${doc.filename} herunterladen`}
                      >
                        <FiDownload aria-hidden="true" />
                      </button>
                      {doc.status === 'failed' && (
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() => handleReindex(doc.id)}
                          aria-label={`${doc.title || doc.filename} neu indexieren`}
                        >
                          <FiRefreshCw aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="action-btn delete"
                        onClick={() => handleDelete(doc.id, doc.filename)}
                        aria-label={`${doc.title || doc.filename} löschen`}
                      >
                        <FiTrash2 aria-hidden="true" />
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
        <nav className="dm-pagination" role="navigation" aria-label="Seitennavigation">
          <div className="dm-pagination-size">
            <label htmlFor="dm-page-size">Pro Seite:</label>
            <select
              id="dm-page-size"
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
          <div className="dm-pagination-nav">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
              aria-label="Erste Seite"
            >
              ⟨⟨
            </button>
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              aria-label="Vorherige Seite"
            >
              Zurück
            </button>
            <span aria-live="polite" aria-atomic="true">
              Seite {currentPage} von {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              aria-label="Nächste Seite"
            >
              Weiter
            </button>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
              aria-label="Letzte Seite"
            >
              ⟩⟩
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
          className="dm-modal-wrapper"
          footer={
            <div className="modal-footer" role="group" aria-label="Aktionen">
              {isEditable(selectedDocument) && (
                <button
                  type="button"
                  className="modal-btn primary"
                  onClick={() => {
                    setShowDetails(false);
                    handleEdit(selectedDocument);
                  }}
                  aria-label="Dokument bearbeiten"
                >
                  <FiEdit2 aria-hidden="true" /> Bearbeiten
                </button>
              )}
              <button
                type="button"
                className="modal-btn secondary"
                onClick={() => handleDownload(selectedDocument.id, selectedDocument.filename)}
                aria-label="Dokument herunterladen"
              >
                <FiDownload aria-hidden="true" /> Download
              </button>
              <button
                type="button"
                className="modal-btn danger"
                onClick={() => {
                  handleDelete(selectedDocument.id, selectedDocument.filename);
                  setShowDetails(false);
                }}
                aria-label="Dokument löschen"
              >
                <FiTrash2 aria-hidden="true" /> Löschen
              </button>
            </div>
          }
        >
          {/* Basic Info */}
          <div className="detail-section">
            <h4>Informationen</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="label">Dateiname</span>
                <span className="value">{selectedDocument.filename}</span>
              </div>
              <div className="detail-item">
                <span className="label">Größe</span>
                <span className="value">{formatFileSize(selectedDocument.file_size)}</span>
              </div>
              <div className="detail-item">
                <span className="label">Typ</span>
                <span className="value">{selectedDocument.file_extension}</span>
              </div>
              <div className="detail-item">
                <span className="label">Status</span>
                <StatusBadge status={selectedDocument.status} />
              </div>
              <div className="detail-item">
                <span className="label">Seiten</span>
                <span className="value">{selectedDocument.page_count || '-'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Wörter</span>
                <span className="value">
                  {selectedDocument.word_count?.toLocaleString() || '-'}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Chunks</span>
                <span className="value">{selectedDocument.chunk_count || '-'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Sprache</span>
                <span className="value">
                  {selectedDocument.language === 'de' ? 'Deutsch' : 'Englisch'}
                </span>
              </div>
            </div>
          </div>

          {/* AI Summary */}
          {selectedDocument.summary && (
            <div className="detail-section">
              <h4>
                <FiCpu aria-hidden="true" /> KI-Zusammenfassung
              </h4>
              <p className="summary-text">{selectedDocument.summary}</p>
            </div>
          )}

          {/* Topics */}
          {selectedDocument.key_topics && selectedDocument.key_topics.length > 0 && (
            <div className="detail-section">
              <h4>
                <FiTag aria-hidden="true" /> Themen
              </h4>
              <ul className="topics-list" aria-label="Dokumenten-Themen">
                {selectedDocument.key_topics.map((topic, idx) => (
                  <li key={idx} className="topic-tag">
                    {topic}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Category with confidence */}
          {selectedDocument.category_name && (
            <div className="detail-section">
              <h4>
                <FiFolder aria-hidden="true" /> Kategorie
              </h4>
              <div className="category-info">
                <CategoryBadge
                  name={selectedDocument.category_name}
                  color={selectedDocument.category_color}
                />
                {selectedDocument.category_confidence && (
                  <span
                    className="confidence"
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
            <div className="detail-section">
              <h4>
                <FiLink aria-hidden="true" /> Ähnliche Dokumente
              </h4>
              {loadingSimilar ? (
                <div className="loading-similar" role="status" aria-live="polite">
                  <FiRefreshCw className="spin" aria-hidden="true" />
                  <span>Suche ähnliche Dokumente...</span>
                </div>
              ) : similarDocuments.length === 0 ? (
                <p className="no-similar">Keine ähnlichen Dokumente gefunden</p>
              ) : (
                <ul className="similar-list" aria-label="Ähnliche Dokumente">
                  {similarDocuments.map((sim, idx) => (
                    <li key={idx} className="similar-item">
                      <FiFile aria-hidden="true" />
                      <span className="sim-name">{sim.title || sim.filename}</span>
                      <span
                        className="sim-score"
                        aria-label={`Ähnlichkeit: ${(sim.similarity_score * 100).toFixed(0)} Prozent`}
                      >
                        {(sim.similarity_score * 100).toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Error message if failed */}
          {selectedDocument.status === 'failed' && selectedDocument.processing_error && (
            <div className="detail-section error-section" role="alert">
              <h4>
                <FiAlertCircle aria-hidden="true" /> Fehler
              </h4>
              <p className="error-text">{selectedDocument.processing_error}</p>
              <button
                type="button"
                className="retry-btn"
                onClick={() => {
                  handleReindex(selectedDocument.id);
                  setShowDetails(false);
                }}
                aria-label="Indexierung erneut versuchen"
              >
                <FiRefreshCw aria-hidden="true" /> Erneut versuchen
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
        <MarkdownCreateDialog
          isOpen={showMarkdownCreate}
          onClose={() => setShowMarkdownCreate(false)}
          onCreated={handleMarkdownCreated}
          spaceId={activeSpaceId || uploadSpaceId}
          spaces={spaces}
        />
      )}

      {/* Simple Table Create Dialog (PostgreSQL Datentabellen) */}
      {showSimpleTableCreate && (
        <SimpleTableCreateDialog
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
