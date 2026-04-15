import { useState, useCallback, useRef } from 'react';
import { useApi } from '../../hooks/useApi';

interface Document {
  id: string;
  filename: string;
  status: string;
  is_favorite: boolean;
  [key: string]: unknown;
}

export interface SimilarDocument {
  id: string;
  filename: string;
  similarity: number;
  [key: string]: unknown;
}

interface SearchResults {
  results: Array<{
    document_id: string;
    chunk_text: string;
    similarity: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface UseDocumentActionsParams {
  confirm: (options: { message: string }) => Promise<boolean>;
  setError: (message: string) => void;
  loadDocuments: () => void;
  loadStatistics: () => void;
}

interface UseDocumentActionsReturn {
  // Detail modal
  selectedDocument: Document | null;
  setSelectedDocument: React.Dispatch<React.SetStateAction<Document | null>>;
  showDetails: boolean;
  setShowDetails: React.Dispatch<React.SetStateAction<boolean>>;
  similarDocuments: SimilarDocument[];
  loadingSimilar: boolean;
  // Semantic search
  semanticSearch: string;
  setSemanticSearch: React.Dispatch<React.SetStateAction<string>>;
  searchResults: SearchResults | null;
  setSearchResults: React.Dispatch<React.SetStateAction<SearchResults | null>>;
  searching: boolean;
  // Actions
  handleDelete: (docId: string, filename: string) => Promise<void>;
  handleDownload: (docId: string, filename: string) => Promise<void>;
  handleReindex: (docId: string) => Promise<void>;
  viewDocumentDetails: (doc: Document) => Promise<void>;
  handleSemanticSearch: () => Promise<void>;
  toggleFavorite: (doc: Document) => Promise<void>;
}

/**
 * useDocumentActions - Document CRUD, search, favorites, and related actions
 */
export default function useDocumentActions({
  confirm,
  setError,
  loadDocuments,
  loadStatistics,
}: UseDocumentActionsParams): UseDocumentActionsReturn {
  const api = useApi();

  // Detail modal state
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [similarDocuments, setSimilarDocuments] = useState<SimilarDocument[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  // Semantic search state
  const [semanticSearch, setSemanticSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRequestIdRef = useRef(0);

  const handleDelete = useCallback(
    async (docId: string, filename: string) => {
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
    async (docId: string, filename: string) => {
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
    async (docId: string) => {
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
    async (doc: Document) => {
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
    async (doc: Document) => {
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
