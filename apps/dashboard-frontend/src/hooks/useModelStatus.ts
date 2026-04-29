/**
 * useModelStatus — Dashboard-side hook for memory budget + installed models.
 *
 * Phase 1 of LLM_RAG_N8N_HARDENING: budget + installed list now come from the
 * shared TanStack cache (`modelKeys.memoryBudget()` / `modelKeys.installed()`)
 * so Store and Chat see Dashboard's data and vice versa. UI-only state
 * (loading per model, SSE status, last error) stays local because it doesn't
 * belong in the cache.
 *
 * Polling cadence:
 *   - memoryBudget → MODEL_POLL_INTERVAL_MS (5s) so RAM pressure is current
 *   - installed → no automatic polling; refreshes via mutation invalidation
 *     of `modelKeys.installed()`
 */
import { useState, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from './useApi';
import { modelKeys, MODEL_POLL_INTERVAL_MS } from './queries/modelKeys';
import type { InstalledModel, MemoryBudget } from '../types';

interface InstalledModelsResponse {
  models?: InstalledModel[];
}

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
  const qc = useQueryClient();

  const [loadingModels, setLoadingModels] = useState<Set<string>>(new Set());
  const [loadingStatus, setLoadingStatus] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const abortRefs = useRef<Record<string, AbortController>>({});

  // Shared TanStack queries — Store and Chat read the same cache entries.
  const budgetQuery = useQuery({
    queryKey: modelKeys.memoryBudget(),
    queryFn: ({ signal }) =>
      api.get<MemoryBudget>('/models/memory-budget', { showError: false, signal }),
    refetchInterval: MODEL_POLL_INTERVAL_MS,
    // TanStack pauses background refetch automatically when the tab is
    // hidden, so the previous visibilitychange handler is no longer needed.
  });

  const installedQuery = useQuery({
    queryKey: modelKeys.installed(),
    queryFn: async ({ signal }) => {
      const data = await api.get<InstalledModelsResponse>('/models/installed', {
        showError: false,
        signal,
      });
      return data.models ?? [];
    },
  });

  const budget = budgetQuery.data ?? null;
  const installedModels = installedQuery.data ?? [];
  const pollErrors = (budgetQuery.failureCount || 0) + (installedQuery.failureCount || 0);

  const fetchData = useCallback(
    async (manual = false) => {
      if (manual) setIsRefreshing(true);
      try {
        await Promise.all([
          qc.invalidateQueries({ queryKey: modelKeys.memoryBudget() }),
          qc.invalidateQueries({ queryKey: modelKeys.installed() }),
        ]);
      } finally {
        if (manual) setIsRefreshing(false);
      }
    },
    [qc]
  );

  const handleLoadLlm = useCallback(
    async (modelId: string) => {
      setLoadingModels(prev => new Set(prev).add(modelId));
      setLoadingStatus(prev => ({ ...prev, [modelId]: 'Wird vorbereitet…' }));
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
        if (!reader) throw new Error('Streaming nicht verfügbar');

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
