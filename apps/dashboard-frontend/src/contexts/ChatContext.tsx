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
import type { ChatInput } from '@arasul/shared-schemas';
import useTokenBatching from '../hooks/useTokenBatching';
import { useApi } from '../hooks/useApi';
import { API_BASE, getAuthHeaders } from '../config/api';
import type { DocumentSource, MatchedSpace, QueueJob } from '../types';

// --- Types ---

/**
 * A single tool step of an agent run (Plan 008, Schritt 11). Streamed live via
 * `tool_start` (status 'running') and completed by `tool_result` (status 'done').
 */
export interface AgentToolStep {
  tool: string;
  params?: Record<string, unknown>;
  result?: string;
  status: 'running' | 'done';
}

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
  images?: string[]; // Base64-encoded images for vision models
  visionFallbackVia?: string; // model_id of the vision model that captioned the user image (P6 auto-fallback)
  agent?: string; // Agent name when this assistant message is an @agent run (Schritt 11)
  steps?: AgentToolStep[]; // Live tool steps of an agent run
}

export interface ChatSettings {
  use_rag?: boolean;
  use_thinking?: boolean;
  preferred_space_id?: string | null;
  preferred_model?: string;
}

interface QueueState {
  pending_count: number;
  processing: QueueJob | null;
  queue: QueueJob[];
}

interface InstalledModel {
  id: string;
  name: string;
  install_status?: string;
  status?: string;
  supports_thinking?: boolean;
  rag_optimized?: boolean;
  supports_vision_input?: boolean;
  model_type?: string;
}

interface Space {
  id: string;
  name: string;
  description?: string;
  color?: string;
  document_count?: number;
}

interface ActiveJob {
  id: string;
  status: string;
  model?: string;
  chat_id?: string;
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
  file?: File;
  images?: string[]; // Base64-encoded images for vision models
}

interface RunAgentOptions {
  workspaceRef: string;
  agentName: string;
  userInput: string;
  fullMessage: string;
  messages?: ChatMessage[];
}

// Flow-Agent (Plan 010): per DB-Id adressiert statt per Workspace+Name.
interface RunFlowAgentOptions {
  agentId: number;
  agentName: string;
  userInput: string;
  fullMessage: string;
  messages?: ChatMessage[];
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
  runAgentStream: (chatId: string, options: RunAgentOptions) => Promise<void>;
  runFlowAgentStream: (chatId: string, options: RunFlowAgentOptions) => Promise<void>;
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

interface ChatProviderProps {
  children: ReactNode;
  isAuthenticated: boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children, isAuthenticated }: ChatProviderProps) {
  const api = useApi();

  // === JOB QUEUE ===
  // Background job tracking and queue state

  const [activeJobIds, setActiveJobIds] = useState<Record<string, string>>({}); // chatId -> jobId
  const [globalQueue, setGlobalQueue] = useState<QueueState>({
    pending_count: 0,
    processing: null,
    queue: [],
  });

  // === MODEL MANAGEMENT ===
  // Model selection, defaults, favorites, and installed model list

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

  // === KNOWLEDGE SPACES ===
  // RAG knowledge spaces for document-grounded answers

  const [spaces, setSpaces] = useState<Space[]>([]);

  // --- Refs ---

  const abortControllersRef = useRef<Record<string, AbortController>>({});
  // P2.2.1: Track pending verifyPersistence retry timers per chat so they can
  // be aborted on cleanupChat / logout / unmount. Without this, retry
  // setTimeouts (up to 11.5s) keep firing updateMessages on stale or deleted
  // chat state.
  const verifyTimersRef = useRef<Map<string, Set<ReturnType<typeof setTimeout>>>>(new Map());
  const messageCallbacksRef = useRef(new Map<string, MessageCallbacks>());
  const activeStreamChatIdRef = useRef<string | null>(null);
  // RACE-001: Mutex to prevent concurrent reconnectToJob calls
  const reconnectMutexRef = useRef<Promise<void>>(Promise.resolve());
  // RACE-002: Per-chat send lock to prevent double-send from rapid clicks
  const sendLockRef = useRef(new Set<string>());
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
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
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

  // === BACKGROUND MESSAGES ===
  // Background message accumulation when ChatView is not mounted

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

  // FH2: Full cleanup when a chat is deleted — prevents memory leaks
  const cleanupChat = useCallback((chatId: string) => {
    // Abort any active stream
    const controller = abortControllersRef.current[chatId];
    if (controller) {
      controller.abort();
      delete abortControllersRef.current[chatId];
    }
    // Remove callback entry
    messageCallbacksRef.current.delete(chatId);
    // Clear background state
    backgroundMessagesRef.current.delete(chatId);
    backgroundLoadingRef.current.delete(chatId);
    // P2.2.1: clear any pending verifyPersistence retry timers
    const timers = verifyTimersRef.current.get(chatId);
    if (timers) {
      for (const id of timers) clearTimeout(id);
      verifyTimersRef.current.delete(chatId);
    }
    // Clear active job
    setActiveJobIds(prev => {
      if (!(chatId in prev)) return prev;
      const next = { ...prev };
      delete next[chatId];
      return next;
    });
    // Clear active stream ref if it was this chat
    if (activeStreamChatIdRef.current === chatId) {
      activeStreamChatIdRef.current = null;
    }
  }, []);

  // --- Token Batching ---
  const { tokenBatchRef, flushTokenBatch, addTokenToBatch, resetTokenBatch } =
    useTokenBatching<ChatMessage>(routedSetMessages);

  // --- Data Loading ---

  const loadModels = useCallback(async () => {
    try {
      const [installedRes, defaultRes, loadedRes] = await Promise.all([
        api.get<{ models?: InstalledModel[] }>('/models/installed', { showError: false }),
        api.get<{ default_model?: string }>('/models/default', { showError: false }),
        api.get<{ model_id?: string }>('/models/loaded', { showError: false }).catch(() => null),
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
      const data = await api.get<{ spaces?: Space[] }>('/spaces', { showError: false });
      setSpaces(data.spaces || []);
    } catch (err) {
      console.error('Error loading spaces:', err);
    }
  }, [api]);

  const mapMessage = (msg: Record<string, unknown>): ChatMessage => ({
    id: msg.id as number | undefined,
    role: msg.role as string,
    content: (msg.content as string) || '',
    thinking: (msg.thinking as string) || '',
    hasThinking: !!(msg.thinking && (msg.thinking as string).length > 0),
    thinkingCollapsed: true,
    sources: (msg.sources as DocumentSource[]) || [],
    sourcesCollapsed: true,
    matchedSpaces: (msg.matched_spaces as MatchedSpace[]) || undefined,
    status: (msg.status as string) || 'completed',
    jobId: msg.job_id as string | undefined,
    jobStatus: msg.job_status as string | undefined,
  });

  const loadMessages = useCallback(
    async (chatId: string, options: LoadMessagesOptions = {}): Promise<LoadMessagesResult> => {
      const { limit = 50, before } = options;
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (before) params.set('before', String(before));
        const data = await api.get<{ messages?: Record<string, unknown>[]; hasMore?: boolean }>(
          `/chats/${chatId}/messages?${params}`,
          { showError: false }
        );
        return {
          messages: (data.messages || []).map(mapMessage),
          hasMore: data.hasMore || false,
        };
      } catch (err) {
        // 404 = der (evtl. aus persistiertem Zustand restaurierte) Chat existiert
        // nicht mehr. Das ist ein erwarteter Zustand (gelöschter, aber noch
        // referenzierter Chat), kein Fehler — nicht als Konsolenfehler loggen.
        if ((err as { status?: number })?.status !== 404) {
          console.error('Error loading messages:', err);
        }
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
        const data = await api.get<{ jobs?: QueueJob[] }>(`/chats/${chatId}/jobs`, {
          showError: false,
        });
        const jobs = data.jobs || [];
        const activeJob = jobs.find(
          (j: QueueJob) => j.status === 'streaming' || j.status === 'pending'
        );
        if (activeJob) {
          setActiveJobIds(prev => ({ ...prev, [chatId]: activeJob.id }));
          return activeJob;
        }
        return null;
      } catch (err) {
        // 404 = Chat existiert nicht mehr (siehe loadMessages) — erwartet, kein Fehler.
        if ((err as { status?: number })?.status !== 404) {
          console.error('Error checking active jobs:', err);
        }
        return null;
      }
    },
    [api]
  );

  const cancelJob = useCallback(
    async (chatId: string) => {
      // Get the jobId before clearing state
      const jobId = activeJobIds[chatId];

      // 1. Abort the local stream first (this is instant)
      const controller = abortControllersRef.current[chatId];
      if (controller) {
        controller.abort();
        delete abortControllersRef.current[chatId];
      }

      // 2. Cancel on server — await so we confirm cancellation before updating state
      if (jobId) {
        try {
          await api.del(`/llm/jobs/${jobId}`, { showError: false });
        } catch {
          // Job may already be complete — ignore
        }
      }

      // 3. Update state AFTER API call completes
      setActiveJobIds(prev => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
      updateIsLoading(chatId, false);
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
        const data = await api.get<QueueState>('/llm/queue', { showError: false });
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

  // === MESSAGE STREAMING ===
  // SSE streaming for chat responses (reconnect + send)

  const reconnectToJob = useCallback(
    async (jobId: string, targetChatId: string) => {
      // RACE-001: Serialize reconnect calls via mutex to prevent concurrent streams
      const prevMutex = reconnectMutexRef.current;
      let releaseMutex: () => void;
      reconnectMutexRef.current = new Promise<void>(resolve => {
        releaseMutex = resolve;
      });
      await prevMutex;

      // Abort ALL existing streams — token batching only supports one active stream
      for (const id of Object.keys(abortControllersRef.current)) {
        if (id !== targetChatId) {
          abortControllersRef.current[id]?.abort();
          delete abortControllersRef.current[id];
        }
      }
      abortExistingStream(targetChatId);
      const abortController = new AbortController();
      abortControllersRef.current[targetChatId] = abortController;
      activeStreamChatIdRef.current = targetChatId;

      // Declared outside try so catch/finally can clear the timeout
      let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

      try {
        const response = await fetch(`${API_BASE}/llm/jobs/${jobId}/stream`, {
          headers: getAuthHeaders(),
          signal: abortController.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        if (!response.body) throw new Error('Stream body ist null');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        // FH8: Use longer initial timeout for reconnect — the model may still be loading
        // after a page refresh. Subsequent reads use a shorter timeout.
        const RECONNECT_INITIAL_TIMEOUT = 180_000; // 3min for first chunk (model may be loading)
        const RECONNECT_READ_TIMEOUT = 120_000; // 120s for subsequent reads (heartbeats reset this)
        let isFirstReconnectRead = true;
        let reconnectTimeoutReject: ((reason: Error) => void) | null = null;

        const resetReconnectTimeout = () => {
          if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
          const ms = isFirstReconnectRead ? RECONNECT_INITIAL_TIMEOUT : RECONNECT_READ_TIMEOUT;
          reconnectTimeoutId = setTimeout(() => {
            if (reconnectTimeoutReject)
              reconnectTimeoutReject(
                new Error(
                  isFirstReconnectRead
                    ? 'Reconnect-Timeout: Keine Antwort nach 3 Minuten. Bitte Systemstatus prüfen.'
                    : 'Stream-Timeout: Keine Daten seit 120 Sekunden'
                )
              );
          }, ms);
        };

        resetReconnectTimeout();

        for (;;) {
          const readPromise = reader.read();
          const timeoutPromise = new Promise<never>((_, reject) => {
            reconnectTimeoutReject = reject;
          });
          const { done, value } = await Promise.race([readPromise, timeoutPromise]);
          // Reset timeout on EVERY successful read (including heartbeat chunks)
          resetReconnectTimeout();
          isFirstReconnectRead = false;
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(l => l.trim().startsWith('data:'));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.replace(/^data:\s*/, ''));

              // Heartbeat/retry: no UI update, just keep connection alive
              if (data.type === 'heartbeat' || data.type === 'retry') {
                continue;
              }

              // Status events: show model loading / queue status to user
              if (data.type === 'status') {
                updateMessages(targetChatId, prev =>
                  prev.map(msg =>
                    msg.jobId === jobId
                      ? { ...msg, streamStatus: data.status, statusMessage: data.message || '' }
                      : msg
                  )
                );
                continue;
              }

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
                          ...(data.sources
                            ? { sources: data.sources, sourcesCollapsed: true }
                            : {}),
                          ...(data.matchedSpaces ? { matchedSpaces: data.matchedSpaces } : {}),
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
        if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
      } catch (err: unknown) {
        if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
        if (err instanceof Error && err.name === 'AbortError') return;
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
        releaseMutex!();
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
        file,
        images,
      } = options;
      if ((!input.trim() && !file) || !chatId) return;

      // RACE-002: Synchronous guard against double-send (React state updates are async)
      if (sendLockRef.current.has(chatId)) return;
      sendLockRef.current.add(chatId);

      const userMessage = input.trim();
      const isRAG = useRAG && !file; // file uploads use their own pipeline
      const isFileUpload = !!file;
      const effectiveModel = model !== undefined ? model : selectedModelRef.current;

      // Save user message to DB (skip for file uploads — backend handles it)
      if (!isFileUpload) {
        try {
          await api.post(
            `/chats/${chatId}/messages`,
            { role: 'user', content: userMessage },
            { showError: false }
          );
        } catch (err) {
          console.error('Error saving user message:', err);
          updateError(
            chatId,
            'Warnung: Nachricht konnte nicht gespeichert werden. Bei Seitenaktualisierung könnte sie verloren gehen.'
          );
        }
      }

      // Update UI with user message + empty assistant message
      const newMessages: ChatMessage[] = [
        ...messages,
        { role: 'user', content: userMessage, ...(images && images.length > 0 ? { images } : {}) },
      ];
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

      // Abort ALL existing streams — token batching only supports one active stream at a time.
      // If Chat A is streaming and user starts Chat B, Chat A's batched tokens would route
      // to Chat B via activeStreamChatIdRef. Prevent this by aborting all other streams first.
      for (const id of Object.keys(abortControllersRef.current)) {
        if (id !== chatId) {
          abortControllersRef.current[id]?.abort();
          delete abortControllersRef.current[id];
        }
      }
      abortExistingStream(chatId);
      const abortController = new AbortController();
      abortControllersRef.current[chatId] = abortController;
      activeStreamChatIdRef.current = chatId;
      resetTokenBatch();

      let currentJobId: string | null = null;
      let streamDone = false;
      try {
        let streamError = false;
        let ragSources: DocumentSource[] = [];

        // Build endpoint and payload
        let endpoint: string;
        let fetchOptions: RequestInit;

        if (isFileUpload) {
          // Document analysis: FormData upload with SSE response
          endpoint = `${API_BASE}/document-analysis/analyze`;
          const formData = new FormData();
          formData.append('file', file);
          formData.append('conversation_id', String(chatId));
          if (userMessage) formData.append('prompt', userMessage);
          if (effectiveModel) formData.append('model', effectiveModel);
          fetchOptions = {
            method: 'POST',
            headers: { ...getAuthHeaders() }, // No Content-Type — browser sets multipart boundary
            body: formData,
            signal: abortController.signal,
          };
        } else if (isRAG) {
          endpoint = `${API_BASE}/rag/query`;
          fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
              query: userMessage,
              top_k: 10,
              thinking: useThinking,
              conversation_id: chatId,
              model: effectiveModel || undefined,
              ...(selectedSpaces.length > 0
                ? { space_ids: selectedSpaces, auto_routing: false }
                : { auto_routing: true }),
            }),
            signal: abortController.signal,
          };
        } else {
          endpoint = `${API_BASE}/llm/chat`;
          const chatPayload: ChatInput = {
            messages: newMessages.map(m => ({ role: m.role, content: m.content })),
            temperature: 0.7,
            max_tokens: 32768,
            stream: true,
            thinking: useThinking,
            conversation_id: chatId,
            model: effectiveModel || undefined,
            ...(images && images.length > 0 ? { images } : {}),
          };
          fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(chatPayload),
            signal: abortController.signal,
          };
        }

        const response = await fetch(endpoint, fetchOptions);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        if (!response.body) throw new Error('Stream body ist null');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        // First read timeout is longer to account for model loading (large models need minutes)
        const INITIAL_READ_TIMEOUT = 660_000; // 11min for initial response (backend allows 600s for model load + buffer)
        const STREAM_READ_TIMEOUT = 120_000; // 120s for subsequent reads (heartbeats reset this)
        let isFirstRead = true;
        let streamTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let streamTimeoutReject: ((reason: Error) => void) | null = null;

        const resetStreamTimeout = () => {
          if (streamTimeoutId) clearTimeout(streamTimeoutId);
          const ms = isFirstRead ? INITIAL_READ_TIMEOUT : STREAM_READ_TIMEOUT;
          streamTimeoutId = setTimeout(() => {
            if (streamTimeoutReject)
              streamTimeoutReject(
                new Error(
                  isFirstRead
                    ? 'Timeout: Modell konnte nicht geladen werden (11 Min). Bitte Systemstatus prüfen.'
                    : 'Stream-Timeout: Keine Daten seit 120 Sekunden'
                )
              );
          }, ms);
        };

        resetStreamTimeout();

        for (;;) {
          const readPromise = reader.read();
          // TIMEOUT-FIX: Create fresh reject ref per iteration and clear old timeout
          // before setting new one to prevent stale rejection
          const timeoutPromise = new Promise<never>((_, reject) => {
            streamTimeoutReject = reject;
          });
          const { done, value } = await Promise.race([readPromise, timeoutPromise]);
          // RACE-FIX: Immediately nullify reject ref so a stale timeout callback
          // (that fires between Promise.race resolution and clearTimeout) is a no-op
          streamTimeoutReject = null;
          if (streamTimeoutId) clearTimeout(streamTimeoutId);
          resetStreamTimeout();
          isFirstRead = false;
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
                  const cur = u[assistantMessageIndex];
                  if (cur) {
                    u[assistantMessageIndex] = {
                      ...cur,
                      jobId: currentJobId!,
                    };
                  }
                  return u;
                });
              }

              // Heartbeat/retry: no UI update, just keep connection alive
              if (data.type === 'heartbeat' || data.type === 'retry') {
                continue;
              }

              // Status events: show model loading / queue status to user
              if (data.type === 'status') {
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  const cur = u[assistantMessageIndex];
                  if (cur) {
                    u[assistantMessageIndex] = {
                      ...cur,
                      streamStatus: data.status,
                      statusMessage: data.message || '',
                    };
                  }
                  return u;
                });
                continue;
              }

              if (data.error) {
                streamError = true;
                updateError(chatId, data.error);
                if (data.errorCode === 'MODEL_SWITCH_FAILED') {
                  loadModels();
                  if (selectedModelRef.current) setSelectedModel('');
                }
                // P2.2.3: remove the empty assistant placeholder. Without
                // this, the streaming-status bubble with empty content sits
                // in the message list forever — the catch-block cleanup at
                // the end of sendMessage only runs on thrown errors, not on
                // data.error events.
                updateMessages(chatId, prev => {
                  if (
                    assistantMessageIndex >= 0 &&
                    assistantMessageIndex < prev.length &&
                    prev[assistantMessageIndex]?.role === 'assistant' &&
                    !prev[assistantMessageIndex]?.content
                  ) {
                    return prev.filter((_, i) => i !== assistantMessageIndex);
                  }
                  return prev;
                });
                break;
              }

              // RAG-specific events: combined rag_metadata (single re-render)
              if (isRAG && data.type === 'rag_metadata') {
                ragSources = data.sources || [];
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  const cur = u[assistantMessageIndex];
                  if (cur) {
                    u[assistantMessageIndex] = {
                      ...cur,
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
                  const cur = u[assistantMessageIndex];
                  if (cur) {
                    u[assistantMessageIndex] = {
                      ...cur,
                      sources: ragSources,
                      sourcesCollapsed: ragSources.length > 0,
                      // Legacy fallback: matchedSpaces from options are plain IDs, wrap as MatchedSpace
                      matchedSpaces: matchedSpaces.map(id => ({ name: id })),
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

              // Vision auto-fallback (P6/P7): primary model is text-only, a small
              // vision model captioned the user's image so the primary can answer.
              // Render a Badge on the assistant message: "🖥️ Vision via <model>".
              if (
                data.type === 'warning' &&
                data.code === 'VISION_FALLBACK_ACTIVE' &&
                data.vision_via
              ) {
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  const cur = u[assistantMessageIndex];
                  if (cur) {
                    u[assistantMessageIndex] = {
                      ...cur,
                      visionFallbackVia: data.vision_via,
                    };
                  }
                  return u;
                });
              }

              // Token streaming
              if (data.type === 'thinking' && data.token) {
                addTokenToBatch('thinking', data.token, assistantMessageIndex);
              }

              if (data.type === 'thinking_end') {
                flushTokenBatch(assistantMessageIndex, true);
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  const cur = u[assistantMessageIndex];
                  if (cur) {
                    u[assistantMessageIndex] = {
                      ...cur,
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
                streamDone = true;
                break;
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
          if (streamError || streamDone) break;
        }
        if (streamTimeoutId) clearTimeout(streamTimeoutId);

        // FH3: Save final batch values BEFORE reset to avoid race condition
        // resetTokenBatch() zeroes out the ref, so we must capture values first
        const { content: fullResponse, thinking: fullThinking } = tokenBatchRef.current;
        resetTokenBatch();

        // Final consistency: mark streaming messages as completed
        if (fullResponse || fullThinking) {
          updateMessages(chatId, prev =>
            prev.map(msg => (msg.status === 'streaming' ? { ...msg, status: 'completed' } : msg))
          );
        }

        // DB-SYNC: Reload messages from database to ensure persistence.
        // Backend completeJob() runs async — give it time, then verify.
        // Extended retry: 1.5s initial + 5 retries × 2s = 11.5s max total wait.
        // P2.2.1: every scheduled retry is tracked in verifyTimersRef and
        // cancelled by cleanupChat / logout, so it cannot fire on a deleted
        // or logged-out chat.
        if (fullResponse || fullThinking) {
          const syncChatId = chatId;
          const trackTimer = (id: ReturnType<typeof setTimeout>) => {
            let set = verifyTimersRef.current.get(syncChatId);
            if (!set) {
              set = new Set();
              verifyTimersRef.current.set(syncChatId, set);
            }
            set.add(id);
          };
          const untrackTimer = (id: ReturnType<typeof setTimeout>) => {
            const set = verifyTimersRef.current.get(syncChatId);
            if (set) {
              set.delete(id);
              if (set.size === 0) verifyTimersRef.current.delete(syncChatId);
            }
          };
          const verifyPersistence = async (retriesLeft: number) => {
            try {
              const result = await loadMessages(syncChatId);
              if (result.messages.length > 0) {
                const lastDbAssistant = [...result.messages]
                  .reverse()
                  .find(m => m.role === 'assistant');
                if (lastDbAssistant?.content || lastDbAssistant?.thinking) {
                  updateMessages(syncChatId, () => result.messages);
                } else if (retriesLeft > 0) {
                  const id = setTimeout(() => {
                    untrackTimer(id);
                    verifyPersistence(retriesLeft - 1);
                  }, 2000);
                  trackTimer(id);
                }
              }
            } catch {
              // Non-critical — streaming content is already displayed locally
            }
          };
          const initialId = setTimeout(() => {
            untrackTimer(initialId);
            verifyPersistence(5);
          }, 1500);
          trackTimer(initialId);
        }

        if (!streamError && !fullResponse && !fullThinking) {
          throw new Error(
            isRAG ? 'Keine Antwort vom RAG-System erhalten' : 'Keine Antwort vom LLM erhalten'
          );
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (streamDone) return; // Ignore post-done errors (e.g. timeout after successful stream)
        console.error(`${isRAG ? 'RAG' : 'Chat'} error:`, err);

        // Cancel orphaned backend job to free GPU resources
        if (currentJobId) {
          api.del(`/llm/jobs/${currentJobId}`, { showError: false }).catch(() => {});
        }

        updateError(
          chatId,
          (err instanceof Error ? err.message : null) ||
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
        sendLockRef.current.delete(chatId);
        delete abortControllersRef.current[chatId];
        // FH3: Reset in finally as safety net (idempotent if already reset in try block)
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

  // --- Streaming: Run Agent (@agent command, Plan 008 Schritt 11) ---
  // Mirrors sendMessage's lifecycle (user-message persistence, callback routing,
  // abort registry) but consumes the agent run endpoint's event stream —
  // tool_start / tool_result / text / done / error — instead of token chunks.

  const runAgentStream = useCallback(
    async (chatId: string, options: RunAgentOptions) => {
      const { workspaceRef, agentName, userInput, fullMessage, messages = [] } = options;
      if (!chatId || !workspaceRef || !agentName) return;

      // Reuse sendMessage's double-send guard so a stray double-click can't
      // open two runs for the same chat.
      if (sendLockRef.current.has(chatId)) return;
      sendLockRef.current.add(chatId);

      // Persist the user message exactly like the normal chat path.
      try {
        await api.post(
          `/chats/${chatId}/messages`,
          { role: 'user', content: fullMessage },
          { showError: false }
        );
      } catch (err) {
        console.error('Error saving agent user message:', err);
      }

      const baseMessages: ChatMessage[] = [...messages, { role: 'user', content: fullMessage }];
      const assistantIndex = baseMessages.length;
      updateMessages(chatId, () => [
        ...baseMessages,
        { role: 'assistant', content: '', status: 'streaming', agent: agentName, steps: [] },
      ]);
      updateIsLoading(chatId, true);
      updateError(chatId, null);

      // Only one active stream at a time (token batching / activeStreamChatIdRef).
      for (const id of Object.keys(abortControllersRef.current)) {
        if (id !== chatId) {
          abortControllersRef.current[id]?.abort();
          delete abortControllersRef.current[id];
        }
      }
      abortExistingStream(chatId);
      const abortController = new AbortController();
      abortControllersRef.current[chatId] = abortController;
      activeStreamChatIdRef.current = chatId;

      const patchAssistant = (patch: (cur: ChatMessage) => ChatMessage) =>
        updateMessages(chatId, prev => {
          const u = [...prev];
          const cur = u[assistantIndex];
          if (cur) u[assistantIndex] = patch(cur);
          return u;
        });

      let finalText = '';
      let streamError = false;

      const handleAgentEvent = (evt: {
        type?: string;
        tool?: string;
        params?: Record<string, unknown>;
        result?: string;
        content?: string;
        message?: string;
      }) => {
        switch (evt.type) {
          case 'tool_start':
            patchAssistant(cur => ({
              ...cur,
              steps: [
                ...(cur.steps || []),
                { tool: evt.tool || '', params: evt.params, status: 'running' },
              ],
            }));
            break;
          case 'tool_result':
            patchAssistant(cur => {
              const steps = [...(cur.steps || [])];
              for (let i = steps.length - 1; i >= 0; i--) {
                const s = steps[i];
                if (s && s.tool === evt.tool && s.status === 'running') {
                  steps[i] = { ...s, status: 'done', result: evt.result };
                  break;
                }
              }
              return { ...cur, steps };
            });
            break;
          case 'text':
            finalText = evt.content || finalText;
            patchAssistant(cur => ({ ...cur, content: evt.content || cur.content }));
            break;
          case 'done':
            finalText = evt.result != null ? evt.result : finalText;
            patchAssistant(cur => ({
              ...cur,
              content: finalText || cur.content,
              status: 'completed',
              steps: (cur.steps || []).map(s =>
                s.status === 'running' ? { ...s, status: 'done' } : s
              ),
            }));
            break;
          case 'error':
            streamError = true;
            updateError(chatId, evt.message || 'Der Agent hat einen Fehler gemeldet.');
            patchAssistant(cur => ({ ...cur, status: 'error' }));
            break;
          default:
            break;
        }
      };

      try {
        const url = `${API_BASE}/sandbox/projects/${encodeURIComponent(
          workspaceRef
        )}/agenten/${encodeURIComponent(agentName)}/run/stream`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ input: userInput }),
          signal: abortController.signal,
        });
        if (!response.ok) {
          let msg = `HTTP ${response.status}`;
          try {
            const j = (await response.json()) as { error?: { message?: string } };
            msg = j?.error?.message || msg;
          } catch {
            /* non-JSON error body */
          }
          if (response.status === 404) msg = `Agent „${agentName}" nicht gefunden.`;
          throw new Error(msg);
        }
        if (!response.body) throw new Error('Stream body ist null');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            try {
              handleAgentEvent(JSON.parse(t.replace(/^data:\s*/, '')));
            } catch {
              /* ignore malformed frame */
            }
          }
        }

        // Persist the agent's final answer so history survives a reload.
        if (!streamError && finalText) {
          try {
            await api.post(
              `/chats/${chatId}/messages`,
              { role: 'assistant', content: finalText },
              { showError: false }
            );
          } catch (err) {
            console.error('Error saving agent answer:', err);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Agent run error:', err);
        updateError(
          chatId,
          (err instanceof Error ? err.message : null) || 'Fehler beim Ausführen des Agenten.'
        );
        patchAssistant(cur => ({ ...cur, status: 'error' }));
      } finally {
        sendLockRef.current.delete(chatId);
        updateIsLoading(chatId, false);
        delete abortControllersRef.current[chatId];
        if (activeStreamChatIdRef.current === chatId) activeStreamChatIdRef.current = null;
      }
    },
    [api, abortExistingStream, updateMessages, updateIsLoading, updateError]
  );

  // Flow-Agent (Plan 010, Schritt 6): bewusst als eigenständige Parallel-Methode
  // zu runAgentStream gehalten, damit der bestehende @-Datei-Agenten-Pfad NICHT
  // angefasst wird. Nur URL (/agents/:id/run/stream) und Adressierung (DB-Id)
  // unterscheiden sich; die Event-Behandlung (status/tool/text/done/error) ist
  // identisch, weil der Flow-Agent-Lauf dieselben Frames liefert.
  const runFlowAgentStream = useCallback(
    async (chatId: string, options: RunFlowAgentOptions) => {
      const { agentId, agentName, userInput, fullMessage, messages = [] } = options;
      if (!chatId || agentId == null || !agentName) return;

      if (sendLockRef.current.has(chatId)) return;
      sendLockRef.current.add(chatId);

      try {
        await api.post(
          `/chats/${chatId}/messages`,
          { role: 'user', content: fullMessage },
          { showError: false }
        );
      } catch (err) {
        console.error('Error saving flow-agent user message:', err);
      }

      const baseMessages: ChatMessage[] = [...messages, { role: 'user', content: fullMessage }];
      const assistantIndex = baseMessages.length;
      updateMessages(chatId, () => [
        ...baseMessages,
        { role: 'assistant', content: '', status: 'streaming', agent: agentName, steps: [] },
      ]);
      updateIsLoading(chatId, true);
      updateError(chatId, null);

      for (const id of Object.keys(abortControllersRef.current)) {
        if (id !== chatId) {
          abortControllersRef.current[id]?.abort();
          delete abortControllersRef.current[id];
        }
      }
      abortExistingStream(chatId);
      const abortController = new AbortController();
      abortControllersRef.current[chatId] = abortController;
      activeStreamChatIdRef.current = chatId;

      const patchAssistant = (patch: (cur: ChatMessage) => ChatMessage) =>
        updateMessages(chatId, prev => {
          const u = [...prev];
          const cur = u[assistantIndex];
          if (cur) u[assistantIndex] = patch(cur);
          return u;
        });

      let finalText = '';
      let streamError = false;

      const handleAgentEvent = (evt: {
        type?: string;
        tool?: string;
        params?: Record<string, unknown>;
        result?: string;
        content?: string;
        message?: string;
      }) => {
        switch (evt.type) {
          case 'tool_start':
            patchAssistant(cur => ({
              ...cur,
              steps: [
                ...(cur.steps || []),
                { tool: evt.tool || '', params: evt.params, status: 'running' },
              ],
            }));
            break;
          case 'tool_result':
            patchAssistant(cur => {
              const steps = [...(cur.steps || [])];
              for (let i = steps.length - 1; i >= 0; i--) {
                const s = steps[i];
                if (s && s.tool === evt.tool && s.status === 'running') {
                  steps[i] = { ...s, status: 'done', result: evt.result };
                  break;
                }
              }
              return { ...cur, steps };
            });
            break;
          case 'text':
            finalText = evt.content || finalText;
            patchAssistant(cur => ({ ...cur, content: evt.content || cur.content }));
            break;
          case 'done':
            finalText = evt.result != null ? evt.result : finalText;
            patchAssistant(cur => ({
              ...cur,
              content: finalText || cur.content,
              status: 'completed',
              steps: (cur.steps || []).map(s =>
                s.status === 'running' ? { ...s, status: 'done' } : s
              ),
            }));
            break;
          case 'error':
            streamError = true;
            updateError(chatId, evt.message || 'Der Agent hat einen Fehler gemeldet.');
            patchAssistant(cur => ({ ...cur, status: 'error' }));
            break;
          default:
            break;
        }
      };

      try {
        const url = `${API_BASE}/agents/${agentId}/run/stream`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ input: userInput }),
          signal: abortController.signal,
        });
        if (!response.ok) {
          let msg = `HTTP ${response.status}`;
          try {
            const j = (await response.json()) as { error?: { message?: string } };
            msg = j?.error?.message || msg;
          } catch {
            /* non-JSON error body */
          }
          if (response.status === 404) msg = `Flow-Agent „${agentName}" nicht gefunden.`;
          throw new Error(msg);
        }
        if (!response.body) throw new Error('Stream body ist null');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            try {
              handleAgentEvent(JSON.parse(t.replace(/^data:\s*/, '')));
            } catch {
              /* ignore malformed frame */
            }
          }
        }

        if (!streamError && finalText) {
          try {
            await api.post(
              `/chats/${chatId}/messages`,
              { role: 'assistant', content: finalText },
              { showError: false }
            );
          } catch (err) {
            console.error('Error saving flow-agent answer:', err);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Flow-agent run error:', err);
        updateError(
          chatId,
          (err instanceof Error ? err.message : null) || 'Fehler beim Ausführen des Agenten.'
        );
        patchAssistant(cur => ({ ...cur, status: 'error' }));
      } finally {
        sendLockRef.current.delete(chatId);
        updateIsLoading(chatId, false);
        delete abortControllersRef.current[chatId];
        if (activeStreamChatIdRef.current === chatId) activeStreamChatIdRef.current = null;
      }
    },
    [api, abortExistingStream, updateMessages, updateIsLoading, updateError]
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
      runAgentStream,
      runFlowAgentStream,
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
      // Cleanup
      cleanupChat,
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
      runAgentStream,
      runFlowAgentStream,
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
      cleanupChat,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChatContext must be used within a ChatProvider');
  return context;
}
