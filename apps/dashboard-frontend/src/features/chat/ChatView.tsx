import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowDown, X } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import {
  useChatContext,
  type ChatMessage as ChatMessageType,
  type ChatSettings,
} from '../../contexts/ChatContext';
import { useToast } from '../../contexts/ToastContext';
import ChatTopBar from './ChatTopBar';
import ChatInputArea from './ChatInputArea';
import ChatMessage from './ChatMessage';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import './chat.css';

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

  const chatId = parseInt(chatIdParam!, 10);

  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [currentProject, setCurrentProject] = useState<{ name: string; color: string } | null>(
    null
  );
  const [chatSettings, setChatSettings] = useState<ChatSettings | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const messagesLengthRef = useRef(0);
  useEffect(() => {
    messagesLengthRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (!chatId || isNaN(chatId)) {
      localStorage.removeItem('arasul_last_chat_id');
      navigate('/chat', { replace: true });
      return;
    }

    let cancelled = false;
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

    registerMessageCallback(chatId, { setMessages, setIsLoading, setError });
    clearBackgroundState(chatId);

    const init = async () => {
      try {
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

  useEffect(() => {
    if (!isUserScrolling && messages.length > 0 && !loadingMessages) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isUserScrolling, loadingMessages]);

  const scrollToBottom = useCallback(() => {
    setIsUserScrolling(false);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom < 100;
    setIsUserScrolling(!isAtBottom);
    setShowScrollButton(!isAtBottom && messagesLengthRef.current > 0);
  }, []);

  const toggleThinking = useCallback((index: number) => {
    setMessages(prev => {
      const u = [...prev];
      u[index] = { ...u[index], thinkingCollapsed: !u[index].thinkingCollapsed };
      return u;
    });
  }, []);

  const toggleSources = useCallback((index: number) => {
    setMessages(prev => {
      const u = [...prev];
      u[index] = { ...u[index], sourcesCollapsed: !u[index].sourcesCollapsed };
      return u;
    });
  }, []);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
  }, []);

  const loadMoreMessages = useCallback(async () => {
    if (loadingMore || !hasMoreMessages || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldestId = messages[0]?.id;
      if (!oldestId) return;
      const result = await loadMessages(chatId, { before: oldestId });
      if (result.messages.length > 0) {
        setMessages((prev: ChatMessageType[]) => [...result.messages, ...prev]);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
    <main className="chat-view flex flex-col h-full bg-background overflow-hidden w-full max-w-[1400px] mx-auto relative animate-[chat-fadeIn_200ms_ease-out]">
      <ChatTopBar
        chatId={chatId}
        title={title}
        onTitleChange={handleTitleChange}
        project={currentProject}
      />

      <div
        className="chat-messages flex-1 overflow-y-auto min-h-0 relative"
        ref={messagesContainerRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Chat-Nachrichten"
        aria-live="polite"
      >
        {loadingMessages ? (
          <div className="skeleton-messages flex flex-col max-w-[960px] mx-auto py-6 px-4">
            {[
              { label: true, body: 'short' },
              { label: true, body: 'long' },
              { label: true, body: 'short' },
              { label: true, body: 'medium' },
            ].map((s, i) => (
              <div
                key={i}
                className="skeleton-message flex flex-col gap-2 py-5 border-b border-border last:border-b-0"
              >
                <div className="skeleton-message-label w-8 h-3.5 bg-card rounded-md animate-[skeleton-pulse_1.5s_ease-in-out_infinite]" />
                <div
                  className={cn(
                    'skeleton-message-body bg-card rounded-xl p-4 animate-[skeleton-pulse_1.5s_ease-in-out_infinite]',
                    s.body === 'short' && 'h-10 max-w-[60%]',
                    s.body === 'medium' && 'h-20',
                    s.body === 'long' && 'h-[120px]'
                  )}
                />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty-state flex flex-col items-center justify-center flex-1 min-h-[300px] p-8">
            <h2 className="text-3xl font-normal text-muted-foreground m-0 mb-4 text-center">
              Wie kann ich dir heute helfen?
            </h2>
            {currentProject && (
              <span
                className="project-badge inline-flex items-center gap-1.5 py-1 px-3 border border-border rounded-full text-sm text-muted-foreground"
                style={{ borderColor: currentProject.color }}
              >
                <span
                  className="project-dot w-2.5 h-2.5 rounded-full"
                  style={{ background: currentProject.color }}
                />
                {currentProject.name}
              </span>
            )}
          </div>
        ) : (
          <div className="messages-wrapper max-w-[960px] mx-auto py-6 px-4 flex flex-col">
            {hasMoreMessages && (
              <Button
                variant="outline"
                size="sm"
                className="self-center mb-4"
                onClick={loadMoreMessages}
                disabled={loadingMore}
              >
                {loadingMore ? 'Laden...' : 'Ältere Nachrichten laden'}
              </Button>
            )}
            {messages.map((message: ChatMessageType, index: number) => (
              <ChatMessage
                key={message.id || message.jobId || `${chatId}-msg-${index}`}
                message={message}
                index={index}
                chatId={chatId}
                isLoading={isLoading && index === messages.length - 1}
                onToggleThinking={toggleThinking}
                onToggleSources={toggleSources}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {showScrollButton && (
          <Button
            variant="outline"
            size="icon"
            className="absolute bottom-5 right-5 rounded-full z-10 shadow-md"
            onClick={scrollToBottom}
            aria-label="Zum Ende scrollen"
          >
            <ArrowDown aria-hidden="true" />
          </Button>
        )}
      </div>

      {error && (
        <div className="mx-auto max-w-[960px] px-4 py-2">
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm flex items-center justify-between">
            <span>{error}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setError(null)}
              aria-label="Fehler schließen"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

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
