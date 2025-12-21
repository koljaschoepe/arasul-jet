import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FiSend, FiAlertCircle, FiChevronDown, FiChevronUp, FiPlus, FiTrash2,
  FiEdit2, FiCheck, FiX, FiMessageSquare, FiDatabase
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

  // UI state
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Refs
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load all chats on mount
  useEffect(() => {
    loadChats();
  }, []);

  // Load messages when chat changes
  useEffect(() => {
    if (currentChatId) {
      loadMessages(currentChatId);
    }
  }, [currentChatId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChats = async () => {
    try {
      setLoadingChats(true);
      const response = await axios.get(`${API_BASE}/chats`);
      const chatList = response.data.chats || [];
      setChats(chatList);

      // If no chat is selected, select the first one or create a new one
      if (!currentChatId && chatList.length > 0) {
        setCurrentChatId(chatList[0].id);
      } else if (chatList.length === 0) {
        // Create first chat
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

      // Convert database messages to UI format
      const formattedMessages = msgs.map(msg => ({
        role: msg.role,
        content: msg.content,
        thinking: msg.thinking,
        hasThinking: !!msg.thinking,
        thinkingCollapsed: !!msg.thinking
      }));

      setMessages(formattedMessages);
    } catch (err) {
      console.error('Error loading messages:', err);
      setMessages([]);
    }
  };

  const createNewChat = async () => {
    try {
      const response = await axios.post(`${API_BASE}/chats`, {
        title: 'New Chat'
      });

      const newChat = response.data.chat;
      setChats(prevChats => [newChat, ...prevChats]);
      setCurrentChatId(newChat.id);
      setMessages([]);
      setInput('');
    } catch (err) {
      console.error('Error creating chat:', err);
    }
  };

  const deleteChat = async (chatId) => {
    if (!window.confirm('Are you sure you want to delete this chat?')) {
      return;
    }

    try {
      await axios.delete(`${API_BASE}/chats/${chatId}`);

      // Remove from list
      const updatedChats = chats.filter(c => c.id !== chatId);
      setChats(updatedChats);

      // If deleting current chat, switch to another
      if (currentChatId === chatId) {
        if (updatedChats.length > 0) {
          setCurrentChatId(updatedChats[0].id);
        } else {
          await createNewChat();
        }
      }
    } catch (err) {
      console.error('Error deleting chat:', err);
    }
  };

  const startEditingTitle = (chat) => {
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

      // Update in list
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

  const saveMessage = async (chatId, role, content, thinking = null) => {
    try {
      await axios.post(`${API_BASE}/chats/${chatId}/messages`, {
        role,
        content,
        thinking
      });

      // Update chat's updated_at in the list
      loadChats();
    } catch (err) {
      console.error('Error saving message:', err);
    }
  };

  const handleRAGSend = async () => {
    if (!input.trim() || isLoading || !currentChatId) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message to UI
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    // Save user message to database
    await saveMessage(currentChatId, 'user', userMessage);

    // Add empty assistant message for streaming
    const assistantMessageIndex = newMessages.length;
    setMessages([...newMessages, {
      role: 'assistant',
      content: '',
      thinking: '',
      thinkingCollapsed: false,
      hasThinking: false,
      sources: []
    }]);

    try {
      let fullResponse = '';
      let fullThinking = '';
      let ragSources = [];
      let streamError = false;
      let hasStartedResponse = false;

      const token = localStorage.getItem('arasul_token');

      const response = await fetch(`${API_BASE}/rag/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query: userMessage,
          top_k: 5
        })
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

            if (data.error) {
              streamError = true;
              setError(data.error);
              break;
            }

            // Handle sources
            if (data.type === 'sources' && data.sources) {
              ragSources = data.sources;
              setMessages(prevMessages => {
                const updated = [...prevMessages];
                updated[assistantMessageIndex] = {
                  ...updated[assistantMessageIndex],
                  sources: ragSources
                };
                return updated;
              });
            }

            // Handle thinking tokens
            if (data.type === 'thinking' && data.token) {
              fullThinking += data.token;
              setMessages(prevMessages => {
                const updated = [...prevMessages];
                updated[assistantMessageIndex] = {
                  ...updated[assistantMessageIndex],
                  thinking: fullThinking,
                  hasThinking: true,
                  thinkingCollapsed: hasStartedResponse
                };
                return updated;
              });
            }

            // Handle thinking end
            if (data.type === 'thinking_end') {
              hasStartedResponse = false;
            }

            // Handle response tokens
            if (data.type === 'response' && data.token) {
              if (!hasStartedResponse && fullThinking) {
                hasStartedResponse = true;
              }

              fullResponse += data.token;
              setMessages(prevMessages => {
                const updated = [...prevMessages];
                updated[assistantMessageIndex] = {
                  ...updated[assistantMessageIndex],
                  content: fullResponse,
                  thinkingCollapsed: hasStartedResponse && fullThinking.length > 0
                };
                return updated;
              });
            }

            if (data.type === 'done' || data.done) {
              break;
            }
          } catch (parseError) {
            console.error('Error parsing RAG SSE data:', parseError);
          }
        }

        if (streamError) break;
      }

      // Save assistant message to database
      if (fullResponse || fullThinking) {
        await saveMessage(currentChatId, 'assistant', fullResponse, fullThinking);
      }

      if (!streamError && !fullResponse && !fullThinking) {
        throw new Error('Keine Antwort vom RAG-System erhalten');
      }

    } catch (err) {
      console.error('RAG error:', err);
      let errorMessage = 'Fehler bei der RAG-Anfrage.';

      if (err.message.includes('503')) {
        errorMessage = 'RAG-Service ist nicht verfügbar. Bitte versuche es später erneut.';
      } else if (err.name === 'AbortError') {
        errorMessage = 'Zeitüberschreitung. Das RAG-System braucht zu lange für die Antwort.';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setMessages(newMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    // Use RAG if enabled
    if (useRAG) {
      return handleRAGSend();
    }

    if (!input.trim() || isLoading || !currentChatId) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message to UI
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    // Save user message to database
    await saveMessage(currentChatId, 'user', userMessage);

    // Add empty assistant message for streaming
    const assistantMessageIndex = newMessages.length;
    setMessages([...newMessages, {
      role: 'assistant',
      content: '',
      thinking: '',
      thinkingCollapsed: false,
      hasThinking: false
    }]);

    try {
      const token = localStorage.getItem('arasul_token');
      let fullResponse = '';
      let fullThinking = '';
      let streamError = false;
      let hasStartedResponse = false;

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
          stream: true
        })
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

            if (data.error) {
              streamError = true;
              setError(data.error);
              break;
            }

            if (data.type === 'thinking' && data.token) {
              fullThinking += data.token;
              setMessages(prevMessages => {
                const updated = [...prevMessages];
                updated[assistantMessageIndex] = {
                  ...updated[assistantMessageIndex],
                  thinking: fullThinking,
                  hasThinking: true,
                  thinkingCollapsed: hasStartedResponse
                };
                return updated;
              });
            }

            if (data.type === 'thinking_end') {
              hasStartedResponse = false;
            }

            if (data.type === 'response' && data.token) {
              if (!hasStartedResponse && fullThinking) {
                hasStartedResponse = true;
              }

              fullResponse += data.token;
              setMessages(prevMessages => {
                const updated = [...prevMessages];
                updated[assistantMessageIndex] = {
                  ...updated[assistantMessageIndex],
                  content: fullResponse,
                  thinkingCollapsed: hasStartedResponse && fullThinking.length > 0
                };
                return updated;
              });
            }

            if (data.done) {
              break;
            }
          } catch (parseError) {
            console.error('Error parsing SSE data:', parseError);
          }
        }

        if (streamError) break;
      }

      // Save assistant message to database
      if (fullResponse || fullThinking) {
        await saveMessage(currentChatId, 'assistant', fullResponse, fullThinking);
      }

      if (!streamError && !fullResponse && !fullThinking) {
        throw new Error('Keine Antwort vom LLM erhalten');
      }

    } catch (err) {
      console.error('Chat error:', err);
      let errorMessage = 'Fehler beim Senden der Nachricht.';

      if (err.message.includes('503')) {
        errorMessage = 'LLM-Service ist nicht verfügbar. Bitte versuche es später erneut.';
      } else if (err.name === 'AbortError') {
        errorMessage = 'Zeitüberschreitung. Das Modell braucht zu lange für die Antwort.';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setMessages(newMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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

  if (loadingChats) {
    return (
      <div className="chat-multi-container">
        <div className="chat-loading-screen">
          <div className="spinner"></div>
          <p>Loading chats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-multi-container">
      {/* Sidebar with chat list */}
      <div className="chat-sidebar">
        <button className="new-chat-button" onClick={createNewChat}>
          <FiPlus /> New Chat
        </button>

        <div className="chat-list">
          {chats.map(chat => (
            <div
              key={chat.id}
              className={`chat-item ${currentChatId === chat.id ? 'active' : ''}`}
            >
              {editingChatId === chat.id ? (
                <div className="chat-item-editing">
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && saveTitle(chat.id)}
                    autoFocus
                    className="chat-title-input"
                  />
                  <div className="chat-item-actions">
                    <button onClick={() => saveTitle(chat.id)} className="btn-icon" title="Save">
                      <FiCheck />
                    </button>
                    <button onClick={cancelEditingTitle} className="btn-icon" title="Cancel">
                      <FiX />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="chat-item-content"
                    onClick={() => setCurrentChatId(chat.id)}
                  >
                    <FiMessageSquare className="chat-item-icon" />
                    <span className="chat-item-title">{chat.title}</span>
                  </div>
                  {currentChatId === chat.id && (
                    <div className="chat-item-actions">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditingTitle(chat);
                        }}
                        className="btn-icon"
                        title="Rename"
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChat(chat.id);
                        }}
                        className="btn-icon btn-delete"
                        title="Delete"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="chat-main">
        <div className="chat-header">
          <h2 className="chat-title">
            {chats.find(c => c.id === currentChatId)?.title || 'Chat'}
          </h2>
        </div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty-state">
              <FiMessageSquare size={48} />
              <p>Start a conversation with your AI assistant</p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`chat-message ${message.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'}`}
            >
              <div className="chat-message-role">
                {message.role === 'user' ? 'You' : 'AI'}
              </div>

              {message.hasThinking && message.thinking && (
                <div className={`thinking-block ${message.thinkingCollapsed ? 'collapsed' : 'expanded'}`}>
                  <div className="thinking-header" onClick={() => toggleThinking(index)}>
                    <span className="thinking-title">💭 Thinking</span>
                    <span className="thinking-toggle">
                      {message.thinkingCollapsed ? <FiChevronDown /> : <FiChevronUp />}
                    </span>
                  </div>
                  {!message.thinkingCollapsed && (
                    <div className="thinking-content">{message.thinking}</div>
                  )}
                </div>
              )}

              {message.content && (
                <div className="chat-message-content markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}

              {/* RAG Sources */}
              {message.sources && message.sources.length > 0 && (
                <div className="rag-sources">
                  <div className="rag-sources-title">Sources</div>
                  {message.sources.map((source, sourceIndex) => (
                    <div key={sourceIndex} className="rag-source-item">
                      <div className="rag-source-name">{source.document_name}</div>
                      <div className="rag-source-preview">{source.text_preview}</div>
                      <div className="rag-source-score">Relevance: {(source.score * 100).toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="chat-message chat-message-assistant">
              <div className="chat-message-role">AI</div>
              <div className="chat-message-content">
                <div className="chat-loading">
                  <span className="chat-loading-dot"></span>
                  <span className="chat-loading-dot"></span>
                  <span className="chat-loading-dot"></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="chat-error">
            <FiAlertCircle />
            <span>{error}</span>
          </div>
        )}

        <div className="chat-input-container">
          <button
            className={`rag-toggle-button ${useRAG ? 'active' : ''}`}
            onClick={() => setUseRAG(!useRAG)}
            title={useRAG ? "RAG mode active - searches your documents" : "Enable RAG mode to search documents"}
            type="button"
          >
            <FiDatabase />
          </button>
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={useRAG ? "Ask about your documents..." : "Message AI..."}
            disabled={isLoading}
            rows={1}
          />
          <button
            className="chat-send-button"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            title="Send message (Enter)"
          >
            <FiSend />
          </button>
        </div>

        <div className="chat-info">
          Press <kbd>Enter</kbd> to send or <kbd>Shift+Enter</kbd> for new line
        </div>
      </div>
    </div>
  );
}

export default ChatMulti;
