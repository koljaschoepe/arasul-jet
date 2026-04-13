import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useApi } from './useApi';
import type { InstalledModel, MemoryBudget } from '../types';

interface InstalledModelsResponse {
  models?: InstalledModel[];
}

const POLL_INTERVAL = 10_000;

export interface ModelStatusData {
  /** All installed models (available status) */
  installedModels: InstalledModel[];
  /** Memory budget from backend */
  budget: MemoryBudget | null;
  /** LLM models only */
  llmModels: InstalledModel[];
  /** OCR models only */
  ocrModels: InstalledModel[];
  /** Models currently being loaded/unloaded */
  loadingModels: Set<string>;
  /** SSE status messages per model */
  loadingStatus: Record<string, string>;
  /** Last operation error */
  error: string | null;
  /** Whether a manual refresh is in progress */
  isRefreshing: boolean;
  /** Consecutive poll failures */
  pollErrors: number;
  /** Memory calculations */
  usedMb: number;
  totalBudgetMb: number;
  usedPercent: number;
  /** Check if an LLM model is loaded */
  isLlmLoaded: (model: InstalledModel) => boolean;
  /** Check if a model can be loaded (RAM check) */
  canLoadModel: (model: InstalledModel) => boolean;
  /** Fetch data (manual refresh) */
  fetchData: (manual?: boolean) => Promise<void>;
  /** Load an LLM model via SSE streaming */
  handleLoadLlm: (modelId: string) => Promise<void>;
  /** Load/start an OCR model container */
  handleLoadOcr: (modelId: string) => Promise<void>;
  /** Unload a model */
  handleUnload: (modelId: string) => Promise<void>;
  /** Clear the error */
  clearError: () => void;
}

export default function useModelStatus(): ModelStatusData {
  const api = useApi();
  const [budget, setBudget] = useState<MemoryBudget | null>(null);
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);
  const [loadingModels, setLoadingModels] = useState<Set<string>>(new Set());
  const [loadingStatus, setLoadingStatus] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pollErrors, setPollErrors] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRefs = useRef<Record<string, AbortController>>({});

  const fetchData = useCallback(
    async (manual = false) => {
      if (manual) setIsRefreshing(true);
      try {
        const [budgetData, modelsData] = await Promise.all([
          api.get<MemoryBudget>('/models/memory-budget', { showError: false }),
          api.get<InstalledModelsResponse>('/models/installed', { showError: false }),
        ]);
        setBudget(budgetData);
        if (modelsData?.models) setInstalledModels(modelsData.models);
        setPollErrors(0);
      } catch {
        setPollErrors(prev => prev + 1);
      } finally {
        if (manual) setIsRefreshing(false);
      }
    },
    [api]
  );

  useEffect(() => {
    fetchData();

    // Only poll when tab is visible to save resources on Jetson
    const startPolling = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchData();
        }
      }, POLL_INTERVAL);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchData(); // Immediate refresh when tab becomes visible
        startPolling();
      } else {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  const handleLoadLlm = useCallback(
    async (modelId: string) => {
      setLoadingModels(prev => new Set(prev).add(modelId));
      setLoadingStatus(prev => ({ ...prev, [modelId]: 'Wird vorbereitet\u2026' }));
      setError(null);

      const controller = new AbortController();
      abortRefs.current[modelId] = controller;

      try {
        const res = await api.post<Response>(`/models/${modelId}/activate?stream=true`, null, {
          raw: true,
          showError: false,
          signal: controller.signal,
        });

        const reader = (res as unknown as Response).body?.getReader();
        if (!reader) throw new Error('Streaming nicht verf\u00fcgbar');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.message) {
                setLoadingStatus(prev => ({ ...prev, [modelId]: data.message }));
              }
              if (data.error) {
                setError(data.error);
              }
              if (data.done) {
                await fetchData();
              }
            } catch {
              // ignore parse errors from partial chunks
            }
          }
        }
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Fehler beim Laden');
        }
      } finally {
        delete abortRefs.current[modelId];
        setLoadingModels(prev => {
          const next = new Set(prev);
          next.delete(modelId);
          return next;
        });
        setLoadingStatus(prev => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });
      }
    },
    [api, fetchData]
  );

  const handleLoadOcr = useCallback(
    async (modelId: string) => {
      setLoadingModels(prev => new Set(prev).add(modelId));
      setError(null);
      try {
        await api.post(`/models/${modelId}/load`);
        await fetchData();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Fehler beim Starten');
      } finally {
        setLoadingModels(prev => {
          const next = new Set(prev);
          next.delete(modelId);
          return next;
        });
      }
    },
    [api, fetchData]
  );

  const handleUnload = useCallback(
    async (modelId: string) => {
      setLoadingModels(prev => new Set(prev).add(modelId));
      setError(null);
      try {
        await api.post(`/models/${modelId}/unload`);
        await fetchData();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Fehler beim Entladen');
      } finally {
        setLoadingModels(prev => {
          const next = new Set(prev);
          next.delete(modelId);
          return next;
        });
      }
    },
    [api, fetchData]
  );

  const clearError = useCallback(() => setError(null), []);

  // Derived state
  const availableModels = useMemo(
    () => installedModels.filter(m => m.install_status === 'available' || m.status === 'available'),
    [installedModels]
  );

  const llmModels = useMemo(
    () => availableModels.filter(m => !m.model_type || m.model_type === 'llm'),
    [availableModels]
  );

  const ocrModels = useMemo(
    () => availableModels.filter(m => m.model_type === 'ocr'),
    [availableModels]
  );

  const loadedIds = useMemo(() => new Set(budget?.loadedModels?.map(m => m.id) || []), [budget]);

  const loadedOllamaNames = useMemo(
    () => new Set(budget?.loadedModels?.map(m => m.ollamaName) || []),
    [budget]
  );

  const isLlmLoaded = useCallback(
    (model: InstalledModel) => loadedIds.has(model.id) || loadedOllamaNames.has(model.id),
    [loadedIds, loadedOllamaNames]
  );

  const canLoadModel = useCallback(
    (model: InstalledModel) => {
      if (!budget || !model.ram_required_gb) return true;
      return model.ram_required_gb * 1024 <= budget.availableMb;
    },
    [budget]
  );

  const usedMb = budget?.usedMb || 0;
  const totalBudgetMb = budget?.totalBudgetMb || 0;
  const usedPercent = totalBudgetMb > 0 ? (usedMb / totalBudgetMb) * 100 : 0;

  return {
    installedModels,
    budget,
    llmModels,
    ocrModels,
    loadingModels,
    loadingStatus,
    error,
    isRefreshing,
    pollErrors,
    usedMb,
    totalBudgetMb,
    usedPercent,
    isLlmLoaded,
    canLoadModel,
    fetchData,
    handleLoadLlm,
    handleLoadOcr,
    handleUnload,
    clearError,
  };
}
