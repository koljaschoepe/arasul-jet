import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '../../hooks/useApi';
import type { QueueJob } from '../../types';
import type { ActiveJob, QueueState } from './types';

interface UseJobQueueParams {
  isAuthenticated: boolean;
  /** Shared ref tracking which chat owns the active stream (provider-owned). */
  activeStreamChatIdRef: React.MutableRefObject<string | null>;
  onCancelLoading: (chatId: string) => void;
}

export interface UseJobQueueReturn {
  activeJobIds: Record<string, string>;
  globalQueue: QueueState;
  /** Map<chatId, AbortController> — exposed for streaming hook to register/abort */
  abortControllersRef: React.MutableRefObject<Record<string, AbortController>>;
  /** Mutex used to serialize reconnect calls. */
  reconnectMutexRef: React.MutableRefObject<Promise<void>>;
  /** Per-chat lock against double-send. */
  sendLockRef: React.MutableRefObject<Set<string>>;
  /** Tracks which chat owns the active stream; null when no stream. */
  activeStreamChatIdRef: React.MutableRefObject<string | null>;
  setActiveJob: (chatId: string, jobId: string) => void;
  clearActiveJob: (chatId: string) => void;
  getActiveJobForChat: (chatId: string) => string | null;
  cancelJob: (chatId: string) => Promise<void>;
  abortExistingStream: (chatId: string) => void;
  checkActiveJobs: (chatId: string) => Promise<ActiveJob | null>;
  /** Aborts every active stream and clears refs (used on logout). */
  abortAllStreams: () => void;
}

/**
 * useJobQueue — Background job tracking, queue polling and stream
 * abort/cancel orchestration. Owns the abort-controllers, mutex and
 * send-lock refs so that streaming hooks can plug into them.
 */
export default function useJobQueue({
  isAuthenticated,
  activeStreamChatIdRef,
  onCancelLoading,
}: UseJobQueueParams): UseJobQueueReturn {
  const api = useApi();

  const [activeJobIds, setActiveJobIds] = useState<Record<string, string>>({});
  const [globalQueue, setGlobalQueue] = useState<QueueState>({
    pending_count: 0,
    processing: null,
    queue: [],
  });

  const abortControllersRef = useRef<Record<string, AbortController>>({});
  const reconnectMutexRef = useRef<Promise<void>>(Promise.resolve());
  const sendLockRef = useRef(new Set<string>());

  const setActiveJob = useCallback((chatId: string, jobId: string) => {
    setActiveJobIds(prev => ({ ...prev, [chatId]: jobId }));
  }, []);

  const clearActiveJob = useCallback((chatId: string) => {
    setActiveJobIds(prev => {
      if (!(chatId in prev)) return prev;
      const next = { ...prev };
      delete next[chatId];
      return next;
    });
  }, []);

  const getActiveJobForChat = useCallback(
    (chatId: string) => activeJobIds[chatId] || null,
    [activeJobIds]
  );

  const abortExistingStream = useCallback((chatId: string) => {
    if (abortControllersRef.current[chatId]) {
      abortControllersRef.current[chatId].abort();
      delete abortControllersRef.current[chatId];
    }
  }, []);

  const cancelJob = useCallback(
    async (chatId: string) => {
      const jobId = activeJobIds[chatId];

      // 1) Abort the local stream (instant)
      const controller = abortControllersRef.current[chatId];
      if (controller) {
        controller.abort();
        delete abortControllersRef.current[chatId];
      }

      // 2) Cancel on server, await so we confirm cancellation
      if (jobId) {
        try {
          await api.del(`/llm/jobs/${jobId}`, { showError: false });
        } catch {
          // Job may already be complete — ignore
        }
      }

      // 3) Update state AFTER API call completes
      clearActiveJob(chatId);
      onCancelLoading(chatId);
    },
    [activeJobIds, clearActiveJob, onCancelLoading, api]
  );

  const checkActiveJobs = useCallback(
    async (chatId: string): Promise<ActiveJob | null> => {
      try {
        const data = await api.get(`/chats/${chatId}/jobs`, { showError: false });
        const jobs = data.jobs || [];
        const activeJob = jobs.find(
          (j: QueueJob) => j.status === 'streaming' || j.status === 'pending'
        );
        if (activeJob) {
          setActiveJob(chatId, activeJob.id);
          return activeJob;
        }
        return null;
      } catch (err) {
        console.error('Error checking active jobs:', err);
        return null;
      }
    },
    [api, setActiveJob]
  );

  const abortAllStreams = useCallback(() => {
    Object.values(abortControllersRef.current).forEach(c => {
      if (c?.abort) c.abort();
    });
    abortControllersRef.current = {};
  }, []);

  // Queue polling while active jobs exist
  const activeJobCount = Object.keys(activeJobIds).length;
  useEffect(() => {
    if (activeJobCount === 0) {
      setGlobalQueue({ pending_count: 0, processing: null, queue: [] });
      return;
    }
    const pollQueue = async () => {
      try {
        const data = await api.get('/llm/queue', { showError: false });
        setGlobalQueue(data);
      } catch (err) {
        console.error('Error polling queue:', err);
      }
    };
    pollQueue();
    const interval = setInterval(pollQueue, 2000);
    return () => clearInterval(interval);
  }, [activeJobCount, api]);

  // Cleanup on logout
  useEffect(() => {
    if (!isAuthenticated) {
      abortAllStreams();
    }
  }, [isAuthenticated, abortAllStreams]);

  return {
    activeJobIds,
    globalQueue,
    abortControllersRef,
    reconnectMutexRef,
    sendLockRef,
    activeStreamChatIdRef,
    setActiveJob,
    clearActiveJob,
    getActiveJobForChat,
    cancelJob,
    abortExistingStream,
    checkActiveJobs,
    abortAllStreams,
  };
}
