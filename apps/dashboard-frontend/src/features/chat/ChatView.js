import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowDown } from 'react-icons/fi';
import { useApi } from '../../hooks/useApi';
import { useChatContext } from '../../contexts/ChatContext';
import { useToast } from '../../contexts/ToastContext';
import ChatTopBar from './ChatTopBar';
import ChatInputArea from './ChatInputArea';
import ChatMessage from './ChatMessage';
import './chatview.css';

export default function ChatView() {
  const { chatId: chatIdParam } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const toast = useToast();

  const {
    loadMessages,
    registerMessageCallback,
    unregisterMessageCallback,
    reconnectToJob,
    checkActiveJobs,
    activeJobIds,
    getBackgroundMessages,
    getBackgroundLoading,
    clearBackgroundState,
    hasActiveStream,
  } = useChatContext();

  // Parse and validate chatId
  const chatId = parseInt(chatIdParam, 10);

  // Per-chat state (registered as callbacks with ChatContext)
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Chat metadata
  const [title, setTitle] = useState('');
  const [currentProject, setCurrentProject] = useState(null);
  const [chatSettings, setChatSettings] = useState(null);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Scroll control
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Ref-mirror for messages (used by ChatInputArea via messagesRef)
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Ref for stable handleScroll
  const messagesLengthRef = useRef(0);
  useEffect(() => {
    messagesLengthRef.current = messages.length;
  }, [messages.length]);

  // Initialize chat - parallelized (Phase 1.1 + 1.2)
  useEffect(() => {
    if (!chatId || isNaN(chatId)) {
      localStorage.removeItem('arasul_last_chat_id');
      navigate('/chat', { replace: true });
      return;
    }

    let cancelled = false;

    // Apply background state immediately if stream was running while we were away
    const bgMessages = getBackgroundMessages(chatId);
    const bgLoading = getBackgroundLoading(chatId) || hasActiveStream(chatId);

    if (bgMessages && bgMessages.length > 0) {
      setMessages(bgMessages);
      setIsLoading(bgLoading);
      setLoadingMessages(false);
      setError(null);
    } else {
      setLoadingMessages(true);
      setMessages([]);
      setError(null);
      setIsLoading(bgLoading);
    }

    // Register callbacks so ChatContext streaming can update our local state
    registerMessageCallback(chatId, {
      setMessages,
      setIsLoading,
      setError,
    });

    // Clear background state now that callbacks are registered
    clearBackgroundState(chatId);

    const init = async () => {
      try {
        // Parallel: fetch chat+project metadata, messages, and active jobs
        const [chatData, msgResult, activeJob] = await Promise.all([
          api.get(`/chats/${chatId}`, { showError: false }),
          loadMessages(chatId),
          checkActiveJobs(chatId),
        ]);

        if (cancelled) return;

        if (!chatData.chat) {
          toast.error('Chat nicht gefunden');
          localStorage.removeItem('arasul_last_chat_id');
          navigate('/chat', { replace: true });
          return;
        }

        // Remember last visited chat
        localStorage.setItem('arasul_last_chat_id', String(chatId));

        setTitle(chatData.chat.title || '');
        setCurrentProject(chatData.project || null);
        setChatSettings(chatData.chat.settings || null);
        setMessages(msgResult.messages);
        setHasMoreMessages(msgResult.hasMore);
        setLoadingMessages(false);

        if (activeJob) {
          setIsLoading(true);
          reconnectToJob(activeJob.id, chatId);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error initializing chat:', err);
        toast.error('Chat konnte nicht geladen werden');
        localStorage.removeItem('arasul_last_chat_id');
        navigate('/chat', { replace: true });
      }
    };

    init();

    return () => {
      cancelled = true;
      // Only unregister callback — do NOT abort stream, it continues in background
      unregisterMessageCallback(chatId);
    };
  }, [
    chatId,
    navigate,
    api,
    toast,
    loadMessages,
    registerMessageCallback,
    unregisterMessageCallback,
    checkActiveJobs,
    reconnectToJob,
    getBackgroundMessages,
    getBackgroundLoading,
    clearBackgroundState,
    hasActiveStream,
  ]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (!isUserScrolling && messages.length > 0 && !loadingMessages) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isUserScrolling, loadingMessages]);

  const scrollToBottom = useCallback(() => {
    setIsUserScrolling(false);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleScroll = useCallback(e => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom < 100;
    setIsUserScrolling(!isAtBottom);
    setShowScrollButton(!isAtBottom && messagesLengthRef.current > 0);
  }, []);

  // Toggle callbacks for ChatMessage
  const toggleThinking = useCallback(index => {
    setMessages(prev => {
      const u = [...prev];
      u[index] = { ...u[index], thinkingCollapsed: !u[index].thinkingCollapsed };
      return u;
    });
  }, []);

  const toggleSources = useCallback(index => {
    setMessages(prev => {
      const u = [...prev];
      u[index] = { ...u[index], sourcesCollapsed: !u[index].sourcesCollapsed };
      return u;
    });
  }, []);

  const handleTitleChange = useCallback(newTitle => {
    setTitle(newTitle);
  }, []);

  // Load older messages (pagination)
  const loadMoreMessages = useCallback(async () => {
    if (loadingMore || !hasMoreMessages || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldestId = messages[0]?.id;
      if (!oldestId) return;
      const result = await loadMessages(chatId, { before: oldestId });
      if (result.messages.length > 0) {
        setMessages(prev => [...result.messages, ...prev]);
        setHasMoreMessages(result.hasMore);
      } else {
        setHasMoreMessages(false);
      }
    } catch (err) {
      console.error('Error loading more messages:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMoreMessages, messages, chatId, loadMessages]);

  // Escape key: navigate back to landing (only when not in input/textarea)
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.key !== 'Escape') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      localStorage.removeItem('arasul_last_chat_id');
      navigate('/chat');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <main className="chat-view">
      <ChatTopBar
        chatId={chatId}
        title={title}
        onTitleChange={handleTitleChange}
        project={currentProject}
      />

      {/* Messages Area */}
      <div
        className="chat-messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Chat-Nachrichten"
        aria-live="polite"
      >
        {loadingMessages ? (
          <div className="skeleton-messages">
            {[
              { label: true, body: 'short' },
              { label: true, body: 'long' },
              { label: true, body: 'short' },
              { label: true, body: 'medium' },
            ].map((s, i) => (
              <div key={i} className="skeleton-message">
                <div className="skeleton-message-label" />
                <div className={`skeleton-message-body ${s.body}`} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty-state">
            <h2>Wie kann ich dir heute helfen?</h2>
            {currentProject && (
              <span className="project-badge" style={{ borderColor: currentProject.color }}>
                <span className="project-dot" style={{ background: currentProject.color }} />
                {currentProject.name}
              </span>
            )}
          </div>
        ) : (
          <div className="messages-wrapper">
            {hasMoreMessages && (
              <button
                type="button"
                className="load-more-btn"
                onClick={loadMoreMessages}
                disabled={loadingMore}
              >
                {loadingMore ? 'Laden...' : 'Ältere Nachrichten laden'}
              </button>
            )}
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id || message.jobId || `${chatId}-msg-${index}`}
                message={message}
                index={index}
                chatId={chatId}
                isLoading={isLoading}
                onToggleThinking={toggleThinking}
                onToggleSources={toggleSources}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {showScrollButton && (
          <button
            type="button"
            className="scroll-bottom-btn"
            onClick={scrollToBottom}
            aria-label="Zum Ende scrollen"
          >
            <FiArrowDown aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Input Area */}
      <ChatInputArea
        chatId={chatId}
        chatSettings={chatSettings}
        messagesRef={messagesRef}
        hasMessages={messages.length > 0}
        isLoading={isLoading}
        error={error}
        onClearError={() => setError(null)}
        disabled={loadingMessages}
      />
    </main>
  );
}
