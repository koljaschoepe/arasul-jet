/**
 * DownloadContext - Global Download State Management
 *
 * Manages model downloads globally so they persist across page navigation.
 * Downloads continue in the background even when user navigates away from ModelStore.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { API_BASE, getAuthHeaders } from '../config/api';
import { useApi } from '../hooks/useApi';
import type { CatalogModel } from '../types';

// --- Types ---

// 'paused' (Phase 0) means the server still has bytes_completed > 0 and the
// download will auto-resume on the next backend boot OR when the user clicks
// the model again (which triggers POST /models/download — modelService picks
// up from where it left off). It is NOT an error; the UI must communicate
// that the bytes are safe.
type DownloadPhase = 'init' | 'download' | 'paused' | 'verify' | 'complete' | 'error';

interface DownloadState {
  progress: number;
  status: string;
  phase: DownloadPhase;
  error: string | null;
  modelName?: string;
  // Phase 0: byte-level fields (server-authoritative)
  bytesCompleted?: number;
  bytesTotal?: number;
  speedBps?: number;
}

interface DownloadListItem extends DownloadState {
  modelId: string;
}

interface DownloadContextValue {
  activeDownloads: Record<string, DownloadState>;
  activeDownloadCount: number;
  activeDownloadsList: DownloadListItem[];
  startDownload: (modelId: string, modelName?: string) => Promise<void>;
  // Tab-close / "Pause" semantics: aborts the SSE; backend goes to 'paused'
  // and the bytes are preserved for resume.
  cancelDownload: (modelId: string) => void;
  // Hard reset: aborts the SSE AND tells the server to drop the row +
  // ollama-rm any local blobs. Use when the user wants to start over.
  purgeDownload: (modelId: string) => Promise<void>;
  // Resume a paused download from the saved bytes. Equivalent to clicking
  // the Download button again on a 'paused' row — kept as an explicit method
  // so UI components can wire a clear "Fortsetzen" button.
  resumeDownload: (modelId: string, modelName?: string) => Promise<void>;
  isDownloading: (modelId: string) => boolean;
  getDownloadState: (modelId: string) => DownloadState | null;
  onDownloadComplete: (callback: (modelId: string, success: boolean) => void) => () => void;
}

interface DownloadProviderProps {
  children: ReactNode;
}

interface StatusInterpretation {
  phase: DownloadPhase;
  label: string;
}

// Context
const DownloadContext = createContext<DownloadContextValue | null>(null);

// Helper: Interpret Ollama status messages
const interpretDownloadStatus = (status: string): StatusInterpretation => {
  if (!status) return { phase: 'init', label: 'Initialisiere...' };

  const statusLower = status.toLowerCase();
  if (statusLower.includes('pulling manifest')) {
    return { phase: 'init', label: 'Lade Manifest...' };
  } else if (statusLower.includes('pulling') || statusLower.includes('downloading')) {
    return { phase: 'download', label: 'Download läuft...' };
  } else if (statusLower.includes('verifying')) {
    return { phase: 'verify', label: 'Verifiziere Daten...' };
  } else if (statusLower.includes('writing') || statusLower.includes('extracting')) {
    return { phase: 'verify', label: 'Schreibe Daten...' };
  } else if (statusLower.includes('success')) {
    return { phase: 'complete', label: 'Abgeschlossen!' };
  }
  return { phase: 'download', label: status };
};

// Provider Component
export function DownloadProvider({ children }: DownloadProviderProps) {
  const api = useApi();

  // Active downloads: { modelId: { progress, status, phase, error } }
  const [activeDownloads, setActiveDownloads] = useState<Record<string, DownloadState>>({});

  // Ref to track active abort controllers
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  // Callbacks to notify when download completes (for ModelStore to refresh)
  const onCompleteCallbacksRef = useRef(new Set<(modelId: string, success: boolean) => void>());

  // Track downloads whose onComplete has already fired to prevent duplicate callbacks
  // from racing SSE completion (2s delay) vs polling (3s interval)
  const completedRef = useRef(new Set<string>());

  // RC-004 FIX: Use ref to track activeDownloads for polling
  // This prevents the useEffect from re-running when activeDownloads changes
  const activeDownloadsRef = useRef(activeDownloads);

  // Keep ref in sync with state
  useEffect(() => {
    activeDownloadsRef.current = activeDownloads;
  }, [activeDownloads]);

  // Check for existing downloads on mount (poll DB state).
  // Phase 0: 'paused' rows are surfaced as well — they are valid downloads
  // the user can see/resume (the backend auto-resume sweep also runs on boot,
  // but the user might land on the page faster than the next sweep).
  useEffect(() => {
    const controller = new AbortController();
    const checkExistingDownloads = async () => {
      try {
        const data = await api.get<{ models?: CatalogModel[] }>('/models/catalog', {
          showError: false,
          signal: controller.signal,
        });
        const models = data.models || [];

        const inFlight = models.filter(
          m => m.install_status === 'downloading' || m.install_status === 'paused'
        );

        if (inFlight.length > 0) {
          const newDownloads: Record<string, DownloadState> = {};
          inFlight.forEach(m => {
            const isPaused = m.install_status === 'paused';
            newDownloads[m.id] = {
              progress: m.download_progress || 0,
              status: isPaused ? 'Pausiert — wird fortgesetzt...' : 'Download läuft...',
              phase: isPaused ? 'paused' : 'download',
              error: isPaused ? m.install_error || null : null,
              modelName: m.name,
              bytesCompleted: m.bytes_completed,
              bytesTotal: m.bytes_total,
              speedBps: m.download_speed_bps,
            };
          });
          setActiveDownloads(prev => ({ ...prev, ...newDownloads }));
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        console.error('[DownloadContext] Error checking existing downloads:', err);
      }
    };

    checkExistingDownloads();

    // RC-004 FIX: Poll using ref instead of state in dependency array
    // This creates only one interval that persists for the component lifetime
    const pollInterval = setInterval(async () => {
      // Use ref to get current downloads
      const currentDownloads = Object.keys(activeDownloadsRef.current);
      if (currentDownloads.length === 0) return;

      try {
        const data = await api.get<{ models?: CatalogModel[] }>('/models/catalog', {
          showError: false,
          signal: controller.signal,
        });
        const models = data.models || [];

        setActiveDownloads(prev => {
          const updated = { ...prev };
          let hasChanges = false;

          for (const modelId of Object.keys(prev)) {
            // Skip downloads already completed by SSE — prevents duplicate callbacks
            if (prev[modelId]?.phase === 'complete') continue;

            const model = models.find(m => m.id === modelId);
            if (model) {
              if (model.install_status === 'available') {
                // Download completed (detected by polling — SSE wasn't active)
                delete updated[modelId];
                hasChanges = true;
                // Notify callbacks only if not already fired
                if (!completedRef.current.has(modelId)) {
                  completedRef.current.add(modelId);
                  onCompleteCallbacksRef.current.forEach(cb => cb(modelId, true));
                }
              } else if (model.install_status === 'error') {
                // Hard error — bytes are gone or unrecoverable
                updated[modelId] = {
                  ...prev[modelId],
                  progress: 0,
                  phase: 'error',
                  error: model.install_error || 'Download fehlgeschlagen',
                };
                hasChanges = true;
              } else if (model.install_status === 'paused') {
                // Phase 0: bytes survived a server restart / network blip —
                // the backend will auto-resume; keep the row visible so the
                // user knows nothing is lost.
                updated[modelId] = {
                  ...prev[modelId],
                  progress: model.download_progress || prev[modelId].progress,
                  phase: 'paused',
                  status: 'Pausiert — wird fortgesetzt...',
                  error: model.install_error || null,
                  bytesCompleted: model.bytes_completed,
                  bytesTotal: model.bytes_total,
                  speedBps: model.download_speed_bps,
                };
                hasChanges = true;
              } else if (model.install_status === 'downloading') {
                // Update progress + bytes from DB
                const next: DownloadState = {
                  ...prev[modelId],
                  progress: model.download_progress || 0,
                  phase: 'download',
                  bytesCompleted: model.bytes_completed,
                  bytesTotal: model.bytes_total,
                  speedBps: model.download_speed_bps,
                  // Clear stale "Verbindung verloren" error if server is alive
                  error: null,
                };
                if (
                  prev[modelId].progress !== next.progress ||
                  prev[modelId].bytesCompleted !== next.bytesCompleted ||
                  prev[modelId].phase !== 'download' ||
                  prev[modelId].error !== null
                ) {
                  updated[modelId] = next;
                  hasChanges = true;
                }
              }
            }
          }

          return hasChanges ? updated : prev;
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        console.debug('[DownloadContext] Poll error:', err);
      }
    }, 3000);

    return () => {
      controller.abort();
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // RC-004 FIX: Empty dependency array - only run on mount (api is stable via useMemo)

  // Start a download
  // DL-FE-001: Use ref instead of state in dependency array to prevent
  // callback re-creation on every activeDownloads change
  const startDownload = useCallback(
    async (modelId: string, modelName?: string) => {
      // Don't start if already downloading (use ref for current state)
      if (activeDownloadsRef.current[modelId]) {
        return;
      }

      // Clear dedup guard for re-downloads
      completedRef.current.delete(modelId);

      // Set initial state
      setActiveDownloads(prev => ({
        ...prev,
        [modelId]: {
          progress: 0,
          status: 'Starte Download...',
          phase: 'init',
          error: null,
          modelName: modelName || modelId,
        },
      }));

      const abortController = new AbortController();
      abortControllersRef.current[modelId] = abortController;

      try {
        // FH5: raw fetch() required here — response is an SSE stream that must be read
        // incrementally via reader.read(), which useApi() does not support.
        const response = await fetch(`${API_BASE}/models/download`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ model_id: modelId }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // DL-FE-003: Handle "already downloading" response from backend
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/event-stream')) {
          const data = await response.json();
          if (data.status === 'already_downloading') {
            setActiveDownloads(prev => ({
              ...prev,
              [modelId]: {
                ...prev[modelId],
                progress: data.progress || 0,
                status: 'Download läuft bereits...',
                phase: 'download',
              },
            }));
            return;
          }
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // DL-FE-002: Inactivity timeout - abort if no data for 5 minutes
        // TIMEOUT-FIX: Increased from 60s to 300s — large models (70GB+) can take
        // several minutes for Ollama to resolve the manifest before streaming begins
        let lastDataTime = Date.now();
        const INACTIVITY_TIMEOUT_MS = 300000;
        const inactivityCheck = setInterval(() => {
          if (Date.now() - lastDataTime > INACTIVITY_TIMEOUT_MS) {
            clearInterval(inactivityCheck);
            abortController.abort();
          }
        }, 5000);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Reset inactivity timer on any data (including heartbeats)
            lastDataTime = Date.now();

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop()!;

            for (const line of lines) {
              // Skip heartbeat comments from server
              if (line.startsWith(':')) continue;

              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));

                  setActiveDownloads(prev => {
                    if (!prev[modelId]) return prev;

                    const update = { ...prev[modelId] };

                    if (data.progress !== undefined) {
                      update.progress = data.progress;
                    }
                    if (data.bytes_completed !== undefined && data.bytes_completed !== null) {
                      update.bytesCompleted = data.bytes_completed;
                    }
                    if (data.bytes_total !== undefined && data.bytes_total !== null) {
                      update.bytesTotal = data.bytes_total;
                    }
                    if (data.speed_bps !== undefined && data.speed_bps !== null) {
                      update.speedBps = data.speed_bps;
                    }

                    if (data.status) {
                      const interpreted = interpretDownloadStatus(data.status);
                      update.phase = interpreted.phase;
                      update.status = interpreted.label;
                    }

                    if (data.done) {
                      if (data.success) {
                        update.phase = 'complete';
                        update.status = 'Abgeschlossen!';
                        update.progress = 100;
                      }
                      if (data.error) {
                        update.phase = 'error';
                        update.error = data.error;
                      }
                    }

                    return { ...prev, [modelId]: update };
                  });

                  // Handle completion
                  if (data.done) {
                    // Fire callbacks immediately (deduped), then clean up after 2s visual delay
                    if (!completedRef.current.has(modelId)) {
                      completedRef.current.add(modelId);
                      onCompleteCallbacksRef.current.forEach(cb => cb(modelId, data.success));
                    }
                    setTimeout(() => {
                      setActiveDownloads(prev => {
                        const updated = { ...prev };
                        delete updated[modelId];
                        return updated;
                      });
                    }, 2000);
                  }
                } catch (e: unknown) {
                  console.debug(
                    '[DownloadContext] SSE parse error:',
                    e instanceof Error ? e.message : e
                  );
                }
              }
            }
          }
        } finally {
          clearInterval(inactivityCheck);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Phase 0: an abort here is either an inactivity timeout (SSE went
          // silent) or an explicit cancelDownload(). In both cases the server
          // side either keeps streaming OR has already moved the row to
          // 'paused' with bytes preserved. The UI shows 'paused' (not
          // 'error') so the user knows their bytes are safe — the next
          // polling tick will reflect the authoritative server state.
          const downloadState = activeDownloadsRef.current[modelId];
          if (
            downloadState &&
            downloadState.phase !== 'complete' &&
            downloadState.phase !== 'error'
          ) {
            setActiveDownloads(prev => ({
              ...prev,
              [modelId]: {
                ...prev[modelId],
                phase: 'paused',
                status: 'Pausiert — wird fortgesetzt...',
                error: null,
              },
            }));
          }
        } else {
          console.error(`[DownloadContext] Download error for ${modelId}:`, err);
          setActiveDownloads(prev => ({
            ...prev,
            [modelId]: {
              ...prev[modelId],
              phase: 'error',
              error: err instanceof Error ? err.message : 'Unbekannter Fehler',
            },
          }));
        }
      } finally {
        delete abortControllersRef.current[modelId];
      }
    },
    [] // DL-FE-001: Empty deps - uses ref for current state checks
  );

  // Pause a download (tab-close semantics): aborts the local SSE, but
  // bytes survive on the server. The polling loop will then surface the
  // 'paused' phase from the next /models/catalog response.
  const cancelDownload = useCallback((modelId: string) => {
    const controller = abortControllersRef.current[modelId];
    if (controller) {
      controller.abort();
    }
    setActiveDownloads(prev => ({
      ...prev,
      [modelId]: {
        ...(prev[modelId] || { progress: 0, status: '', phase: 'paused', error: null }),
        phase: 'paused',
        status: 'Pausiert — wird fortgesetzt...',
        error: null,
      },
    }));
  }, []);

  // Hard reset: tells the server to drop the row and (best-effort) ollama-rm.
  // After this the next download starts from 0 bytes and attempt_count = 0.
  const purgeDownload = useCallback(
    async (modelId: string) => {
      const controller = abortControllersRef.current[modelId];
      if (controller) {
        controller.abort();
      }
      try {
        await api.delete(`/models/${encodeURIComponent(modelId)}/download`, {
          showError: false,
        });
      } catch (err) {
        console.warn(`[DownloadContext] Purge failed for ${modelId}:`, err);
      }
      setActiveDownloads(prev => {
        const updated = { ...prev };
        delete updated[modelId];
        return updated;
      });
    },
    [api]
  );

  // Resume = re-trigger a normal startDownload. The server's atomic claim in
  // modelService.downloadModel handles the resume from saved bytes.
  const resumeDownload = useCallback(
    async (modelId: string, modelName?: string) => {
      // Drop any stale 'paused'/'error' state so startDownload re-initialises.
      delete abortControllersRef.current[modelId];
      await startDownload(modelId, modelName);
    },
    [startDownload]
  );

  // Register callback for download completion
  const onDownloadComplete = useCallback(
    (callback: (modelId: string, success: boolean) => void) => {
      onCompleteCallbacksRef.current.add(callback);
      return () => onCompleteCallbacksRef.current.delete(callback);
    },
    []
  );

  // Check if a model is downloading - uses ref to prevent callback recreation
  const isDownloading = useCallback((modelId: string) => {
    return !!activeDownloadsRef.current[modelId];
  }, []);

  // Get download state for a model - uses ref to prevent callback recreation
  const getDownloadState = useCallback((modelId: string) => {
    return activeDownloadsRef.current[modelId] || null;
  }, []);

  // Get all active downloads count - memoized to prevent unnecessary re-renders
  const activeDownloadCount = useMemo(() => Object.keys(activeDownloads).length, [activeDownloads]);

  // Get all active downloads as array - memoized to prevent new array every render
  const activeDownloadsList = useMemo(
    () => Object.entries(activeDownloads).map(([modelId, state]) => ({ modelId, ...state })),
    [activeDownloads]
  );

  const value = useMemo(
    () => ({
      activeDownloads,
      activeDownloadCount,
      activeDownloadsList,
      startDownload,
      cancelDownload,
      purgeDownload,
      resumeDownload,
      isDownloading,
      getDownloadState,
      onDownloadComplete,
    }),
    [
      activeDownloads,
      activeDownloadCount,
      activeDownloadsList,
      startDownload,
      cancelDownload,
      purgeDownload,
      resumeDownload,
      isDownloading,
      getDownloadState,
      onDownloadComplete,
    ]
  );

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}

// Hook to use download context
export function useDownloads(): DownloadContextValue {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownloads must be used within a DownloadProvider');
  }
  return context;
}

export default DownloadContext;
