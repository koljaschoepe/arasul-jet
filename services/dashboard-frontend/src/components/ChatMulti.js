import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FiAlertCircle, FiChevronDown, FiChevronUp, FiPlus, FiX, FiArrowDown,
  FiSearch, FiBook, FiCpu, FiTrash2, FiEdit2, FiChevronRight, FiArrowUp
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

  // Background job tracking - enables tab-switch resilience
  const [activeJobIds, setActiveJobIds] = useState({}); // chatId -> jobId

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

  // Load messages when chat changes and check for active jobs
  useEffect(() => {
    if (currentChatId) {
      // Reset loading state when switching chats (checkActiveJobs will set it back if needed)
      setIsLoading(false);
      setError(null);
      loadMessages(currentChatId);
      checkActiveJobs(currentChatId);
      setIsUserScrolling(false);
    }
  }, [currentChatId]);

  // Smart auto-scroll
  useEffect(() => {
    if (!isUserScrolling && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isUserScrolling]);

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
      setChats(chatList);

      if (!currentChatId && chatList.length > 0) {
        setCurrentChatId(chatList[0].id);
      } else if (chatList.length === 0) {
        await createNewChat();
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
        content: msg.content,
        thinking: msg.thinking,
        hasThinking: !!msg.thinking,
        thinkingCollapsed: true,
        sources: msg.sources || [],
        sourcesCollapsed: true,
        status: msg.status || 'completed',
        jobId: msg.job_id
      }));

      setMessages(formattedMessages);
    } catch (err) {
      console.error('Error loading messages:', err);
      setMessages([]);
    }
  };

  // Check for active jobs when switching to a chat
  const checkActiveJobs = async (chatId) => {
    try {
      const token = localStorage.getItem('arasul_token');
      const response = await axios.get(`${API_BASE}/chats/${chatId}/jobs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const jobs = response.data.jobs || [];

      for (const job of jobs) {
        if (job.status === 'streaming' || job.status === 'pending') {
          // Found an active job - reconnect to it
          setActiveJobIds(prev => ({ ...prev, [chatId]: job.id }));
          setIsLoading(true);
          reconnectToJob(job.id, chatId);
          break; // Only handle one active job per chat
        }
      }
    } catch (err) {
      console.error('Error checking active jobs:', err);
    }
  };

  // Reconnect to an active job's stream
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
              // Update the last assistant message with current content
              if (isCurrentChat) {
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  const lastMsgIndex = updated.length - 1;
                  if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'assistant') {
                    updated[lastMsgIndex] = {
                      ...updated[lastMsgIndex],
                      content: data.content || '',
                      thinking: data.thinking || '',
                      hasThinking: !!(data.thinking),
                      status: data.status
                    };
                  }
                  return updated;
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
      const response = await axios.post(`${API_BASE}/chats`, {
        title: `New Chat`
      });

      const newChat = response.data.chat;
      setChats(prevChats => [...prevChats, newChat]);
      setCurrentChatId(newChat.id);
      setMessages([]);
      setInput('');
      setError(null);
    } catch (err) {
      console.error('Error creating chat:', err);
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
    if (!input.trim() || isLoading || !currentChatId) return;

    // Capture chat context at start - this won't change during streaming
    const targetChatId = currentChatId;
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

      const response = await fetch(`${API_BASE}/rag/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query: userMessage,
          top_k: 5,
          thinking: useThinking,
          conversation_id: targetChatId  // Required for job-based streaming
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
            }

            if (data.error) {
              streamError = true;
              // Only show error if still on same chat
              if (currentChatIdRef.current === targetChatId) {
                setError(data.error);
              }
              break;
            }

            // Only update UI if still viewing the same chat
            const isCurrentChat = currentChatIdRef.current === targetChatId;

            if (data.type === 'sources' && data.sources) {
              ragSources = data.sources;
              if (isCurrentChat) {
                setMessages(prevMessages => {
                  const updated = [...prevMessages];
                  if (updated[assistantMessageIndex]) {
                    updated[assistantMessageIndex] = {
                      ...updated[assistantMessageIndex],
                      sources: ragSources,
                      sourcesCollapsed: ragSources.length > 0
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

    if (!input.trim() || isLoading || !currentChatId) return;

    // Capture chat context at start - this won't change during streaming
    const targetChatId = currentChatId;
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
          conversation_id: targetChatId  // Required for job-based streaming
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
            }

            if (data.error) {
              streamError = true;
              // Only show error if still on same chat
              if (currentChatIdRef.current === targetChatId) {
                setError(data.error);
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
              {/* Job indicator for streaming chats */}
              {activeJobIds[chat.id] ? (
                <span className="job-indicator" title="Antwort wird generiert...">
                  <span className="pulse-dot"></span>
                </span>
              ) : (
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
                  {chats.length > 1 && (
                    <button
                      className="tab-action-btn delete"
                      onClick={(e) => deleteChat(e, chat.id)}
                      title="Loeschen"
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

          {/* Thinking Toggle Button */}
          <button
            className={`input-toggle think-toggle ${useThinking ? 'active' : ''}`}
            onClick={() => setUseThinking(!useThinking)}
            title={useThinking ? "Thinking deaktivieren" : "Thinking aktivieren"}
          >
            <FiCpu />
            {useThinking && <span>Think</span>}
          </button>

          {/* Text Input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={useRAG ? "Frage zu Dokumenten stellen..." : "Nachricht eingeben..."}
            disabled={isLoading}
          />

          {/* Send Button */}
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
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
