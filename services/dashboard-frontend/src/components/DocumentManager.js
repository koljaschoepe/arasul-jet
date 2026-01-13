import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  FiUpload, FiFile, FiSearch, FiFilter, FiTrash2, FiDownload,
  FiRefreshCw, FiX, FiCheck, FiAlertCircle, FiClock, FiFolder,
  FiChevronDown, FiChevronUp, FiStar, FiTag, FiFileText,
  FiDatabase, FiCpu, FiLayers, FiEye, FiLink, FiEdit2, FiPlus,
  FiSettings
} from 'react-icons/fi';
import MarkdownEditor from './MarkdownEditor';
import SpaceModal from './SpaceModal';
import '../documents.css';
import '../markdown-editor.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

// Format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Format date
const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Status badge component
const StatusBadge = ({ status }) => {
  const statusConfig = {
    pending: { icon: FiClock, color: '#f59e0b', label: 'Wartend' },
    processing: { icon: FiRefreshCw, color: '#3b82f6', label: 'Verarbeitung' },
    indexed: { icon: FiCheck, color: '#22c55e', label: 'Indexiert' },
    failed: { icon: FiAlertCircle, color: '#ef4444', label: 'Fehlgeschlagen' }
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <span className={`status-badge status-${status}`} style={{ '--status-color': config.color }}>
      <Icon className={status === 'processing' ? 'spin' : ''} />
      {config.label}
    </span>
  );
};

// Category badge component
const CategoryBadge = ({ name, color }) => (
  <span className="category-badge" style={{ '--cat-color': color || '#6b7280' }}>
    <FiFolder />
    {name || 'Unkategorisiert'}
  </span>
);

// Space badge component (RAG 2.0)
const SpaceBadge = ({ name, color }) => (
  <span className="space-badge" style={{ '--space-color': color || '#6366f1' }}>
    <FiFolder />
    {name || 'Allgemein'}
  </span>
);

function DocumentManager() {
  // State
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
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
  const [itemsPerPage] = useState(20);

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

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);

  // Refs
  const fileInputRef = useRef(null);

  // Get auth token from localStorage
  const getAuthToken = () => {
    return localStorage.getItem('arasul_token');
  };

  // Check if file is editable (markdown or text)
  const isEditable = (doc) => {
    const editableExtensions = ['.md', '.markdown', '.txt'];
    return editableExtensions.includes(doc.file_extension?.toLowerCase());
  };

  // Load documents
  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage
      });

      if (statusFilter) params.append('status', statusFilter);
      if (categoryFilter) params.append('category_id', categoryFilter);
      if (searchQuery) params.append('search', searchQuery);
      if (activeSpaceId) params.append('space_id', activeSpaceId);

      const response = await axios.get(`${API_BASE}/documents?${params}`);
      setDocuments(response.data.documents || []);
      setTotalDocuments(response.data.total || 0);
      setError(null);
    } catch (err) {
      console.error('Error loading documents:', err);
      setError('Fehler beim Laden der Dokumente');
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, categoryFilter, searchQuery, itemsPerPage, activeSpaceId]);

  // Load categories
  const loadCategories = async () => {
    try {
      const response = await axios.get(`${API_BASE}/documents/categories`);
      setCategories(response.data.categories || []);
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  };

  // Load statistics
  const loadStatistics = async () => {
    try {
      const response = await axios.get(`${API_BASE}/documents/statistics`);
      setStatistics(response.data);
    } catch (err) {
      console.error('Error loading statistics:', err);
    }
  };

  // Load Knowledge Spaces (RAG 2.0)
  const loadSpaces = async () => {
    try {
      const response = await axios.get(`${API_BASE}/spaces`);
      setSpaces(response.data.spaces || []);
    } catch (err) {
      console.error('Error loading spaces:', err);
    }
  };

  // Handle space change (for tabs)
  const handleSpaceChange = (spaceId) => {
    setActiveSpaceId(spaceId);
    setCurrentPage(1);
    // Also set as default upload space
    setUploadSpaceId(spaceId);
  };

  // Handle space modal save
  const handleSpaceSave = (savedSpace) => {
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

  // Initial load
  useEffect(() => {
    loadDocuments();
    loadCategories();
    loadStatistics();
    loadSpaces();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadDocuments();
      loadStatistics();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadDocuments]);

  // File upload handler
  const handleFileUpload = async (files) => {
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

        await axios.post(`${API_BASE}/documents/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const fileProgress = (progressEvent.loaded / progressEvent.total) * 100;
            const totalProgress = ((completedFiles * 100) + fileProgress) / totalFiles;
            setUploadProgress(Math.round(totalProgress));
          }
        });

        completedFiles++;
        setUploadProgress(Math.round((completedFiles / totalFiles) * 100));

      } catch (err) {
        console.error(`Error uploading ${file.name}:`, err);
        if (err.response?.status === 409) {
          setError(`"${file.name}" existiert bereits`);
        } else {
          setError(`Fehler beim Hochladen von "${file.name}"`);
        }
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
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e) => {
    handleDrag(e);
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    handleDrag(e);
    setDragActive(false);
  };

  const handleDrop = (e) => {
    handleDrag(e);
    setDragActive(false);
    handleFileUpload(e.dataTransfer.files);
  };

  // Delete document
  const handleDelete = async (docId, filename) => {
    if (!window.confirm(`"${filename}" wirklich löschen?`)) return;

    try {
      await axios.delete(`${API_BASE}/documents/${docId}`);
      loadDocuments();
      loadStatistics();
    } catch (err) {
      setError('Fehler beim Löschen');
    }
  };

  // Download document
  const handleDownload = async (docId, filename) => {
    try {
      const response = await axios.get(`${API_BASE}/documents/${docId}/download`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
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
  const handleReindex = async (docId) => {
    try {
      await axios.post(`${API_BASE}/documents/${docId}/reindex`);
      loadDocuments();
    } catch (err) {
      setError('Fehler beim Neuindexieren');
    }
  };

  // View document details
  const viewDocumentDetails = async (doc) => {
    setSelectedDocument(doc);
    setShowDetails(true);
    setSimilarDocuments([]);

    // Load similar documents
    if (doc.status === 'indexed') {
      setLoadingSimilar(true);
      try {
        const response = await axios.get(`${API_BASE}/documents/${doc.id}/similar`);
        setSimilarDocuments(response.data.similar_documents || []);
      } catch (err) {
        console.error('Error loading similar documents:', err);
      } finally {
        setLoadingSimilar(false);
      }
    }
  };

  // Semantic search
  const handleSemanticSearch = async () => {
    if (!semanticSearch.trim()) return;

    setSearching(true);
    try {
      const response = await axios.post(`${API_BASE}/documents/search`, {
        query: semanticSearch,
        top_k: 10
      });
      setSearchResults(response.data);
    } catch (err) {
      setError('Fehler bei der Suche');
    } finally {
      setSearching(false);
    }
  };

  // Toggle favorite
  const toggleFavorite = async (doc) => {
    try {
      await axios.patch(`${API_BASE}/documents/${doc.id}`, {
        is_favorite: !doc.is_favorite
      });
      loadDocuments();
    } catch (err) {
      setError('Fehler beim Aktualisieren');
    }
  };

  // Open editor for a document
  const handleEdit = (doc) => {
    setEditingDocument(doc);
    setShowEditor(true);
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

  const totalPages = Math.ceil(totalDocuments / itemsPerPage);

  return (
    <div className="document-manager">
      {/* Header with statistics */}
      <div className="dm-header">
        <div className="dm-stats-row">
          <div className="dm-stat-card">
            <FiDatabase className="dm-stat-icon" />
            <div className="dm-stat-content">
              <span className="dm-stat-value">{statistics?.total_documents || 0}</span>
              <span className="dm-stat-label">Dokumente</span>
            </div>
          </div>
          <div className="dm-stat-card">
            <FiCheck className="dm-stat-icon success" />
            <div className="dm-stat-content">
              <span className="dm-stat-value">{statistics?.indexed_documents || 0}</span>
              <span className="dm-stat-label">Indexiert</span>
            </div>
          </div>
          <div className="dm-stat-card">
            <FiClock className="dm-stat-icon warning" />
            <div className="dm-stat-content">
              <span className="dm-stat-value">{statistics?.pending_documents || 0}</span>
              <span className="dm-stat-label">Wartend</span>
            </div>
          </div>
          <div className="dm-stat-card">
            <FiLayers className="dm-stat-icon" />
            <div className="dm-stat-content">
              <span className="dm-stat-value">{statistics?.total_chunks || 0}</span>
              <span className="dm-stat-label">Chunks</span>
            </div>
          </div>
        </div>
      </div>

      {/* Knowledge Spaces Tabs (RAG 2.0) */}
      <div className="dm-spaces-tabs">
        <div className="spaces-tabs-list">
          <button
            className={`space-tab ${activeSpaceId === null ? 'active' : ''}`}
            onClick={() => handleSpaceChange(null)}
          >
            <FiFolder />
            <span>Alle</span>
            <span className="space-count">{statistics?.total_documents || 0}</span>
          </button>
          {spaces.map(space => (
            <button
              key={space.id}
              className={`space-tab ${activeSpaceId === space.id ? 'active' : ''}`}
              onClick={() => handleSpaceChange(space.id)}
              style={{ '--space-color': space.color }}
            >
              <FiFolder style={{ color: space.color }} />
              <span>{space.name}</span>
              <span className="space-count">{space.document_count || 0}</span>
              {!space.is_default && !space.is_system && (
                <button
                  className="space-edit-btn"
                  onClick={(e) => handleEditSpace(space, e)}
                  title="Bearbeiten"
                >
                  <FiSettings />
                </button>
              )}
            </button>
          ))}
          <button
            className="space-tab add-space"
            onClick={() => {
              setEditingSpace(null);
              setShowSpaceModal(true);
            }}
            title="Neuen Bereich erstellen"
          >
            <FiPlus />
            <span>Neu</span>
          </button>
        </div>
      </div>

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
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => handleFileUpload(e.target.files)}
          multiple
          accept=".pdf,.docx,.md,.markdown,.txt"
          style={{ display: 'none' }}
        />

        {uploading ? (
          <div className="upload-progress">
            <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
            <span>{uploadProgress}% hochgeladen</span>
          </div>
        ) : (
          <>
            <FiUpload className="upload-icon" />
            <p>
              Dateien hier ablegen oder klicken zum Auswählen
              {(uploadSpaceId || activeSpaceId) && spaces.length > 0 && (
                <span className="upload-space-hint">
                  {' → '}{spaces.find(s => s.id === (uploadSpaceId || activeSpaceId))?.name || 'Allgemein'}
                </span>
              )}
            </p>
            <span className="upload-hint">PDF, DOCX, Markdown (max. 50MB)</span>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="dm-error">
          <FiAlertCircle />
          <span>{error}</span>
          <button onClick={() => setError(null)}><FiX /></button>
        </div>
      )}

      {/* Semantic Search */}
      <div className="dm-semantic-search">
        <div className="semantic-search-input">
          <FiCpu className="search-icon" />
          <input
            type="text"
            placeholder="Semantische Suche in allen Dokumenten..."
            value={semanticSearch}
            onChange={(e) => setSemanticSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSemanticSearch()}
          />
          <button
            className="search-btn"
            onClick={handleSemanticSearch}
            disabled={searching || !semanticSearch.trim()}
          >
            {searching ? <FiRefreshCw className="spin" /> : <FiSearch />}
          </button>
        </div>

        {/* Search Results */}
        {searchResults && (
          <div className="search-results">
            <div className="search-results-header">
              <h4>Suchergebnisse für "{searchResults.query}"</h4>
              <button onClick={() => setSearchResults(null)}><FiX /></button>
            </div>
            {searchResults.results.length === 0 ? (
              <p className="no-results">Keine Ergebnisse gefunden</p>
            ) : (
              <div className="search-results-list">
                {searchResults.results.map((result, idx) => (
                  <div key={idx} className="search-result-item">
                    <div className="result-header">
                      <span className="result-name">{result.document_name}</span>
                      <span className="result-score">{(result.score * 100).toFixed(0)}%</span>
                    </div>
                    <p className="result-preview">{result.chunk_text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="dm-filters">
        <div className="filter-group">
          <FiSearch className="filter-icon" />
          <input
            type="text"
            placeholder="Dokumente suchen..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="filter-group">
          <FiFilter className="filter-icon" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">Alle Status</option>
            <option value="indexed">Indexiert</option>
            <option value="pending">Wartend</option>
            <option value="processing">Verarbeitung</option>
            <option value="failed">Fehlgeschlagen</option>
          </select>
        </div>

        <div className="filter-group">
          <FiFolder className="filter-icon" />
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">Alle Kategorien</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        <button className="refresh-btn" onClick={loadDocuments}>
          <FiRefreshCw className={loading ? 'spin' : ''} />
        </button>
      </div>

      {/* Documents List */}
      <div className="dm-documents">
        {loading && documents.length === 0 ? (
          <div className="dm-loading">
            <FiRefreshCw className="spin" />
            <p>Dokumente werden geladen...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="dm-empty">
            <FiFileText />
            <p>Keine Dokumente gefunden</p>
            <span>Laden Sie Dokumente hoch, um sie zu indexieren</span>
          </div>
        ) : (
          <table className="dm-table">
            <thead>
              <tr>
                <th></th>
                <th>Dokument</th>
                <th>Bereich</th>
                <th>Status</th>
                <th>Größe</th>
                <th>Hochgeladen</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr
                  key={doc.id}
                  className={`clickable-row ${doc.is_favorite ? 'favorite' : ''}`}
                  onClick={() => viewDocumentDetails(doc)}
                >
                  <td>
                    <button
                      className={`favorite-btn ${doc.is_favorite ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(doc); }}
                    >
                      <FiStar />
                    </button>
                  </td>
                  <td className="doc-name-cell">
                    <div className="doc-info">
                      <FiFile className="doc-icon" />
                      <div>
                        <span className="doc-title">{doc.title || doc.filename}</span>
                        {doc.title && doc.title !== doc.filename && (
                          <span className="doc-filename">{doc.filename}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <SpaceBadge name={doc.space_name} color={doc.space_color} />
                  </td>
                  <td>
                    <StatusBadge status={doc.status} />
                  </td>
                  <td>{formatFileSize(doc.file_size)}</td>
                  <td>{formatDate(doc.uploaded_at)}</td>
                  <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="action-btn"
                      onClick={() => viewDocumentDetails(doc)}
                      title="Details"
                    >
                      <FiEye />
                    </button>
                    {isEditable(doc) && (
                      <button
                        className="action-btn edit"
                        onClick={() => handleEdit(doc)}
                        title="Bearbeiten"
                      >
                        <FiEdit2 />
                      </button>
                    )}
                    <button
                      className="action-btn"
                      onClick={() => handleDownload(doc.id, doc.filename)}
                      title="Download"
                    >
                      <FiDownload />
                    </button>
                    {doc.status === 'failed' && (
                      <button
                        className="action-btn"
                        onClick={() => handleReindex(doc.id)}
                        title="Neu indexieren"
                      >
                        <FiRefreshCw />
                      </button>
                    )}
                    <button
                      className="action-btn delete"
                      onClick={() => handleDelete(doc.id, doc.filename)}
                      title="Löschen"
                    >
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="dm-pagination">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            Zurück
          </button>
          <span>Seite {currentPage} von {totalPages}</span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            Weiter
          </button>
        </div>
      )}

      {/* Document Details Modal */}
      {showDetails && selectedDocument && (
        <div className="dm-modal-overlay" onClick={() => setShowDetails(false)}>
          <div className="dm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedDocument.title || selectedDocument.filename}</h3>
              <button onClick={() => setShowDetails(false)}><FiX /></button>
            </div>

            <div className="modal-body">
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
                    <span className="value">{selectedDocument.word_count?.toLocaleString() || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Chunks</span>
                    <span className="value">{selectedDocument.chunk_count || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Sprache</span>
                    <span className="value">{selectedDocument.language === 'de' ? 'Deutsch' : 'Englisch'}</span>
                  </div>
                </div>
              </div>

              {/* AI Summary */}
              {selectedDocument.summary && (
                <div className="detail-section">
                  <h4><FiCpu /> KI-Zusammenfassung</h4>
                  <p className="summary-text">{selectedDocument.summary}</p>
                </div>
              )}

              {/* Topics */}
              {selectedDocument.key_topics && selectedDocument.key_topics.length > 0 && (
                <div className="detail-section">
                  <h4><FiTag /> Themen</h4>
                  <div className="topics-list">
                    {selectedDocument.key_topics.map((topic, idx) => (
                      <span key={idx} className="topic-tag">{topic}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Category with confidence */}
              {selectedDocument.category_name && (
                <div className="detail-section">
                  <h4><FiFolder /> Kategorie</h4>
                  <div className="category-info">
                    <CategoryBadge
                      name={selectedDocument.category_name}
                      color={selectedDocument.category_color}
                    />
                    {selectedDocument.category_confidence && (
                      <span className="confidence">
                        ({(selectedDocument.category_confidence * 100).toFixed(0)}% Konfidenz)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Similar Documents */}
              {selectedDocument.status === 'indexed' && (
                <div className="detail-section">
                  <h4><FiLink /> Ähnliche Dokumente</h4>
                  {loadingSimilar ? (
                    <div className="loading-similar">
                      <FiRefreshCw className="spin" />
                      <span>Suche ähnliche Dokumente...</span>
                    </div>
                  ) : similarDocuments.length === 0 ? (
                    <p className="no-similar">Keine ähnlichen Dokumente gefunden</p>
                  ) : (
                    <div className="similar-list">
                      {similarDocuments.map((sim, idx) => (
                        <div key={idx} className="similar-item">
                          <FiFile />
                          <span className="sim-name">{sim.title || sim.filename}</span>
                          <span className="sim-score">
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
                <div className="detail-section error-section">
                  <h4><FiAlertCircle /> Fehler</h4>
                  <p className="error-text">{selectedDocument.processing_error}</p>
                  <button
                    className="retry-btn"
                    onClick={() => {
                      handleReindex(selectedDocument.id);
                      setShowDetails(false);
                    }}
                  >
                    <FiRefreshCw /> Erneut versuchen
                  </button>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {isEditable(selectedDocument) && (
                <button
                  className="modal-btn primary"
                  onClick={() => {
                    setShowDetails(false);
                    handleEdit(selectedDocument);
                  }}
                >
                  <FiEdit2 /> Bearbeiten
                </button>
              )}
              <button
                className="modal-btn secondary"
                onClick={() => handleDownload(selectedDocument.id, selectedDocument.filename)}
              >
                <FiDownload /> Download
              </button>
              <button
                className="modal-btn danger"
                onClick={() => {
                  handleDelete(selectedDocument.id, selectedDocument.filename);
                  setShowDetails(false);
                }}
              >
                <FiTrash2 /> Löschen
              </button>
            </div>
          </div>
        </div>
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
    </div>
  );
}

export default DocumentManager;
