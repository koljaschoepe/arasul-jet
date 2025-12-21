import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FiSend, FiAlertCircle, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import '../chat.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

function Chat() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hallo! Ich bin dein lokaler AI-Assistent. Wie kann ich dir helfen?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [useRAG, setUseRAG] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleRAGSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message to chat
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

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
      // Get auth token
      const token = localStorage.getItem('arasul_token');

      let fullResponse = '';
      let fullThinking = '';
      let ragSources = [];
      let streamError = false;
      let hasStartedResponse = false;

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

    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message to chat
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

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
      // Get auth token
      const token = localStorage.getItem('arasul_token');

      let fullResponse = '';
      let fullThinking = '';
      let streamError = false;
      let hasStartedResponse = false;

      // Use fetch API with SSE streaming
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

            // Handle thinking tokens
            if (data.type === 'thinking' && data.token) {
              fullThinking += data.token;

              setMessages(prevMessages => {
                const updatedMessages = [...prevMessages];
                updatedMessages[assistantMessageIndex] = {
                  ...updatedMessages[assistantMessageIndex],
                  thinking: fullThinking,
                  hasThinking: true,
                  thinkingCollapsed: hasStartedResponse
                };
                return updatedMessages;
              });
            }

            // Handle thinking_end signal
            if (data.type === 'thinking_end') {
              // Thinking block is complete, next tokens will be response
              hasStartedResponse = false; // Keep thinking visible until response starts
            }

            // Handle response tokens
            if (data.type === 'response' && data.token) {
              if (!hasStartedResponse && fullThinking) {
                // First response token - collapse thinking
                hasStartedResponse = true;
              }

              fullResponse += data.token;

              setMessages(prevMessages => {
                const updatedMessages = [...prevMessages];
                updatedMessages[assistantMessageIndex] = {
                  ...updatedMessages[assistantMessageIndex],
                  content: fullResponse,
                  thinkingCollapsed: hasStartedResponse && fullThinking.length > 0
                };
                return updatedMessages;
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

      // Remove the failed messages
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
      const updatedMessages = [...prevMessages];
      updatedMessages[index] = {
        ...updatedMessages[index],
        thinkingCollapsed: !updatedMessages[index].thinkingCollapsed
      };
      return updatedMessages;
    });
  };

  return (
    <div className="container">
      <div className="chat-container">
        <div className="chat-header">
          <h2 className="chat-title">AI Chat</h2>
          <p className="chat-subtitle">Lokales LLM auf deinem Jetson AGX Orin</p>
          <div className="rag-toggle-container">
            <label className="rag-toggle-label">
              <input
                type="checkbox"
                checked={useRAG}
                onChange={(e) => setUseRAG(e.target.checked)}
                className="rag-toggle-checkbox"
              />
              <span className="rag-toggle-text">📚 RAG-Modus (Dokumentensuche)</span>
            </label>
          </div>
        </div>

        <div className="chat-messages">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`chat-message ${message.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'}`}
            >
              <div className="chat-message-role">
                {message.role === 'user' ? 'Du' : 'AI'}
              </div>

              {/* Thinking Block */}
              {message.hasThinking && message.thinking && (
                <div className={`thinking-block ${message.thinkingCollapsed ? 'collapsed' : 'expanded'}`}>
                  <div
                    className="thinking-header"
                    onClick={() => toggleThinking(index)}
                  >
                    <span className="thinking-title">
                      💭 Denkprozess
                    </span>
                    <span className="thinking-toggle">
                      {message.thinkingCollapsed ? <FiChevronDown /> : <FiChevronUp />}
                    </span>
                  </div>
                  {!message.thinkingCollapsed && (
                    <div className="thinking-content">
                      {message.thinking}
                    </div>
                  )}
                </div>
              )}

              {/* Response Content */}
              {message.content && (
                <div className="chat-message-content">
                  {message.content}
                </div>
              )}

              {/* RAG Sources */}
              {message.sources && message.sources.length > 0 && (
                <div className="rag-sources">
                  <div className="rag-sources-title">📄 Quellen:</div>
                  {message.sources.map((source, sourceIndex) => (
                    <div key={sourceIndex} className="rag-source-item">
                      <div className="rag-source-name">{source.document_name}</div>
                      <div className="rag-source-preview">{source.text_preview}</div>
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
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Schreibe eine Nachricht..."
            disabled={isLoading}
            rows={1}
            style={{
              minHeight: '24px',
              maxHeight: '120px',
              height: 'auto',
              overflow: input.split('\n').length > 3 ? 'auto' : 'hidden'
            }}
          />
          <button
            className="chat-send-button"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            title="Nachricht senden (Enter)"
          >
            <FiSend />
          </button>
        </div>

        <div className="chat-info">
          Drücke <kbd>Enter</kbd> zum Senden oder <kbd>Shift+Enter</kbd> für einen Zeilenumbruch.
        </div>
      </div>
    </div>
  );
}

export default Chat;
