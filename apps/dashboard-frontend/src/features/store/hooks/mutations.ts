import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useApi } from '../../../hooks/useApi';
import { storeKeys } from './queryKeys';

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

/** useDeleteModelMutation — Uninstall a model. */
export function useDeleteModelMutation(): UseMutationResult<unknown, Error, string> {
  const api = useApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (modelId: string) => api.del(`/models/${modelId}`, { showError: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: storeKeys.modelsCatalog() });
      qc.invalidateQueries({ queryKey: storeKeys.modelsStatus() });
      qc.invalidateQueries({ queryKey: storeKeys.modelsDefault() });
    },
  });
}

/**
 * useSetDefaultModelMutation — Set a model as the system-wide default.
 * Optimistically updates the default-model cache.
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
      await qc.cancelQueries({ queryKey: storeKeys.modelsDefault() });
      const previous = qc.getQueryData<{ default_model?: string | null }>(
        storeKeys.modelsDefault()
      );
      qc.setQueryData(storeKeys.modelsDefault(), { default_model: modelId });
      return { previous };
    },
    onError: (_err, _modelId, context) => {
      if (context?.previous) qc.setQueryData(storeKeys.modelsDefault(), context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: storeKeys.modelsDefault() });
    },
  });
}
