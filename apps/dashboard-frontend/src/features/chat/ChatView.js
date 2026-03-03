import { useState, useEffect, useRef, useCallback } from 'react';
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

  // Scroll control
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Initialize chat
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
        // Load chat metadata
        const chatsData = await api.get(`/chats?project_id=`, { showError: false });
        const chat = (chatsData.chats || []).find(c => c.id === chatId);

        if (cancelled) return;

        if (!chat) {
          toast.error('Chat nicht gefunden');
          navigate('/chat', { replace: true });
          return;
        }

        setTitle(chat.title || '');

        // Load project info if available
        if (chat.project_id) {
          try {
            const projData = await api.get(`/projects/${chat.project_id}`, { showError: false });
            if (!cancelled) setCurrentProject(projData.project || null);
          } catch {
            // Project load is non-critical
          }
        }

        // Load messages
        const msgs = await loadMessages(chatId);
        if (cancelled) return;
        setMessages(msgs);
        setLoadingMessages(false);

        // Check for active/pending jobs and reconnect
        const activeJob = await checkActiveJobs(chatId);
        if (cancelled) return;
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

  const toggleQueryOpt = useCallback(index => {
    setMessages(prev => {
      const u = [...prev];
      u[index] = { ...u[index], queryOptCollapsed: !u[index].queryOptCollapsed };
      return u;
    });
  }, []);

  const toggleContext = useCallback(index => {
    setMessages(prev => {
      const u = [...prev];
      u[index] = { ...u[index], contextCollapsed: !u[index].contextCollapsed };
      return u;
    });
  }, []);

  const handleTitleChange = useCallback(newTitle => {
    setTitle(newTitle);
  }, []);

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
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id || message.jobId || `${chatId}-msg-${index}`}
                message={message}
                index={index}
                chatId={chatId}
                isLoading={isLoading}
                onToggleThinking={toggleThinking}
                onToggleSources={toggleSources}
                onToggleQueryOpt={toggleQueryOpt}
                onToggleContext={toggleContext}
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
        messages={messages}
        isLoading={isLoading}
        error={error}
        onClearError={() => setError(null)}
        disabled={loadingMessages}
      />
    </main>
  );
}
