import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useApi } from '../../../hooks/useApi';
import { modelKeys } from '../../../hooks/queries/modelKeys';
import { storeKeys } from './queryKeys';
import type { CatalogModel } from '../../../types';

// ---- App actions ----

interface AppActionPayload {
  appId: string;
  action: 'install' | 'uninstall' | 'enable' | 'disable' | string;
  /** Optional payload (e.g., install options). */
  options?: Record<string, unknown>;
}

/**
 * useAppActionMutation — Install/uninstall/enable/disable an app.
 * Invalidates the apps cache on success so the UI reflects new state.
 */
export function useAppActionMutation(): UseMutationResult<unknown, Error, AppActionPayload> {
  const api = useApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ appId, action, options }: AppActionPayload) =>
      api.post(`/apps/${appId}/${action}`, options ?? null, { showError: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: storeKeys.apps() });
      qc.invalidateQueries({ queryKey: storeKeys.recommendations() });
    },
  });
}

// ---- Model actions ----

interface DeleteContext {
  previousCatalog?: CatalogModel[];
}

/**
 * useDeleteModelMutation — Uninstall a model.
 *
 * Phase 1.4: optimistic update — the model card disappears from the catalog
 * the moment the user confirms, and rolls back on server error. Without this
 * the user clicked Delete and stared at the same card for ~1s on slow
 * connections, often clicking again.
 */
export function useDeleteModelMutation(): UseMutationResult<unknown, Error, string, DeleteContext> {
  const api = useApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (modelId: string) => api.del(`/models/${modelId}`, { showError: false }),
    onMutate: async modelId => {
      await qc.cancelQueries({ queryKey: modelKeys.catalog() });
      const previousCatalog = qc.getQueryData<CatalogModel[]>(modelKeys.catalog());
      if (previousCatalog) {
        qc.setQueryData<CatalogModel[]>(
          modelKeys.catalog(),
          previousCatalog.map(m =>
            m.id === modelId
              ? // Mark as not installed (UI hides the "delete" affordance)
                { ...m, install_status: '', download_progress: 0 }
              : m
          )
        );
      }
      return { previousCatalog };
    },
    onError: (_err, _modelId, context) => {
      if (context?.previousCatalog) {
        qc.setQueryData(modelKeys.catalog(), context.previousCatalog);
      }
    },
    onSettled: () => {
      // Re-sync the entire model namespace — delete affects catalog, status,
      // default (if it was the default), installed list, and memory budget.
      qc.invalidateQueries({ queryKey: modelKeys.all });
    },
  });
}

/**
 * useSetDefaultModelMutation — Set a model as the system-wide default.
 * Optimistically updates the default-model cache (entry shape:
 * `{ default_model: 'qwen3:7b-q8' }`).
 */
export function useSetDefaultModelMutation(): UseMutationResult<
  unknown,
  Error,
  string,
  { previous?: { default_model?: string | null } }
> {
  const api = useApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (modelId: string) =>
      api.post('/models/default', { model_id: modelId }, { showError: false }),
    onMutate: async modelId => {
      await qc.cancelQueries({ queryKey: modelKeys.default() });
      const previous = qc.getQueryData<{ default_model?: string | null }>(modelKeys.default());
      qc.setQueryData(modelKeys.default(), { default_model: modelId });
      return { previous };
    },
    onError: (_err, _modelId, context) => {
      if (context?.previous) qc.setQueryData(modelKeys.default(), context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: modelKeys.default() });
    },
  });
}
