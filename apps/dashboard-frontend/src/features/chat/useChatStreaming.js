import { useCallback } from 'react';
import useTokenBatching from '../../hooks/useTokenBatching';
import { API_BASE, getAuthHeaders } from '../../config/api';

/**
 * useChatStreaming - SSE streaming for chat messages (send + reconnect)
 *
 * Uses depsRef to break circular dependency with loadChats/loadMessages/etc.
 * The caller updates depsRef.current each render.
 */
export default function useChatStreaming({
  depsRef,
  currentChatIdRef,
  abortControllersRef,
  setMessages,
  setIsLoading,
  setError,
  setActiveJobIds,
  setMatchedSpaces,
  selectedModel,
  setSelectedModel,
}) {
  // RENDER-001: Token batching to reduce re-renders during streaming
  const { tokenBatchRef, flushTokenBatch, addTokenToBatch, resetTokenBatch } =
    useTokenBatching(setMessages);

  // Reconnect to an active job's stream
  const reconnectToJob = useCallback(
    async (jobId, targetChatId) => {
      const { loadMessages, loadChats } = depsRef.current;
      const abortController = new AbortController();
      abortControllersRef.current[targetChatId] = abortController;

      try {
        const response = await fetch(`${API_BASE}/llm/jobs/${jobId}/stream`, {
          headers: getAuthHeaders(),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.replace(/^data:\s*/, ''));
              const isCurrentChat = currentChatIdRef.current === targetChatId;

              if (data.type === 'reconnect' || data.type === 'update') {
                if (isCurrentChat) {
                  setMessages(prevMessages =>
                    prevMessages.map(msg => {
                      if (
                        msg.jobId === jobId ||
                        (msg.role === 'assistant' && msg.status === 'streaming' && !msg.jobId)
                      ) {
                        return {
                          ...msg,
                          content: data.content || msg.content || '',
                          thinking: data.thinking || msg.thinking || '',
                          hasThinking: !!(data.thinking || msg.thinking),
                          status: data.status || msg.status,
                          jobId: jobId,
                        };
                      }
                      return msg;
                    })
                  );
                }
              }

              if (data.done) {
                if (isCurrentChat) setIsLoading(false);
                setActiveJobIds(prev => {
                  const newState = { ...prev };
                  delete newState[targetChatId];
                  return newState;
                });
                if (isCurrentChat) {
                  const finalMsgs = await loadMessages(targetChatId);
                  if (currentChatIdRef.current === targetChatId) {
                    setMessages(finalMsgs);
                  }
                }
                loadChats();
              }

              if (data.error) {
                if (isCurrentChat) {
                  setError(data.error);
                  setIsLoading(false);
                }
                setActiveJobIds(prev => {
                  const newState = { ...prev };
                  delete newState[targetChatId];
                  return newState;
                });
              }
            } catch (parseError) {
              console.error('Error parsing reconnect SSE data:', parseError);
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Reconnect error:', err);
        if (currentChatIdRef.current === targetChatId) {
          setIsLoading(false);
        }
        setActiveJobIds(prev => {
          const newState = { ...prev };
          delete newState[targetChatId];
          return newState;
        });
      } finally {
        delete abortControllersRef.current[targetChatId];
      }
    },
    [
      depsRef,
      currentChatIdRef,
      abortControllersRef,
      setMessages,
      setIsLoading,
      setError,
      setActiveJobIds,
    ]
  );

  // Unified send handler for both RAG and LLM modes
  const handleSend = useCallback(
    async ({
      input,
      messages,
      currentChatId,
      useRAG,
      useThinking,
      selectedSpaces,
      matchedSpaces,
    }) => {
      const { loadMessages, loadChats, loadInstalledModels, saveMessage } = depsRef.current;

      if (!input.trim()) return;
      if (!currentChatId) return;

      const isRAG = useRAG;
      const targetChatId = currentChatId;
      const userMessage = input.trim();

      await saveMessage(targetChatId, 'user', userMessage);

      const newMessages = [...messages, { role: 'user', content: userMessage }];
      setMessages(newMessages);
      setIsLoading(true);

      let assistantMessageIndex = newMessages.length;
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: '',
          thinking: '',
          thinkingCollapsed: false,
          hasThinking: false,
          ...(isRAG ? { sources: [], sourcesCollapsed: true } : {}),
          status: 'streaming',
        },
      ]);

      const abortController = new AbortController();
      abortControllersRef.current[targetChatId] = abortController;
      resetTokenBatch();

      try {
        let streamError = false;
        let currentJobId = null;
        let ragSources = [];

        let endpoint, payload;
        if (isRAG) {
          endpoint = `${API_BASE}/rag/query`;
          payload = {
            query: userMessage,
            top_k: 5,
            thinking: useThinking,
            conversation_id: targetChatId,
            model: selectedModel || undefined,
          };
          if (selectedSpaces.length > 0) {
            payload.space_ids = selectedSpaces;
            payload.auto_routing = false;
          } else {
            payload.auto_routing = true;
          }
        } else {
          endpoint = `${API_BASE}/llm/chat`;
          payload = {
            messages: newMessages.map(m => ({ role: m.role, content: m.content })),
            temperature: 0.7,
            max_tokens: 32768,
            stream: true,
            thinking: useThinking,
            conversation_id: targetChatId,
            model: selectedModel || undefined,
          };
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.replace(/^data:\s*/, ''));

              if (data.type === 'job_started' && data.jobId) {
                currentJobId = data.jobId;
                setActiveJobIds(prev => ({ ...prev, [targetChatId]: currentJobId }));
                if (currentChatIdRef.current === targetChatId) {
                  setMessages(prevMessages => {
                    const updated = [...prevMessages];
                    if (updated[assistantMessageIndex]) {
                      updated[assistantMessageIndex] = {
                        ...updated[assistantMessageIndex],
                        jobId: currentJobId,
                      };
                    }
                    return updated;
                  });
                }
              }

              if (data.error) {
                streamError = true;
                if (currentChatIdRef.current === targetChatId) {
                  setError(data.error);
                }
                if (data.errorCode === 'MODEL_SWITCH_FAILED') {
                  loadInstalledModels();
                  if (selectedModel) setSelectedModel('');
                }
                break;
              }

              const isCurrentChat = currentChatIdRef.current === targetChatId;

              if (isRAG && data.type === 'matched_spaces' && data.spaces) {
                if (isCurrentChat) setMatchedSpaces(data.spaces);
              }

              if (isRAG && data.type === 'query_optimization') {
                if (isCurrentChat) {
                  setMessages(prevMessages => {
                    const updated = [...prevMessages];
                    if (updated[assistantMessageIndex]) {
                      updated[assistantMessageIndex] = {
                        ...updated[assistantMessageIndex],
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
                    return updated;
                  });
                }
              }

              if (isRAG && data.type === 'sources' && data.sources) {
                ragSources = data.sources;
                if (isCurrentChat) {
                  setMessages(prevMessages => {
                    const updated = [...prevMessages];
                    if (updated[assistantMessageIndex]) {
                      updated[assistantMessageIndex] = {
                        ...updated[assistantMessageIndex],
                        sources: ragSources,
                        sourcesCollapsed: ragSources.length > 0,
                        matchedSpaces: matchedSpaces,
                      };
                    }
                    return updated;
                  });
                }
              }

              if (data.type === 'context_info' && isCurrentChat) {
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  if (updated[assistantMessageIndex]) {
                    updated[assistantMessageIndex] = {
                      ...updated[assistantMessageIndex],
                      tokenBreakdown: data.tokenBreakdown,
                      contextCollapsed: true,
                    };
                  }
                  return updated;
                });
              }

              if (data.type === 'compaction' && isCurrentChat) {
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  const bannerMsg = {
                    role: 'system',
                    type: 'compaction',
                    content: '',
                    tokensBefore: data.tokensBefore,
                    tokensAfter: data.tokensAfter,
                    messagesCompacted: data.messagesCompacted,
                  };
                  updated.splice(assistantMessageIndex, 0, bannerMsg);
                  return updated;
                });
                assistantMessageIndex++;
              }

              if (data.type === 'thinking' && data.token && isCurrentChat) {
                addTokenToBatch('thinking', data.token, assistantMessageIndex);
              }

              if (data.type === 'thinking_end' && isCurrentChat) {
                flushTokenBatch(assistantMessageIndex, true);
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  if (updated[assistantMessageIndex]) {
                    updated[assistantMessageIndex] = {
                      ...updated[assistantMessageIndex],
                      thinkingCollapsed: true,
                    };
                  }
                  return updated;
                });
              }

              if (data.type === 'response' && data.token && isCurrentChat) {
                addTokenToBatch('content', data.token, assistantMessageIndex);
              }

              if (data.type === 'done' || data.done) {
                if (isCurrentChat) flushTokenBatch(assistantMessageIndex, true);
                setActiveJobIds(prev => {
                  const newState = { ...prev };
                  delete newState[targetChatId];
                  return newState;
                });
                break;
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }

          if (streamError) break;
        }

        const { content: fullResponse, thinking: fullThinking } = tokenBatchRef.current;

        if (fullResponse || fullThinking) {
          loadChats();
          if (currentChatIdRef.current === targetChatId) {
            const finalMsgs = await loadMessages(targetChatId);
            if (currentChatIdRef.current === targetChatId) {
              setMessages(finalMsgs);
            }
          }
        }

        if (!streamError && !fullResponse && !fullThinking) {
          throw new Error(
            isRAG ? 'Keine Antwort vom RAG-System erhalten' : 'Keine Antwort vom LLM erhalten'
          );
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error(`${isRAG ? 'RAG' : 'Chat'} error:`, err);
        if (currentChatIdRef.current === targetChatId) {
          setError(
            err.message ||
              (isRAG ? 'Fehler bei der RAG-Anfrage.' : 'Fehler beim Senden der Nachricht.')
          );
          setMessages(newMessages);
        }
        setActiveJobIds(prev => {
          const newState = { ...prev };
          delete newState[targetChatId];
          return newState;
        });
      } finally {
        if (currentChatIdRef.current === targetChatId) {
          setIsLoading(false);
        }
        delete abortControllersRef.current[targetChatId];
        resetTokenBatch();
      }
    },
    [
      depsRef,
      currentChatIdRef,
      abortControllersRef,
      setMessages,
      setIsLoading,
      setError,
      setActiveJobIds,
      setMatchedSpaces,
      selectedModel,
      setSelectedModel,
      tokenBatchRef,
      flushTokenBatch,
      addTokenToBatch,
      resetTokenBatch,
    ]
  );

  return { reconnectToJob, handleSend, resetTokenBatch };
}
