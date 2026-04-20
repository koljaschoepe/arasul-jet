/**
 * ActivationContext - Global Model Activation State Management
 *
 * Manages model activations globally so they persist across page navigation.
 * Activations continue in the background even when user navigates away from StoreModels.
 * Pattern follows DownloadContext.
 */

import {
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

// --- Types ---

interface ActivationState {
  modelId: string;
  modelName?: string;
  progress: number;
  message: string;
  error: string | null;
}

interface ActivationContextValue {
  activation: ActivationState | null;
  startActivation: (modelId: string, modelName?: string) => Promise<void>;
  cancelActivation: () => void;
  isActivating: (modelId: string) => boolean;
  getActivationPercent: () => number;
  onActivationComplete: (callback: (modelId: string, success: boolean) => void) => () => void;
}

interface ActivationProviderProps {
  children: ReactNode;
}

// Context
const ActivationContext = createContext<ActivationContextValue | null>(null);

// Provider Component
export function ActivationProvider({ children }: ActivationProviderProps) {
  const [activation, setActivation] = useState<ActivationState | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const activatingRef = useRef(false);
  const onCompleteCallbacksRef = useRef(new Set<(modelId: string, success: boolean) => void>());
  const activationRef = useRef(activation);
  // FE-05: track pending timeouts so unmount can cancel them
  const pendingTimeoutsRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    activationRef.current = activation;
  }, [activation]);

  // Cleanup on unmount
  useEffect(() => {
    const pendingTimeouts = pendingTimeoutsRef.current;
    return () => {
      abortRef.current?.abort();
      pendingTimeouts.forEach(id => clearTimeout(id));
      pendingTimeouts.clear();
    };
  }, []);

  const startActivation = useCallback(async (modelId: string, modelName?: string) => {
    if (activatingRef.current) return;
    activatingRef.current = true;

    // Abort any previous activation
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setActivation({
      modelId,
      modelName: modelName || modelId,
      progress: 0,
      message: 'Initialisiere...',
      error: null,
    });

    try {
      // FH5: raw fetch() required — response is an SSE stream
      const response = await fetch(`${API_BASE}/models/${modelId}/activate?stream=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const body = response.body;
      if (!body) throw new Error('Streaming nicht verfügbar');

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          if (controller.signal.aborted) {
            reader.cancel();
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith(':')) continue;

            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.error) {
                  throw new Error(data.error);
                }

                setActivation(prev => {
                  if (!prev || prev.modelId !== modelId) return prev;
                  return {
                    ...prev,
                    progress: data.progress !== undefined ? data.progress : prev.progress,
                    message: data.message || prev.message,
                  };
                });

                if (data.done) {
                  setActivation(prev =>
                    prev
                      ? {
                          ...prev,
                          progress: 100,
                          message: data.message || 'Erfolgreich aktiviert!',
                        }
                      : null
                  );
                  // Brief visual delay, then clear
                  onCompleteCallbacksRef.current.forEach(cb => cb(modelId, true));
                  await new Promise<void>(resolve => {
                    const id = setTimeout(() => {
                      pendingTimeoutsRef.current.delete(id);
                      resolve();
                    }, 1200);
                    pendingTimeoutsRef.current.add(id);
                  });
                  setActivation(null);
                }
              } catch (parseErr: unknown) {
                if (
                  parseErr instanceof Error &&
                  parseErr.message !== 'Unexpected end of JSON input'
                ) {
                  throw parseErr;
                }
              }
            }
          }
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setActivation(null);
        return;
      }

      console.error('[ActivationContext] Activation error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Aktivierung fehlgeschlagen';

      setActivation(prev =>
        prev ? { ...prev, error: errorMessage, message: errorMessage } : null
      );
      onCompleteCallbacksRef.current.forEach(cb => cb(modelId, false));

      // Clear error state after 5s
      const errorClearId = setTimeout(() => {
        pendingTimeoutsRef.current.delete(errorClearId);
        setActivation(prev => (prev?.modelId === modelId && prev?.error ? null : prev));
      }, 5000);
      pendingTimeoutsRef.current.add(errorClearId);
    } finally {
      activatingRef.current = false;
      abortRef.current = null;
    }
  }, []);

  const cancelActivation = useCallback(() => {
    abortRef.current?.abort();
    setActivation(null);
    activatingRef.current = false;
  }, []);

  const isActivating = useCallback((modelId: string) => {
    return activationRef.current?.modelId === modelId && !activationRef.current?.error;
  }, []);

  const getActivationPercent = useCallback(() => {
    return activationRef.current?.progress || 0;
  }, []);

  const onActivationComplete = useCallback(
    (callback: (modelId: string, success: boolean) => void) => {
      onCompleteCallbacksRef.current.add(callback);
      return () => onCompleteCallbacksRef.current.delete(callback);
    },
    []
  );

  const value = useMemo(
    () => ({
      activation,
      startActivation,
      cancelActivation,
      isActivating,
      getActivationPercent,
      onActivationComplete,
    }),
    [
      activation,
      startActivation,
      cancelActivation,
      isActivating,
      getActivationPercent,
      onActivationComplete,
    ]
  );

  return <ActivationContext.Provider value={value}>{children}</ActivationContext.Provider>;
}

// Hook
export function useActivation(): ActivationContextValue {
  const context = useContext(ActivationContext);
  if (!context) {
    throw new Error('useActivation must be used within an ActivationProvider');
  }
  return context;
}

export default ActivationContext;
