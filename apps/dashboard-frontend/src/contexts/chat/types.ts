import type { DocumentSource, MatchedSpace, QueueJob } from '../../types';

export interface ChatMessage {
  id?: number;
  role: string;
  content: string;
  thinking?: string;
  hasThinking?: boolean;
  thinkingCollapsed?: boolean;
  thinkingCollapsing?: boolean;
  sources?: DocumentSource[];
  sourcesCollapsed?: boolean;
  status?: string;
  jobId?: string;
  jobStatus?: string;
  matchedSpaces?: MatchedSpace[];
  type?: string;
  tokensBefore?: number;
  tokensAfter?: number;
  messagesCompacted?: number;
  streamStatus?: string;
  statusMessage?: string;
  /** Base64-encoded images for vision models */
  images?: string[];
  /** Streaming-time metrics (Phase 9.3) */
  tokensPerSecond?: number;
  tokenCount?: number;
  streamDurationMs?: number;
}

export interface ChatSettings {
  use_rag?: boolean;
  use_thinking?: boolean;
  preferred_space_id?: string | null;
  preferred_model?: string;
}

export interface QueueState {
  pending_count: number;
  processing: QueueJob | null;
  queue: QueueJob[];
}

export interface InstalledModel {
  id: string;
  name: string;
  install_status?: string;
  status?: string;
  supports_thinking?: boolean;
  rag_optimized?: boolean;
  supports_vision_input?: boolean;
  model_type?: string;
}

export interface Space {
  id: string;
  name: string;
  description?: string;
  color?: string;
  document_count?: number;
}

export interface ActiveJob {
  id: string;
  status: string;
  model?: string;
  chat_id?: string;
}

export interface MessageCallbacks {
  setMessages?: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setIsLoading?: (value: boolean) => void;
  setError?: (value: string | null) => void;
}

export interface SendMessageOptions {
  useRAG?: boolean;
  useThinking?: boolean;
  selectedSpaces?: string[];
  matchedSpaces?: string[];
  messages?: ChatMessage[];
  model?: string;
  file?: File;
  /** Base64-encoded images for vision models */
  images?: string[];
}

export interface LoadMessagesOptions {
  limit?: number;
  before?: number;
}

export interface LoadMessagesResult {
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface ChatContextValue {
  // State
  activeJobIds: Record<string, string>;
  globalQueue: QueueState;
  installedModels: InstalledModel[];
  defaultModel: string;
  loadedModel: string | null;
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  favoriteModels: string[];
  spaces: Space[];
  // Functions
  sendMessage: (chatId: string, input: string, options?: SendMessageOptions) => Promise<void>;
  reconnectToJob: (jobId: string, targetChatId: string) => Promise<void>;
  cancelJob: (chatId: string) => Promise<void>;
  abortExistingStream: (chatId: string) => void;
  checkActiveJobs: (chatId: string) => Promise<ActiveJob | null>;
  loadModels: () => Promise<void>;
  loadSpaces: () => Promise<void>;
  loadMessages: (chatId: string, options?: LoadMessagesOptions) => Promise<LoadMessagesResult>;
  setModelAsDefault: (modelId: string) => Promise<void>;
  toggleFavorite: (modelId: string) => void;
  getActiveJobForChat: (chatId: string) => string | null;
  registerMessageCallback: (chatId: string, callbacks: MessageCallbacks) => void;
  unregisterMessageCallback: (chatId: string) => void;
  // Background state accessors
  getBackgroundMessages: (chatId: string) => ChatMessage[] | null;
  getBackgroundLoading: (chatId: string) => boolean;
  clearBackgroundState: (chatId: string) => void;
  hasActiveStream: (chatId: string) => boolean;
  // Cleanup
  cleanupChat: (chatId: string) => void;
}
