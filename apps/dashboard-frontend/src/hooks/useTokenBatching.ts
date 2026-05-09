import {
  useRef,
  useCallback,
  useEffect,
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
  batchIntervalMs: number = 50
): UseTokenBatchingReturn {
  const tokenBatchRef = useRef<TokenBatch>({
    content: '',
    thinking: '',
    pendingContent: '',
    pendingThinking: '',
  });
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // P2.2.6: hold the latest assistantMessageIndex in a ref so a pending
  // setTimeout flushes against the CURRENT index, not the one captured when
  // the timer was first scheduled. Without this, compaction-induced index
  // shifts (ChatContext line ~998) would write tokens into the previous slot.
  const indexRef = useRef<number>(-1);

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

  // Schedule a batched flush if not already scheduled. The setTimeout reads
  // the current index from the ref (not from this closure) so compaction
  // shifts during the BATCH_INTERVAL_MS window do not misroute tokens.
  const scheduleTokenFlush = useCallback(() => {
    if (!batchTimerRef.current) {
      batchTimerRef.current = setTimeout(() => {
        flushTokenBatch(indexRef.current);
        batchTimerRef.current = null;
      }, batchIntervalMs);
    }
  }, [flushTokenBatch, batchIntervalMs]);

  // Add token to batch (instead of immediately updating state)
  const addTokenToBatch = useCallback(
    (type: TokenType, token: string, assistantMessageIndex: number) => {
      if (type === 'content') {
        tokenBatchRef.current.pendingContent += token;
      } else if (type === 'thinking') {
        tokenBatchRef.current.pendingThinking += token;
      }
      indexRef.current = assistantMessageIndex;
      scheduleTokenFlush();
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
    indexRef.current = -1;
  }, []);

  // P2.2.5: clear any pending setTimeout on unmount so it cannot fire
  // setMessages on a dead component during fast chat-tab switches.
  useEffect(() => {
    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
    };
  }, []);

  return {
    tokenBatchRef,
    flushTokenBatch,
    addTokenToBatch,
    resetTokenBatch,
  };
}
