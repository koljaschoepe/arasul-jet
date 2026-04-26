import { useState, useCallback } from 'react';
import { useApi } from '../../../hooks/useApi';
import type { Document } from '../../../types';
import { useSimilarDocumentsQuery } from './queries';
import {
  useDeleteDocumentMutation,
  useReindexDocumentMutation,
  useToggleFavoriteMutation,
  useSemanticSearchMutation,
} from './mutations';

export interface SimilarDocument {
  id: string;
  filename: string;
  similarity: number;
  [key: string]: unknown;
}

interface SearchResults {
  query?: string;
  results: Array<{
    document_id?: string;
    chunk_text?: string;
    similarity?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface UseDocumentActionsParams {
  confirm: (options: { message: string }) => Promise<boolean>;
  setError: (message: string) => void;
  /** Kept for API parity; mutations invalidate the cache themselves now. */
  loadDocuments: () => void;
  /** Kept for API parity; mutations invalidate the cache themselves now. */
  loadStatistics: () => void;
}

interface UseDocumentActionsReturn {
  selectedDocument: Document | null;
  setSelectedDocument: React.Dispatch<React.SetStateAction<Document | null>>;
  showDetails: boolean;
  setShowDetails: React.Dispatch<React.SetStateAction<boolean>>;
  similarDocuments: SimilarDocument[];
  loadingSimilar: boolean;
  semanticSearch: string;
  setSemanticSearch: React.Dispatch<React.SetStateAction<string>>;
  searchResults: SearchResults | null;
  setSearchResults: React.Dispatch<React.SetStateAction<SearchResults | null>>;
  searching: boolean;
  handleDelete: (docId: string, filename: string) => Promise<void>;
  handleDownload: (docId: string, filename: string) => Promise<void>;
  handleReindex: (docId: string) => Promise<void>;
  viewDocumentDetails: (doc: Document) => Promise<void>;
  handleSemanticSearch: () => Promise<void>;
  toggleFavorite: (doc: Document) => Promise<void>;
}

/**
 * useDocumentActions — Document CRUD, semantic search, favorites, and detail
 * modal state. Public API preserved from the pre-TanStack version; internals
 * delegate to TanStack mutations for cache invalidation.
 */
export default function useDocumentActions({
  confirm,
  setError,
}: UseDocumentActionsParams): UseDocumentActionsReturn {
  const api = useApi();

  // Detail modal
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Semantic search input + results (the result lives here so it survives
  // unmount of the search panel without re-fetching)
  const [semanticSearch, setSemanticSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);

  // Mutations
  const deleteMutation = useDeleteDocumentMutation();
  const reindexMutation = useReindexDocumentMutation();
  const favoriteMutation = useToggleFavoriteMutation();
  const searchMutation = useSemanticSearchMutation();

  // Similar documents query — runs only when a doc is selected and indexed
  const similarQuery = useSimilarDocumentsQuery(showDetails ? selectedDocument : null);

  const handleDelete = useCallback(
    async (docId: string, filename: string) => {
      if (!(await confirm({ message: `"${filename}" wirklich löschen?` }))) return;
      try {
        await deleteMutation.mutateAsync(docId);
      } catch {
        setError('Fehler beim Löschen');
      }
    },
    [confirm, deleteMutation, setError]
  );

  const handleDownload = useCallback(
    async (docId: string, filename: string) => {
      try {
        const response = await api.get<Response>(`/documents/${docId}/download`, {
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
      } catch {
        setError('Fehler beim Download');
      }
    },
    [api, setError]
  );

  const handleReindex = useCallback(
    async (docId: string) => {
      try {
        await reindexMutation.mutateAsync(docId);
      } catch {
        setError('Fehler beim Neuindexieren');
      }
    },
    [reindexMutation, setError]
  );

  const viewDocumentDetails = useCallback(async (doc: Document) => {
    setSelectedDocument(doc);
    setShowDetails(true);
    // Similar documents auto-fetch via useSimilarDocumentsQuery
  }, []);

  const handleSemanticSearch = useCallback(async () => {
    if (!semanticSearch.trim()) return;
    try {
      const data = await searchMutation.mutateAsync(semanticSearch);
      setSearchResults(data);
    } catch {
      setError('Fehler bei der Suche');
    }
  }, [searchMutation, semanticSearch, setError]);

  const toggleFavorite = useCallback(
    async (doc: Document) => {
      try {
        await favoriteMutation.mutateAsync({ doc });
      } catch {
        setError('Fehler beim Aktualisieren');
      }
    },
    [favoriteMutation, setError]
  );

  return {
    selectedDocument,
    setSelectedDocument,
    showDetails,
    setShowDetails,
    similarDocuments: similarQuery.data ?? [],
    loadingSimilar: similarQuery.isFetching,
    semanticSearch,
    setSemanticSearch,
    searchResults,
    setSearchResults,
    searching: searchMutation.isPending,
    handleDelete,
    handleDownload,
    handleReindex,
    viewDocumentDetails,
    handleSemanticSearch,
    toggleFavorite,
  };
}
