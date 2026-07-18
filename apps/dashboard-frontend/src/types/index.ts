/**
 * Shared Type Definitions - Arasul Dashboard Frontend
 *
 * Core domain types used across multiple components and contexts.
 * File-local types that appear only once should remain in their respective files.
 */

// --- Documents & Knowledge Spaces ---

export interface DocumentSpace {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_default?: boolean;
  is_system?: boolean;
  document_count?: number;
}

export interface Document {
  id: string;
  filename: string;
  original_name?: string;
  file_extension?: string;
  status: string;
  category_id?: string;
  space_id?: string;
  space_name?: string;
  space_color?: string;
  file_size?: number;
  title?: string;
  is_favorite?: boolean;
  created_at?: string;
  updated_at?: string;
  indexed_at?: string;
  // File / storage metadata (returned by the documents API and indexer).
  mime_type?: string;
  content_hash?: string;
  file_path?: string;
  // Indexing / analysis metadata (populated by the document-indexer).
  page_count?: number;
  word_count?: number;
  char_count?: number;
  chunk_count?: number;
  language?: string;
  summary?: string;
  key_topics?: string[];
  processing_error?: string;
  // Category fields (joined from the categories table).
  category_name?: string;
  category_color?: string;
  category_confidence?: number;
}

export interface DocumentCategory {
  id: string;
  name: string;
  document_count?: number;
}

export interface DocumentStatistics {
  total_documents: number;
  indexed_documents: number;
  pending_documents: number;
  failed_documents?: number;
  table_count?: number;
  /** Indexed chunk count from GET /documents/statistics, shown in DocumentStatsHeader. */
  total_chunks?: number;
}

export interface DocumentSource {
  document_name: string;
  space_name?: string;
  space_id?: string;
  document_id?: string;
  score?: number;
  rerank_score?: number;
  hybrid_score?: number;
  content?: string;
  text_preview?: string;
  chunk_text?: string;
  chunk_index?: number;
}

// --- Chat ---

export interface MatchedSpace {
  id?: string;
  name: string;
  color?: string;
  score?: number;
}

// --- Models ---

export interface InstalledModel {
  id: string;
  name: string;
  install_status?: string;
  status?: string;
  supports_thinking?: boolean;
  rag_optimized?: boolean;
  supports_vision_input?: boolean;
  size_bytes?: number;
  ram_required_gb?: number;
  category?: string;
  performance_tier?: number;
  model_type?: string;
  is_running?: boolean;
}

export interface CatalogModel {
  id: string;
  name: string;
  description: string;
  size_bytes: number;
  ram_required_gb: number;
  category: string;
  model_type?: string;
  capabilities?: string[];
  recommended_for?: string[];
  install_status: string;
  download_progress?: number;
  install_error?: string;
  effective_ollama_name?: string;
  performance_tier?: number;
  ollama_library_url?: string;
}

// --- Model Lifecycle ---

export interface LoadedModelInfo {
  id: string;
  ollamaName: string;
  name: string;
  ramMb: number;
  expiresAt?: string;
}

export interface MemoryBudget {
  totalBudgetMb: number;
  usedMb: number;
  availableMb: number;
  safetyBufferMb: number;
  loadedModels: LoadedModelInfo[];
  canLoadMore: boolean;
}

export interface OllamaModel {
  name: string;
  size?: number;
  modified_at?: string;
}

// --- System Metrics ---
// Shared shape of the live metrics payload (`GET /metrics/live` and the
// `/metrics/live-stream` WebSocket). Consumed by useWebSocketMetrics and the
// dashboard shell in App.tsx; kept here so both agree on one precise type
// instead of an index-signature grab bag.

export interface MetricsDisk {
  used: number;
  free: number;
  percent: number;
}

export interface Metrics {
  cpu: number;
  ram: number;
  swap: number;
  gpu: number;
  temperature: number;
  temp: number;
  disk: MetricsDisk;
  /** Optional network state from the metrics-collector (used for the offline banner). */
  network?: {
    online?: boolean;
  };
}

// --- DataTable ---

export interface DataTable {
  id: string;
  slug: string;
  name: string;
  description?: string;
  space_id?: string;
  status?: string;
  row_count?: number;
  field_count?: number;
  needs_reindex?: boolean;
  last_indexed_at?: string | null;
  index_row_count?: number;
  created_at?: string;
  updated_at?: string;
}

// --- API ---

// ApiError is defined in hooks/useApi.ts (extends Error with .status/.code/.details).
// Re-exported here so consumers can import it from the central types module.
export type { ApiError } from '../hooks/useApi';

export interface SSEData {
  type?: string;
  token?: string;
  content?: string;
  thinking?: string;
  status?: string;
  done?: boolean;
  error?: string;
  errorCode?: string;
  jobId?: string;
  sources?: DocumentSource[];
  matchedSpaces?: MatchedSpace[];
  queryOptimization?: Record<string, unknown>;
  progress?: number;
  message?: string;
  success?: boolean;
  tokensBefore?: number;
  tokensAfter?: number;
  messagesCompacted?: number;
  // Vision auto-fallback frames (P6/P7): vision model id used to caption
  // the image, surfaced to render a Badge on the assistant response.
  code?: string;
  vision_via?: string;
}

// --- Queue ---

export interface QueueJob {
  id: string;
  status: string;
  model?: string;
  chat_id?: string;
  created_at?: string;
}

export interface QueueState {
  pending_count: number;
  processing: QueueJob | null;
  queue: QueueJob[];
}
