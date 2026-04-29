import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../hooks/useApi';
import { modelKeys, MODEL_POLL_INTERVAL_MS } from '../../hooks/queries/modelKeys';
import type { InstalledModel } from './types';

const FAVORITES_STORAGE_KEY = 'arasul_favorite_models';

interface InstalledModelsResponse {
  models?: InstalledModel[];
}

interface DefaultModelResponse {
  default_model?: string | null;
}

interface LoadedModelResponse {
  model_id?: string;
}

interface UseChatModelsParams {
  isAuthenticated: boolean;
}

export interface UseChatModelsReturn {
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  /** Live ref-mirror of selectedModel so callers can keep their callbacks stable. */
  selectedModelRef: React.MutableRefObject<string>;
  installedModels: InstalledModel[];
  defaultModel: string;
  loadedModel: string | null;
  favoriteModels: string[];
  loadModels: () => Promise<void>;
  setModelAsDefault: (modelId: string) => Promise<void>;
  toggleFavorite: (modelId: string) => void;
}

/**
 * useChatModels — LLM model state via TanStack Query: installed models,
 * default, currently loaded, plus per-user favorites (localStorage).
 *
 * Query keys (`['models', 'installed' | 'default' | 'loaded']`) are shared
 * with Store's hooks so changes propagate automatically (e.g. setting a
 * new default in Store updates ChatContext via cache invalidation).
 *
 * Queries are gated on `isAuthenticated` to avoid fetching before login.
 */
export default function useChatModels({
  isAuthenticated,
}: UseChatModelsParams): UseChatModelsReturn {
  const api = useApi();
  const qc = useQueryClient();

  const installedQuery = useQuery({
    queryKey: modelKeys.installed(),
    enabled: isAuthenticated,
    queryFn: async ({ signal }) => {
      const data = await api.get<InstalledModelsResponse>('/models/installed', {
        showError: false,
        signal,
      });
      return data.models ?? [];
    },
  });

  // Cache stores the wire shape (`{ default_model: '...' }`) so the Store's
  // useModelsDefaultQuery — which queries the same key — gets the same data.
  // We expose the unwrapped string via `select` to keep this hook's API
  // unchanged for ChatContext consumers.
  const defaultQuery = useQuery({
    queryKey: modelKeys.default(),
    enabled: isAuthenticated,
    queryFn: ({ signal }) =>
      api.get<DefaultModelResponse>('/models/default', { showError: false, signal }),
    select: data => data?.default_model ?? '',
  });

  // Phase 1.2: poll loaded model so the chat header notices when the backend
  // unloads a model under memory pressure. Without this the header would
  // happily display a model that's no longer in RAM.
  const loadedQuery = useQuery({
    queryKey: modelKeys.loaded(),
    enabled: isAuthenticated,
    refetchInterval: MODEL_POLL_INTERVAL_MS,
    queryFn: async ({ signal }) => {
      try {
        const data = await api.get<LoadedModelResponse>('/models/loaded', {
          showError: false,
          signal,
        });
        return data.model_id ?? null;
      } catch {
        // Endpoint may not exist in older configurations
        return null;
      }
    },
  });

  // Selection + favorites are pure client state
  const [selectedModel, setSelectedModel] = useState('');
  const [favoriteModels, setFavoriteModels] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });

  // Ref-mirror to keep streaming sendMessage stable
  const selectedModelRef = useRef(selectedModel);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  // Set-default mutation. Cache update uses the centralized key + wire shape
  // (`{ default_model }`) so Store and Dashboard see the change in the same
  // render tick.
  const setDefaultMutation = useMutation({
    mutationFn: (modelId: string) =>
      api.post('/models/default', { model_id: modelId }, { showError: false }),
    onSuccess: (_data, modelId) => {
      qc.setQueryData(modelKeys.default(), { default_model: modelId });
    },
  });

  const setModelAsDefault = useCallback(
    async (modelId: string) => {
      try {
        await setDefaultMutation.mutateAsync(modelId);
      } catch (err) {
        console.error('Error setting default model:', err);
      }
    },
    [setDefaultMutation]
  );

  const toggleFavorite = useCallback((modelId: string) => {
    setFavoriteModels(prev => {
      const next = prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId];
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Manual reload — invalidates the entire model namespace so every consumer
  // (Chat, Store, Dashboard, Sidebar) refreshes in lockstep.
  const loadModels = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: modelKeys.all });
  }, [qc]);

  return {
    selectedModel,
    setSelectedModel,
    selectedModelRef,
    installedModels: installedQuery.data ?? [],
    defaultModel: defaultQuery.data ?? '',
    loadedModel: loadedQuery.data ?? null,
    favoriteModels,
    loadModels,
    setModelAsDefault,
    toggleFavorite,
  };
}
