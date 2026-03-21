/**
 * ChatContext - Global Chat State Management
 *
 * Manages shared chat state at app level (survives all navigation):
 * - Active streaming jobs and queue status
 * - Model selection and installed models
 * - Knowledge Spaces for RAG
 * - Streaming with callback registry (per-chat UI updates)
 * - Background message accumulation when ChatView is not mounted
 *
 * Mounted at App level — streams persist across route changes.
 * When ChatView unmounts, tokens accumulate in backgroundMessagesRef.
 * When ChatView remounts, it picks up accumulated state instantly.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import useTokenBatching from '../hooks/useTokenBatching';
import { useApi } from '../hooks/useApi';
import { API_BASE, getAuthHeaders } from '../config/api';

// --- Types ---

interface ChatMessage {
  id?: number;
  role: string;
  content: string;
  thinking?: string;
  hasThinking?: boolean;
  thinkingCollapsed?: boolean;
  sources?: any[];
  sourcesCollapsed?: boolean;
  status?: string;
  jobId?: string;
  jobStatus?: string;
  matchedSpaces?: string[];
  type?: string;
  tokensBefore?: number;
  tokensAfter?: number;
  messagesCompacted?: number;
}

interface QueueState {
  pending_count: number;
  processing: any;
  queue: any[];
}

interface InstalledModel {
  id: string;
  name: string;
  [key: string]: any;
}

interface Space {
  id: string;
  name: string;
  [key: string]: any;
}

interface ActiveJob {
  id: string;
  status: string;
  [key: string]: any;
}

interface MessageCallbacks {
  setMessages?: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setIsLoading?: (value: boolean) => void;
  setError?: (value: string | null) => void;
}

interface SendMessageOptions {
  useRAG?: boolean;
  useThinking?: boolean;
  selectedSpaces?: string[];
  matchedSpaces?: string[];
  messages?: ChatMessage[];
  model?: string;
}

interface LoadMessagesOptions {
  limit?: number;
  before?: number;
}

interface LoadMessagesResult {
  messages: ChatMessage[];
  hasMore: boolean;
}

interface ChatContextValue {
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
  cancelJob: (chatId: string) => void;
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
}

interface ChatProviderProps {
  children: ReactNode;
  isAuthenticated: boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children, isAuthenticated }: ChatProviderProps) {
  const api = useApi();

  // --- State ---

  // Background job tracking
  const [activeJobIds, setActiveJobIds] = useState<Record<string, string>>({}); // chatId -> jobId
  const [globalQueue, setGlobalQueue] = useState<QueueState>({
    pending_count: 0,
    processing: null,
    queue: [],
  });

  // Model state
  const [selectedModel, setSelectedModel] = useState('');
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);
  const [defaultModel, setDefaultModel] = useState('');
  const [loadedModel, setLoadedModel] = useState<string | null>(null);
  const [favoriteModels, setFavoriteModels] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('arasul_favorite_models') || '[]');
    } catch {
      return [];
    }
  });

  // Knowledge Spaces
  const [spaces, setSpaces] = useState<Space[]>([]);

  // --- Refs ---

  const abortControllersRef = useRef<Record<string, AbortController>>({});
  const messageCallbacksRef = useRef(new Map<string, MessageCallbacks>());
  const activeStreamChatIdRef = useRef<string | null>(null);
  // Background accumulation: stores messages/loading when ChatView is not mounted
  // LEAK-002: LRU eviction - max 10 chats in background to prevent unbounded growth
  const MAX_BACKGROUND_CHATS = 10;
  const backgroundMessagesRef = useRef(new Map<string, ChatMessage[]>()); // chatId → messages[]
  const backgroundLoadingRef = useRef(new Set<string>()); // chatIds still loading
  // Ref-mirror for selectedModel to keep sendMessage stable
  const selectedModelRef = useRef(selectedModel);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  // --- Callback Registry ---
  // ChatView registers per-chat callbacks on mount, unregisters on unmount.
  // Streaming updates route through these callbacks.

  const registerMessageCallback = useCallback((chatId: string, callbacks: MessageCallbacks) => {
    messageCallbacksRef.current.set(chatId, callbacks);
  }, []);

  const unregisterMessageCallback = useCallback((chatId: string) => {
    messageCallbacksRef.current.delete(chatId);
  }, []);

  // LEAK-002: Evict oldest background entries when limit exceeded
  const evictBackgroundIfNeeded = useCallback(() => {
    const map = backgroundMessagesRef.current;
    while (map.size > MAX_BACKGROUND_CHATS) {
      // Map iterates in insertion order - first key is oldest
      const oldest = map.keys().next().value;
      if (oldest !== undefined) {
        map.delete(oldest);
        backgroundLoadingRef.current.delete(oldest);
      } else {
        break;
      }
    }
  }, []);

  // Route setMessages to the active streaming chat's callback (used by useTokenBatching)
  // Falls back to background accumulation when ChatView is not mounted.
  const routedSetMessages = useCallback(
    (updater: any) => {
      const chatId = activeStreamChatIdRef.current;
      if (!chatId) return;
      const cb = messageCallbacksRef.current.get(chatId);
      if (cb?.setMessages) {
        cb.setMessages(updater);
      } else {
        // ChatView not mounted — accumulate in background
        const prev = backgroundMessagesRef.current.get(chatId) || [];
        const next = typeof updater === 'function' ? updater(prev) : updater;
        backgroundMessagesRef.current.set(chatId, next);
        evictBackgroundIfNeeded();
      }
    },
    [evictBackgroundIfNeeded]
  );

  const updateMessages = useCallback(
    (chatId: string, updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      const cb = messageCallbacksRef.current.get(chatId);
      if (cb?.setMessages) {
        cb.setMessages(updater);
      } else {
        // ChatView not mounted — accumulate in background
        const prev = backgroundMessagesRef.current.get(chatId) || [];
        const next = typeof updater === 'function' ? updater(prev) : updater;
        backgroundMessagesRef.current.set(chatId, next);
        evictBackgroundIfNeeded();
      }
    },
    [evictBackgroundIfNeeded]
  );

  const updateIsLoading = useCallback((chatId: string, value: boolean) => {
    const cb = messageCallbacksRef.current.get(chatId);
    if (cb?.setIsLoading) {
      cb.setIsLoading(value);
    } else {
      // Track loading state in background
      if (value) {
        backgroundLoadingRef.current.add(chatId);
      } else {
        backgroundLoadingRef.current.delete(chatId);
      }
    }
  }, []);

  const updateError = useCallback((chatId: string, value: string | null) => {
    const cb = messageCallbacksRef.current.get(chatId);
    if (cb?.setError) cb.setError(value);
  }, []);

  // --- Background State Accessors ---

  const getBackgroundMessages = useCallback((chatId: string) => {
    return backgroundMessagesRef.current.get(chatId) || null;
  }, []);

  const getBackgroundLoading = useCallback((chatId: string) => {
    return backgroundLoadingRef.current.has(chatId);
  }, []);

  const clearBackgroundState = useCallback((chatId: string) => {
    backgroundMessagesRef.current.delete(chatId);
    backgroundLoadingRef.current.delete(chatId);
  }, []);

  const hasActiveStream = useCallback((chatId: string) => {
    return !!abortControllersRef.current[chatId];
  }, []);

  // --- Token Batching ---
  const { tokenBatchRef, flushTokenBatch, addTokenToBatch, resetTokenBatch } =
    useTokenBatching(routedSetMessages);

  // --- Data Loading ---

  const loadModels = useCallback(async () => {
    try {
      const [installedRes, defaultRes, loadedRes] = await Promise.all([
        api.get('/models/installed', { showError: false }),
        api.get('/models/default', { showError: false }),
        api.get('/models/loaded', { showError: false }).catch(() => null),
      ]);
      setInstalledModels(installedRes.models || []);
      if (defaultRes.default_model) setDefaultModel(defaultRes.default_model);
      if (loadedRes?.model_id) setLoadedModel(loadedRes.model_id);
    } catch (err) {
      console.error('Error loading models:', err);
    }
  }, [api]);

  const loadSpaces = useCallback(async () => {
    try {
      const data = await api.get('/spaces', { showError: false });
      setSpaces(data.spaces || []);
    } catch (err) {
      console.error('Error loading spaces:', err);
    }
  }, [api]);

  const mapMessage = (msg: any): ChatMessage => ({
    id: msg.id,
    role: msg.role,
    content: msg.content || '',
    thinking: msg.thinking || '',
    hasThinking: !!(msg.thinking && msg.thinking.length > 0),
    thinkingCollapsed: true,
    sources: msg.sources || [],
    sourcesCollapsed: true,
    status: msg.status || 'completed',
    jobId: msg.job_id,
    jobStatus: msg.job_status,
  });

  const loadMessages = useCallback(
    async (chatId: string, options: LoadMessagesOptions = {}): Promise<LoadMessagesResult> => {
      const { limit = 50, before } = options;
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (before) params.set('before', String(before));
        const data = await api.get(`/chats/${chatId}/messages?${params}`, { showError: false });
        return {
          messages: (data.messages || []).map(mapMessage),
          hasMore: data.hasMore || false,
        };
      } catch (err) {
        console.error('Error loading messages:', err);
        return { messages: [], hasMore: false };
      }
    },
    [api]
  );

  // --- Model Actions ---

  const setModelAsDefault = useCallback(
    async (modelId: string) => {
      try {
        await api.post('/models/default', { model_id: modelId }, { showError: false });
        setDefaultModel(modelId);
      } catch (err) {
        console.error('Error setting default model:', err);
      }
    },
    [api]
  );

  const toggleFavorite = useCallback((modelId: string) => {
    setFavoriteModels(prev => {
      const next = prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId];
      localStorage.setItem('arasul_favorite_models', JSON.stringify(next));
      return next;
    });
  }, []);

  // --- Job Management ---

  const getActiveJobForChat = useCallback(
    (chatId: string) => {
      return activeJobIds[chatId] || null;
    },
    [activeJobIds]
  );

  const checkActiveJobs = useCallback(
    async (chatId: string) => {
      try {
        const data = await api.get(`/chats/${chatId}/jobs`, { showError: false });
        const jobs = data.jobs || [];
        const activeJob = jobs.find((j: any) => j.status === 'streaming' || j.status === 'pending');
        if (activeJob) {
          setActiveJobIds(prev => ({ ...prev, [chatId]: activeJob.id }));
          return activeJob;
        }
        return null;
      } catch (err) {
        console.error('Error checking active jobs:', err);
        return null;
      }
    },
    [api]
  );

  const cancelJob = useCallback(
    (chatId: string) => {
      // Get the jobId before clearing state
      const jobId = activeJobIds[chatId];

      const controller = abortControllersRef.current[chatId];
      if (controller) {
        controller.abort();
        delete abortControllersRef.current[chatId];
      }
      setActiveJobIds(prev => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
      updateIsLoading(chatId, false);

      // Call backend to abort GPU stream
      if (jobId) {
        api.del(`/llm/jobs/${jobId}`, { showError: false }).catch(() => {});
      }
    },
    [activeJobIds, updateIsLoading, api]
  );

  // Abort any existing stream for a chatId
  const abortExistingStream = useCallback((chatId: string) => {
    if (abortControllersRef.current[chatId]) {
      abortControllersRef.current[chatId].abort();
      delete abortControllersRef.current[chatId];
    }
  }, []);

  // --- Effects ---

  // Load models and spaces when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    loadModels();
    loadSpaces();
  }, [isAuthenticated, loadModels, loadSpaces]);

  // Queue polling while active jobs exist
  const activeJobCount = Object.keys(activeJobIds).length;
  useEffect(() => {
    if (activeJobCount === 0) {
      setGlobalQueue({ pending_count: 0, processing: null, queue: [] });
      return;
    }
    const pollQueue = async () => {
      try {
        const data = await api.get('/llm/queue', { showError: false });
        setGlobalQueue(data);
      } catch (err) {
        console.error('Error polling queue:', err);
      }
    };
    pollQueue();
    const interval = setInterval(pollQueue, 2000);
    return () => clearInterval(interval);
  }, [activeJobCount, api]);

  // Cleanup streams when user logs out (isAuthenticated → false)
  useEffect(() => {
    if (!isAuthenticated) {
      Object.values(abortControllersRef.current).forEach(c => {
        if (c?.abort) c.abort();
      });
      abortControllersRef.current = {};
      backgroundMessagesRef.current.clear();
      backgroundLoadingRef.current.clear();
      resetTokenBatch();
    }
  }, [isAuthenticated, resetTokenBatch]);

  // --- Streaming: Reconnect ---

  const reconnectToJob = useCallback(
    async (jobId: string, targetChatId: string) => {
      abortExistingStream(targetChatId);
      const abortController = new AbortController();
      abortControllersRef.current[targetChatId] = abortController;
      activeStreamChatIdRef.current = targetChatId;

      try {
        const response = await fetch(`${API_BASE}/llm/jobs/${jobId}/stream`, {
          headers: getAuthHeaders(),
          signal: abortController.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(l => l.trim().startsWith('data:'));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.replace(/^data:\s*/, ''));

              if (data.type === 'reconnect' || data.type === 'update') {
                updateMessages(targetChatId, prev =>
                  prev.map(msg =>
                    msg.jobId === jobId ||
                    (msg.role === 'assistant' && msg.status === 'streaming' && !msg.jobId)
                      ? {
                          ...msg,
                          content: data.content || msg.content || '',
                          thinking: data.thinking || msg.thinking || '',
                          hasThinking: !!(data.thinking || msg.thinking),
                          status: data.status || msg.status,
                          jobId,
                        }
                      : msg
                  )
                );
              }

              if (data.done) {
                updateIsLoading(targetChatId, false);
                setActiveJobIds(prev => {
                  const n = { ...prev };
                  delete n[targetChatId];
                  return n;
                });
                const result = await loadMessages(targetChatId);
                updateMessages(targetChatId, () => result.messages);
              }

              if (data.error) {
                updateError(targetChatId, data.error);
                updateIsLoading(targetChatId, false);
                setActiveJobIds(prev => {
                  const n = { ...prev };
                  delete n[targetChatId];
                  return n;
                });
              }
            } catch (e) {
              console.error('Error parsing reconnect SSE:', e);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Reconnect error:', err);
        updateIsLoading(targetChatId, false);
        setActiveJobIds(prev => {
          const n = { ...prev };
          delete n[targetChatId];
          return n;
        });
      } finally {
        delete abortControllersRef.current[targetChatId];
        if (activeStreamChatIdRef.current === targetChatId) activeStreamChatIdRef.current = null;
      }
    },
    [abortExistingStream, loadMessages, updateMessages, updateIsLoading, updateError]
  );

  // --- Streaming: Send Message ---

  const sendMessage = useCallback(
    async (chatId: string, input: string, options: SendMessageOptions = {}) => {
      const {
        useRAG = false,
        useThinking = true,
        selectedSpaces = [],
        matchedSpaces = [],
        messages = [],
        model,
      } = options;
      if (!input.trim() || !chatId) return;

      const userMessage = input.trim();
      const isRAG = useRAG;
      const effectiveModel = model !== undefined ? model : selectedModelRef.current;

      // Save user message to DB
      try {
        await api.post(
          `/chats/${chatId}/messages`,
          { role: 'user', content: userMessage },
          { showError: false }
        );
      } catch (err) {
        console.error('Error saving message:', err);
      }

      // Update UI with user message + empty assistant message
      const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMessage }];
      updateMessages(chatId, () => newMessages);
      updateIsLoading(chatId, true);

      let assistantMessageIndex = newMessages.length;
      updateMessages(chatId, () => [
        ...newMessages,
        {
          role: 'assistant',
          content: '',
          thinking: '',
          thinkingCollapsed: false,
          hasThinking: false,
          status: 'streaming',
          ...(isRAG ? { sources: [], sourcesCollapsed: true } : {}),
        },
      ]);

      abortExistingStream(chatId);
      const abortController = new AbortController();
      abortControllersRef.current[chatId] = abortController;
      activeStreamChatIdRef.current = chatId;
      resetTokenBatch();

      try {
        let streamError = false;
        let currentJobId: string | null = null;
        let ragSources: any[] = [];

        // Build endpoint and payload
        const endpoint = isRAG ? `${API_BASE}/rag/query` : `${API_BASE}/llm/chat`;
        const payload = isRAG
          ? {
              query: userMessage,
              top_k: 10,
              thinking: useThinking,
              conversation_id: chatId,
              model: effectiveModel || undefined,
              ...(selectedSpaces.length > 0
                ? { space_ids: selectedSpaces, auto_routing: false }
                : { auto_routing: true }),
            }
          : {
              messages: newMessages.map(m => ({ role: m.role, content: m.content })),
              temperature: 0.7,
              max_tokens: 32768,
              stream: true,
              thinking: useThinking,
              conversation_id: chatId,
              model: effectiveModel || undefined,
            };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload),
          signal: abortController.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(l => l.trim().startsWith('data:'));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.replace(/^data:\s*/, ''));

              if (data.type === 'job_started' && data.jobId) {
                currentJobId = data.jobId;
                setActiveJobIds(prev => ({ ...prev, [chatId]: currentJobId! }));
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  if (u[assistantMessageIndex]) {
                    u[assistantMessageIndex] = {
                      ...u[assistantMessageIndex],
                      jobId: currentJobId!,
                    };
                  }
                  return u;
                });
              }

              if (data.error) {
                streamError = true;
                updateError(chatId, data.error);
                if (data.errorCode === 'MODEL_SWITCH_FAILED') {
                  loadModels();
                  if (selectedModelRef.current) setSelectedModel('');
                }
                break;
              }

              // RAG-specific events: combined rag_metadata (single re-render)
              if (isRAG && data.type === 'rag_metadata') {
                ragSources = data.sources || [];
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  if (u[assistantMessageIndex]) {
                    const qo = data.queryOptimization || {};
                    u[assistantMessageIndex] = {
                      ...u[assistantMessageIndex],
                      sources: ragSources,
                      sourcesCollapsed: ragSources.length > 0,
                      matchedSpaces: data.matchedSpaces || matchedSpaces,
                    };
                  }
                  return u;
                });
              }

              // Legacy: individual RAG events (backwards compat for reconnect)
              if (isRAG && data.type === 'sources' && data.sources) {
                ragSources = data.sources;
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  if (u[assistantMessageIndex]) {
                    u[assistantMessageIndex] = {
                      ...u[assistantMessageIndex],
                      sources: ragSources,
                      sourcesCollapsed: ragSources.length > 0,
                      matchedSpaces,
                    };
                  }
                  return u;
                });
              }

              if (data.type === 'compaction') {
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  u.splice(assistantMessageIndex, 0, {
                    role: 'system',
                    type: 'compaction',
                    content: '',
                    tokensBefore: data.tokensBefore,
                    tokensAfter: data.tokensAfter,
                    messagesCompacted: data.messagesCompacted,
                  });
                  return u;
                });
                assistantMessageIndex++;
              }

              // Token streaming
              if (data.type === 'thinking' && data.token) {
                addTokenToBatch('thinking', data.token, assistantMessageIndex);
              }

              if (data.type === 'thinking_end') {
                flushTokenBatch(assistantMessageIndex, true);
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  if (u[assistantMessageIndex]) {
                    u[assistantMessageIndex] = {
                      ...u[assistantMessageIndex],
                      thinkingCollapsed: true,
                    };
                  }
                  return u;
                });
              }

              if (data.type === 'response' && data.token) {
                addTokenToBatch('content', data.token, assistantMessageIndex);
              }

              // Stream complete
              if (data.type === 'done' || data.done) {
                flushTokenBatch(assistantMessageIndex, true);
                updateIsLoading(chatId, false);
                setActiveJobIds(prev => {
                  const n = { ...prev };
                  delete n[chatId];
                  return n;
                });
                break;
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
          if (streamError) break;
        }

        // Final consistency: mark streaming messages as completed (no DB reload needed)
        const { content: fullResponse, thinking: fullThinking } = tokenBatchRef.current;

        if (fullResponse || fullThinking) {
          updateMessages(chatId, prev =>
            prev.map(msg => (msg.status === 'streaming' ? { ...msg, status: 'completed' } : msg))
          );
        }

        if (!streamError && !fullResponse && !fullThinking) {
          throw new Error(
            isRAG ? 'Keine Antwort vom RAG-System erhalten' : 'Keine Antwort vom LLM erhalten'
          );
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error(`${isRAG ? 'RAG' : 'Chat'} error:`, err);
        updateError(
          chatId,
          err.message ||
            (isRAG ? 'Fehler bei der RAG-Anfrage.' : 'Fehler beim Senden der Nachricht.')
        );
        updateIsLoading(chatId, false);
        updateMessages(chatId, () => newMessages);
        setActiveJobIds(prev => {
          const n = { ...prev };
          delete n[chatId];
          return n;
        });
      } finally {
        delete abortControllersRef.current[chatId];
        resetTokenBatch();
        if (activeStreamChatIdRef.current === chatId) activeStreamChatIdRef.current = null;
      }
    },
    [
      api,
      abortExistingStream,
      loadModels,
      loadMessages,
      updateMessages,
      updateIsLoading,
      updateError,
      resetTokenBatch,
      addTokenToBatch,
      flushTokenBatch,
      tokenBatchRef,
    ]
  );

  // --- Context Value ---

  const value = useMemo(
    () => ({
      // State
      activeJobIds,
      globalQueue,
      installedModels,
      defaultModel,
      loadedModel,
      selectedModel,
      setSelectedModel,
      favoriteModels,
      spaces,
      // Functions
      sendMessage,
      reconnectToJob,
      cancelJob,
      abortExistingStream,
      checkActiveJobs,
      loadModels,
      loadSpaces,
      loadMessages,
      setModelAsDefault,
      toggleFavorite,
      getActiveJobForChat,
      registerMessageCallback,
      unregisterMessageCallback,
      // Background state accessors
      getBackgroundMessages,
      getBackgroundLoading,
      clearBackgroundState,
      hasActiveStream,
    }),
    [
      activeJobIds,
      globalQueue,
      installedModels,
      defaultModel,
      loadedModel,
      selectedModel,
      favoriteModels,
      spaces,
      sendMessage,
      reconnectToJob,
      cancelJob,
      abortExistingStream,
      checkActiveJobs,
      loadModels,
      loadSpaces,
      loadMessages,
      setModelAsDefault,
      toggleFavorite,
      getActiveJobForChat,
      registerMessageCallback,
      unregisterMessageCallback,
      getBackgroundMessages,
      getBackgroundLoading,
      clearBackgroundState,
      hasActiveStream,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChatContext must be used within a ChatProvider');
  return context;
}

export default ChatContext;
