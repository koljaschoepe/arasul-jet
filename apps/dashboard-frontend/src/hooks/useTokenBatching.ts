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
  resetTokenBatch: () => void;
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
  batchIntervalMs: number = 16
): UseTokenBatchingReturn {
  const tokenBatchRef = useRef<TokenBatch>({
    content: '',
    thinking: '',
    pendingContent: '',
    pendingThinking: '',
  });
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Reset batch state for new stream
  const resetTokenBatch = useCallback(() => {
    tokenBatchRef.current = { content: '', thinking: '', pendingContent: '', pendingThinking: '' };
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
  }, []);

  return {
    tokenBatchRef,
    flushTokenBatch,
    addTokenToBatch,
    resetTokenBatch,
  };
}
