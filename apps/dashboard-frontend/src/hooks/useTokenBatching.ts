import {
  useRef,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
} from 'react';

interface TokenBatch {
  content: string;
  thinking: string;
  pendingContent: string;
  pendingThinking: string;
}

/** Minimal message shape needed for token batching – intentionally narrower than ChatMessage */
interface TokenCountableMessage {
  content: string;
  thinking?: string;
  hasThinking?: boolean;
  [key: string]: unknown;
}

type TokenType = 'content' | 'thinking';

interface UseTokenBatchingReturn {
  tokenBatchRef: MutableRefObject<TokenBatch>;
  flushTokenBatch: (assistantMessageIndex: number, forceFlush?: boolean) => void;
  addTokenToBatch: (type: TokenType, token: string, assistantMessageIndex: number) => void;
  /**
   * Reset the batch and bind it to a new opaque `streamId`. addTokenToBatch
   * calls made with a different (or older) streamId are dropped — defense
   * against stale tokens leaking across chat switches. (Phase 4.3)
   *
   * Returns the bound streamId so the caller can pass it back to subsequent
   * addTokenToBatch calls. If the caller doesn't care, omit and behavior is
   * backward-compatible.
   */
  resetTokenBatch: (streamId?: string | number) => string | number | null;
  /** Send a token tagged with the streamId previously bound by resetTokenBatch. */
  addTokenToBatchForStream: (
    streamId: string | number,
    type: TokenType,
    token: string,
    assistantMessageIndex: number
  ) => void;
}

/**
 * useTokenBatching - Batches streaming tokens to reduce React re-renders.
 * RENDER-001: Instead of updating state on every single token (100+ times/second),
 * tokens are batched and flushed at most every BATCH_INTERVAL_MS.
 *
 * @param setMessages - State setter for messages array
 * @param batchIntervalMs - Flush interval in milliseconds
 */
export default function useTokenBatching(
  setMessages: Dispatch<SetStateAction<TokenCountableMessage[]>>,
  batchIntervalMs: number = 50
): UseTokenBatchingReturn {
  const tokenBatchRef = useRef<TokenBatch>({
    content: '',
    thinking: '',
    pendingContent: '',
    pendingThinking: '',
  });
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Phase 4.3: opaque tag set by resetTokenBatch(); addTokenToBatchForStream
  // drops tokens whose streamId doesn't match — protects against the chat
  // switch race where an aborted stream's late SSE chunks would otherwise
  // append into the next chat's buffer.
  const streamIdRef = useRef<string | number | null>(null);

  // Flush batched tokens to state - called periodically or when stream ends
  // RC-001 FIX: Added index validation and warning for out-of-bounds access
  const flushTokenBatch = useCallback(
    (assistantMessageIndex: number, forceFlush: boolean = false) => {
      const batch = tokenBatchRef.current;

      if (batch.pendingContent || batch.pendingThinking || forceFlush) {
        if (batch.pendingContent) {
          batch.content += batch.pendingContent;
          batch.pendingContent = '';
        }
        if (batch.pendingThinking) {
          batch.thinking += batch.pendingThinking;
          batch.pendingThinking = '';
        }

        setMessages(prevMessages => {
          // RC-001: Validate index before update
          if (assistantMessageIndex < 0 || assistantMessageIndex >= prevMessages.length) {
            console.warn(
              `[useTokenBatching] flushTokenBatch: Invalid index ${assistantMessageIndex}, messages length: ${prevMessages.length}`
            );
            return prevMessages;
          }

          const updated = [...prevMessages];
          if (updated[assistantMessageIndex]) {
            updated[assistantMessageIndex] = {
              ...updated[assistantMessageIndex],
              content: batch.content,
              thinking: batch.thinking,
              hasThinking: batch.thinking.length > 0,
            };
          }
          return updated;
        });
      }
    },
    [setMessages]
  );

  // Schedule a batched flush if not already scheduled
  const scheduleTokenFlush = useCallback(
    (assistantMessageIndex: number) => {
      if (!batchTimerRef.current) {
        batchTimerRef.current = setTimeout(() => {
          flushTokenBatch(assistantMessageIndex);
          batchTimerRef.current = null;
        }, batchIntervalMs);
      }
    },
    [flushTokenBatch, batchIntervalMs]
  );

  // Add token to batch (instead of immediately updating state)
  const addTokenToBatch = useCallback(
    (type: TokenType, token: string, assistantMessageIndex: number) => {
      if (type === 'content') {
        tokenBatchRef.current.pendingContent += token;
      } else if (type === 'thinking') {
        tokenBatchRef.current.pendingThinking += token;
      }
      scheduleTokenFlush(assistantMessageIndex);
    },
    [scheduleTokenFlush]
  );

  // Stream-tagged variant: drop stale tokens (Phase 4.3 defense-in-depth).
  const addTokenToBatchForStream = useCallback(
    (streamId: string | number, type: TokenType, token: string, assistantMessageIndex: number) => {
      if (streamIdRef.current !== streamId) {
        // Late chunk from an aborted/stale stream — drop on the floor.
        return;
      }
      addTokenToBatch(type, token, assistantMessageIndex);
    },
    [addTokenToBatch]
  );

  // Reset batch state for new stream. Optional streamId binds the batch
  // to a specific stream identifier; subsequent addTokenToBatchForStream
  // calls with a different ID are no-ops.
  const resetTokenBatch = useCallback((streamId: string | number | null = null) => {
    tokenBatchRef.current = { content: '', thinking: '', pendingContent: '', pendingThinking: '' };
    streamIdRef.current = streamId;
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    return streamId;
  }, []);

  return {
    tokenBatchRef,
    flushTokenBatch,
    addTokenToBatch,
    addTokenToBatchForStream,
    resetTokenBatch,
  };
}
