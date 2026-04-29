/**
 * useEvictionWatcher — toast notification when an LLM is unloaded.
 *
 * Phase 2.5 of LLM_RAG_N8N_HARDENING. The backend's LRU eviction (and
 * idle-based unload from `modelLifecycleService`) used to happen silently
 * — the user just saw their model "vanish" with no explanation. Instead
 * of pushing a new SSE event, we diff the shared `loadedModels` snapshot
 * (already polled every 5s for the budget widget) and emit a toast when
 * an entry disappears.
 *
 * Mount once high in the tree (AppShell). Multiple mounts would multi-fire.
 */
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from './useApi';
import { useToast } from '../contexts/ToastContext';
import { modelKeys, MODEL_POLL_INTERVAL_MS } from './queries/modelKeys';
import type { MemoryBudget } from '../types';

export function useEvictionWatcher() {
  const api = useApi();
  const toast = useToast();
  // First snapshot starts as "unset" so we don't fire toasts on initial mount.
  const previousIdsRef = useRef<Set<string> | null>(null);

  const budgetQuery = useQuery({
    queryKey: modelKeys.memoryBudget(),
    queryFn: ({ signal }) =>
      api.get<MemoryBudget>('/models/memory-budget', { showError: false, signal }),
    refetchInterval: MODEL_POLL_INTERVAL_MS,
  });

  useEffect(() => {
    const loaded = budgetQuery.data?.loadedModels;
    if (!loaded) return;
    const currentIds = new Set(loaded.map(m => m.id));
    const previous = previousIdsRef.current;
    if (previous) {
      for (const id of previous) {
        if (!currentIds.has(id)) {
          // Find the friendly name from the previous snapshot if we have it,
          // else just use the id.
          const name = budgetQuery.data?.loadedModels.find(m => m.id === id)?.name || id;
          toast.info(`Modell „${name}" wurde entladen — RAM für anderes Modell freigegeben.`);
        }
      }
    }
    previousIdsRef.current = currentIds;
  }, [budgetQuery.data, toast]);
}
