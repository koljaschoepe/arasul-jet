import { useState, useCallback, useRef } from 'react';
import { useApi } from '../../hooks/useApi';

/**
 * useDocumentActions - Document CRUD, search, favorites, and related actions
 */
export default function useDocumentActions({ confirm, setError, loadDocuments, loadStatistics }) {
  const api = useApi();

  // Detail modal state
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [similarDocuments, setSimilarDocuments] = useState([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  // Semantic search state
  const [semanticSearch, setSemanticSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const searchRequestIdRef = useRef(0);

  const handleDelete = useCallback(
    async (docId, filename) => {
      if (!(await confirm({ message: `"${filename}" wirklich löschen?` }))) return;
      try {
        await api.del(`/documents/${docId}`, { showError: false });
        loadDocuments();
        loadStatistics();
      } catch (err) {
        setError('Fehler beim Löschen');
      }
    },
    [api, confirm, setError, loadDocuments, loadStatistics]
  );

  const handleDownload = useCallback(
    async (docId, filename) => {
      try {
        const response = await api.get(`/documents/${docId}/download`, {
          raw: true,
          showError: false,
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
    },
    [api, setError]
  );

  const handleReindex = useCallback(
    async docId => {
      try {
        await api.post(`/documents/${docId}/reindex`, undefined, { showError: false });
        loadDocuments();
      } catch (err) {
        setError('Fehler beim Neuindexieren');
      }
    },
    [api, setError, loadDocuments]
  );

  const viewDocumentDetails = useCallback(
    async doc => {
      setSelectedDocument(doc);
      setShowDetails(true);
      setSimilarDocuments([]);

      if (doc.status === 'indexed') {
        setLoadingSimilar(true);
        try {
          const data = await api.get(`/documents/${doc.id}/similar`, { showError: false });
          setSimilarDocuments(data.similar_documents || []);
        } catch (err) {
          console.error('Error loading similar documents:', err);
        } finally {
          setLoadingSimilar(false);
        }
      }
    },
    [api]
  );

  const handleSemanticSearch = useCallback(async () => {
    if (!semanticSearch.trim()) return;
    const currentRequestId = ++searchRequestIdRef.current;
    setSearching(true);

    try {
      const data = await api.post(
        '/documents/search',
        { query: semanticSearch, top_k: 10 },
        { showError: false }
      );
      if (searchRequestIdRef.current === currentRequestId) {
        setSearchResults(data);
      }
    } catch (err) {
      if (searchRequestIdRef.current === currentRequestId) {
        setError('Fehler bei der Suche');
      }
    } finally {
      if (searchRequestIdRef.current === currentRequestId) {
        setSearching(false);
      }
    }
  }, [api, semanticSearch, setError]);

  const toggleFavorite = useCallback(
    async doc => {
      try {
        await api.patch(
          `/documents/${doc.id}`,
          { is_favorite: !doc.is_favorite },
          { showError: false }
        );
        loadDocuments();
      } catch (err) {
        setError('Fehler beim Aktualisieren');
      }
    },
    [api, setError, loadDocuments]
  );

  return {
    // Detail modal
    selectedDocument,
    setSelectedDocument,
    showDetails,
    setShowDetails,
    similarDocuments,
    loadingSimilar,
    // Semantic search
    semanticSearch,
    setSemanticSearch,
    searchResults,
    setSearchResults,
    searching,
    // Actions
    handleDelete,
    handleDownload,
    handleReindex,
    viewDocumentDetails,
    handleSemanticSearch,
    toggleFavorite,
  };
}
