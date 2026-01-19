import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FiAlertCircle, FiChevronDown, FiChevronUp, FiPlus, FiX, FiArrowDown,
  FiSearch, FiBook, FiCpu, FiTrash2, FiEdit2, FiChevronRight, FiArrowUp, FiBox,
  FiFolder, FiCheck, FiDownload
} from 'react-icons/fi';
import '../chatmulti.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

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
  const [useRAG, setUseRAG] = useState(false);
  const [useThinking, setUseThinking] = useState(true);

  // Model selection
  const [selectedModel, setSelectedModel] = useState(''); // '' = default
  const [installedModels, setInstalledModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef(null);

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
  const [hoveredChatId, setHoveredChatId] = useState(null);

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

  // Keep ref in sync with state
  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

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
    const handleClickOutside = (e) => {
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
      const [installedRes, defaultRes] = await Promise.all([
        axios.get(`${API_BASE}/models/installed`),
        axios.get(`${API_BASE}/models/default`)
      ]);

      const models = installedRes.data.models || [];
      setInstalledModels(models);

      // FIX: API returns { default_model: "model-id" }, not { model: { id: "..." } }
      if (defaultRes.data.default_model) {
        setDefaultModel(defaultRes.data.default_model);
      }
    } catch (err) {
      console.error('Error loading models:', err);
      // Non-blocking error - models will just show default
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
  const toggleSpaceSelection = (spaceId) => {
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
  const initializeChat = async (chatId) => {
    // Reset UI state
    setIsLoading(false);
    setError(null);
    setIsUserScrolling(false);

    // 1. FIRST: Load messages (now includes live content from llm_jobs)
    await loadMessages(chatId);

    // 2. THEN: Check for active jobs
    const activeJob = await checkActiveJobsAsync(chatId);

    // 3. If active job exists: reconnect to stream
    if (activeJob) {
      setIsLoading(true);
      reconnectToJob(activeJob.id, chatId);
    }
  };

  // Async version of checkActiveJobs that returns the active job
  const checkActiveJobsAsync = async (chatId) => {
    try {
      const token = localStorage.getItem('arasul_token');
      const response = await axios.get(`${API_BASE}/chats/${chatId}/jobs`, {
        headers: { 'Authorization': `Bearer ${token}` }
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
        const token = localStorage.getItem('arasul_token');
        const response = await axios.get(`${API_BASE}/llm/queue`, {
          headers: { 'Authorization': `Bearer ${token}` }
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

  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom < 100;

    setIsUserScrolling(!isAtBottom);
    setShowScrollButton(!isAtBottom && messages.length > 0);
  }, [messages.length]);

  const loadChats = async () => {
    try {
      setLoadingChats(true);
      const response = await axios.get(`${API_BASE}/chats`);
      const chatList = response.data.chats || [];
      console.log('[ChatMulti] loadChats: loaded', chatList.length, 'chats');
      setChats(chatList);

      if (!currentChatId && chatList.length > 0) {
        console.log('[ChatMulti] loadChats: setting currentChatId to', chatList[0].id);
        setCurrentChatId(chatList[0].id);
      } else if (chatList.length === 0) {
        console.log('[ChatMulti] loadChats: no chats, creating new one');
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

  const loadMessages = async (chatId) => {
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
        jobId: msg.job_id,  // Important: track job_id for reconnection
        jobStatus: msg.job_status  // Track job status for UI
      }));

      setMessages(formattedMessages);
      return formattedMessages;
    } catch (err) {
      console.error('Error loading messages:', err);
      setMessages([]);
      return [];
    }
  };

  // Note: checkActiveJobs is replaced by checkActiveJobsAsync above
  // which is called sequentially in initializeChat

  // Reconnect to an active job's stream
  // Uses job_id based message updates instead of index-based
  const reconnectToJob = async (jobId, targetChatId) => {
    const token = localStorage.getItem('arasul_token');

    // Create AbortController for this reconnection
    const abortController = new AbortController();
    abortControllersRef.current[targetChatId] = abortController;

    try {
      const response = await fetch(`${API_BASE}/llm/jobs/${jobId}/stream`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: abortController.signal
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
                    if (msg.jobId === jobId ||
                        (msg.role === 'assistant' && msg.status === 'streaming' && !msg.jobId)) {
                      return {
                        ...msg,
                        content: data.content || msg.content || '',
                        thinking: data.thinking || msg.thinking || '',
                        hasThinking: !!(data.thinking || msg.thinking),
                        status: data.status || msg.status,
                        jobId: jobId  // Ensure jobId is set
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
                loadMessages(targetChatId);
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
        console.log(`Reconnect stream aborted for chat ${targetChatId}`);
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
        title: `New Chat`
      });

      const newChat = response.data.chat;
      console.log('[ChatMulti] Created new chat:', newChat.id);

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

  const selectChat = (chatId) => {
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

  const saveTitle = async (chatId) => {
    if (!editingTitle.trim()) {
      cancelEditingTitle();
      return;
    }

    try {
      await axios.patch(`${API_BASE}/chats/${chatId}`, {
        title: editingTitle
      });

      setChats(prevChats =>
        prevChats.map(c => c.id === chatId ? { ...c, title: editingTitle } : c)
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
      const token = localStorage.getItem('arasul_token');
      const response = await fetch(`${API_BASE}/chats/${chatId}/export?format=${format}`, {
        headers: { 'Authorization': `Bearer ${token}` }
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
        thinking
      });
      loadChats();
    } catch (err) {
      console.error('Error saving message:', err);
    }
  };

  const toggleThinking = (index) => {
    setMessages(prevMessages => {
      const updated = [...prevMessages];
      updated[index] = {
        ...updated[index],
        thinkingCollapsed: !updated[index].thinkingCollapsed
      };
      return updated;
    });
  };

  const toggleSources = (index) => {
    setMessages(prevMessages => {
      const updated = [...prevMessages];
      updated[index] = {
        ...updated[index],
        sourcesCollapsed: !updated[index].sourcesCollapsed
      };
      return updated;
    });
  };

  const handleRAGSend = async () => {
    // Validate required fields
    if (!input.trim() || isLoading) return;

    // CRITICAL: Ensure currentChatId is valid before proceeding
    if (!currentChatId || currentChatId === null || currentChatId === undefined) {
      console.error('Cannot send RAG message: currentChatId is invalid:', currentChatId);
      setError('Chat nicht bereit. Bitte warte einen Moment...');
      return;
    }

    // Capture chat context at start - this won't change during streaming
    const targetChatId = currentChatId;
    console.log('[ChatMulti] handleRAGSend: targetChatId =', targetChatId, 'type:', typeof targetChatId);
    const userMessage = input.trim();
    setInput('');
    setError(null);
    setIsUserScrolling(false);

    // Save user message first
    await saveMessage(targetChatId, 'user', userMessage);

    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    const assistantMessageIndex = newMessages.length;
    setMessages([...newMessages, {
      role: 'assistant',
      content: '',
      thinking: '',
      thinkingCollapsed: false,
      hasThinking: false,
      sources: [],
      sourcesCollapsed: true,
      status: 'streaming'
    }]);

    // Create AbortController for this stream
    const abortController = new AbortController();
    abortControllersRef.current[targetChatId] = abortController;

    try {
      let fullResponse = '';
      let fullThinking = '';
      let ragSources = [];
      let streamError = false;
      let currentJobId = null;

      const token = localStorage.getItem('arasul_token');

      // RAG 2.0: Include space_ids for filtered search
      const ragPayload = {
        query: userMessage,
        top_k: 5,
        thinking: useThinking,
        conversation_id: targetChatId  // Required for job-based streaming
      };

      // If specific spaces are selected, include them; otherwise auto-routing is used
      if (selectedSpaces.length > 0) {
        ragPayload.space_ids = selectedSpaces;
        ragPayload.auto_routing = false;
      } else {
        ragPayload.auto_routing = true;
      }

      const response = await fetch(`${API_BASE}/rag/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(ragPayload),
        signal: abortController.signal
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
              // Update the assistant message with jobId for reconnection
              if (currentChatIdRef.current === targetChatId) {
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  if (updated[assistantMessageIndex]) {
                    updated[assistantMessageIndex] = {
                      ...updated[assistantMessageIndex],
                      jobId: currentJobId
                    };
                  }
                  return updated;
                });
              }
            }

            if (data.error) {
              streamError = true;
              // Only show error if still on same chat
              if (currentChatIdRef.current === targetChatId) {
                setError(data.error);
              }
              // Refresh models list if model switch failed (model might have been removed from Ollama)
              if (data.errorCode === 'MODEL_SWITCH_FAILED') {
                loadInstalledModels();
                // Reset to default model if selected model is no longer available
                if (selectedModel) {
                  setSelectedModel('');
                }
              }
              break;
            }

            // Only update UI if still viewing the same chat
            const isCurrentChat = currentChatIdRef.current === targetChatId;

            // RAG 2.0: Handle matched_spaces event
            if (data.type === 'matched_spaces' && data.spaces) {
              if (isCurrentChat) {
                setMatchedSpaces(data.spaces);
              }
            }

            if (data.type === 'sources' && data.sources) {
              ragSources = data.sources;
              if (isCurrentChat) {
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  if (updated[assistantMessageIndex]) {
                    updated[assistantMessageIndex] = {
                      ...updated[assistantMessageIndex],
                      sources: ragSources,
                      sourcesCollapsed: ragSources.length > 0,
                      matchedSpaces: matchedSpaces  // Include matched spaces in message
                    };
                  }
                  return updated;
                });
              }
            }

            if (data.type === 'thinking' && data.token) {
              fullThinking += data.token;
              if (isCurrentChat) {
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  if (updated[assistantMessageIndex]) {
                    updated[assistantMessageIndex] = {
                      ...updated[assistantMessageIndex],
                      thinking: fullThinking,
                      hasThinking: true
                    };
                  }
                  return updated;
                });
              }
            }

            if (data.type === 'thinking_end') {
              if (isCurrentChat) {
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  if (updated[assistantMessageIndex]) {
                    updated[assistantMessageIndex] = {
                      ...updated[assistantMessageIndex],
                      thinkingCollapsed: true
                    };
                  }
                  return updated;
                });
              }
            }

            if (data.type === 'response' && data.token) {
              fullResponse += data.token;
              if (isCurrentChat) {
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  if (updated[assistantMessageIndex]) {
                    updated[assistantMessageIndex] = {
                      ...updated[assistantMessageIndex],
                      content: fullResponse
                    };
                  }
                  return updated;
                });
              }
            }

            if (data.type === 'done' || data.done) {
              // Clear active job
              setActiveJobIds(prev => {
                const newState = { ...prev };
                delete newState[targetChatId];
                return newState;
              });
              break;
            }
          } catch (parseError) {
            console.error('Error parsing RAG SSE data:', parseError);
          }
        }

        if (streamError) break;
      }

      // Backend saves message automatically - just reload for UI sync
      if (fullResponse || fullThinking) {
        loadChats(); // Update message count
        // If user switched back to this chat, reload messages to show final state
        if (currentChatIdRef.current === targetChatId) {
          loadMessages(targetChatId);
        }
      }

      if (!streamError && !fullResponse && !fullThinking) {
        throw new Error('Keine Antwort vom RAG-System erhalten');
      }

    } catch (err) {
      // Ignore abort errors (user switched chat)
      if (err.name === 'AbortError') {
        console.log(`RAG stream aborted for chat ${targetChatId} - user switched chat`);
        return;
      }
      console.error('RAG error:', err);
      if (currentChatIdRef.current === targetChatId) {
        setError(err.message || 'Fehler bei der RAG-Anfrage.');
        setMessages(newMessages);
      }
      setActiveJobIds(prev => {
        const newState = { ...prev };
        delete newState[targetChatId];
        return newState;
      });
    } finally {
      // Only reset loading if still on same chat
      if (currentChatIdRef.current === targetChatId) {
        setIsLoading(false);
      }
      // Cleanup abort controller
      delete abortControllersRef.current[targetChatId];
    }
  };

  const handleSend = async () => {
    if (useRAG) {
      return handleRAGSend();
    }

    // Validate required fields
    if (!input.trim() || isLoading) return;

    // CRITICAL: Ensure currentChatId is valid before proceeding
    if (!currentChatId || currentChatId === null || currentChatId === undefined) {
      console.error('Cannot send message: currentChatId is invalid:', currentChatId);
      setError('Chat nicht bereit. Bitte warte einen Moment...');
      return;
    }

    // Capture chat context at start - this won't change during streaming
    const targetChatId = currentChatId;
    console.log('[ChatMulti] handleSend: targetChatId =', targetChatId, 'type:', typeof targetChatId);
    const userMessage = input.trim();
    setInput('');
    setError(null);
    setIsUserScrolling(false);

    // Save user message first
    await saveMessage(targetChatId, 'user', userMessage);

    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    const assistantMessageIndex = newMessages.length;
    setMessages([...newMessages, {
      role: 'assistant',
      content: '',
      thinking: '',
      thinkingCollapsed: false,
      hasThinking: false,
      status: 'streaming'
    }]);

    // Create AbortController for this stream
    const abortController = new AbortController();
    abortControllersRef.current[targetChatId] = abortController;

    try {
      const token = localStorage.getItem('arasul_token');
      let fullResponse = '';
      let fullThinking = '';
      let streamError = false;
      let currentJobId = null;

      const response = await fetch(`${API_BASE}/llm/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          temperature: 0.7,
          max_tokens: 32768,
          stream: true,
          thinking: useThinking,
          conversation_id: targetChatId,  // Required for job-based streaming
          model: selectedModel || undefined  // Optional: explicit model selection
        }),
        signal: abortController.signal
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
              // Update the assistant message with jobId for reconnection
              if (currentChatIdRef.current === targetChatId) {
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  if (updated[assistantMessageIndex]) {
                    updated[assistantMessageIndex] = {
                      ...updated[assistantMessageIndex],
                      jobId: currentJobId
                    };
                  }
                  return updated;
                });
              }
            }

            if (data.error) {
              streamError = true;
              // Only show error if still on same chat
              if (currentChatIdRef.current === targetChatId) {
                setError(data.error);
              }
              // Refresh models list if model switch failed (model might have been removed from Ollama)
              if (data.errorCode === 'MODEL_SWITCH_FAILED') {
                loadInstalledModels();
                // Reset to default model if selected model is no longer available
                if (selectedModel) {
                  setSelectedModel('');
                }
              }
              break;
            }

            // Only update UI if still viewing the same chat
            const isCurrentChat = currentChatIdRef.current === targetChatId;

            if (data.type === 'thinking' && data.token) {
              fullThinking += data.token;
              if (isCurrentChat) {
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  if (updated[assistantMessageIndex]) {
                    updated[assistantMessageIndex] = {
                      ...updated[assistantMessageIndex],
                      thinking: fullThinking,
                      hasThinking: true
                    };
                  }
                  return updated;
                });
              }
            }

            if (data.type === 'thinking_end') {
              if (isCurrentChat) {
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  if (updated[assistantMessageIndex]) {
                    updated[assistantMessageIndex] = {
                      ...updated[assistantMessageIndex],
                      thinkingCollapsed: true
                    };
                  }
                  return updated;
                });
              }
            }

            if (data.type === 'response' && data.token) {
              fullResponse += data.token;
              if (isCurrentChat) {
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  if (updated[assistantMessageIndex]) {
                    updated[assistantMessageIndex] = {
                      ...updated[assistantMessageIndex],
                      content: fullResponse
                    };
                  }
                  return updated;
                });
              }
            }

            if (data.done) {
              // Clear active job
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

      // Backend saves message automatically - just reload for UI sync
      if (fullResponse || fullThinking) {
        loadChats(); // Update message count
        // If user switched back to this chat, reload messages to show final state
        if (currentChatIdRef.current === targetChatId) {
          loadMessages(targetChatId);
        }
      }

      if (!streamError && !fullResponse && !fullThinking) {
        throw new Error('Keine Antwort vom LLM erhalten');
      }

    } catch (err) {
      // Ignore abort errors (user switched chat)
      if (err.name === 'AbortError') {
        console.log(`Stream aborted for chat ${targetChatId} - user switched chat`);
        return;
      }
      console.error('Chat error:', err);
      if (currentChatIdRef.current === targetChatId) {
        setError(err.message || 'Fehler beim Senden der Nachricht.');
        setMessages(newMessages);
      }
      setActiveJobIds(prev => {
        const newState = { ...prev };
        delete newState[targetChatId];
        return newState;
      });
    } finally {
      // Only reset loading if still on same chat
      if (currentChatIdRef.current === targetChatId) {
        setIsLoading(false);
      }
      // Cleanup abort controller
      delete abortControllersRef.current[targetChatId];
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboardShortcuts = (e) => {
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

  if (loadingChats) {
    return (
      <div className="chat-container">
        <div className="chat-loading">
          <div className="loading-spinner"></div>
          <p>Laden...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-container ${hasMessages ? 'has-messages' : 'empty-state'}`}>
      {/* Top Chat Tabs Bar */}
      <div className="chat-tabs-bar">
        {/* New Chat Button */}
        <button
          className="new-chat-tab-btn"
          onClick={createNewChat}
          title="Neuer Chat (Ctrl+T)"
        >
          <FiPlus />
        </button>

        {/* Chat Tabs */}
        <div className="chat-tabs" ref={tabsContainerRef}>
          {chats.map(chat => (
            <div
              key={chat.id}
              className={`chat-tab ${currentChatId === chat.id ? 'active' : ''} ${activeJobIds[chat.id] ? 'has-active-job' : ''}`}
              onClick={() => selectChat(chat.id)}
              onMouseEnter={() => setHoveredChatId(chat.id)}
              onMouseLeave={() => setHoveredChatId(null)}
            >
              {/* Job indicator for streaming/queued chats */}
              {activeJobIds[chat.id] ? (() => {
                const jobId = activeJobIds[chat.id];
                const isProcessing = globalQueue.processing?.id === jobId;
                const queueJob = globalQueue.queue?.find(q => q.id === jobId);
                const queuePosition = queueJob?.queue_position;

                return (
                  <span
                    className="job-indicator"
                    title={isProcessing ? "Wird verarbeitet..." : queuePosition > 1 ? `Position ${queuePosition} in der Warteschlange` : "Wartet..."}
                  >
                    <span className={`pulse-dot ${isProcessing ? 'active' : 'queued'}`}></span>
                    {!isProcessing && queuePosition > 1 && (
                      <span className="queue-position">#{queuePosition}</span>
                    )}
                  </span>
                );
              })() : (
                <FiChevronRight className="tab-icon" />
              )}
              {editingChatId === chat.id ? (
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => handleTitleKeyDown(e, chat.id)}
                  onBlur={() => saveTitle(chat.id)}
                  autoFocus
                  className="tab-title-input"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="tab-title">{chat.title}</span>
              )}
              {/* Show actions on hover or if active */}
              {(hoveredChatId === chat.id || currentChatId === chat.id) && editingChatId !== chat.id && (
                <div className="tab-actions">
                  <button
                    className="tab-action-btn"
                    onClick={(e) => startEditingTitle(e, chat)}
                    title="Umbenennen"
                  >
                    <FiEdit2 />
                  </button>
                  <button
                    className="tab-action-btn export"
                    onClick={(e) => exportChat(e, chat.id, 'markdown')}
                    title="Als Markdown exportieren"
                  >
                    <FiDownload />
                  </button>
                  {chats.length > 1 && (
                    <button
                      className="tab-action-btn delete"
                      onClick={(e) => deleteChat(e, chat.id)}
                      title="Löschen"
                    >
                      <FiTrash2 />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Messages Area */}
      {hasMessages && (
        <div
          className="chat-messages"
          ref={messagesContainerRef}
          onScroll={handleScroll}
        >
          <div className="messages-wrapper">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`message ${message.role === 'user' ? 'user' : 'assistant'}`}
              >
                <div className="message-label">
                  {message.role === 'user' ? 'Du' : 'AI'}
                </div>

                {/* Thinking Block */}
                {message.hasThinking && message.thinking && (
                  <div className={`thinking-block ${message.thinkingCollapsed ? 'collapsed' : ''}`}>
                    <div
                      className="thinking-header"
                      onClick={() => toggleThinking(index)}
                    >
                      <FiCpu className="thinking-icon" />
                      <span>Gedankengang</span>
                      {message.thinkingCollapsed ? <FiChevronDown /> : <FiChevronUp />}
                    </div>
                    {!message.thinkingCollapsed && (
                      <div className="thinking-content">
                        {message.thinking}
                      </div>
                    )}
                  </div>
                )}

                {/* Message Content */}
                {message.content && (
                  <div className="message-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}

                {/* Loading indicator */}
                {message.role === 'assistant' && !message.content && !message.thinking && isLoading && (
                  <div className="message-loading">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                )}

                {/* Sources Block - at the bottom, collapsible like thinking */}
                {message.sources && message.sources.length > 0 && (
                  <div className={`sources-block ${message.sourcesCollapsed ? 'collapsed' : ''}`}>
                    <div
                      className="sources-header"
                      onClick={() => toggleSources(index)}
                    >
                      <FiBook className="sources-icon" />
                      <span>Quellen ({message.sources.length})</span>
                      {message.sourcesCollapsed ? <FiChevronDown /> : <FiChevronUp />}
                    </div>
                    {!message.sourcesCollapsed && (
                      <div className="sources-content">
                        {message.sources.map((source, sourceIndex) => (
                          <div key={sourceIndex} className="source-item">
                            <div className="source-name">{source.document_name}</div>
                            <div className="source-preview">{source.text_preview}</div>
                            <div className="source-score">
                              Relevanz: {(source.score * 100).toFixed(0)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
            >
              <FiArrowDown />
            </button>
          )}
        </div>
      )}

      {/* Centered Input Section */}
      <div className={`chat-input-section ${hasMessages ? 'bottom' : 'centered'}`}>
        {/* Welcome text - only when empty */}
        {!hasMessages && (
          <div className="welcome-text">
            Wie kann ich dir heute helfen?
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="error-banner">
            <FiAlertCircle />
            <span>{error}</span>
            <button onClick={() => setError(null)}><FiX /></button>
          </div>
        )}

        {/* Main Input Box - Single Row */}
        <div className="input-box">
          {/* RAG Toggle Button */}
          <button
            className={`input-toggle rag-toggle ${useRAG ? 'active' : ''}`}
            onClick={() => setUseRAG(!useRAG)}
            title={useRAG ? "RAG deaktivieren" : "RAG aktivieren"}
          >
            <FiSearch />
            {useRAG && <span>RAG</span>}
          </button>

          {/* Space Filter (RAG 2.0) - Only shown when RAG is active */}
          {useRAG && spaces.length > 0 && (
            <div className="space-selector" ref={spacesDropdownRef}>
              <button
                className={`input-toggle space-toggle ${selectedSpaces.length > 0 ? 'active' : ''}`}
                onClick={() => setShowSpacesDropdown(!showSpacesDropdown)}
                title={selectedSpaces.length > 0 ? `${selectedSpaces.length} Bereiche ausgewählt` : "Alle Bereiche (Auto-Routing)"}
              >
                <FiFolder />
                <span className="space-toggle-label">
                  {selectedSpaces.length > 0 ? `${selectedSpaces.length} Bereiche` : 'Auto'}
                </span>
                <FiChevronDown className={`dropdown-arrow ${showSpacesDropdown ? 'open' : ''}`} />
              </button>
              {showSpacesDropdown && (
                <div className="space-dropdown">
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
            title={useThinking ? "Thinking deaktivieren" : "Thinking aktivieren"}
          >
            <FiCpu />
            {useThinking && <span>Think</span>}
          </button>

          {/* Model Selector */}
          {installedModels.length > 0 && (
            <div className="model-selector" ref={modelDropdownRef}>
              <button
                className={`input-toggle model-toggle ${selectedModel ? 'active' : ''}`}
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                title="Modell auswählen"
              >
                <FiBox />
                <span className="model-name-short">
                  {selectedModel
                    ? installedModels.find(m => m.id === selectedModel)?.name?.split(' ')[0] || selectedModel.split(':')[0]
                    : 'Standard'}
                </span>
                <FiChevronDown className={`dropdown-arrow ${showModelDropdown ? 'open' : ''}`} />
              </button>
              {showModelDropdown && (
                <div className="model-dropdown">
                  <div
                    className={`model-option ${!selectedModel ? 'selected' : ''}`}
                    onClick={() => { setSelectedModel(''); setShowModelDropdown(false); }}
                  >
                    <span className="model-option-name">Standard</span>
                    <span className="model-option-desc">{defaultModel ? defaultModel.split(':')[0] : 'Automatisch'}</span>
                  </div>
                  {installedModels.map(model => {
                    const isAvailable = model.install_status === 'available' || model.status === 'available';
                    return (
                      <div
                        key={model.id}
                        className={`model-option ${selectedModel === model.id ? 'selected' : ''} ${!isAvailable ? 'unavailable' : ''}`}
                        onClick={() => {
                          if (isAvailable) {
                            setSelectedModel(model.id);
                            setShowModelDropdown(false);
                          }
                        }}
                        title={!isAvailable ? (model.install_error || 'Modell nicht verfügbar') : ''}
                      >
                        <span className="model-option-name">
                          {model.name}
                          {!isAvailable && <FiAlertCircle className="model-warning-icon" style={{ marginLeft: '6px', color: '#EF4444' }} />}
                        </span>
                        <span className="model-option-desc">
                          {!isAvailable ? (model.install_error || 'Nicht verfügbar') : `${model.category} • ${model.ram_required_gb}GB RAM`}
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
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={useRAG ? "Frage zu Dokumenten stellen..." : "Nachricht eingeben..."}
            disabled={isLoading || loadingChats || !currentChatId}
          />

          {/* Send Button */}
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isLoading || loadingChats || !currentChatId}
            title="Senden (Enter)"
          >
            <FiArrowUp />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatMulti;
