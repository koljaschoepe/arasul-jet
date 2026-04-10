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

type DownloadPhase = 'init' | 'download' | 'verify' | 'complete' | 'error';

interface DownloadState {
  progress: number;
  status: string;
  phase: DownloadPhase;
  error: string | null;
  modelName?: string;
}

interface DownloadListItem extends DownloadState {
  modelId: string;
}

interface DownloadContextValue {
  activeDownloads: Record<string, DownloadState>;
  activeDownloadCount: number;
  activeDownloadsList: DownloadListItem[];
  startDownload: (modelId: string, modelName?: string) => Promise<void>;
  cancelDownload: (modelId: string) => void;
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

  // Check for existing downloads on mount (poll DB state)
  useEffect(() => {
    const controller = new AbortController();
    const checkExistingDownloads = async () => {
      try {
        const data = await api.get<{ models?: CatalogModel[] }>('/models/catalog', {
          showError: false,
          signal: controller.signal,
        });
        const models = data.models || [];

        // Find models that are downloading
        const downloading = models.filter(m => m.install_status === 'downloading');

        if (downloading.length > 0) {
          const newDownloads: Record<string, DownloadState> = {};
          downloading.forEach(m => {
            newDownloads[m.id] = {
              progress: m.download_progress || 0,
              status: 'Download läuft...',
              phase: 'download',
              error: null,
              modelName: m.name,
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
                // Download failed
                updated[modelId] = {
                  ...prev[modelId],
                  progress: 0,
                  phase: 'error',
                  error: model.install_error || 'Download fehlgeschlagen',
                };
                hasChanges = true;
              } else if (model.install_status === 'downloading') {
                // Update progress from DB
                if (prev[modelId].progress !== model.download_progress) {
                  updated[modelId] = {
                    ...prev[modelId],
                    progress: model.download_progress || 0,
                  };
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
          // Check if this was an inactivity timeout vs intentional cancel
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
                phase: 'error',
                error:
                  'Verbindung zum Server verloren. Der Download läuft möglicherweise im Hintergrund weiter.',
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

  // Cancel a download
  const cancelDownload = useCallback((modelId: string) => {
    const controller = abortControllersRef.current[modelId];
    if (controller) {
      controller.abort();
    }
    setActiveDownloads(prev => {
      const updated = { ...prev };
      delete updated[modelId];
      return updated;
    });
  }, []);

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
      isDownloading,
      getDownloadState,
      onDownloadComplete,
    ]
  );
  // Note: isDownloading, getDownloadState, startDownload, cancelDownload, onDownloadComplete
  // all have empty deps (use refs internally), so they don't cause value recreation.
  // Only activeDownloads/count/list changes trigger context updates.

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
