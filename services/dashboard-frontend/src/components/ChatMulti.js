import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  FiAlertCircle,
  FiChevronDown,
  FiX,
  FiArrowDown,
  FiSearch,
  FiCpu,
  FiArrowUp,
  FiBox,
  FiFolder,
  FiCheck,
  FiStar,
} from 'react-icons/fi';
import ChatMessage from './Chat/ChatMessage';
import ChatTabsBar from './Chat/ChatTabsBar';
import useTokenBatching from '../hooks/useTokenBatching';
import { API_BASE, getAuthHeaders } from '../config/api';
import '../chatmulti.css';

function ChatMulti() {
  // Chat list state
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [loadingChats, setLoadingChats] = useState(true);

  // Current chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [useRAG, setUseRAG] = useState(true);
  const [useThinking, setUseThinking] = useState(true);

  // Model selection
  const [selectedModel, setSelectedModel] = useState(''); // '' = default
  const [installedModels, setInstalledModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState('');
  const [loadedModel, setLoadedModel] = useState(null); // Currently loaded in RAM
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef(null);
  // P4-003: Favorite models (persisted in localStorage)
  const [favoriteModels, setFavoriteModels] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('arasul_favorite_models') || '[]');
    } catch {
      return [];
    }
  });

  // Knowledge Spaces (RAG 2.0)
  const [spaces, setSpaces] = useState([]);
  const [selectedSpaces, setSelectedSpaces] = useState([]); // empty = auto-routing
  const [showSpacesDropdown, setShowSpacesDropdown] = useState(false);
  const [matchedSpaces, setMatchedSpaces] = useState([]); // Spaces matched by auto-routing
  const spacesDropdownRef = useRef(null);

  // Background job tracking - enables tab-switch resilience
  const [activeJobIds, setActiveJobIds] = useState({}); // chatId -> jobId

  // Queue tracking - shows position in queue for pending jobs
  const [globalQueue, setGlobalQueue] = useState({ pending_count: 0, processing: null, queue: [] });

  // UI state
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Scroll control state
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Refs
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const currentChatIdRef = useRef(currentChatId); // Track current chat for streaming callbacks
  const abortControllersRef = useRef({}); // Track abort controllers per chat
  const generationRef = useRef(0); // RACE-001: Generation counter to detect chat switches during async operations

  // RENDER-001: Token batching to reduce re-renders during streaming
  const { tokenBatchRef, flushTokenBatch, addTokenToBatch, resetTokenBatch } =
    useTokenBatching(setMessages);

  // Keep ref in sync with state
  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

  // CLEANUP-001: Cleanup all abort controllers and timers on unmount
  useEffect(() => {
    return () => {
      // Abort all ongoing fetch operations
      Object.values(abortControllersRef.current).forEach(controller => {
        if (controller && typeof controller.abort === 'function') {
          controller.abort();
        }
      });
      abortControllersRef.current = {};

      // Clear batch timer if exists
      resetTokenBatch();
    };
  }, [resetTokenBatch]);

  // Load all chats on mount
  useEffect(() => {
    loadChats();
  }, []);

  // Load installed models on mount
  useEffect(() => {
    loadInstalledModels();
  }, []);

  // Close model dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = e => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) {
        setShowModelDropdown(false);
      }
      if (spacesDropdownRef.current && !spacesDropdownRef.current.contains(e.target)) {
        setShowSpacesDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load installed models from API
  const loadInstalledModels = async () => {
    try {
      const [installedRes, defaultRes, loadedRes] = await Promise.all([
        axios.get(`${API_BASE}/models/installed`),
        axios.get(`${API_BASE}/models/default`),
        axios.get(`${API_BASE}/models/loaded`).catch(() => ({ data: null })),
      ]);

      const models = installedRes.data.models || [];
      setInstalledModels(models);

      // API returns { default_model: "model-id" }
      if (defaultRes.data.default_model) {
        setDefaultModel(defaultRes.data.default_model);
      }

      // Track currently loaded model in RAM
      if (loadedRes.data?.model_id) {
        setLoadedModel(loadedRes.data.model_id);
      }
    } catch (err) {
      console.error('Error loading models:', err);
      // Non-blocking error - models will just show default
    }
  };

  // Set a model as the new default
  const setModelAsDefault = async modelId => {
    try {
      await axios.post(`${API_BASE}/models/default`, { model_id: modelId });
      setDefaultModel(modelId);
      // If "Standard" was selected, keep it as default but update the actual default model
    } catch (err) {
      console.error('Error setting default model:', err);
    }
  };

  // Load Knowledge Spaces for RAG 2.0
  const loadSpaces = async () => {
    try {
      const response = await axios.get(`${API_BASE}/spaces`);
      setSpaces(response.data.spaces || []);
    } catch (err) {
      console.error('Error loading spaces:', err);
    }
  };

  // Load spaces on mount (for RAG filtering)
  useEffect(() => {
    loadSpaces();
  }, []);

  // Toggle space selection
  const toggleSpaceSelection = spaceId => {
    setSelectedSpaces(prev => {
      if (prev.includes(spaceId)) {
        return prev.filter(id => id !== spaceId);
      } else {
        return [...prev, spaceId];
      }
    });
  };

  // Clear all space selections (use auto-routing)
  const clearSpaceSelection = () => {
    setSelectedSpaces([]);
    setShowSpacesDropdown(false);
  };

  // Load messages when chat changes and check for active jobs
  // IMPORTANT: Sequential execution to avoid race conditions
  useEffect(() => {
    if (currentChatId) {
      initializeChat(currentChatId);
    }
  }, [currentChatId]);

  // Sequential chat initialization to fix race condition
  // RACE-001: Uses generation counter to prevent stale updates from previous chats
  // RC-002 FIX: setMessages is called AFTER generation check, not inside loadMessages
  const initializeChat = async chatId => {
    // Increment generation counter - any ongoing async operations for previous chat will be ignored
    const currentGeneration = ++generationRef.current;

    // Abort any ongoing operations for the previous chat
    const previousChatId = currentChatIdRef.current;
    if (
      previousChatId &&
      previousChatId !== chatId &&
      abortControllersRef.current[previousChatId]
    ) {
      abortControllersRef.current[previousChatId].abort();
      delete abortControllersRef.current[previousChatId];
    }

    // Reset UI state
    setIsLoading(false);
    setError(null);
    setIsUserScrolling(false);

    // 1. FIRST: Load messages (now includes live content from llm_jobs)
    const msgs = await loadMessages(chatId);

    // RC-002 FIX: Check if chat changed BEFORE setting messages
    if (generationRef.current !== currentGeneration) {
      // [ChatMulti] initializeChat: chat changed during loadMessages, aborting (gen ${currentGeneration} vs ${generationRef.current})
      return;
    }

    // RC-002 FIX: Now safe to set messages - generation is still current
    setMessages(msgs);

    // 2. THEN: Check for active jobs
    const activeJob = await checkActiveJobsAsync(chatId);

    // RACE-001: Check again after async operation
    if (generationRef.current !== currentGeneration) {
      // [ChatMulti] initializeChat: chat changed during checkActiveJobs, aborting
      return;
    }

    // 3. If active job exists: reconnect to stream
    if (activeJob) {
      setIsLoading(true);
      reconnectToJob(activeJob.id, chatId);
    }
  };

  // Async version of checkActiveJobs that returns the active job
  const checkActiveJobsAsync = async chatId => {
    try {
      const response = await axios.get(`${API_BASE}/chats/${chatId}/jobs`, {
        headers: getAuthHeaders(),
      });
      const jobs = response.data.jobs || [];

      // Find first active job (streaming or pending)
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
  };

  // Smart auto-scroll
  useEffect(() => {
    if (!isUserScrolling && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isUserScrolling]);

  // Queue polling - updates queue status when there are active jobs
  useEffect(() => {
    if (Object.keys(activeJobIds).length === 0) {
      // No active jobs, clear queue state
      setGlobalQueue({ pending_count: 0, processing: null, queue: [] });
      return;
    }

    const pollQueue = async () => {
      try {
        const response = await axios.get(`${API_BASE}/llm/queue`, {
          headers: getAuthHeaders(),
        });
        setGlobalQueue(response.data);
      } catch (err) {
        console.error('Error polling queue:', err);
      }
    };

    // Initial poll
    pollQueue();

    // Poll every 2 seconds while there are active jobs
    const interval = setInterval(pollQueue, 2000);
    return () => clearInterval(interval);
  }, [activeJobIds]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleScroll = useCallback(
    e => {
      const { scrollTop, scrollHeight, clientHeight } = e.target;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isAtBottom = distanceFromBottom < 100;

      setIsUserScrolling(!isAtBottom);
      setShowScrollButton(!isAtBottom && messages.length > 0);
    },
    [messages.length]
  );

  const loadChats = async () => {
    try {
      setLoadingChats(true);
      const response = await axios.get(`${API_BASE}/chats`);
      const chatList = response.data.chats || [];
      // [ChatMulti] loadChats: loaded', chatList.length, 'chats');
      setChats(chatList);

      if (!currentChatId && chatList.length > 0) {
        // [ChatMulti] loadChats: setting currentChatId to', chatList[0].id);
        setCurrentChatId(chatList[0].id);
      } else if (chatList.length === 0) {
        // [ChatMulti] loadChats: no chats, creating new one');
        // Don't set loadingChats to false yet - createNewChat will do it
        await createNewChat();
        return; // createNewChat handles setLoadingChats(false)
      }
    } catch (err) {
      console.error('Error loading chats:', err);
    } finally {
      setLoadingChats(false);
    }
  };

  // RC-002 FIX: loadMessages no longer calls setMessages directly
  // This allows the caller to check generation counter before updating state
  const loadMessages = async chatId => {
    try {
      const response = await axios.get(`${API_BASE}/chats/${chatId}/messages`);
      const msgs = response.data.messages || [];

      const formattedMessages = msgs.map(msg => ({
        role: msg.role,
        content: msg.content || '',
        thinking: msg.thinking || '',
        hasThinking: !!(msg.thinking && msg.thinking.length > 0),
        thinkingCollapsed: true,
        sources: msg.sources || [],
        sourcesCollapsed: true,
        status: msg.status || 'completed',
        jobId: msg.job_id, // Important: track job_id for reconnection
        jobStatus: msg.job_status, // Track job status for UI
      }));

      // RC-002: Return messages without setting state - caller will set state after generation check
      return formattedMessages;
    } catch (err) {
      console.error('Error loading messages:', err);
      return [];
    }
  };

  // Note: checkActiveJobs is replaced by checkActiveJobsAsync above
  // which is called sequentially in initializeChat

  // Reconnect to an active job's stream
  // Uses job_id based message updates instead of index-based
  const reconnectToJob = async (jobId, targetChatId) => {
    // Create AbortController for this reconnection
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

            // Only update UI if still viewing the same chat
            const isCurrentChat = currentChatIdRef.current === targetChatId;

            if (data.type === 'reconnect' || data.type === 'update') {
              // Update message by job_id instead of index
              if (isCurrentChat) {
                setMessages(prevMessages => {
                  return prevMessages.map(msg => {
                    // Match by job_id OR by streaming status for assistant messages
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
                        jobId: jobId, // Ensure jobId is set
                      };
                    }
                    return msg;
                  });
                });
              }
            }

            if (data.done) {
              if (isCurrentChat) {
                setIsLoading(false);
              }
              setActiveJobIds(prev => {
                const newState = { ...prev };
                delete newState[targetChatId];
                return newState;
              });
              // Reload messages to get final state (only if still viewing this chat)
              if (isCurrentChat) {
                // RC-002 FIX: Set messages after loading since loadMessages no longer calls setMessages
                const finalMsgs = await loadMessages(targetChatId);
                if (currentChatIdRef.current === targetChatId) {
                  setMessages(finalMsgs);
                }
              }
              loadChats(); // Update message count
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
      // Ignore abort errors
      if (err.name === 'AbortError') {
        // Stream aborted for chat ${targetChatId}`);
        return;
      }
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
      // Cleanup abort controller
      delete abortControllersRef.current[targetChatId];
    }
  };

  const createNewChat = async () => {
    try {
      // Block input while creating new chat
      setLoadingChats(true);

      const response = await axios.post(`${API_BASE}/chats`, {
        title: `New Chat`,
      });

      const newChat = response.data.chat;
      // [ChatMulti] Created new chat:', newChat.id);

      setChats(prevChats => [...prevChats, newChat]);
      setCurrentChatId(newChat.id);
      setMessages([]);
      setInput('');
      setError(null);
    } catch (err) {
      console.error('Error creating chat:', err);
      setError('Fehler beim Erstellen des Chats');
    } finally {
      setLoadingChats(false);
    }
  };

  const selectChat = chatId => {
    setCurrentChatId(chatId);
  };

  const deleteChat = async (e, chatId) => {
    e.stopPropagation();

    if (chats.length <= 1) {
      return;
    }

    try {
      await axios.delete(`${API_BASE}/chats/${chatId}`);

      const updatedChats = chats.filter(c => c.id !== chatId);
      setChats(updatedChats);

      if (currentChatId === chatId) {
        setCurrentChatId(updatedChats[0]?.id || null);
      }
    } catch (err) {
      console.error('Error deleting chat:', err);
    }
  };

  const startEditingTitle = (e, chat) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingTitle(chat.title);
  };

  const saveTitle = async chatId => {
    if (!editingTitle.trim()) {
      cancelEditingTitle();
      return;
    }

    try {
      await axios.patch(`${API_BASE}/chats/${chatId}`, {
        title: editingTitle,
      });

      setChats(prevChats =>
        prevChats.map(c => (c.id === chatId ? { ...c, title: editingTitle } : c))
      );

      setEditingChatId(null);
      setEditingTitle('');
    } catch (err) {
      console.error('Error updating title:', err);
    }
  };

  const cancelEditingTitle = () => {
    setEditingChatId(null);
    setEditingTitle('');
  };

  const handleTitleKeyDown = (e, chatId) => {
    if (e.key === 'Enter') {
      saveTitle(chatId);
    } else if (e.key === 'Escape') {
      cancelEditingTitle();
    }
  };

  // Export chat to JSON or Markdown
  const exportChat = async (e, chatId, format = 'json') => {
    e.stopPropagation();
    try {
      const response = await fetch(`${API_BASE}/chats/${chatId}/export?format=${format}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `chat-${chatId}.${format === 'json' ? 'json' : 'md'}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error exporting chat:', err);
      setError('Export fehlgeschlagen');
    }
  };

  const saveMessage = async (chatId, role, content, thinking = null) => {
    try {
      await axios.post(`${API_BASE}/chats/${chatId}/messages`, {
        role,
        content,
        thinking,
      });
      loadChats();
    } catch (err) {
      console.error('Error saving message:', err);
    }
  };

  // MEDIUM-PRIORITY-FIX 3.5: Memoized toggle functions to prevent unnecessary re-renders
  const toggleThinking = useCallback(index => {
    setMessages(prevMessages => {
      const updated = [...prevMessages];
      updated[index] = {
        ...updated[index],
        thinkingCollapsed: !updated[index].thinkingCollapsed,
      };
      return updated;
    });
  }, []);

  // P4-003: Toggle favorite model
  const toggleFavorite = useCallback(modelId => {
    setFavoriteModels(prev => {
      const newFavorites = prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId];
      localStorage.setItem('arasul_favorite_models', JSON.stringify(newFavorites));
      return newFavorites;
    });
  }, []);

  const toggleSources = useCallback(index => {
    setMessages(prevMessages => {
      const updated = [...prevMessages];
      updated[index] = {
        ...updated[index],
        sourcesCollapsed: !updated[index].sourcesCollapsed,
      };
      return updated;
    });
  }, []);

  // Unified send handler for both RAG and LLM modes
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    if (!currentChatId) {
      setError('Chat nicht bereit. Bitte warte einen Moment...');
      return;
    }

    const isRAG = useRAG;
    const targetChatId = currentChatId;
    const userMessage = input.trim();
    setInput('');
    setError(null);
    setIsUserScrolling(false);

    await saveMessage(targetChatId, 'user', userMessage);

    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    const assistantMessageIndex = newMessages.length;
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
      // Build request based on mode
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
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
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

            // Track job ID for background processing
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

            // RAG-specific: matched spaces and sources
            if (isRAG && data.type === 'matched_spaces' && data.spaces) {
              if (isCurrentChat) setMatchedSpaces(data.spaces);
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

            // RENDER-001: Batched token updates
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

      // RENDER-001: Final content check from batch
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
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboardShortcuts = e => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 't') {
          e.preventDefault();
          createNewChat();
        }
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => window.removeEventListener('keydown', handleKeyboardShortcuts);
  }, [chats]);

  const hasMessages = messages.length > 0;

  return (
    <main
      className={`chat-container ${hasMessages ? 'has-messages' : 'empty-state'} ${loadingChats ? 'is-loading' : 'is-ready'}`}
      role="main"
      aria-label="AI Chat"
      aria-busy={loadingChats}
    >
      <ChatTabsBar
        chats={chats}
        currentChatId={currentChatId}
        activeJobIds={activeJobIds}
        globalQueue={globalQueue}
        editingChatId={editingChatId}
        editingTitle={editingTitle}
        tabsContainerRef={tabsContainerRef}
        onCreateNewChat={createNewChat}
        onSelectChat={selectChat}
        onStartEditingTitle={startEditingTitle}
        onEditingTitleChange={setEditingTitle}
        onTitleKeyDown={handleTitleKeyDown}
        onSaveTitle={saveTitle}
        onExportChat={exportChat}
        onDeleteChat={deleteChat}
      />

      {/* Messages Area */}
      {hasMessages && (
        <div
          className="chat-messages"
          ref={messagesContainerRef}
          onScroll={handleScroll}
          role="log"
          aria-label="Chat-Nachrichten"
          aria-live="polite"
          aria-relevant="additions"
        >
          <div className="messages-wrapper">
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id || message.jobId || `${currentChatId}-msg-${index}`}
                message={message}
                index={index}
                chatId={currentChatId}
                isLoading={isLoading}
                onToggleThinking={toggleThinking}
                onToggleSources={toggleSources}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <button
              className="scroll-bottom-btn"
              onClick={() => {
                setIsUserScrolling(false);
                scrollToBottom();
              }}
              aria-label="Zum Ende scrollen"
            >
              <FiArrowDown aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Centered Input Section */}
      <div className={`chat-input-section ${hasMessages ? 'bottom' : 'centered'}`}>
        {/* Welcome text - only when empty */}
        {!hasMessages && <div className="welcome-text">Wie kann ich dir heute helfen?</div>}

        {/* Error Display */}
        {error && (
          <div className="error-banner" role="alert">
            <FiAlertCircle aria-hidden="true" />
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Fehlermeldung schließen">
              <FiX aria-hidden="true" />
            </button>
          </div>
        )}

        {/* P2-001/P2-003: Model Capability Warnings */}
        {(() => {
          const currentModel = selectedModel
            ? installedModels.find(m => m.id === selectedModel)
            : installedModels.find(m => m.id === defaultModel);

          const showThinkWarning =
            useThinking && currentModel && currentModel.supports_thinking === false;
          const showRagWarning = useRAG && currentModel && currentModel.rag_optimized === false;

          if (showThinkWarning || showRagWarning) {
            return (
              <div className="capability-warning" role="status">
                <FiAlertCircle style={{ color: 'var(--warning-color)', flexShrink: 0 }} />
                <span>
                  {showThinkWarning && showRagWarning
                    ? `"${currentModel.name}" ist weder für Think-Mode noch RAG optimiert.`
                    : showThinkWarning
                      ? `"${currentModel.name}" unterstützt Think-Mode möglicherweise nicht optimal.`
                      : `"${currentModel.name}" ist nicht für RAG optimiert. Empfohlen: Qwen3-Modelle.`}
                </span>
              </div>
            );
          }
          return null;
        })()}

        {/* Main Input Box - Single Row */}
        <div className="input-box" role="toolbar" aria-label="Chat-Eingabe Optionen">
          {/* RAG Toggle Button */}
          <button
            className={`input-toggle rag-toggle ${useRAG ? 'active' : ''}`}
            onClick={() => setUseRAG(!useRAG)}
            aria-pressed={useRAG}
            aria-label={
              useRAG ? 'RAG deaktivieren (Dokumentensuche)' : 'RAG aktivieren (Dokumentensuche)'
            }
          >
            <FiSearch aria-hidden="true" />
            {useRAG && <span>RAG</span>}
          </button>

          {/* Space Filter (RAG 2.0) - Only shown when RAG is active */}
          {useRAG && spaces.length > 0 && (
            <div className="space-selector" ref={spacesDropdownRef}>
              <button
                className={`input-toggle space-toggle ${selectedSpaces.length > 0 ? 'active' : ''}`}
                onClick={() => setShowSpacesDropdown(!showSpacesDropdown)}
                aria-expanded={showSpacesDropdown}
                aria-haspopup="listbox"
                aria-label={
                  selectedSpaces.length > 0
                    ? `${selectedSpaces.length} Bereiche ausgewählt`
                    : 'Alle Bereiche (Auto-Routing)'
                }
              >
                <FiFolder />
                <span className="space-toggle-label">
                  {selectedSpaces.length > 0 ? `${selectedSpaces.length} Bereiche` : 'Auto'}
                </span>
                <FiChevronDown className={`dropdown-arrow ${showSpacesDropdown ? 'open' : ''}`} />
              </button>
              {showSpacesDropdown && (
                <div className="space-dropdown" role="listbox" aria-label="Bereiche auswählen">
                  <div
                    className={`space-option auto-option ${selectedSpaces.length === 0 ? 'selected' : ''}`}
                    onClick={clearSpaceSelection}
                  >
                    <FiCheck className="check-icon" />
                    <span className="space-option-name">Auto-Routing</span>
                    <span className="space-option-desc">KI wählt relevante Bereiche</span>
                  </div>
                  <div className="space-dropdown-divider" />
                  {spaces.map(space => (
                    <div
                      key={space.id}
                      className={`space-option ${selectedSpaces.includes(space.id) ? 'selected' : ''}`}
                      onClick={() => toggleSpaceSelection(space.id)}
                    >
                      <FiCheck className="check-icon" />
                      <FiFolder style={{ color: space.color }} className="space-icon" />
                      <span className="space-option-name">{space.name}</span>
                      <span className="space-option-count">{space.document_count || 0} Dok.</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Thinking Toggle Button */}
          <button
            className={`input-toggle think-toggle ${useThinking ? 'active' : ''}`}
            onClick={() => setUseThinking(!useThinking)}
            aria-pressed={useThinking}
            aria-label={useThinking ? 'Thinking-Modus deaktivieren' : 'Thinking-Modus aktivieren'}
          >
            <FiCpu aria-hidden="true" />
            {useThinking && <span>Think</span>}
          </button>

          {/* Model Selector */}
          {installedModels.length > 0 && (
            <div className="model-selector" ref={modelDropdownRef}>
              <button
                className={`input-toggle model-toggle ${selectedModel ? 'active' : ''}`}
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                aria-expanded={showModelDropdown}
                aria-haspopup="listbox"
                aria-label="Modell auswählen"
              >
                <FiBox />
                <span className="model-name-short">
                  {selectedModel
                    ? installedModels.find(m => m.id === selectedModel)?.name?.split(' ')[0] ||
                      selectedModel.split(':')[0]
                    : 'Standard'}
                </span>
                <FiChevronDown className={`dropdown-arrow ${showModelDropdown ? 'open' : ''}`} />
              </button>
              {showModelDropdown && (
                <div className="model-dropdown" role="listbox" aria-label="Modell auswählen">
                  <div
                    className={`model-option ${!selectedModel ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedModel('');
                      setShowModelDropdown(false);
                    }}
                  >
                    <span className="model-option-name">
                      <FiStar style={{ color: 'var(--primary-color)', marginRight: '4px' }} />
                      Standard
                    </span>
                    <span className="model-option-desc">
                      {defaultModel ? defaultModel.split(':')[0] : 'Automatisch'}
                    </span>
                  </div>
                  {/* P4-003: Sort models - favorites first, then by category */}
                  {[...installedModels]
                    .sort((a, b) => {
                      const aFav = favoriteModels.includes(a.id) ? 0 : 1;
                      const bFav = favoriteModels.includes(b.id) ? 0 : 1;
                      if (aFav !== bFav) return aFav - bFav;
                      return (a.performance_tier || 1) - (b.performance_tier || 1);
                    })
                    .map(model => {
                      const isAvailable =
                        model.install_status === 'available' || model.status === 'available';
                      const isDefault = model.id === defaultModel;
                      const isFavorite = favoriteModels.includes(model.id);
                      // Check if this model is currently loaded in RAM (compare by ollama_name or id)
                      const isLoaded =
                        loadedModel &&
                        (model.effective_ollama_name === loadedModel ||
                          model.id === loadedModel ||
                          loadedModel.startsWith(model.id.split(':')[0]));
                      return (
                        <div
                          key={model.id}
                          className={`model-option ${selectedModel === model.id ? 'selected' : ''} ${!isAvailable ? 'unavailable' : ''} ${isFavorite ? 'favorite' : ''}`}
                          onClick={() => {
                            if (isAvailable) {
                              setSelectedModel(model.id);
                              setShowModelDropdown(false);
                            }
                          }}
                          title={
                            !isAvailable ? model.install_error || 'Modell nicht verfügbar' : ''
                          }
                        >
                          <span className="model-option-name">
                            {/* P4-003: Favorite toggle button */}
                            <button
                              className={`favorite-btn ${isFavorite ? 'active' : ''}`}
                              onClick={e => {
                                e.stopPropagation();
                                toggleFavorite(model.id);
                              }}
                              title={
                                isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'
                              }
                            >
                              <FiStar
                                style={{
                                  color: isFavorite
                                    ? 'var(--warning-color)'
                                    : 'var(--text-disabled)',
                                }}
                              />
                            </button>
                            {model.name}
                            {isLoaded && (
                              <FiCpu
                                style={{ marginLeft: '6px', color: 'var(--text-muted)' }}
                                title="Im RAM geladen"
                              />
                            )}
                            {!isAvailable && (
                              <FiAlertCircle
                                className="model-warning-icon"
                                style={{ marginLeft: '6px', color: 'var(--danger-color)' }}
                              />
                            )}
                          </span>
                          <span className="model-option-desc">
                            {!isAvailable ? (
                              model.install_error || 'Nicht verfügbar'
                            ) : (
                              <>
                                {`${model.category} • ${model.ram_required_gb}GB RAM`}
                                {model.supports_thinking && (
                                  <span
                                    style={{ color: 'var(--primary-color)', marginLeft: '6px' }}
                                    title="Unterstützt Think-Mode"
                                  >
                                    💭
                                  </span>
                                )}
                                {model.rag_optimized && (
                                  <span
                                    style={{ color: 'var(--success-color)', marginLeft: '4px' }}
                                    title="RAG-optimiert"
                                  >
                                    📚
                                  </span>
                                )}
                                {isLoaded && (
                                  <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                                    • Aktiv
                                  </span>
                                )}
                                {!isDefault && isAvailable && (
                                  <button
                                    className="set-default-btn"
                                    onClick={e => {
                                      e.stopPropagation();
                                      setModelAsDefault(model.id);
                                    }}
                                    title="Als Standard setzen"
                                  >
                                    <FiStar /> Standard
                                  </button>
                                )}
                              </>
                            )}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* Text Input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={useRAG ? 'Frage zu Dokumenten stellen...' : 'Nachricht eingeben...'}
            disabled={isLoading || loadingChats || !currentChatId}
            aria-label={useRAG ? 'Frage zu Dokumenten eingeben' : 'Chat-Nachricht eingeben'}
            aria-describedby={isLoading ? 'chat-loading-status' : undefined}
          />
          {isLoading && (
            <span id="chat-loading-status" className="sr-only">
              Antwort wird generiert...
            </span>
          )}

          {/* Send Button */}
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isLoading || loadingChats || !currentChatId}
            aria-label="Nachricht senden"
          >
            <FiArrowUp aria-hidden="true" />
          </button>
        </div>
      </div>
    </main>
  );
}

export default ChatMulti;
