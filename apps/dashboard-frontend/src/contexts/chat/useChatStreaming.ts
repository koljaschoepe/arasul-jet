import { useEffect, useCallback } from 'react';
import type { ChatInput } from '@arasul/shared-schemas';
import { useApi } from '../../hooks/useApi';
import { API_BASE, getAuthHeaders } from '../../config/api';
import useTokenBatching from '../../hooks/useTokenBatching';
import type { DocumentSource, MatchedSpace } from '../../types';
import type {
  ChatMessage,
  LoadMessagesOptions,
  LoadMessagesResult,
  SendMessageOptions,
} from './types';

// Reconnect timeouts
const RECONNECT_INITIAL_TIMEOUT = 180_000; // 3 min for first chunk (model may be loading)
const RECONNECT_READ_TIMEOUT = 120_000; // 120s for subsequent reads

// Send-message timeouts
const SEND_INITIAL_READ_TIMEOUT = 660_000; // 11 min for initial response (backend allows 600s + buffer)
const SEND_STREAM_READ_TIMEOUT = 120_000; // 120s for subsequent reads

interface UseChatStreamingParams {
  isAuthenticated: boolean;
  // From useJobQueue
  abortControllersRef: React.MutableRefObject<Record<string, AbortController>>;
  reconnectMutexRef: React.MutableRefObject<Promise<void>>;
  sendLockRef: React.MutableRefObject<Set<string>>;
  activeStreamChatIdRef: React.MutableRefObject<string | null>;
  abortExistingStream: (chatId: string) => void;
  setActiveJob: (chatId: string, jobId: string) => void;
  clearActiveJob: (chatId: string) => void;
  // From useChatCallbacks
  routedSetMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  updateMessages: (
    chatId: string,
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])
  ) => void;
  updateIsLoading: (chatId: string, value: boolean) => void;
  updateError: (chatId: string, value: string | null) => void;
  // From useChatModels
  selectedModelRef: React.MutableRefObject<string>;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  loadModels: () => Promise<void>;
}

export interface UseChatStreamingReturn {
  loadMessages: (chatId: string, options?: LoadMessagesOptions) => Promise<LoadMessagesResult>;
  reconnectToJob: (jobId: string, targetChatId: string) => Promise<void>;
  sendMessage: (chatId: string, input: string, options?: SendMessageOptions) => Promise<void>;
}

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

/**
 * useChatStreaming — SSE streaming for chat: loadMessages, reconnectToJob,
 * sendMessage. Handles token batching, RAG, file-upload, vision images,
 * compaction events, abort/timeout, and DB-sync verification.
 */
export default function useChatStreaming({
  isAuthenticated,
  abortControllersRef,
  reconnectMutexRef,
  sendLockRef,
  activeStreamChatIdRef,
  abortExistingStream,
  setActiveJob,
  clearActiveJob,
  routedSetMessages,
  updateMessages,
  updateIsLoading,
  updateError,
  selectedModelRef,
  setSelectedModel,
  loadModels,
}: UseChatStreamingParams): UseChatStreamingReturn {
  const api = useApi();

  // Token batching, fed by routedSetMessages — cast needed because token-batching is generic
  const { tokenBatchRef, flushTokenBatch, addTokenToBatch, resetTokenBatch } = useTokenBatching(
    routedSetMessages as React.Dispatch<React.SetStateAction<ChatMessage[]>>
  );

  // Reset token batch on logout
  useEffect(() => {
    if (!isAuthenticated) {
      resetTokenBatch();
    }
  }, [isAuthenticated, resetTokenBatch]);

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

        while (true) {
          const readPromise = reader.read();
          const timeoutPromise = new Promise<never>((_, reject) => {
            reconnectTimeoutReject = reject;
          });
          const { done, value } = await Promise.race([readPromise, timeoutPromise]);
          resetReconnectTimeout();
          isFirstReconnectRead = false;
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(l => l.trim().startsWith('data:'));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.replace(/^data:\s*/, ''));

              if (data.type === 'heartbeat' || data.type === 'retry') continue;

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
                clearActiveJob(targetChatId);
                const result = await loadMessages(targetChatId);
                updateMessages(targetChatId, () => result.messages);
              }

              if (data.error) {
                updateError(targetChatId, data.error);
                updateIsLoading(targetChatId, false);
                clearActiveJob(targetChatId);
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
        clearActiveJob(targetChatId);
      } finally {
        delete abortControllersRef.current[targetChatId];
        if (activeStreamChatIdRef.current === targetChatId) activeStreamChatIdRef.current = null;
        releaseMutex!();
      }
    },
    [
      abortExistingStream,
      loadMessages,
      updateMessages,
      updateIsLoading,
      updateError,
      clearActiveJob,
      abortControllersRef,
      reconnectMutexRef,
      activeStreamChatIdRef,
    ]
  );

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
        let isFirstRead = true;
        let streamTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let streamTimeoutReject: ((reason: Error) => void) | null = null;

        // Phase 9.3: token-speed metrics. Start clock at first received token
        // (not at fetch start, which would include model-load time and skew
        // tokens/sec downward). End at `done`.
        let firstTokenTime = 0;
        let tokenCount = 0;

        const resetStreamTimeout = () => {
          if (streamTimeoutId) clearTimeout(streamTimeoutId);
          const ms = isFirstRead ? SEND_INITIAL_READ_TIMEOUT : SEND_STREAM_READ_TIMEOUT;
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

        while (true) {
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
                setActiveJob(chatId, currentJobId!);
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

              if (data.type === 'heartbeat' || data.type === 'retry') continue;

              if (data.type === 'status') {
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  if (u[assistantMessageIndex]) {
                    u[assistantMessageIndex] = {
                      ...u[assistantMessageIndex],
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
                // Structured error-code dispatch (Phase 9.7). The backend
                // classifies LLM failures so we can render context-specific
                // recovery UX (refresh model list, clear selection, …).
                switch (data.errorCode) {
                  case 'MODEL_SWITCH_FAILED':
                  case 'MODEL_NOT_FOUND':
                    // Refresh installed models so the broken selection clears
                    loadModels();
                    if (selectedModelRef.current) setSelectedModel('');
                    break;
                  case 'CUDA_OOM':
                  case 'LLM_UNREACHABLE':
                    // Don't auto-clear selection — user retry may succeed
                    break;
                  default:
                    break;
                }
                break;
              }

              // RAG: combined rag_metadata (single re-render)
              if (isRAG && data.type === 'rag_metadata') {
                ragSources = data.sources || [];
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  if (u[assistantMessageIndex]) {
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

              // Legacy: individual RAG sources event (backwards compat for reconnect)
              if (isRAG && data.type === 'sources' && data.sources) {
                ragSources = data.sources;
                updateMessages(chatId, prev => {
                  const u = [...prev];
                  if (u[assistantMessageIndex]) {
                    u[assistantMessageIndex] = {
                      ...u[assistantMessageIndex],
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

              // Token streaming
              if (data.type === 'thinking' && data.token) {
                if (!firstTokenTime) firstTokenTime = Date.now();
                tokenCount++;
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
                if (!firstTokenTime) firstTokenTime = Date.now();
                tokenCount++;
                addTokenToBatch('content', data.token, assistantMessageIndex);
              }

              // Stream complete
              if (data.type === 'done' || data.done) {
                flushTokenBatch(assistantMessageIndex, true);
                updateIsLoading(chatId, false);
                clearActiveJob(chatId);

                // Compute token-speed metrics and stamp them on the message
                if (firstTokenTime && tokenCount > 0) {
                  const streamDurationMs = Date.now() - firstTokenTime;
                  const tokensPerSecond =
                    streamDurationMs > 0 ? (tokenCount * 1000) / streamDurationMs : 0;
                  updateMessages(chatId, prev => {
                    const u = [...prev];
                    if (u[assistantMessageIndex]) {
                      u[assistantMessageIndex] = {
                        ...u[assistantMessageIndex],
                        tokenCount,
                        streamDurationMs,
                        tokensPerSecond: Math.round(tokensPerSecond * 10) / 10,
                      };
                    }
                    return u;
                  });
                }

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
        const { content: fullResponse, thinking: fullThinking } = tokenBatchRef.current;
        resetTokenBatch();

        // Mark streaming messages as completed
        if (fullResponse || fullThinking) {
          updateMessages(chatId, prev =>
            prev.map(msg => (msg.status === 'streaming' ? { ...msg, status: 'completed' } : msg))
          );
        }

        // DB-SYNC: Reload messages from database to ensure persistence
        // Backend completeJob() runs async — give it time, then verify
        // Extended retry: 1.5s initial + 5 retries × 2s = 11.5s max total wait
        if (fullResponse || fullThinking) {
          const syncChatId = chatId;
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
                  setTimeout(() => verifyPersistence(retriesLeft - 1), 2000);
                }
                // If all retries exhausted: keep local messages as-is (don't discard)
                // The inline recovery in GET /messages will fix it on next load
              }
            } catch {
              // Non-critical — streaming content is already displayed locally
            }
          };
          setTimeout(() => verifyPersistence(5), 1500);
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
        clearActiveJob(chatId);
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
      setActiveJob,
      clearActiveJob,
      setSelectedModel,
      selectedModelRef,
      sendLockRef,
      abortControllersRef,
      activeStreamChatIdRef,
    ]
  );

  return { loadMessages, reconnectToJob, sendMessage };
}
