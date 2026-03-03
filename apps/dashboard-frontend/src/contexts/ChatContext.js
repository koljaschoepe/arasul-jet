/**
 * ChatContext - Global Chat State Management
 *
 * Manages shared chat state that survives route changes within /chat/*:
 * - Active streaming jobs and queue status
 * - Model selection and installed models
 * - Knowledge Spaces for RAG
 * - Streaming with callback registry (per-chat UI updates)
 *
 * Scoped to /chat/* route - unmounts when user navigates to other sections.
 * Backend jobs continue running; messages reload from DB on return.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import useTokenBatching from '../hooks/useTokenBatching';
import { useApi } from '../hooks/useApi';
import { API_BASE, getAuthHeaders } from '../config/api';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const api = useApi();

  // --- State ---

  // Background job tracking
  const [activeJobIds, setActiveJobIds] = useState({}); // chatId -> jobId
  const [globalQueue, setGlobalQueue] = useState({ pending_count: 0, processing: null, queue: [] });

  // Model state
  const [selectedModel, setSelectedModel] = useState('');
  const [installedModels, setInstalledModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState('');
  const [loadedModel, setLoadedModel] = useState(null);
  const [favoriteModels, setFavoriteModels] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('arasul_favorite_models') || '[]');
    } catch {
      return [];
    }
  });

  // Knowledge Spaces
  const [spaces, setSpaces] = useState([]);

  // --- Refs ---

  const abortControllersRef = useRef({});
  const messageCallbacksRef = useRef(new Map());
  const activeStreamChatIdRef = useRef(null);
  // Ref-mirror for selectedModel to keep sendMessage stable
  const selectedModelRef = useRef(selectedModel);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  // --- Callback Registry ---
  // ChatView registers per-chat callbacks on mount, unregisters on unmount.
  // Streaming updates route through these callbacks.

  const registerMessageCallback = useCallback((chatId, callbacks) => {
    messageCallbacksRef.current.set(chatId, callbacks);
  }, []);

  const unregisterMessageCallback = useCallback(chatId => {
    messageCallbacksRef.current.delete(chatId);
  }, []);

  // Route setMessages to the active streaming chat's callback (used by useTokenBatching)
  const routedSetMessages = useCallback(updater => {
    const chatId = activeStreamChatIdRef.current;
    if (!chatId) return;
    const cb = messageCallbacksRef.current.get(chatId);
    if (cb?.setMessages) cb.setMessages(updater);
  }, []);

  const updateMessages = useCallback((chatId, updater) => {
    const cb = messageCallbacksRef.current.get(chatId);
    if (cb?.setMessages) cb.setMessages(updater);
  }, []);

  const updateIsLoading = useCallback((chatId, value) => {
    const cb = messageCallbacksRef.current.get(chatId);
    if (cb?.setIsLoading) cb.setIsLoading(value);
  }, []);

  const updateError = useCallback((chatId, value) => {
    const cb = messageCallbacksRef.current.get(chatId);
    if (cb?.setError) cb.setError(value);
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

  const loadMessages = useCallback(
    async chatId => {
      try {
        const data = await api.get(`/chats/${chatId}/messages`, { showError: false });
        return (data.messages || []).map(msg => ({
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
        }));
      } catch (err) {
        console.error('Error loading messages:', err);
        return [];
      }
    },
    [api]
  );

  // --- Model Actions ---

  const setModelAsDefault = useCallback(
    async modelId => {
      try {
        await api.post('/models/default', { model_id: modelId }, { showError: false });
        setDefaultModel(modelId);
      } catch (err) {
        console.error('Error setting default model:', err);
      }
    },
    [api]
  );

  const toggleFavorite = useCallback(modelId => {
    setFavoriteModels(prev => {
      const next = prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId];
      localStorage.setItem('arasul_favorite_models', JSON.stringify(next));
      return next;
    });
  }, []);

  // --- Job Management ---

  const getActiveJobForChat = useCallback(
    chatId => {
      return activeJobIds[chatId] || null;
    },
    [activeJobIds]
  );

  const checkActiveJobs = useCallback(
    async chatId => {
      try {
        const data = await api.get(`/chats/${chatId}/jobs`, { showError: false });
        const jobs = data.jobs || [];
        const activeJob = jobs.find(j => j.status === 'streaming' || j.status === 'pending');
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
    chatId => {
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
    },
    [updateIsLoading]
  );

  // Abort any existing stream for a chatId
  const abortExistingStream = useCallback(chatId => {
    if (abortControllersRef.current[chatId]) {
      abortControllersRef.current[chatId].abort();
      delete abortControllersRef.current[chatId];
    }
  }, []);

  // --- Effects ---

  // Load models and spaces on mount
  useEffect(() => {
    loadModels();
    loadSpaces();
  }, [loadModels, loadSpaces]);

  // Queue polling while active jobs exist
  useEffect(() => {
    if (Object.keys(activeJobIds).length === 0) {
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
  }, [activeJobIds, api]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(abortControllersRef.current).forEach(c => {
        if (c?.abort) c.abort();
      });
      abortControllersRef.current = {};
      resetTokenBatch();
    };
  }, [resetTokenBatch]);

  // --- Streaming: Reconnect ---

  const reconnectToJob = useCallback(
    async (jobId, targetChatId) => {
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

        const reader = response.body.getReader();
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
                const finalMsgs = await loadMessages(targetChatId);
                updateMessages(targetChatId, () => finalMsgs);
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
      } catch (err) {
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
    async (chatId, input, options = {}) => {
      const {
        useRAG = true,
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
      const newMessages = [...messages, { role: 'user', content: userMessage }];
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
        let currentJobId = null;
        let ragSources = [];

        // Build endpoint and payload
        const endpoint = isRAG ? `${API_BASE}/rag/query` : `${API_BASE}/llm/chat`;
        const payload = isRAG
          ? {
              query: userMessage,
              top_k: 5,
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

        const reader = response.body.getReader();
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
                setActiveJobIds(prev => ({ ...prev, [chatId]: currentJobId }));
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  if (u[assistantMessageIndex]) {
                    u[assistantMessageIndex] = { ...u[assistantMessageIndex], jobId: currentJobId };
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

              // RAG-specific events
              if (isRAG && data.type === 'matched_spaces' && data.spaces) {
                const cb = messageCallbacksRef.current.get(chatId);
                if (cb?.setMatchedSpaces) cb.setMatchedSpaces(data.spaces);
              }

              if (isRAG && data.type === 'query_optimization') {
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  if (u[assistantMessageIndex]) {
                    u[assistantMessageIndex] = {
                      ...u[assistantMessageIndex],
                      queryOptimization: {
                        duration: data.duration,
                        decompoundEnabled: data.decompoundEnabled,
                        decompoundResult: data.decompoundResult,
                        multiQueryEnabled: data.multiQueryEnabled,
                        multiQueryVariants: data.multiQueryVariants || [],
                        hydeEnabled: data.hydeEnabled,
                        hydeGenerated: data.hydeGenerated,
                      },
                      queryOptCollapsed: true,
                    };
                  }
                  return u;
                });
              }

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

              // Context and compaction events
              if (data.type === 'context_info') {
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  if (u[assistantMessageIndex]) {
                    u[assistantMessageIndex] = {
                      ...u[assistantMessageIndex],
                      tokenBreakdown: data.tokenBreakdown,
                      contextCollapsed: true,
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

        // Final consistency: reload from DB
        const { content: fullResponse, thinking: fullThinking } = tokenBatchRef.current;

        if (fullResponse || fullThinking) {
          const finalMsgs = await loadMessages(chatId);
          updateMessages(chatId, () => finalMsgs);
        }

        if (!streamError && !fullResponse && !fullThinking) {
          throw new Error(
            isRAG ? 'Keine Antwort vom RAG-System erhalten' : 'Keine Antwort vom LLM erhalten'
          );
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error(`${isRAG ? 'RAG' : 'Chat'} error:`, err);
        updateError(
          chatId,
          err.message ||
            (isRAG ? 'Fehler bei der RAG-Anfrage.' : 'Fehler beim Senden der Nachricht.')
        );
        updateMessages(chatId, () => newMessages);
        setActiveJobIds(prev => {
          const n = { ...prev };
          delete n[chatId];
          return n;
        });
      } finally {
        updateIsLoading(chatId, false);
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
      checkActiveJobs,
      loadModels,
      loadSpaces,
      loadMessages,
      setModelAsDefault,
      toggleFavorite,
      getActiveJobForChat,
      registerMessageCallback,
      unregisterMessageCallback,
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
      checkActiveJobs,
      loadModels,
      loadSpaces,
      loadMessages,
      setModelAsDefault,
      toggleFavorite,
      getActiveJobForChat,
      registerMessageCallback,
      unregisterMessageCallback,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChatContext must be used within a ChatProvider');
  return context;
}

export default ChatContext;
