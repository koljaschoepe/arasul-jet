/**
 * useModelState — canonical per-model boolean state.
 *
 * Phase 1.3 of LLM_RAG_N8N_HARDENING. The audit found three different
 * meanings of the word "active" across Chat / Store / Dashboard
 * (user-selected vs. system-default vs. currently-in-RAM). This hook is the
 * one place that resolves them, so callers can ask `isLoaded(modelId)` /
 * `isDefault(modelId)` / `isInstalled(modelId)` without re-implementing the
 * lookup against three different shapes.
 *
 * Backed by the centralized model queries in `modelKeys.ts` — no extra
 * network calls; consumers share the cache.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../useApi';
import { modelKeys, MODEL_POLL_INTERVAL_MS } from './modelKeys';
import type { InstalledModel, MemoryBudget } from '../../types';

interface InstalledResponse {
  models?: InstalledModel[];
}
interface LoadedResponse {
  model_id?: string;
  loaded_models?: Array<{ model_id: string }>;
}
interface DefaultResponse {
  default_model?: string | null;
}

export interface ModelStateApi {
  /** Has this id ever been pulled and is currently sitting on disk. */
  isInstalled: (modelId: string) => boolean;
  /** Is this id (or its ollama_name) currently loaded into RAM. */
  isLoaded: (modelId: string) => boolean;
  /** Is this id the system-wide default for new chats. */
  isDefault: (modelId: string) => boolean;
  /** Resolved IDs of every model loaded in Ollama right now. */
  loadedIds: Set<string>;
  /** Resolved id of the system default (or empty string). */
  defaultId: string;
  /** Whether all underlying queries have at least one data point. */
  isReady: boolean;
}

export function useModelState(): ModelStateApi {
  const api = useApi();

  const installedQuery = useQuery({
    queryKey: modelKeys.installed(),
    queryFn: async ({ signal }) => {
      const data = await api.get<InstalledResponse>('/models/installed', {
        showError: false,
        signal,
      });
      return data.models ?? [];
    },
  });

  const defaultQuery = useQuery({
    queryKey: modelKeys.default(),
    queryFn: ({ signal }) =>
      api.get<DefaultResponse>('/models/default', { showError: false, signal }),
  });

  const loadedQuery = useQuery({
    queryKey: modelKeys.loaded(),
    refetchInterval: MODEL_POLL_INTERVAL_MS,
    queryFn: async ({ signal }) => {
      try {
        return await api.get<LoadedResponse>('/models/loaded', { showError: false, signal });
      } catch {
        return {} as LoadedResponse;
      }
    },
  });

  // Memory-budget gives us the ollama-side names — the most authoritative
  // signal for "really in VRAM right now".
  const budgetQuery = useQuery({
    queryKey: modelKeys.memoryBudget(),
    refetchInterval: MODEL_POLL_INTERVAL_MS,
    queryFn: ({ signal }) =>
      api.get<MemoryBudget>('/models/memory-budget', { showError: false, signal }),
  });

  const installedSet = useMemo(
    () =>
      new Set(
        (installedQuery.data ?? [])
          .filter(m => m.install_status === 'available' || m.status === 'available')
          .map(m => m.id)
      ),
    [installedQuery.data]
  );

  const loadedIds = useMemo(() => {
    const set = new Set<string>();
    const single = loadedQuery.data?.model_id;
    if (single) set.add(single);
    for (const m of loadedQuery.data?.loaded_models ?? []) {
      if (m.model_id) set.add(m.model_id);
    }
    for (const m of budgetQuery.data?.loadedModels ?? []) {
      if (m.id) set.add(m.id);
      if (m.ollamaName) set.add(m.ollamaName);
    }
    return set;
  }, [loadedQuery.data, budgetQuery.data]);

  const defaultId = defaultQuery.data?.default_model ?? '';

  return {
    isInstalled: (modelId: string) => installedSet.has(modelId),
    isLoaded: (modelId: string) => loadedIds.has(modelId),
    isDefault: (modelId: string) => Boolean(defaultId) && defaultId === modelId,
    loadedIds,
    defaultId,
    isReady: installedQuery.isSuccess && defaultQuery.isSuccess && loadedQuery.isSuccess,
  };
}
