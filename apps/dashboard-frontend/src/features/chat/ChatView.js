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
    abortExistingStream,
    reconnectToJob,
    checkActiveJobs,
    activeJobIds,
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
      navigate('/chat', { replace: true });
      return;
    }

    let cancelled = false;
    setLoadingMessages(true);
    setMessages([]);
    setError(null);
    setIsLoading(false);

    // Register callbacks so ChatContext streaming can update our local state
    registerMessageCallback(chatId, {
      setMessages,
      setIsLoading,
      setError,
    });

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
          navigate('/chat', { replace: true });
          return;
        }

        setTitle(chatData.chat.title || '');
        setCurrentProject(chatData.project || null);
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
        navigate('/chat', { replace: true });
      }
    };

    init();

    return () => {
      cancelled = true;
      abortExistingStream(chatId);
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
    abortExistingStream,
    checkActiveJobs,
    reconnectToJob,
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
