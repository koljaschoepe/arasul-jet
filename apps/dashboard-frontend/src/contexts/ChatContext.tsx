/**
 * ChatContext - Global Chat State Management
 *
 * Composes per-domain hooks at app level (state survives all navigation):
 *   - useJobQueue        — active jobs, queue polling, abort/cancel
 *   - useChatModels      — installed models, default, favorites, current selection
 *   - useChatSpaces      — RAG knowledge spaces
 *   - useChatCallbacks   — per-chat callback registry + background message accumulation
 *   - useChatStreaming   — SSE streaming (sendMessage, reconnectToJob, loadMessages)
 *
 * Mounted at App level — streams persist across route changes.
 * When ChatView unmounts, tokens accumulate in background. When ChatView
 * remounts, it picks up accumulated state instantly.
 */

import { createContext, useContext, useCallback, useMemo, useRef, type ReactNode } from 'react';
import useJobQueue from './chat/useJobQueue';
import useChatModels from './chat/useChatModels';
import useChatSpaces from './chat/useChatSpaces';
import useChatCallbacks from './chat/useChatCallbacks';
import useChatStreaming from './chat/useChatStreaming';
import type { ChatContextValue } from './chat/types';

export type {
  ChatMessage,
  ChatSettings,
  SendMessageOptions,
  LoadMessagesOptions,
  LoadMessagesResult,
} from './chat/types';

interface ChatProviderProps {
  children: ReactNode;
  isAuthenticated: boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children, isAuthenticated }: ChatProviderProps) {
  // Shared between job-queue (writer) and callbacks (reader): tracks which
  // chat owns the active stream so background tokens get routed correctly.
  const activeStreamChatIdRef = useRef<string | null>(null);

  // Callbacks: per-chat registry + background message accumulation
  const callbacks = useChatCallbacks({ isAuthenticated, activeStreamChatIdRef });

  // Jobs: activeJobIds, abortControllers, queue polling, mutex/lock refs
  const jobs = useJobQueue({
    isAuthenticated,
    activeStreamChatIdRef,
    onCancelLoading: useCallback(
      (chatId: string) => callbacks.updateIsLoading(chatId, false),
      [callbacks]
    ),
  });

  // Models & Spaces
  const models = useChatModels({ isAuthenticated });
  const spaces = useChatSpaces({ isAuthenticated });

  // Streaming: plug callbacks + job refs + model refs together
  const streaming = useChatStreaming({
    isAuthenticated,
    abortControllersRef: jobs.abortControllersRef,
    reconnectMutexRef: jobs.reconnectMutexRef,
    sendLockRef: jobs.sendLockRef,
    activeStreamChatIdRef,
    abortExistingStream: jobs.abortExistingStream,
    setActiveJob: jobs.setActiveJob,
    clearActiveJob: jobs.clearActiveJob,
    routedSetMessages: callbacks.routedSetMessages,
    updateMessages: callbacks.updateMessages,
    updateIsLoading: callbacks.updateIsLoading,
    updateError: callbacks.updateError,
    selectedModelRef: models.selectedModelRef,
    setSelectedModel: models.setSelectedModel,
    loadModels: models.loadModels,
  });

  // FH2: Full cleanup when a chat is deleted — prevents memory leaks
  const cleanupChat = useCallback(
    (chatId: string) => {
      jobs.abortExistingStream(chatId);
      callbacks.removeChat(chatId);
      jobs.clearActiveJob(chatId);
      if (activeStreamChatIdRef.current === chatId) {
        activeStreamChatIdRef.current = null;
      }
    },
    [jobs, callbacks]
  );

  const hasActiveStream = useCallback(
    (chatId: string) => !!jobs.abortControllersRef.current[chatId],
    [jobs.abortControllersRef]
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      // State
      activeJobIds: jobs.activeJobIds,
      globalQueue: jobs.globalQueue,
      installedModels: models.installedModels,
      defaultModel: models.defaultModel,
      loadedModel: models.loadedModel,
      selectedModel: models.selectedModel,
      setSelectedModel: models.setSelectedModel,
      favoriteModels: models.favoriteModels,
      spaces: spaces.spaces,
      // Functions
      sendMessage: streaming.sendMessage,
      reconnectToJob: streaming.reconnectToJob,
      cancelJob: jobs.cancelJob,
      abortExistingStream: jobs.abortExistingStream,
      checkActiveJobs: jobs.checkActiveJobs,
      loadModels: models.loadModels,
      loadSpaces: spaces.loadSpaces,
      loadMessages: streaming.loadMessages,
      setModelAsDefault: models.setModelAsDefault,
      toggleFavorite: models.toggleFavorite,
      getActiveJobForChat: jobs.getActiveJobForChat,
      registerMessageCallback: callbacks.registerMessageCallback,
      unregisterMessageCallback: callbacks.unregisterMessageCallback,
      // Background state accessors
      getBackgroundMessages: callbacks.getBackgroundMessages,
      getBackgroundLoading: callbacks.getBackgroundLoading,
      clearBackgroundState: callbacks.clearBackgroundState,
      hasActiveStream,
      // Cleanup
      cleanupChat,
    }),
    [jobs, models, spaces, streaming, callbacks, hasActiveStream, cleanupChat]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChatContext must be used within a ChatProvider');
  return context;
}

export default ChatContext;
