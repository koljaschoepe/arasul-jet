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

export interface UsageProfileHour {
  hour: number;
  avgRequests: number;
  phase: 'peak' | 'normal' | 'idle';
}

export interface ModelLifecycle {
  enabled: boolean;
  currentPhase: 'peak' | 'normal' | 'idle';
  keepAliveMinutes: number;
  nextPhaseChange: string;
  nextPhase: string;
  currentHour: number;
  usageProfile: UsageProfileHour[];
}

// --- Telegram ---

export interface TelegramBot {
  id: string;
  name: string;
  username?: string;
  bot_username?: string;
  isActive: boolean;
  llmProvider?: string;
  llmModel?: string;
  llm_model?: string;
  systemPrompt?: string;
  system_prompt?: string;
  chatCount?: number;
  ragEnabled?: boolean;
  rag_enabled?: boolean;
  ragSpaceIds?: string[];
  rag_space_ids?: string[];
  ragShowSources?: boolean;
  rag_show_sources?: boolean;
  toolsEnabled?: boolean;
  tools_enabled?: boolean;
  voiceEnabled?: boolean;
  voice_enabled?: boolean;
  restrictUsers?: boolean;
  restrict_users?: boolean;
  allowedUsers?: string[];
  allowed_users?: string[];
  maxContextTokens?: number;
  max_context_tokens?: number;
  maxResponseTokens?: number;
  max_response_tokens?: number;
  rateLimitPerMinute?: number;
  rate_limit_per_minute?: number;
  createdAt?: string;
  created_at?: string;
  lastMessageAt?: string;
  last_message_at?: string;
}

export interface TelegramCommand {
  id: number;
  command: string;
  description: string;
  response?: string;
  prompt?: string;
  isEnabled?: boolean;
  is_enabled?: boolean;
}

export interface TelegramChat {
  id: string;
  chat_id?: string;
  chatId?: string;
  username?: string;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  type?: string;
  last_message_at?: string;
  lastMessageAt?: string;
  message_count?: number;
  messageCount?: number;
}

export interface OllamaModel {
  name: string;
  size?: number;
  modified_at?: string;
}

// --- System ---

export interface ClaudeCodeConfig {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_API_KEY_set?: boolean;
  CLAUDE_WORKSPACE?: string;
  [key: string]: string | boolean | undefined;
}

export interface ClaudeAppStatus {
  status: string;
  last_error?: string;
  container_id?: string;
  [key: string]: unknown;
}

export interface ClaudeAuthStatus {
  authenticated: boolean;
  expires_at?: string;
  method?: string;
  oauth?: {
    valid: boolean;
    expiresInHours?: number;
    account?: {
      displayName?: string;
      email?: string;
    };
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

export interface ApiError {
  message: string;
  status?: number;
  data?: Record<string, unknown>;
  name?: string;
}

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
