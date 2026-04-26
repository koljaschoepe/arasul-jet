import { useEffect, useCallback, useRef } from 'react';
import type { ChatMessage, MessageCallbacks } from './types';

/**
 * LEAK-002: LRU eviction — max background-accumulated chats. Beyond this
 * limit, oldest entries are dropped to keep memory bounded.
 */
const MAX_BACKGROUND_CHATS = 10;

interface UseChatCallbacksParams {
  isAuthenticated: boolean;
  /** Ref to the chat that currently owns the active stream (driven by streaming hook). */
  activeStreamChatIdRef: React.MutableRefObject<string | null>;
}

export interface UseChatCallbacksReturn {
  registerMessageCallback: (chatId: string, callbacks: MessageCallbacks) => void;
  unregisterMessageCallback: (chatId: string) => void;
  /** Routes setMessages to the *active* stream's chat callback. */
  routedSetMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  /** Updates a *specific* chat's messages (no active-stream routing). */
  updateMessages: (
    chatId: string,
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])
  ) => void;
  updateIsLoading: (chatId: string, value: boolean) => void;
  updateError: (chatId: string, value: string | null) => void;
  getBackgroundMessages: (chatId: string) => ChatMessage[] | null;
  getBackgroundLoading: (chatId: string) => boolean;
  clearBackgroundState: (chatId: string) => void;
  clearAllBackgroundState: () => void;
  /** Removes the callback entry and any background state for a chat. */
  removeChat: (chatId: string) => void;
}

/**
 * useChatCallbacks — Per-chat callback registry plus background message
 * accumulation when the chat view is unmounted. Streaming updates flow
 * through `updateMessages` (per-chat) or `routedSetMessages` (active stream).
 */
export default function useChatCallbacks({
  isAuthenticated,
  activeStreamChatIdRef,
}: UseChatCallbacksParams): UseChatCallbacksReturn {
  const messageCallbacksRef = useRef(new Map<string, MessageCallbacks>());
  const backgroundMessagesRef = useRef(new Map<string, ChatMessage[]>());
  const backgroundLoadingRef = useRef(new Set<string>());

  const evictBackgroundIfNeeded = useCallback(() => {
    const map = backgroundMessagesRef.current;
    while (map.size > MAX_BACKGROUND_CHATS) {
      // Map iterates in insertion order — first key is oldest
      const oldest = map.keys().next().value;
      if (oldest !== undefined) {
        map.delete(oldest);
        backgroundLoadingRef.current.delete(oldest);
      } else {
        break;
      }
    }
  }, []);

  const registerMessageCallback = useCallback((chatId: string, callbacks: MessageCallbacks) => {
    messageCallbacksRef.current.set(chatId, callbacks);
  }, []);

  const unregisterMessageCallback = useCallback((chatId: string) => {
    messageCallbacksRef.current.delete(chatId);
  }, []);

  const writeOrAccumulate = useCallback(
    (chatId: string, updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      const cb = messageCallbacksRef.current.get(chatId);
      if (cb?.setMessages) {
        cb.setMessages(updater);
      } else {
        // ChatView not mounted — accumulate in background
        const prev = backgroundMessagesRef.current.get(chatId) || [];
        const next = typeof updater === 'function' ? updater(prev) : updater;
        backgroundMessagesRef.current.set(chatId, next);
        evictBackgroundIfNeeded();
      }
    },
    [evictBackgroundIfNeeded]
  );

  const routedSetMessages = useCallback(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      const chatId = activeStreamChatIdRef.current;
      if (!chatId) return;
      writeOrAccumulate(chatId, updater);
    },
    [activeStreamChatIdRef, writeOrAccumulate]
  );

  const updateMessages = useCallback(
    (chatId: string, updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      writeOrAccumulate(chatId, updater);
    },
    [writeOrAccumulate]
  );

  const updateIsLoading = useCallback((chatId: string, value: boolean) => {
    const cb = messageCallbacksRef.current.get(chatId);
    if (cb?.setIsLoading) {
      cb.setIsLoading(value);
    } else if (value) {
      backgroundLoadingRef.current.add(chatId);
    } else {
      backgroundLoadingRef.current.delete(chatId);
    }
  }, []);

  const updateError = useCallback((chatId: string, value: string | null) => {
    const cb = messageCallbacksRef.current.get(chatId);
    if (cb?.setError) cb.setError(value);
  }, []);

  const getBackgroundMessages = useCallback(
    (chatId: string) => backgroundMessagesRef.current.get(chatId) || null,
    []
  );

  const getBackgroundLoading = useCallback(
    (chatId: string) => backgroundLoadingRef.current.has(chatId),
    []
  );

  const clearBackgroundState = useCallback((chatId: string) => {
    backgroundMessagesRef.current.delete(chatId);
    backgroundLoadingRef.current.delete(chatId);
  }, []);

  const clearAllBackgroundState = useCallback(() => {
    backgroundMessagesRef.current.clear();
    backgroundLoadingRef.current.clear();
  }, []);

  const removeChat = useCallback((chatId: string) => {
    messageCallbacksRef.current.delete(chatId);
    backgroundMessagesRef.current.delete(chatId);
    backgroundLoadingRef.current.delete(chatId);
  }, []);

  // Clear all background state on logout
  useEffect(() => {
    if (!isAuthenticated) {
      clearAllBackgroundState();
    }
  }, [isAuthenticated, clearAllBackgroundState]);

  return {
    registerMessageCallback,
    unregisterMessageCallback,
    routedSetMessages,
    updateMessages,
    updateIsLoading,
    updateError,
    getBackgroundMessages,
    getBackgroundLoading,
    clearBackgroundState,
    clearAllBackgroundState,
    removeChat,
  };
}
